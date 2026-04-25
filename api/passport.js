var supabase = require("@supabase/supabase-js");
var tiers = require("../lib/tiers");

var DECAY = 0.85;

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function (req, res) {
  if (req.method === "POST") {
    var username = req.body.username;
    if (!username) {
      return res.status(400).json({ error: "username required" });
    }

    var result = await db
      .from("passports")
      .insert({ username: username })
      .select()
      .single();

    if (result.error) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.status(201).json({
      passport_id: result.data.id,
      username: result.data.username,
      created_at: result.data.created_at
    });
  }

  if (req.method === "GET") {
    var passport_id = req.query.id;
    if (!passport_id) {
      return res.status(400).json({ error: "Provide ?id=UUID" });
    }

    var passport = await db
      .from("passports")
      .select("id, username, created_at")
      .eq("id", passport_id)
      .single();

    if (passport.error || !passport.data) {
      return res.status(404).json({ error: "Passport not found" });
    }

    var sessions = await db
      .from("sessions")
      .select("score, total_degrees, degrees_delta, created_at")
      .eq("passport_id", passport_id)
      .order("created_at", { ascending: false });

    var block_count = 0;
    var total_degrees = 0;
    var avg_score = 0;
    var weighted_score = 0;
    var integrity = 0;
    var last_session = null;

    if (sessions.data && sessions.data.length > 0) {
      block_count = sessions.data.length;
      total_degrees = sessions.data[0].total_degrees;

      var scores = sessions.data.map(function (s) { return s.score; });

      var sum = scores.reduce(function (a, b) { return a + b; }, 0);
      avg_score = Math.round((sum / scores.length) * 100) / 100;

      var weightedSum = 0;
      var totalWeight = 0;
      for (var i = 0; i < scores.length; i++) {
        var weight = Math.pow(DECAY, i);
        weightedSum += scores[i] * weight;
        totalWeight += weight;
      }
      weighted_score = Math.round((weightedSum / totalWeight) * 100) / 100;

      var variance = scores.reduce(function (acc, s) {
        return acc + Math.pow(s - weighted_score, 2);
      }, 0) / scores.length;
      integrity = Math.round(Math.sqrt(variance) * 100) / 100;

      last_session = {
        score: sessions.data[0].score,
        degrees_delta: sessions.data[0].degrees_delta,
        timestamp: sessions.data[0].created_at
      };
    }

    var spiral_angle = Math.round((total_degrees % 360) * 100) / 100;
    var tier = tiers.getTier(weighted_score);

    return res.status(200).json({
      passport_id: passport.data.id,
      username: passport.data.username,
      total_degrees: total_degrees,
      block_count: block_count,
      spiral_angle: spiral_angle,
      avg_score: avg_score,
      weighted_score: weighted_score,
      integrity: integrity,
      tier: tier,
      last_session: last_session,
      created_at: passport.data.created_at
    });
  }

  return res.status(405).json({ error: "Use GET or POST" });
};