var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");
var qrbtc = require("../lib/qrbtc");
var auth = require("../lib/auth");
var sec = require("../lib/security");
var gov = require("../lib/governance");
var accum = require("../lib/accumulation");
var vibesafe = require("../lib/vibesafe");
var hexagent = require("../lib/hexagent");
var { generateHexId } = require("../lib/hex-id");
var { mintSession, mintTierUp } = require("../lib/zenodo");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });

  try {
    var body = req.body || {};
    var fields = ["labor", "exchange", "equality", "presence", "ratification", "continuity"];
    var validated = {};
    for (var i = 0; i < fields.length; i++) {
      if (!sec.isScore(body[fields[i]])) {
        return res.status(400).json({ error: fields[i] + " must be 0-10" });
      }
      validated[fields[i]] = parseFloat(body[fields[i]]);
    }

    var passport_id = session.passport_id;
    var passport = await db.from("passports").select("id, revoked, vibesafe_verified, hex_id").eq("id", passport_id).limit(1);
    if (!passport.data || passport.data.length === 0) return res.status(404).json({ error: "Passport not found" });
    if (passport.data[0].revoked) return res.status(403).json({ error: "Passport revoked" });

    var hexId = passport.data[0].hex_id || generateHexId(passport_id);

    // --- FETCH SESSION HISTORY ---
    var history = await db.from("sessions")
      .select("id, score, total_degrees, session_hash, created_at")
      .eq("passport_id", passport_id)
      .order("created_at", { ascending: true });
    var sessions = history.data || [];

    // --- HEXAGENT GOVERNANCE REVIEW ---
    var rawScore = qrbtc.computeScore(validated);
    var governance = gov.enrichScore(rawScore, validated, passport_id);
    var score = governance.adjusted_score;

    var hexVerdict = hexagent.reviewSession(rawScore, validated, passport_id, sessions);

    // HexAgent can block sessions
    if (hexVerdict.ruling === "blocked") {
      return res.status(429).json({
        error: "Session blocked by HexAgent governance review.",
        governor: hexVerdict.governor,
        authority: hexVerdict.authority,
        findings: hexVerdict.findings,
        statement: hexVerdict.hexagent_statement
      });
    }

    // --- VELOCITY CHECK ---
    if (sessions.length > 0) {
      var velocity = accum.checkVelocity(sessions);
      if (!velocity.ok) {
        if (velocity.flags.indexOf("cooldown_active") !== -1) {
          return res.status(429).json({
            error: "Cooldown active. Wait " + Math.ceil(velocity.cooldown_remaining_ms / 1000) + "s.",
            governor: "HexAgent", cooldown_remaining_ms: velocity.cooldown_remaining_ms, flags: velocity.flags
          });
        }
        if (velocity.flags.indexOf("daily_cap_reached") !== -1) {
          return res.status(429).json({
            error: "Daily limit reached (" + accum.MAX_SESSIONS_PER_DAY + "/day).",
            governor: "HexAgent", flags: velocity.flags
          });
        }
        if (velocity.flags.indexOf("hourly_cap_reached") !== -1) {
          return res.status(429).json({
            error: "Hourly limit reached (" + accum.MAX_SESSIONS_PER_HOUR + "/hour).",
            governor: "HexAgent", flags: velocity.flags
          });
        }
      }
    }

    // --- COMPUTE TIER BEFORE (for tier-up detection) ---
    var vibesafeVerified = passport.data[0].vibesafe_verified || false;
    var tierBefore = accum.computeTrueTier(sessions, vibesafeVerified);

    // --- DIMINISHING RETURNS ---
    var sessionNumber = sessions.length + 1;
    var degreesCalc = accum.computeDegreesDelta(score, sessionNumber);
    var degrees_delta = degreesCalc.adjusted_degrees;

    var prev_total = 0, previous_hash = "genesis";
    if (sessions.length > 0) {
      prev_total = sessions[sessions.length - 1].total_degrees;
      previous_hash = sessions[sessions.length - 1].session_hash;
    }

    var total_degrees = Math.round((prev_total + degrees_delta) * 100) / 100;
    var now = new Date();
    var hash_ts = now.getTime();
    var hashInput = score + "|" + degrees_delta + "|" + total_degrees + "|" + previous_hash + "|" + hash_ts;
    var session_hash = crypto.createHash("sha256").update(hashInput).digest("hex");

    var insert = await db.from("sessions").insert({
      passport_id: passport_id, score: score, degrees_delta: degrees_delta,
      total_degrees: total_degrees, session_hash: session_hash, previous_hash: previous_hash,
      hash_ts: hash_ts, created_at: now.toISOString(),
      labor: validated.labor, exchange: validated.exchange, equality: validated.equality,
      presence: validated.presence, ratification: validated.ratification, continuity: validated.continuity
    });
    if (insert.error) return res.status(500).json({ error: insert.error.message });

    // --- COMPUTE TRUE TIER AFTER ---
    var allSessions = sessions.concat([{ score: score, created_at: now.toISOString() }]);
    var tierAfter = accum.computeTrueTier(allSessions, vibesafeVerified);
    var behaviorCheck = vibesafe.analyzeSessionBehavior(allSessions);

    // --- MINT SESSION DOI (async, non-blocking) ---
    var sessionDoi = null;
    var tierDoi = null;
    try {
      sessionDoi = await mintSession({
        hex_id: hexId,
        score: score,
        degrees_delta: degrees_delta,
        total_degrees: total_degrees,
        labor: validated.labor,
        exchange: validated.exchange,
        equality: validated.equality,
        presence: validated.presence,
        ratification: validated.ratification,
        continuity: validated.continuity,
        session_hash: session_hash,
        previous_hash: previous_hash,
        tier: tierAfter.tier,
        scoring_mode: "standard",
        chain_position: sessionNumber
      });
    } catch (doiErr) {
      console.error("SESSION DOI ERROR:", doiErr.message);
    }

    // --- TIER-UP DOI ---
    if (tierAfter.tier !== tierBefore.tier) {
      try {
        tierDoi = await mintTierUp({
          hex_id: hexId,
          old_tier: tierBefore.tier,
          new_tier: tierAfter.tier,
          total_degrees: total_degrees,
          total_sessions: sessionNumber,
          days_active: tierAfter.days_active,
          score: score,
          chain_position: sessionNumber,
          related_doi: sessionDoi && sessionDoi.ok ? sessionDoi.doi : null
        });
      } catch (tierErr) {
        console.error("TIER DOI ERROR:", tierErr.message);
      }
    }

    // Vow warnings
    var vowWarnings = [];
    if (!governance.vow_compliance) {
      vowWarnings = governance.vow_violations.map(function(v) { return v.vow + ": " + v.signal; });
    }

    return res.status(200).json({
      score: score,
      raw_score: governance.raw_score,
      governance_modifier: governance.governance_modifier,
      governance_notes: governance.governance_notes,
      vow_compliant: governance.vow_compliance,
      vow_warnings: vowWarnings,

      degrees_delta: degrees_delta,
      degrees_base: degreesCalc.base_degrees,
      diminishing_factor: degreesCalc.diminishing_factor,
      total_degrees: total_degrees,
      session_number: sessionNumber,

      tier: tierAfter.tier,
      tier_changed: tierAfter.tier !== tierBefore.tier,
      tier_previous: tierBefore.tier,
      tier_details: {
        weighted_avg: tierAfter.weighted_avg,
        consistency: tierAfter.consistency,
        sessions: tierAfter.sessions,
        days_active: tierAfter.days_active,
        vibesafe_verified: tierAfter.vibesafe_verified,
        progress: tierAfter.progress
      },

      hexagent: {
        governor: hexVerdict.governor,
        ruling: hexVerdict.ruling,
        severity: hexVerdict.severity,
        findings: hexVerdict.findings.length,
        statement: hexVerdict.hexagent_statement
      },

      behavior: {
        confidence: behaviorCheck.confidence,
        patterns: behaviorCheck.patterns
      },

      doi: sessionDoi && sessionDoi.ok ? {
        doi: sessionDoi.doi,
        doi_url: sessionDoi.doi_url,
        record_url: sessionDoi.record_url,
        polarity: "+"
      } : null,

      tier_doi: tierDoi && tierDoi.ok ? {
        doi: tierDoi.doi,
        doi_url: tierDoi.doi_url,
        event: tierBefore.tier + " → " + tierAfter.tier,
        polarity: "+"
      } : null,

      session_hash: session_hash,
      previous_hash: previous_hash
    });
  } catch (e) {
    console.error("SCORE:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};
