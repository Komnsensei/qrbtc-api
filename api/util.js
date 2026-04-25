var tiers = require("../lib/tiers");
var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

var dbPublic = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function (req, res) {
  var action = req.query.action;

  if (action === "tiers") {
    var result = await dbPublic.from("tiers").select("*").order("requests_limit", { ascending: true });
    if (result.error) {
      return res.status(200).json({ tiers: tiers.getAllTiers() });
    }
    return res.status(200).json({ tiers: result.data });
  }

  if (action === "spiral") {
    var id = req.query.id;
    if (!id) return res.status(400).json({ error: "id required" });
    var s = await dbPublic
      .from("sessions")
      .select("total_degrees")
      .eq("passport_id", id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (!s.data || s.data.length === 0) {
      return res.status(404).json({ error: "No sessions found" });
    }
    var total = s.data[0].total_degrees;
    return res.status(200).json({
      total_degrees: total,
      spiral_angle: Math.round((total % 360) * 100) / 100
    });
  }

  if (action === "health") {
    var start = Date.now();
    var check = await dbPublic.from("passports").select("id").limit(1);
    var latency = Date.now() - start;
    return res.status(200).json({
      status: "operational",
      version: "3.2.0",
      db_latency_ms: latency,
      db_connected: !check.error,
      timestamp: new Date().toISOString()
    });
  }

  if (action === "billing") {
    if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

    var session = await auth.authenticate(req, "identity:read");
    if (session.error) return res.status(session.status).json({ error: session.error });

    var keyData = await db
      .from("api_keys")
      .select("tier, requests_used, requests_limit, billing_status, upgrade_requested")
      .eq("passport_id", session.passport_id)
      .eq("revoked", false);

    if (!keyData.data || keyData.data.length === 0) {
      return res.status(404).json({ error: "No active key found" });
    }

    var k = keyData.data[0];

    var tierInfo = await db
      .from("tiers")
      .select("*")
      .eq("name", k.tier)
      .limit(1);

    var keys_used = keyData.data.length;
    var keys_limit = tierInfo.data && tierInfo.data.length > 0 ? tierInfo.data[0].key_limit : 1;
    var features = tierInfo.data && tierInfo.data.length > 0 ? tierInfo.data[0].features : [];

    var tierOrder = ["free", "builder", "pro", "sovereign"];
    var currentIdx = tierOrder.indexOf(k.tier);
    var nextTier = currentIdx < tierOrder.length - 1 ? tierOrder[currentIdx + 1] : null;

    return res.status(200).json({
      passport_id: session.passport_id,
      tier: k.tier,
      requests_used: k.requests_used,
      requests_limit: k.requests_limit,
      keys_used: keys_used,
      keys_limit: keys_limit,
      features: features,
      billing_status: k.billing_status,
      upgrade_available: nextTier !== null,
      next_tier: nextTier
    });
  }

  if (action === "upgrade") {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    var session = await auth.authenticate(req, "score:write");
    if (session.error) return res.status(session.status).json({ error: session.error });

    var targetTier = req.query.tier || (req.body && req.body.tier);
    if (!targetTier) return res.status(400).json({ error: "tier required" });

    var tierOrder = ["free", "builder", "pro", "sovereign"];
    if (tierOrder.indexOf(targetTier) === -1) {
      return res.status(400).json({ error: "Invalid tier. Options: " + tierOrder.join(", ") });
    }

    var currentKey = await db
      .from("api_keys")
      .select("id, tier")
      .eq("passport_id", session.passport_id)
      .eq("revoked", false)
      .limit(1);

    if (!currentKey.data || currentKey.data.length === 0) {
      return res.status(404).json({ error: "No active key found" });
    }

    var currentIdx = tierOrder.indexOf(currentKey.data[0].tier);
    var targetIdx = tierOrder.indexOf(targetTier);

    if (targetIdx <= currentIdx) {
      return res.status(400).json({ error: "Can only upgrade. Current: " + currentKey.data[0].tier });
    }

    var newTier = await db
      .from("tiers")
      .select("*")
      .eq("name", targetTier)
      .limit(1);

    if (!newTier.data || newTier.data.length === 0) {
      return res.status(500).json({ error: "Tier not found in database" });
    }

    var update = await db
      .from("api_keys")
      .update({
        tier: targetTier,
        requests_limit: newTier.data[0].requests_limit,
        upgrade_requested: true,
        billing_status: targetTier === "free" ? "unpaid" : "pending"
      })
      .eq("id", currentKey.data[0].id);

    if (update.error) return res.status(500).json({ error: update.error.message });

    return res.status(200).json({
      passport_id: session.passport_id,
      previous_tier: currentKey.data[0].tier,
      new_tier: targetTier,
      requests_limit: newTier.data[0].requests_limit,
      key_limit: newTier.data[0].key_limit,
      features: newTier.data[0].features,
      billing_status: "pending",
      message: "Upgrade applied. Stripe payment will activate when billing goes live."
    });
  }

  
  if (action === "logs") {
    if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

    var session = await auth.authenticate(req, "score:write");
    if (session.error) return res.status(session.status).json({ error: session.error });

    var limit = parseInt(req.query.limit) || 50;

    var logs = await db
      .from("request_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (logs.error) return res.status(500).json({ error: logs.error.message });

    var total = await db.from("request_logs").select("id", { count: "exact" });

    var errors = 0;
    var totalLatency = 0;
    for (var i = 0; i < logs.data.length; i++) {
      if (logs.data[i].status_code >= 400) errors++;
      totalLatency += logs.data[i].latency_ms || 0;
    }

    return res.status(200).json({
      total_logged: total.count || 0,
      showing: logs.data.length,
      error_rate: logs.data.length > 0 ? Math.round((errors / logs.data.length) * 100) + "%" : "0%",
      avg_latency_ms: logs.data.length > 0 ? Math.round(totalLatency / logs.data.length) : 0,
      logs: logs.data
    });
  }
  return res.status(400).json({ error: "Unknown action. Use: ?action=tiers | spiral | health | billing | upgrade | logs" });
};