/**
 * accumulation.js — Anti-Gaming Accumulation Engine
 */

var TIER_REQUIREMENTS = {
  INITIATE:   { min_sessions: 0,  min_avg: 0,  min_days_active: 0,  vibesafe_required: false, min_consistency: 0 },
  SEED:       { min_sessions: 3,  min_avg: 20, min_days_active: 1,  vibesafe_required: false, min_consistency: 0 },
  JOURNEYMAN: { min_sessions: 10, min_avg: 40, min_days_active: 3,  vibesafe_required: false, min_consistency: 0.3 },
  MASTER:     { min_sessions: 25, min_avg: 55, min_days_active: 7,  vibesafe_required: true,  min_consistency: 0.5 },
  SOVEREIGN:  { min_sessions: 50, min_avg: 70, min_days_active: 21, vibesafe_required: true,  min_consistency: 0.6 },
  LUMINARY:   { min_sessions: 100,min_avg: 80, min_days_active: 60, vibesafe_required: true,  min_consistency: 0.7 },
};

var COOLDOWN_MS = 5 * 60 * 1000;
var MAX_SESSIONS_PER_DAY = 10;
var MAX_SESSIONS_PER_HOUR = 3;

function diminishingFactor(sessionNumber) {
  if (sessionNumber <= 1) return 1.0;
  return 1.0 / (1.0 + 0.15 * Math.log(sessionNumber));
}

function computeWeightedAverage(sessions) {
  if (!sessions || sessions.length === 0) return 0;
  var totalWeight = 0;
  var weightedSum = 0;
  for (var i = 0; i < sessions.length; i++) {
    var recencyWeight = 0.3 + 0.7 * (i / Math.max(1, sessions.length - 1));
    totalWeight += recencyWeight;
    weightedSum += sessions[i].score * recencyWeight;
  }
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

function computeConsistency(sessions) {
  if (!sessions || sessions.length < 3) return 1.0;
  var scores = sessions.map(function(s) { return s.score; });
  var mean = scores.reduce(function(a, b) { return a + b; }, 0) / scores.length;
  var variance = scores.reduce(function(sum, s) { return sum + Math.pow(s - mean, 2); }, 0) / scores.length;
  var stddev = Math.sqrt(variance);
  var cv = mean > 0 ? stddev / mean : 1;
  if (cv < 0.02 && mean > 90) return 0.2;
  if (cv > 0.6) return 0.3;
  return Math.max(0, Math.min(1, 1 - cv));
}

function checkVelocity(sessions) {
  var flags = [];
  if (sessions.length < 2) return { ok: true, flags: flags };

  var oneHourAgo = Date.now() - (60 * 60 * 1000);
  var lastHour = sessions.filter(function(s) { return new Date(s.created_at).getTime() > oneHourAgo; });
  if (lastHour.length >= MAX_SESSIONS_PER_HOUR) flags.push("hourly_cap_reached");

  var oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  var lastDay = sessions.filter(function(s) { return new Date(s.created_at).getTime() > oneDayAgo; });
  if (lastDay.length >= MAX_SESSIONS_PER_DAY) flags.push("daily_cap_reached");

  var lastSession = sessions[sessions.length - 1];
  var timeSinceLast = Date.now() - new Date(lastSession.created_at).getTime();
  if (timeSinceLast < COOLDOWN_MS) flags.push("cooldown_active");

  if (sessions.length >= 5) {
    var last5 = sessions.slice(-5);
    var allSame = last5.every(function(s) { return s.score === last5[0].score; });
    if (allSame && last5[0].score > 80) flags.push("identical_scores_suspicious");
  }

  return {
    ok: flags.length === 0,
    flags: flags,
    sessions_last_hour: lastHour.length,
    sessions_last_day: lastDay.length,
    cooldown_remaining_ms: Math.max(0, COOLDOWN_MS - timeSinceLast)
  };
}

function computeDaysActive(sessions) {
  if (!sessions || sessions.length === 0) return 0;
  var days = {};
  sessions.forEach(function(s) { days[new Date(s.created_at).toISOString().slice(0, 10)] = true; });
  return Object.keys(days).length;
}

function computeTrueTier(sessions, vibesafeVerified) {
  var sessionCount = sessions.length;
  var weightedAvg = computeWeightedAverage(sessions);
  var consistency = computeConsistency(sessions);
  var daysActive = computeDaysActive(sessions);

  var tierList = ["LUMINARY", "SOVEREIGN", "MASTER", "JOURNEYMAN", "SEED", "INITIATE"];
  var achievedTier = "INITIATE";

  for (var i = 0; i < tierList.length; i++) {
    var tier = tierList[i];
    var req = TIER_REQUIREMENTS[tier];
    if (sessionCount >= req.min_sessions && weightedAvg >= req.min_avg &&
        daysActive >= req.min_days_active && consistency >= req.min_consistency &&
        (!req.vibesafe_required || vibesafeVerified)) {
      achievedTier = tier;
      break;
    }
  }

  var tierOrder = ["INITIATE", "SEED", "JOURNEYMAN", "MASTER", "SOVEREIGN", "LUMINARY"];
  var currentIdx = tierOrder.indexOf(achievedTier);
  var nextTier = currentIdx < tierOrder.length - 1 ? tierOrder[currentIdx + 1] : null;
  var nextReq = nextTier ? TIER_REQUIREMENTS[nextTier] : null;
  var progress = null;
  if (nextReq) {
    progress = {
      next_tier: nextTier,
      sessions: { have: sessionCount, need: nextReq.min_sessions },
      avg_score: { have: weightedAvg, need: nextReq.min_avg },
      days_active: { have: daysActive, need: nextReq.min_days_active },
      consistency: { have: Math.round(consistency * 100) / 100, need: nextReq.min_consistency },
      vibesafe: { have: vibesafeVerified, need: nextReq.vibesafe_required }
    };
  }

  return {
    tier: achievedTier, weighted_avg: weightedAvg,
    consistency: Math.round(consistency * 100) / 100,
    sessions: sessionCount, days_active: daysActive,
    vibesafe_verified: vibesafeVerified, progress: progress
  };
}

function computeDegreesDelta(score, sessionNumber) {
  var baseDegrees = (score / 100) * 360;
  var factor = diminishingFactor(sessionNumber);
  var adjusted = Math.round(baseDegrees * factor * 100) / 100;
  return { base_degrees: Math.round(baseDegrees * 100) / 100, diminishing_factor: Math.round(factor * 1000) / 1000, adjusted_degrees: adjusted, session_number: sessionNumber };
}

module.exports = {
  TIER_REQUIREMENTS: TIER_REQUIREMENTS, COOLDOWN_MS: COOLDOWN_MS,
  MAX_SESSIONS_PER_DAY: MAX_SESSIONS_PER_DAY, MAX_SESSIONS_PER_HOUR: MAX_SESSIONS_PER_HOUR,
  diminishingFactor: diminishingFactor, computeWeightedAverage: computeWeightedAverage,
  computeConsistency: computeConsistency, checkVelocity: checkVelocity,
  computeDaysActive: computeDaysActive, computeTrueTier: computeTrueTier,
  computeDegreesDelta: computeDegreesDelta,
};