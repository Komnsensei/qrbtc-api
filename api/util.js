var tiers = require("../lib/tiers");
var supabase = require("@supabase/supabase-js");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function (req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  var action = req.query.action;

  if (action === "tiers") {
    return res.status(200).json({ tiers: tiers.getAllTiers() });
  }

  if (action === "spiral") {
    var id = req.query.id;
    if (!id) return res.status(400).json({ error: "id required" });
    var s = await db
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
    var check = await db.from("passports").select("id").limit(1);
    var latency = Date.now() - start;
    return res.status(200).json({
      status: "operational",
      version: "3.1.0",
      db_latency_ms: latency,
      db_connected: !check.error,
      timestamp: new Date().toISOString()
    });
  }

  return res.status(400).json({
    error: "Unknown action. Use: ?action=tiers | spiral | health"
  });
};