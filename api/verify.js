var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function (req, res) {
  // Apply security headers
  auth.applySecurityHeaders(res);
  auth.applyCORSHeaders(res);

  // Handle preflight requests
  if (auth.handlePreflight(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  var session = await auth.authenticate(req, "ledger:read");
  if (session.error) return res.status(session.status).json({ error: session.error });

  try {
    var passport_id = session.passport_id;

    var sessions = await db
      .from("sessions")
      .select("id, score, degrees_delta, total_degrees, session_hash, previous_hash, hash_ts, created_at")
      .eq("passport_id", passport_id)
      .order("created_at", { ascending: true });

    if (!sessions.data || sessions.data.length === 0) {
      return res.status(404).json({ error: "No sessions found" });
    }

    var chain = sessions.data;
    var breaks = [];

    for (var i = 0; i < chain.length; i++) {
      var block = chain[i];

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

      if (block.hash_ts) {
        var hashInput = block.score + "|" + block.degrees_delta + "|" + block.total_degrees + "|" + block.previous_hash + "|" + block.hash_ts;
        var recomputed = crypto.createHash("sha256").update(hashInput).digest("hex");
        if (recomputed !== block.session_hash) {
          breaks.push({
            block_index: i,
            session_id: block.id,
            reason: "Recomputed hash does not match stored session_hash",
            expected: recomputed,
            actual: block.session_hash
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