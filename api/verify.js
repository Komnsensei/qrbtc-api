var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var sec = require("../lib/security");
var vibesafe = require("../lib/vibesafe");
var accum = require("../lib/accumulation");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;

  var action = (req.query.action || "").toLowerCase();

  // --- CHAIN INTEGRITY ---
  if (action === "chain" || (!action && req.method === "GET")) {
    if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
    var session = await auth.authenticate(req, "ledger:read");
    if (session.error) return res.status(session.status || 401).json({ error: session.error });

    try {
      var passport_id = session.passport_id;
      var sessions = await db.from("sessions")
        .select("id, score, degrees_delta, total_degrees, session_hash, previous_hash, hash_ts, created_at")
        .eq("passport_id", passport_id).order("created_at", { ascending: true });

      if (!sessions.data || sessions.data.length === 0) return res.status(404).json({ error: "No sessions found" });

      var chain = sessions.data;
      var breaks = [];

      for (var i = 0; i < chain.length; i++) {
        var block = chain[i];
        if (i === 0) {
          if (block.previous_hash !== "genesis") {
            breaks.push({ block_index: i, session_id: block.id, reason: "First block previous_hash is not genesis" });
          }
        } else {
          if (block.previous_hash !== chain[i - 1].session_hash) {
            breaks.push({ block_index: i, session_id: block.id, reason: "previous_hash mismatch" });
          }
        }
        if (block.hash_ts) {
          var hashInput = block.score + "|" + block.degrees_delta + "|" + block.total_degrees + "|" + block.previous_hash + "|" + block.hash_ts;
          var recomputed = crypto.createHash("sha256").update(hashInput).digest("hex");
          if (recomputed !== block.session_hash) {
            breaks.push({ block_index: i, session_id: block.id, reason: "Hash mismatch" });
          }
        }
      }

      var trueTier = accum.computeTrueTier(chain, false);
      var behavior = vibesafe.analyzeSessionBehavior(chain);

      return res.status(200).json({
        passport_id: passport_id, chain_length: chain.length, chain_intact: breaks.length === 0,
        breaks: breaks, first_block: chain[0].session_hash, last_block: chain[chain.length - 1].session_hash,
        tier: trueTier, behavior: behavior, verified_at: new Date().toISOString()
      });
    } catch (e) {
      console.error("VERIFY:", e.message);
      return res.status(500).json({ error: "Internal error" });
    }
  }

  // --- CHALLENGE: Generate human verification challenge ---
  if (action === "challenge") {
    if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
    var session2 = await auth.authenticate(req, "score:write");
    if (session2.error) return res.status(session2.status || 401).json({ error: session2.error });

    var challenge = vibesafe.generateChallenge(session2.passport_id);
    return res.status(200).json(challenge);
  }

  // --- RESPOND: Answer a challenge + optional multi-method verification ---
  if (action === "respond") {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    var session3 = await auth.authenticate(req, "score:write");
    if (session3.error) return res.status(session3.status || 401).json({ error: session3.error });

    var body = req.body || {};
    if (!body.challenge_id || !body.answer) {
      return res.status(400).json({ error: "challenge_id and answer required" });
    }

    var result = vibesafe.verifyChallenge(session3.passport_id, body.challenge_id, body.answer);

    if (result.verified) {
      var methods = { challenge: result };

      if (body.vibesafe_scan) {
        methods.vibesafe = vibesafe.verifyVibesafeScan(body.vibesafe_scan);
      }
      if (body.zenodo_doi) {
        methods.zenodo = vibesafe.verifyZenodoDOI(body.zenodo_doi);
      }
      if (body.coherence_signature) {
        methods.coherence = vibesafe.verifyCoherenceSignature(body.coherence_signature);
      }

      var history = await db.from("sessions")
        .select("score, created_at")
        .eq("passport_id", session3.passport_id)
        .order("created_at", { ascending: true });
      if (history.data && history.data.length > 0) {
        methods.behavior = vibesafe.analyzeSessionBehavior(history.data);
      }

      var composite = vibesafe.computeVerification(methods);

      if (composite.composite_confidence >= vibesafe.THRESHOLDS.MASTER) {
        await db.from("passports").update({
          vibesafe_verified: true,
          vibesafe_confidence: composite.composite_confidence,
          vibesafe_methods: composite.methods_used,
          vibesafe_verified_at: new Date().toISOString()
        }).eq("id", session3.passport_id);
      }

      return res.status(200).json({
        verified: true, verification: composite,
        stored: composite.composite_confidence >= vibesafe.THRESHOLDS.MASTER
      });
    }

    return res.status(200).json({ verified: false, result: result });
  }

  // --- STATUS: Get verification status ---
  if (action === "status") {
    if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
    var session4 = await auth.authenticate(req, "identity:read");
    if (session4.error) return res.status(session4.status || 401).json({ error: session4.error });

    var passport = await db.from("passports")
      .select("vibesafe_verified, vibesafe_confidence, vibesafe_methods, vibesafe_verified_at")
      .eq("id", session4.passport_id).limit(1);

    var hist = await db.from("sessions")
      .select("score, created_at")
      .eq("passport_id", session4.passport_id)
      .order("created_at", { ascending: true });

    var isVerified = passport.data && passport.data[0] && passport.data[0].vibesafe_verified;
    var behavior2 = vibesafe.analyzeSessionBehavior(hist.data || []);
    var trueTier2 = accum.computeTrueTier(hist.data || [], isVerified);

    return res.status(200).json({
      passport_id: session4.passport_id,
      vibesafe: passport.data ? passport.data[0] : null,
      behavior: behavior2, tier: trueTier2,
      thresholds: vibesafe.THRESHOLDS,
      tier_requirements: accum.TIER_REQUIREMENTS
    });
  }

  return res.status(400).json({ error: "Use ?action=chain|challenge|respond|status" });
};