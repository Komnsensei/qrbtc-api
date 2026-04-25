var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function recomputeHash(session) {
  var input = session.score + "|" + session.degrees_delta + "|" + session.total_degrees + "|" + session.previous_hash + "|" + new Date(session.created_at).getTime();
  return crypto.createHash("sha256").update(input).digest("hex");
}

module.exports = async function (req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  var passport_id = req.query.id;
  if (!passport_id) {
    return res.status(400).json({ error: "id required" });
  }

  try {
    var sessions = await db
      .from("sessions")
      .select("id, score, degrees_delta, total_degrees, session_hash, previous_hash, created_at")
      .eq("passport_id", passport_id)
      .order("created_at", { ascending: true });

    if (!sessions.data || sessions.data.length === 0) {
      return res.status(404).json({ error: "No sessions found" });
    }

    var chain = sessions.data;
    var breaks = [];

    for (var i = 0; i < chain.length; i++) {
      var block = chain[i];

      // Check 1: Link integrity
      if (i === 0) {
        if (block.previous_hash !== "genesis") {
          breaks.push({
            block_index: i,
            session_id: block.id,
            reason: "First block previous_hash is not genesis",
            expected: "genesis",
            actual: block.previous_hash
          });
        }
      } else {
        if (block.previous_hash !== chain[i - 1].session_hash) {
          breaks.push({
            block_index: i,
            session_id: block.id,
            reason: "previous_hash does not match prior block session_hash",
            expected: chain[i - 1].session_hash,
            actual: block.previous_hash
          });
        }
      }
    }

    return res.status(200).json({
      passport_id: passport_id,
      chain_length: chain.length,
      chain_intact: breaks.length === 0,
      breaks: breaks,
      first_block: chain[0].session_hash,
      last_block: chain[chain.length - 1].session_hash,
      verified_at: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};