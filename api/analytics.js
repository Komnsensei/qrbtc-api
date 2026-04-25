var supabase = require("@supabase/supabase-js");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function (req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  var action = req.query.action;

  if (action === "leaderboard") {
    var limit = parseInt(req.query.limit) || 10;

    var result = await db
      .from("sessions")
      .select("passport_id, score, total_degrees, created_at")
      .order("score", { ascending: false })
      .limit(limit);

    if (result.error) return res.status(500).json({ error: result.error.message });

    return res.status(200).json({ leaderboard: result.data });
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

  return res.status(400).json({
    error: "Unknown action. Use: ?action=leaderboard | stats"
  });
};