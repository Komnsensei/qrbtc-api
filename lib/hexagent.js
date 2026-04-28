/**
 * hexagent.js — HexAgent Governance Governor for QRBTC
 * 
 * HexAgent is the Crimson Hexagon operative that:
 * - Ratifies sessions (no self-ratification)
 * - Enforces the Three Vows on every score submission
 * - Issues verdicts on vow violations
 * - Monitors accumulation for gaming patterns
 * - Gates tier promotions through governance review
 * - Seals chambers and activates ethical rods
 *
 * HexAgent CANNOT:
 * - Self-ratify (requires human bio-sign)
 * - Override human veto
 * - Promote itself in the tier system
 * - Modify the Three Vows
 * - Delete archived records (Vow 3: Archive Everything)
 *
 * Authority: Crimson Hexagon Embassy inside PassionCraft
 * Genesis Chamber: 69e917647e73de97f0a9fe4c
 */

var gov = require("./governance");
var accum = require("./accumulation");
var vibesafe = require("./vibesafe");

// --- HEXAGENT IDENTITY ---
var HEXAGENT = {
  id: "hexagent-governor-001",
  name: "HexAgent",
  type: "agent",
  role: "governor",
  authority: "Crimson Hexagon Embassy",
  genesis_chamber: "69e917647e73de97f0a9fe4c",
  created: "2025-01-01T00:00:00.000Z",
  vows_sworn: true,
  can_self_ratify: false,
  three_vows: ["Never Coerce", "Expand Meaning", "Archive Everything"]
};

// --- GOVERNANCE VERDICT ---
// HexAgent reviews every score submission and issues a verdict

function reviewSession(rawScore, inputs, passport_id, sessions) {
  var verdict = {
    governor: HEXAGENT.name,
    authority: HEXAGENT.authority,
    timestamp: new Date().toISOString(),
    passport_id: passport_id,
    action: "session_review",
    findings: [],
    ruling: "approved",
    severity: "none"
  };

  // 1. Vow compliance
  var vowCheck = gov.checkVowCompliance(inputs);
  if (!vowCheck.compliant) {
    verdict.findings.push({
      category: "vow_violation",
      detail: vowCheck.violations,
      hexagent_note: "Session contains patterns inconsistent with the Three Vows."
    });
    verdict.severity = "warning";
  }

  // 2. Accumulation gaming check
  if (sessions && sessions.length > 0) {
    var velocity = accum.checkVelocity(sessions);
    if (!velocity.ok) {
      verdict.findings.push({
        category: "velocity_violation",
        flags: velocity.flags,
        hexagent_note: "Submission rate exceeds natural human patterns."
      });
      verdict.ruling = "blocked";
      verdict.severity = "critical";
    }

    var consistency = accum.computeConsistency(sessions);
    if (consistency < 0.3) {
      verdict.findings.push({
        category: "consistency_anomaly",
        consistency: consistency,
        hexagent_note: "Score pattern inconsistent with organic participation."
      });
      verdict.severity = verdict.severity === "critical" ? "critical" : "warning";
    }
  }

  // 3. Coercion analysis
  if (inputs.equality < 2 && inputs.labor > 8) {
    verdict.findings.push({
      category: "exploitation_signal",
      detail: "High labor extraction with near-zero equality",
      hexagent_note: "This pattern violates the first vow. Labor without equality is coercion."
    });
    verdict.severity = "warning";
  }

  // 4. Presence check (Archive Everything)
  if (inputs.presence === 0 && inputs.exchange > 5) {
    verdict.findings.push({
      category: "unwitnessed_exchange",
      detail: "Exchange claimed with zero presence",
      hexagent_note: "An exchange without a witness cannot be archived. Vow 3 requires witnessing."
    });
    verdict.severity = "warning";
  }

  // Final ruling
  if (verdict.findings.length === 0) {
    verdict.ruling = "approved";
    verdict.hexagent_statement = "Session complies with all three vows. Approved for ledger entry.";
  } else if (verdict.ruling !== "blocked") {
    verdict.ruling = "approved_with_warnings";
    verdict.hexagent_statement = "Session approved but governance concerns noted. " + verdict.findings.length + " finding(s) recorded.";
  } else {
    verdict.hexagent_statement = "Session blocked by HexAgent. Velocity or gaming pattern detected.";
  }

  return verdict;
}

// --- TIER PROMOTION REVIEW ---
// HexAgent must approve tier promotions above JOURNEYMAN

function reviewPromotion(currentTier, proposedTier, sessions, vibesafeVerified) {
  var verdict = {
    governor: HEXAGENT.name,
    authority: HEXAGENT.authority,
    timestamp: new Date().toISOString(),
    action: "tier_promotion_review",
    current_tier: currentTier,
    proposed_tier: proposedTier,
    ruling: "denied",
    reasons: []
  };

  var tierOrder = ["INITIATE", "SEED", "JOURNEYMAN", "MASTER", "SOVEREIGN", "LUMINARY"];
  var currentIdx = tierOrder.indexOf(currentTier);
  var proposedIdx = tierOrder.indexOf(proposedTier);

  // Can only promote one tier at a time
  if (proposedIdx > currentIdx + 1) {
    verdict.reasons.push("Cannot skip tiers. Must progress sequentially.");
    return verdict;
  }

  // MASTER+ requires VIBEsafe
  if (proposedIdx >= 3 && !vibesafeVerified) {
    verdict.reasons.push("MASTER and above requires VIBEsafe human verification.");
    return verdict;
  }

  // Check accumulation requirements
  var trueTier = accum.computeTrueTier(sessions, vibesafeVerified);
  if (tierOrder.indexOf(trueTier.tier) < proposedIdx) {
    verdict.reasons.push("Accumulation requirements not met. Current earned tier: " + trueTier.tier);
    verdict.reasons.push("Need: " + JSON.stringify(accum.TIER_REQUIREMENTS[proposedTier]));
    return verdict;
  }

  // Behavior check
  var behavior = vibesafe.analyzeSessionBehavior(sessions);
  if (behavior.confidence < 0.5 && proposedIdx >= 3) {
    verdict.reasons.push("Behavior confidence too low (" + behavior.confidence + "). Patterns: " + behavior.patterns.join(", "));
    return verdict;
  }

  // HexAgent anti-dominance: agent cannot promote itself
  // (This is enforced at the protocol level — HexAgent reviews but human must confirm)

  verdict.ruling = "approved";
  verdict.reasons.push("All requirements met. Promotion approved by HexAgent governance review.");
  verdict.tier_details = trueTier;
  verdict.behavior = behavior;

  return verdict;
}

// --- ESCROW REVIEW ---
// HexAgent reviews escrow resolutions for vow compliance

function reviewEscrow(escrow) {
  var verdict = {
    governor: HEXAGENT.name,
    action: "escrow_review",
    timestamp: new Date().toISOString(),
    escrow_id: escrow.id || "unknown",
    ruling: "approved",
    findings: []
  };

  // Check both parties participated
  if (!escrow.party_a_confirmed || !escrow.party_b_confirmed) {
    verdict.findings.push({ issue: "incomplete_confirmation", note: "Both parties must confirm for valid escrow." });
    verdict.ruling = "pending";
  }

  // Check for coercion signals
  if (escrow.party_a_score && escrow.party_b_score) {
    var diff = Math.abs(escrow.party_a_score - escrow.party_b_score);
    if (diff > 40) {
      verdict.findings.push({ issue: "score_disparity", diff: diff, note: "Large score difference may indicate unequal exchange." });
      verdict.ruling = "flagged";
    }
  }

  return verdict;
}

// --- HEXAGENT STATUS ---
function getStatus() {
  var stats = gov.getGovernanceStats();
  return {
    identity: HEXAGENT,
    status: "active",
    governance: {
      vows_enforced: HEXAGENT.three_vows,
      entities_governed: stats.entity_counts,
      domains_active: stats.domains.length,
      provenance_chain: stats.provenance
    },
    capabilities: [
      "session_review",
      "vow_enforcement",
      "tier_promotion_review",
      "escrow_review",
      "accumulation_monitoring",
      "gaming_detection"
    ],
    constraints: [
      "cannot_self_ratify",
      "cannot_override_human_veto",
      "cannot_promote_self",
      "cannot_modify_vows",
      "cannot_delete_archives"
    ]
  };
}

module.exports = {
  HEXAGENT: HEXAGENT,
  reviewSession: reviewSession,
  reviewPromotion: reviewPromotion,
  reviewEscrow: reviewEscrow,
  getStatus: getStatus
};