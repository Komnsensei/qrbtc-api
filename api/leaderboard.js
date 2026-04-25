var supabase = require("@supabase/supabase-js");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function (req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  try {
    var limit = parseInt(req.query.limit) || 10;
    if (limit > 100) limit = 100;

    var passports = await db
      .from("passports")
      .select("id, username, revoked")
      .eq("revoked", false);

    if (passports.error) {
      return res.status(500).json({ error: passports.error.message });
    }

    if (!passports.data || passports.data.length === 0) {
      return res.status(200).json({ leaderboard: [] });
    }

    var results = [];

    for (var i = 0; i < passports.data.length; i++) {
      var p = passports.data[i];

      var sessions = await db
        .from("sessions")
        .select("score, total_degrees")
        .eq("passport_id", p.id)
        .order("created_at", { ascending: false });

      if (!sessions.data || sessions.data.length === 0) continue;

      var block_count = sessions.data.length;
      var weighted_total = 0;
      var weight_sum = 0;

      for (var j = 0; j < sessions.data.length; j++) {
        var w = Math.pow(0.85, j);
        weighted_total += sessions.data[j].score * w;
        weight_sum += w;
      }

      var weighted_score = Math.round((weighted_total / weight_sum) * 100) / 100;
      var total_degrees = sessions.data[0].total_degrees;

      results.push({
        rank: 0,
        passport_id: p.id,
        username: p.username,
        weighted_score: weighted_score,
        block_count: block_count,
        total_degrees: total_degrees
      });
    }

    results.sort(function (a, b) { return b.weighted_score - a.weighted_score; });
    results = results.slice(0, limit);

    for (var k = 0; k < results.length; k++) {
      results[k].rank = k + 1;
    }

    return res.status(200).json({
      leaderboard: results,
      count: results.length
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};