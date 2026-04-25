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
    var passports = await db
      .from("passports")
      .select("id, revoked", { count: "exact" });

    var sessions = await db
      .from("sessions")
      .select("score, degrees_delta");

    if (passports.error || sessions.error) {
      return res.status(500).json({
        error: (passports.error || sessions.error).message
      });
    }

    var total_passports = passports.data ? passports.data.length : 0;
    var active_passports = passports.data ? passports.data.filter(function (p) { return !p.revoked; }).length : 0;
    var revoked_passports = total_passports - active_passports;

    var total_sessions = sessions.data ? sessions.data.length : 0;
    var total_score = 0;
    var total_degrees = 0;

    if (sessions.data) {
      for (var i = 0; i < sessions.data.length; i++) {
        total_score += sessions.data[i].score;
        total_degrees += sessions.data[i].degrees_delta;
      }
    }

    var avg_score = total_sessions > 0 ? Math.round((total_score / total_sessions) * 100) / 100 : 0;
    var avg_degrees = total_sessions > 0 ? Math.round((total_degrees / total_sessions) * 100) / 100 : 0;
    var blocks_per_passport = total_passports > 0 ? Math.round((total_sessions / total_passports) * 100) / 100 : 0;

    return res.status(200).json({
      network: {
        total_passports: total_passports,
        active_passports: active_passports,
        revoked_passports: revoked_passports,
        total_sessions: total_sessions,
        blocks_per_passport: blocks_per_passport
      },
      scoring: {
        avg_score: avg_score,
        avg_degrees_per_block: avg_degrees,
        total_degrees_network: Math.round(total_degrees * 100) / 100
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};