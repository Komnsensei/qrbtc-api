var supabase = require("@supabase/supabase-js");
var sec = require("../lib/security");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  try {
    var action = sec.sanitizeString(req.query.action || "");

    if (action === "leaderboard") {
      var limit = parseInt(req.query.limit) || 10;
      if (limit < 1) limit = 1;
      if (limit > 100) limit = 100;

      var result = await db.from("sessions").select("passport_id, score, total_degrees, created_at")
        .order("score", { ascending: false }).limit(limit);
      if (result.error) return res.status(500).json({ error: result.error.message });
      return res.status(200).json(result.data);
    }

    if (action === "stats") {
      var passports = await db.from("passports").select("id", { count: "exact" });
      var sessions = await db.from("sessions").select("id, score", { count: "exact" });
      var scores = sessions.data || [];
      var total = 0;
      for (var i = 0; i < scores.length; i++) total += scores[i].score;
      var avg = scores.length > 0 ? Math.round((total / scores.length) * 100) / 100 : 0;

      return res.status(200).json({
        total_passports: passports.count || 0,
        total_sessions: sessions.count || 0,
        avg_score: avg
      });
    }

    return res.status(400).json({ error: "Use ?action=leaderboard or ?action=stats" });
  } catch (e) {
    console.error("ANALYTICS:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};