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
      .select("score, session_hash, previous_hash, created_at")
      .eq("passport_id", passport_id)
      .order("created_at", { ascending: true });

    if (sessions.error) {
      return res.status(500).json({ error: sessions.error.message });
    }

    if (!sessions.data || sessions.data.length === 0) {
      return res.status(404).json({ error: "No sessions found" });
    }

    var blocks = sessions.data;
    var intact = true;
    var breaks = [];

    for (var i = 0; i < blocks.length; i++) {
      if (i === 0) {
        if (blocks[i].previous_hash !== "genesis") {
          intact = false;
          breaks.push({
            block: 1,
            expected: "genesis",
            found: blocks[i].previous_hash
          });
        }
      } else {
        if (blocks[i].previous_hash !== blocks[i - 1].session_hash) {
          intact = false;
          breaks.push({
            block: i + 1,
            expected: blocks[i - 1].session_hash,
            found: blocks[i].previous_hash
          });
        }
      }
    }

    return res.status(200).json({
      passport_id: passport_id,
      block_count: blocks.length,
      chain_intact: intact,
      breaks: breaks
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};