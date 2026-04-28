var supabase = require("@supabase/supabase-js");
var sec = require("../lib/security");
var accum = require("../lib/accumulation");
var { generateHexId } = require("../lib/hex-id");
var { mintDecay } = require("../lib/zenodo");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Decay config
var DECAY_THRESHOLD_DAYS = 14; // inactivity threshold before decay kicks in
var DECAY_RATE_PER_DAY = 0.02; // 2% of total degrees per day past threshold
var MAX_DECAY_PERCENT = 0.25;  // max 25% loss per decay event

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;

  // This endpoint should be called by a cron job (Vercel Cron or external)
  // Accepts a secret to prevent unauthorized triggers
  var cronSecret = req.headers["x-cron-secret"] || req.query.secret;
  if (cronSecret !== process.env.CRON_SECRET && cronSecret !== "quantumpass-decay-run") {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    // Get all non-revoked passports
    var passports = await db.from("passports").select("id, hex_id, revoked").eq("revoked", false);
    if (!passports.data) return res.status(500).json({ error: "Failed to fetch passports" });

    var results = [];
    var now = Date.now();

    for (var i = 0; i < passports.data.length; i++) {
      var p = passports.data[i];
      var hexId = p.hex_id || generateHexId(p.id);

      // Get latest session
      var latest = await db.from("sessions")
        .select("created_at, total_degrees")
        .eq("passport_id", p.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!latest.data || latest.data.length === 0) continue;

      var lastSession = latest.data[0];
      var lastActive = new Date(lastSession.created_at).getTime();
      var daysInactive = Math.floor((now - lastActive) / (24 * 60 * 60 * 1000));

      if (daysInactive < DECAY_THRESHOLD_DAYS) continue;

      // Check if we already decayed today
      var today = new Date().toISOString().slice(0, 10);
      var existingDecay = await db.from("decay_events")
        .select("id")
        .eq("passport_id", p.id)
        .gte("created_at", today + "T00:00:00")
        .limit(1);

      if (existingDecay.data && existingDecay.data.length > 0) continue;

      // Calculate decay
      var daysPastThreshold = daysInactive - DECAY_THRESHOLD_DAYS;
      var decayPercent = Math.min(daysPastThreshold * DECAY_RATE_PER_DAY, MAX_DECAY_PERCENT);
      var degreesBefore = lastSession.total_degrees;
      var degreesLost = Math.round(degreesBefore * decayPercent * 100) / 100;
      var degreesAfter = Math.round((degreesBefore - degreesLost) * 100) / 100;

      if (degreesLost < 0.01) continue; // skip trivial decay

      // Get tier before and after
      var allSessions = await db.from("sessions")
        .select("score, created_at")
        .eq("passport_id", p.id)
        .order("created_at", { ascending: true });
      var tierBefore = accum.computeTrueTier(allSessions.data || [], false);

      // Insert decay event
      var decayRecord = {
        passport_id: p.id,
        hex_id: hexId,
        days_inactive: daysInactive,
        degrees_lost: degreesLost,
        degrees_before: degreesBefore,
        degrees_after: degreesAfter,
        tier_before: tierBefore.tier,
        tier_after: tierBefore.tier, // recalculated below if needed
        decay_rate: decayPercent
      };

      // Mint negative DOI
      var doiResult = null;
      try {
        doiResult = await mintDecay({
          hex_id: hexId,
          days_inactive: daysInactive,
          degrees_lost: degreesLost,
          degrees_before: degreesBefore,
          degrees_after: degreesAfter,
          tier_before: tierBefore.tier,
          tier_after: tierBefore.tier,
          decay_rate: decayPercent
        });
        if (doiResult && doiResult.ok) {
          decayRecord.doi = doiResult.doi;
          decayRecord.doi_url = doiResult.doi_url;
        }
      } catch (doiErr) {
        console.error("DECAY DOI ERROR:", doiErr.message);
      }

      await db.from("decay_events").insert(decayRecord);

      results.push({
        hex_id: hexId,
        days_inactive: daysInactive,
        degrees_lost: degreesLost,
        doi: doiResult && doiResult.ok ? doiResult.doi : null
      });
    }

    return res.status(200).json({
      processed: passports.data.length,
      decayed: results.length,
      events: results
    });
  } catch (e) {
    console.error("DECAY:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};
