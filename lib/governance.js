/**
 * governance.js — PassionCraft Governance Engine for QRBTC API
 * Loads bead/rod/chamber/thread/escrow data and provides:
 *   - Score modifiers based on governance compliance
 *   - Vow violation detection
 *   - Bead minting validation
 *   - Chamber context for scoring sessions
 *   - Live monitoring hooks for QuantumPass middleware
 */
var fs = require("fs");
var path = require("path");

var DATA_DIR = path.join(__dirname, "..", "passioncraft-data");

// --- LAZY LOAD WITH CACHE ---
var _cache = {};
function loadEntity(name) {
  if (_cache[name]) return _cache[name];
  try {
    var filePath = path.join(DATA_DIR, "entities", name + ".json");
    _cache[name] = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error("governance: failed to load " + name + ": " + e.message);
    _cache[name] = [];
  }
  return _cache[name];
}

function loadGovernance(name) {
  if (_cache["gov_" + name]) return _cache["gov_" + name];
  try {
    var filePath = path.join(DATA_DIR, "governance", name + ".json");
    _cache["gov_" + name] = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error("governance: failed to load gov/" + name + ": " + e.message);
    _cache["gov_" + name] = [];
  }
  return _cache["gov_" + name];
}

// Force reload (call after data updates)
function reloadAll() {
  _cache = {};
  return {
    beads: loadEntity("bead").length,
    rods: loadEntity("ethicalrod").length,
    chambers: loadEntity("chamber").length,
    threads: loadEntity("thread").length,
    escrows: loadEntity("resolveescrow").length,
    artifacts: loadEntity("artifact").length,
    documents: loadEntity("agentdocument").length
  };
}

// --- THREE VOWS CHECK ---
var THREE_VOWS = ["Never Coerce", "Expand Meaning", "Archive Everything"];

// Coercion patterns in score submissions
var COERCION_SIGNALS = [
  function(inputs) { return inputs.equality < 2 && inputs.labor > 8; }, // exploitative: high labor, no equality
  function(inputs) { return inputs.ratification < 1; }, // unratified session
  function(inputs) { return inputs.presence < 1 && inputs.exchange > 8; }, // absent but claiming exchange
  function(inputs) { return inputs.continuity < 1 && inputs.labor > 9; }, // no continuity but max labor = grind
];

function checkVowCompliance(inputs) {
  var violations = [];

  // Vow 1: Never Coerce — check for exploitative patterns
  for (var i = 0; i < COERCION_SIGNALS.length; i++) {
    if (COERCION_SIGNALS[i](inputs)) {
      violations.push({
        vow: "Never Coerce",
        signal: "coercion_pattern_" + i,
        severity: "warning"
      });
    }
  }

  // Vow 2: Expand Meaning — all zeros = nothing expanded
  var total = 0;
  var fields = ["labor", "exchange", "equality", "presence", "ratification", "continuity"];
  for (var j = 0; j < fields.length; j++) total += (inputs[fields[j]] || 0);
  if (total < 6) {
    violations.push({
      vow: "Expand Meaning",
      signal: "below_minimum_meaning_threshold",
      severity: "info"
    });
  }

  // Vow 3: Archive Everything — presence=0 means unwitnessed
  if (inputs.presence === 0) {
    violations.push({
      vow: "Archive Everything",
      signal: "unwitnessed_session",
      severity: "warning"
    });
  }

  return {
    compliant: violations.filter(function(v) { return v.severity === "warning"; }).length === 0,
    violations: violations
  };
}

// --- SCORE MODIFIERS ---
// Governance context can adjust the raw score

function computeGovernanceModifier(inputs, passport_id) {
  var modifier = 0;
  var notes = [];

  // Ratification bonus: fully ratified sessions earn trust
  if (inputs.ratification >= 8) {
    modifier += 2;
    notes.push("ratification_bonus");
  }

  // Equality premium: balanced sessions score higher
  var spread = Math.max(inputs.labor, inputs.exchange, inputs.equality, inputs.presence) -
               Math.min(inputs.labor, inputs.exchange, inputs.equality, inputs.presence);
  if (spread <= 3) {
    modifier += 1.5;
    notes.push("balance_bonus");
  }

  // Continuity chain: returning participants get continuity credit
  if (inputs.continuity >= 7) {
    modifier += 1;
    notes.push("continuity_credit");
  }

  // Vow compliance check — violations reduce modifier
  var vowCheck = checkVowCompliance(inputs);
  if (!vowCheck.compliant) {
    modifier -= 3;
    notes.push("vow_violation_penalty");
  }

  // Cap modifier
  if (modifier > 5) modifier = 5;
  if (modifier < -5) modifier = -5;

  return {
    modifier: Math.round(modifier * 100) / 100,
    notes: notes,
    vow_check: vowCheck
  };
}

// --- CHAMBER CONTEXT ---
function getChamberContext(chamber_id) {
  var chambers = loadEntity("chamber");
  var chamber = null;
  for (var i = 0; i < chambers.length; i++) {
    if (chambers[i].id === chamber_id) { chamber = chambers[i]; break; }
  }
  if (!chamber) return null;

  // Get associated rods
  var rods = loadEntity("ethicalrod");
  var chamberRods = [];
  for (var j = 0; j < rods.length; j++) {
    if (rods[j].chamber_id === chamber_id && rods[j].active) {
      chamberRods.push({
        principle: rods[j].principle,
        enforced_by: rods[j].enforced_by
      });
    }
  }

  // Get associated beads
  var beads = loadEntity("bead");
  var chamberBeads = 0;
  for (var k = 0; k < beads.length; k++) {
    if (beads[k].chamber_id === chamber_id) chamberBeads++;
  }

  return {
    id: chamber.id,
    name: chamber.name,
    domain: chamber.domain,
    status: chamber.status,
    hierarchy_level: chamber.hierarchy_level,
    active_rods: chamberRods.length,
    rods: chamberRods,
    bead_count: chamberBeads
  };
}

// --- BEAD VALIDATION ---
function validateBeadMint(bead_type, chamber_id, author_type) {
  var valid_types = ["semantic", "somatic", "archive", "co-craft", "ethical", "prestige"];
  if (valid_types.indexOf(bead_type) === -1) {
    return { valid: false, reason: "Invalid bead_type: " + bead_type };
  }

  if (bead_type === "prestige" && author_type !== "bio") {
    return { valid: false, reason: "Prestige beads require bio authorship" };
  }

  if (bead_type === "ethical") {
    // Check chamber has active rods
    var ctx = getChamberContext(chamber_id);
    if (!ctx) return { valid: false, reason: "Chamber not found" };
    if (ctx.active_rods === 0) return { valid: false, reason: "No active rods in chamber" };
  }

  return { valid: true };
}

// --- MONITORING: LIVE SCORE ENRICHMENT ---
// Called by score.js to enrich every score submission

function enrichScore(rawScore, inputs, passport_id) {
  var govMod = computeGovernanceModifier(inputs, passport_id);
  var adjustedScore = Math.max(0, Math.min(100, rawScore + govMod.modifier));
  adjustedScore = Math.round(adjustedScore * 100) / 100;

  return {
    raw_score: rawScore,
    governance_modifier: govMod.modifier,
    adjusted_score: adjustedScore,
    governance_notes: govMod.notes,
    vow_compliance: govMod.vow_check.compliant,
    vow_violations: govMod.vow_check.violations,
    three_vows: THREE_VOWS
  };
}

// --- GOVERNANCE STATS ---
function getGovernanceStats() {
  var index = loadGovernance("index");
  return {
    three_vows: THREE_VOWS,
    entity_counts: {
      beads: loadEntity("bead").length,
      ethical_rods: loadEntity("ethicalrod").length,
      chambers: loadEntity("chamber").length,
      threads: loadEntity("thread").length,
      escrows: loadEntity("resolveescrow").length,
      artifacts: loadEntity("artifact").length,
      documents: loadEntity("agentdocument").length,
      profiles: loadEntity("profile").length,
      tasks: loadEntity("task").length,
      workflow_runs: loadEntity("workflowrun").length
    },
    provenance: index.provenance_chain || {},
    domains: index.domains || []
  };
}

// --- THREAD/BEAD SEARCH ---
function searchBeads(query, limit) {
  limit = limit || 20;
  var beads = loadEntity("bead");
  var q = (query || "").toLowerCase();
  var results = [];
  for (var i = 0; i < beads.length && results.length < limit; i++) {
    var content = (beads[i].content || "").toLowerCase();
    if (content.indexOf(q) !== -1) {
      results.push({
        id: beads[i].id,
        bead_type: beads[i].bead_type,
        chamber_id: beads[i].chamber_id,
        author_name: beads[i].author_name,
        content_preview: (beads[i].content || "").slice(0, 300)
      });
    }
  }
  return results;
}

function searchThreads(domain, status) {
  var threads = loadEntity("thread");
  return threads.filter(function(t) {
    if (domain && t.domain !== domain) return false;
    if (status && t.status !== status) return false;
    return true;
  });
}

module.exports = {
  // Core
  checkVowCompliance: checkVowCompliance,
  computeGovernanceModifier: computeGovernanceModifier,
  enrichScore: enrichScore,

  // Chamber + Bead
  getChamberContext: getChamberContext,
  validateBeadMint: validateBeadMint,

  // Search + Stats
  getGovernanceStats: getGovernanceStats,
  searchBeads: searchBeads,
  searchThreads: searchThreads,

  // Data management
  reloadAll: reloadAll,
  loadEntity: loadEntity,
  loadGovernance: loadGovernance,

  // Constants
  THREE_VOWS: THREE_VOWS
};