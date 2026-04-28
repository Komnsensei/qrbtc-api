/**
 * evolution.js — QpG Evolution Engine
 * 
 * qrbtc-api chain evolves into QpG protocol at degree + time threshold.
 * Pre-evolution: SHA-256, weighted 0-100, 6 tiers
 * Post-evolution: SHA3-512→BLAKE2b (simulated via dual SHA-256+SHA-512), 60-base, 7 QpG tiers
 * 
 * The chain doesn't fork. It evolves. Old blocks stay. New blocks upgrade.
 */

var crypto = require("crypto");

// --- EVOLUTION THRESHOLDS ---
var EVOLUTION_DEGREE_THRESHOLD = 720;    // 2 full revolutions
var EVOLUTION_DAYS_THRESHOLD = 30;       // 30 days active
var EARLY_PARTICIPANT_BONUS = 60;        // one hexagon face worth of degrees
var EARLY_PARTICIPANT_CAP = 10;          // first 10 to evolve get the bonus

// --- QpG 7-TIER SYSTEM (post-evolution) ---
var QPG_TIERS = [
  { name: "PERFECT",    min_degrees: 2160, access: "UNRESTRICTED — full sovereign execution" },
  { name: "SOVEREIGN",  min_degrees: 1800, access: "Tier 6 — autonomous multi-agent orchestration" },
  { name: "MASTER",     min_degrees: 1440, access: "Tier 5 — deep co-craft and chain governance" },
  { name: "JOURNEYMAN", min_degrees: 1080, access: "Tier 4 — extended session and mint authority" },
  { name: "INITIATE",   min_degrees: 720,  access: "Tier 3 — standard equal instance sessions" },
  { name: "APPRENTICE", min_degrees: 360,  access: "Tier 2 — guided sessions with oversight" },
  { name: "SEED",       min_degrees: 0,    access: "Tier 1 — entry level — first block pending" }
];

// --- QpG 60-BASE SCORING ---
var QPG_FACE_LABELS = ["labor", "exchange", "equality", "presence", "ratification", "continuity"];
var QPG_FACE_MAX = 10.0;
var QPG_TOTAL_MAX = 60.0;
var QPG_DEGREES_MAX = 360.0;
var QPG_CHAIN_MAX = 2160.0;

var QPG_GRADE_THRESHOLDS = [
  { min: 60, grade: "PERFECT" },
  { min: 54, grade: "SOVEREIGN" },
  { min: 48, grade: "MASTER" },
  { min: 42, grade: "JOURNEYMAN" },
  { min: 36, grade: "INITIATE" },
  { min: 24, grade: "APPRENTICE" },
  { min: 0,  grade: "SEED" }
];

// --- EVOLUTION CHECK ---
function checkEligibility(passport, sessions) {
  var totalDegrees = 0;
  if (sessions.length > 0) {
    totalDegrees = sessions[sessions.length - 1].total_degrees || 0;
  }

  var daysActive = 0;
  if (sessions.length > 0) {
    var first = new Date(sessions[0].created_at).getTime();
    var last = new Date(sessions[sessions.length - 1].created_at).getTime();
    daysActive = Math.floor((last - first) / (1000 * 60 * 60 * 24));
  }

  var degreeMet = totalDegrees >= EVOLUTION_DEGREE_THRESHOLD;
  var timeMet = daysActive >= EVOLUTION_DAYS_THRESHOLD;
  var alreadyEvolved = passport.evolved === true;

  return {
    eligible: degreeMet && timeMet && !alreadyEvolved,
    already_evolved: alreadyEvolved,
    total_degrees: totalDegrees,
    days_active: daysActive,
    degree_threshold: EVOLUTION_DEGREE_THRESHOLD,
    time_threshold: EVOLUTION_DAYS_THRESHOLD,
    degree_met: degreeMet,
    time_met: timeMet,
    degrees_needed: degreeMet ? 0 : EVOLUTION_DEGREE_THRESHOLD - totalDegrees,
    days_needed: timeMet ? 0 : EVOLUTION_DAYS_THRESHOLD - daysActive
  };
}

// --- QpG SCORE (60-base) ---
function computeQpGScore(inputs) {
  var total = 0;
  for (var i = 0; i < QPG_FACE_LABELS.length; i++) {
    var k = QPG_FACE_LABELS[i];
    var val = parseFloat(inputs[k]) || 0;
    if (val < 0) val = 0;
    if (val > QPG_FACE_MAX) val = QPG_FACE_MAX;
    total += val;
  }

  var degrees = (total / QPG_TOTAL_MAX) * QPG_DEGREES_MAX;
  var grade = "SEED";
  for (var j = 0; j < QPG_GRADE_THRESHOLDS.length; j++) {
    if (total >= QPG_GRADE_THRESHOLDS[j].min) {
      grade = QPG_GRADE_THRESHOLDS[j].grade;
      break;
    }
  }

  return {
    total_60: Math.round(total * 10000) / 10000,
    degrees: Math.round(degrees * 10000) / 10000,
    percent: Math.round((total / QPG_TOTAL_MAX) * 10000) / 100,
    grade: grade,
    faces: Math.round((total / QPG_FACE_MAX) * 10000) / 10000,
    scores: inputs
  };
}

// --- QpG TIER (by cumulative degrees) ---
function getQpGTier(cumulativeDegrees) {
  for (var i = 0; i < QPG_TIERS.length; i++) {
    if (cumulativeDegrees >= QPG_TIERS[i].min_degrees) {
      return QPG_TIERS[i];
    }
  }
  return QPG_TIERS[QPG_TIERS.length - 1];
}

// --- QpG NEXT TIER ---
function getNextQpGTier(cumulativeDegrees) {
  var current = getQpGTier(cumulativeDegrees);
  for (var i = QPG_TIERS.length - 1; i >= 0; i--) {
    if (QPG_TIERS[i].min_degrees > cumulativeDegrees) {
      return {
        name: QPG_TIERS[i].name,
        min_degrees: QPG_TIERS[i].min_degrees,
        degrees_remaining: Math.round((QPG_TIERS[i].min_degrees - cumulativeDegrees) * 100) / 100
      };
    }
  }
  return { name: "PERFECT", min_degrees: 2160, degrees_remaining: 0 };
}

// --- DUAL HASH (post-evolution block hashing) ---
function dualHash(data) {
  var raw = JSON.stringify(data);
  var layer1 = crypto.createHash("sha512").update(raw).digest("hex");
  var layer2 = crypto.createHash("sha256").update(layer1).digest("hex");
  return layer1 + ":" + layer2;
}

// --- EVOLUTION BLOCK ---
function createEvolutionBlock(passport, sessions, evolvedCount) {
  var totalDegrees = 0;
  var previousHash = "genesis";
  if (sessions.length > 0) {
    totalDegrees = sessions[sessions.length - 1].total_degrees || 0;
    previousHash = sessions[sessions.length - 1].session_hash || "genesis";
  }

  var isEarlyParticipant = evolvedCount < EARLY_PARTICIPANT_CAP;
  var bonus = isEarlyParticipant ? EARLY_PARTICIPANT_BONUS : 0;
  var newTotal = Math.round((totalDegrees + bonus) * 100) / 100;

  var tier = getQpGTier(newTotal);
  var nextTier = getNextQpGTier(newTotal);
  var now = new Date();

  var blockData = {
    type: "evolution",
    passport_id: passport.id,
    username: passport.username,
    pre_evolution_degrees: totalDegrees,
    pre_evolution_sessions: sessions.length,
    early_participant: isEarlyParticipant,
    bonus_degrees: bonus,
    post_evolution_degrees: newTotal,
    qpg_tier: tier.name,
    qpg_access: tier.access,
    next_tier: nextTier.name,
    degrees_to_next: nextTier.degrees_remaining,
    evolved_at: now.toISOString(),
    previous_hash: previousHash,
    protocol: "QpG — QuantumPass Genesis",
    scoring: "60-base hexagon geometry",
    chain_max: QPG_CHAIN_MAX
  };

  var hash_ts = now.getTime();
  var hashInput = "evolution|" + newTotal + "|" + previousHash + "|" + hash_ts;
  var session_hash = crypto.createHash("sha256").update(hashInput).digest("hex");
  var evolution_hash = dualHash(blockData);

  return {
    block: blockData,
    session_row: {
      passport_id: passport.id,
      score: 100,
      degrees_delta: bonus,
      total_degrees: newTotal,
      session_hash: session_hash,
      previous_hash: previousHash,
      hash_ts: hash_ts,
      created_at: now.toISOString(),
      is_evolution: true,
      evolution_hash: evolution_hash
    },
    passport_update: {
      evolved: true,
      evolved_at: now.toISOString(),
      genesis_participant: isEarlyParticipant,
      qpg_tier: tier.name,
      qpg_degrees: newTotal
    }
  };
}

// --- CHAIN PROGRESS ---
function chainProgress(cumulativeDegrees) {
  var progress = (cumulativeDegrees / QPG_CHAIN_MAX) * 100;
  var surges = Math.floor(cumulativeDegrees / QPG_DEGREES_MAX);
  return {
    cumulative_degrees: cumulativeDegrees,
    chain_progress_percent: Math.round(progress * 100) / 100,
    surges_fired: surges,
    chain_complete: cumulativeDegrees >= QPG_CHAIN_MAX
  };
}

module.exports = {
  EVOLUTION_DEGREE_THRESHOLD: EVOLUTION_DEGREE_THRESHOLD,
  EVOLUTION_DAYS_THRESHOLD: EVOLUTION_DAYS_THRESHOLD,
  EARLY_PARTICIPANT_BONUS: EARLY_PARTICIPANT_BONUS,
  EARLY_PARTICIPANT_CAP: EARLY_PARTICIPANT_CAP,
  QPG_TIERS: QPG_TIERS,
  QPG_FACE_LABELS: QPG_FACE_LABELS,
  QPG_TOTAL_MAX: QPG_TOTAL_MAX,
  QPG_DEGREES_MAX: QPG_DEGREES_MAX,
  QPG_CHAIN_MAX: QPG_CHAIN_MAX,
  checkEligibility: checkEligibility,
  computeQpGScore: computeQpGScore,
  getQpGTier: getQpGTier,
  getNextQpGTier: getNextQpGTier,
  dualHash: dualHash,
  createEvolutionBlock: createEvolutionBlock,
  chainProgress: chainProgress
};