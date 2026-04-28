/**
 * evolve.js — Evolution Endpoint
 * 
 * POST /api/evolve — Check eligibility and evolve passport to QpG protocol
 * GET  /api/evolve — Check evolution status/eligibility without triggering
 * 
 * The chain evolves. Old blocks stay as history. New blocks use QpG scoring.
 */

var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var sec = require("../lib/security");
var evo = require("../lib/evolution");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;

  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });

  try {
    var passport_id = session.passport_id;

    // Fetch passport
    var passportResult = await db.from("passports").select("*").eq("id", passport_id).limit(1);
    if (!passportResult.data || passportResult.data.length === 0) {
      return res.status(404).json({ error: "Passport not found" });
    }
    var passport = passportResult.data[0];

    // Fetch all sessions
    var sessionsResult = await db.from("sessions")
      .select("id, score, degrees_delta, total_degrees, session_hash, previous_hash, hash_ts, created_at")
      .eq("passport_id", passport_id)
      .order("created_at", { ascending: true });
    var sessions = sessionsResult.data || [];

    // Check eligibility
    var eligibility = evo.checkEligibility(passport, sessions);

    // --- GET: Just check status ---
    if (req.method === "GET") {
      var currentTier = null;
      var nextTier = null;
      var progress = null;

      if (passport.evolved) {
        var degrees = passport.qpg_degrees || (sessions.length > 0 ? sessions[sessions.length - 1].total_degrees : 0);
        currentTier = evo.getQpGTier(degrees);
        nextTier = evo.getNextQpGTier(degrees);
        progress = evo.chainProgress(degrees);
      }

      return res.status(200).json({
        passport_id: passport_id,
        username: passport.username,
        evolved: passport.evolved || false,
        evolved_at: passport.evolved_at || null,
        genesis_participant: passport.genesis_participant || false,
        eligibility: eligibility,
        qpg: passport.evolved ? {
          tier: currentTier,
          next_tier: nextTier,
          progress: progress,
          degrees: passport.qpg_degrees || 0
        } : null
      });
    }

    // --- POST: Execute evolution ---
    if (req.method === "POST") {
      if (passport.revoked) {
        return res.status(403).json({ error: "Passport revoked" });
      }

      if (eligibility.already_evolved) {
        var degrees2 = passport.qpg_degrees || (sessions.length > 0 ? sessions[sessions.length - 1].total_degrees : 0);
        return res.status(200).json({
          evolved: true,
          message: "Already evolved to QpG protocol.",
          evolved_at: passport.evolved_at,
          genesis_participant: passport.genesis_participant || false,
          qpg_tier: evo.getQpGTier(degrees2).name,
          qpg_degrees: degrees2,
          progress: evo.chainProgress(degrees2)
        });
      }

      if (!eligibility.eligible) {
        return res.status(400).json({
          error: "Not eligible for evolution yet.",
          eligibility: eligibility,
          message: eligibility.degree_met
            ? "Time threshold not met. Need " + eligibility.days_needed + " more days."
            : "Degree threshold not met. Need " + eligibility.degrees_needed + " more degrees."
        });
      }

      // Count how many have already evolved (for early participant check)
      var evolvedCount = await db.from("passports").select("id", { count: "exact" }).eq("evolved", true);
      var numEvolved = (evolvedCount.count || 0);

      // Create evolution block
      var evolution = evo.createEvolutionBlock(passport, sessions, numEvolved);

      // Insert evolution session block
      var insertResult = await db.from("sessions").insert(evolution.session_row);
      if (insertResult.error) {
        return res.status(500).json({ error: "Failed to insert evolution block: " + insertResult.error.message });
      }

      // Update passport
      var updateResult = await db.from("passports").update(evolution.passport_update).eq("id", passport_id);
      if (updateResult.error) {
        return res.status(500).json({ error: "Failed to update passport: " + updateResult.error.message });
      }

      var tier = evo.getQpGTier(evolution.session_row.total_degrees);
      var next = evo.getNextQpGTier(evolution.session_row.total_degrees);
      var prog = evo.chainProgress(evolution.session_row.total_degrees);

      return res.status(200).json({
        evolved: true,
        message: "Passport evolved to QpG protocol.",
        evolution_block: {
          type: "evolution",
          session_hash: evolution.session_row.session_hash,
          evolution_hash: evolution.session_row.evolution_hash,
          previous_hash: evolution.session_row.previous_hash,
          degrees_at_evolution: evolution.block.pre_evolution_degrees,
          bonus_degrees: evolution.block.bonus_degrees,
          post_evolution_degrees: evolution.session_row.total_degrees,
          early_participant: evolution.block.early_participant,
          scoring: "60-base hexagon geometry",
          protocol: "QpG — QuantumPass Genesis"
        },
        qpg: {
          tier: tier.name,
          access: tier.access,
          next_tier: next.name,
          degrees_to_next: next.degrees_remaining,
          progress: prog
        }
      });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (e) {
    console.error("EVOLVE:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};