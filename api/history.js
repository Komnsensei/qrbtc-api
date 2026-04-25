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
    var passport_id = req.query.id;
    if (!passport_id) {
      return res.status(400).json({ error: "Provide ?id=UUID" });
    }

    var sessions = await db
      .from("sessions")
      .select("score, degrees_delta, total_degrees, session_hash, previous_hash, created_at")
      .eq("passport_id", passport_id)
      .order("created_at", { ascending: true });

    if (sessions.error) {
      return res.status(500).json({ error: sessions.error.message });
    }

    if (!sessions.data || sessions.data.length === 0) {
      return res.status(404).json({ error: "No sessions found" });
    }

    var blocks = sessions.data.map(function (s, i) {
      return {
        block: i + 1,
        score: s.score,
        degrees_delta: s.degrees_delta,
        total_degrees: s.total_degrees,
        session_hash: s.session_hash,
        previous_hash: s.previous_hash,
        timestamp: s.created_at
      };
    });

    return res.status(200).json({
      passport_id: passport_id,
      block_count: blocks.length,
      chain: blocks
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};