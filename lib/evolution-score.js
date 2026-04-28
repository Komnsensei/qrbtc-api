/**
 * evolution-score.js — Dual-mode scoring
 * 
 * Pre-evolution passports: weighted 0-100 (existing qrbtc.js)
 * Post-evolution passports: 60-base QpG scoring
 * 
 * Drop-in wrapper that checks passport.evolved and routes accordingly.
 */

var qrbtc = require("./qrbtc");
var evo = require("./evolution");

function computeScore(inputs, passport) {
  if (passport && passport.evolved) {
    return computeEvolvedScore(inputs);
  }
  return computeStandardScore(inputs);
}

function computeStandardScore(inputs) {
  var score = qrbtc.computeScore(inputs);
  return {
    mode: "standard",
    score: score,
    scoring: "weighted-100"
  };
}

function computeEvolvedScore(inputs) {
  var qpg = evo.computeQpGScore(inputs);
  // Map 60-base to 0-100 for backward compatibility in the sessions table
  var compatScore = Math.round((qpg.total_60 / evo.QPG_TOTAL_MAX) * 100 * 100) / 100;

  return {
    mode: "qpg",
    score: compatScore,
    qpg_total_60: qpg.total_60,
    qpg_degrees: qpg.degrees,
    qpg_grade: qpg.grade,
    qpg_percent: qpg.percent,
    scoring: "60-base-hexagon"
  };
}

function computeDegrees(scoreResult, sessionNumber) {
  if (scoreResult.mode === "qpg") {
    // QpG: degrees come directly from the 60-base math. No diminishing returns.
    return {
      degrees: scoreResult.qpg_degrees,
      base_degrees: scoreResult.qpg_degrees,
      diminishing_factor: 1.0,
      mode: "qpg"
    };
  }
  // Standard: use existing accumulation logic (caller handles this)
  return null;
}

module.exports = {
  computeScore: computeScore,
  computeDegrees: computeDegrees
};