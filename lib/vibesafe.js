/**
 * vibesafe.js — Human Verification Layer for QRBTC
 * 5 methods, multiplicative confidence, geometric mean
 */
var crypto = require("crypto");

var THRESHOLDS = { MASTER: 0.4, SOVEREIGN: 0.6, LUMINARY: 0.8 };
var ACTIVE_CHALLENGES = {};

function generateChallenge(passport_id) {
  var types = [
    function() {
      var a = Math.floor(Math.random() * 20) + 5;
      var b = Math.floor(Math.random() * 20) + 5;
      var op = Math.random() > 0.5 ? "+" : "*";
      var answer = op === "+" ? a + b : a * b;
      return { question: "What is " + a + " " + op + " " + b + "?", answer: String(answer), type: "math" };
    },
    function() {
      var vows = ["Never Coerce", "Expand Meaning", "Archive Everything"];
      var idx = Math.floor(Math.random() * 3);
      return { question: "What is the " + ["first", "second", "third"][idx] + " vow of the Three Vows?", answer: vows[idx].toLowerCase(), type: "knowledge" };
    },
    function() {
      var word = ["sovereignty", "coherence", "provenance", "governance", "escrow"][Math.floor(Math.random() * 5)];
      return { question: "Type this word backwards: " + word, answer: word.split("").reverse().join(""), type: "reversal" };
    },
  ];
  var gen = types[Math.floor(Math.random() * types.length)]();
  var challenge = {
    id: crypto.randomBytes(16).toString("hex"), question: gen.question,
    answer: gen.answer, type: gen.type, expires: Date.now() + 300000, created: Date.now()
  };
  ACTIVE_CHALLENGES[passport_id] = challenge;
  return { challenge_id: challenge.id, question: challenge.question, type: challenge.type, expires_in_seconds: 300 };
}

function verifyChallenge(passport_id, challenge_id, answer) {
  var ch = ACTIVE_CHALLENGES[passport_id];
  if (!ch) return { verified: false, reason: "no_active_challenge" };
  if (ch.id !== challenge_id) return { verified: false, reason: "wrong_challenge_id" };
  if (Date.now() > ch.expires) { delete ACTIVE_CHALLENGES[passport_id]; return { verified: false, reason: "expired" }; }
  var correct = answer.trim().toLowerCase() === ch.answer.toLowerCase();
  var responseTime = Date.now() - ch.created;
  var fast = responseTime < 500;
  var slow = responseTime > 240000;
  delete ACTIVE_CHALLENGES[passport_id];
  if (!correct) return { verified: false, reason: "wrong_answer", confidence: 0 };
  var confidence = 1.0;
  if (fast) confidence *= 0.2;
  if (slow) confidence *= 0.5;
  return { verified: true, confidence: Math.round(confidence * 100) / 100, response_time_ms: responseTime, flags: [].concat(fast ? ["too_fast"] : [], slow ? ["too_slow"] : []) };
}

function analyzeSessionBehavior(sessions) {
  if (!sessions || sessions.length < 3) return { confidence: 0.5, reason: "insufficient_data", patterns: [] };
  var confidence = 1.0;
  var patterns = [];
  var intervals = [];
  for (var i = 1; i < sessions.length; i++) {
    intervals.push(new Date(sessions[i].created_at).getTime() - new Date(sessions[i-1].created_at).getTime());
  }
  if (intervals.length >= 5) {
    var avgI = intervals.reduce(function(a, b) { return a + b; }, 0) / intervals.length;
    var varI = intervals.reduce(function(s, iv) { return s + Math.pow(iv - avgI, 2); }, 0) / intervals.length;
    var cvI = avgI > 0 ? Math.sqrt(varI) / avgI : 0;
    if (cvI < 0.05) { confidence *= 0.2; patterns.push("machine_regular_intervals"); }
    else if (cvI > 0.3) { patterns.push("human_irregular_intervals"); }
  }
  var scores = sessions.map(function(s) { return s.score; });
  var scoreSet = {};
  scores.forEach(function(s) { scoreSet[s] = true; });
  var unique = Object.keys(scoreSet).length;
  if (unique === 1 && sessions.length > 5) { confidence *= 0.1; patterns.push("identical_scores"); }
  else if (unique < sessions.length * 0.3 && sessions.length > 10) { confidence *= 0.4; patterns.push("low_score_diversity"); }
  var hourBuckets = new Array(24).fill(0);
  sessions.forEach(function(s) { hourBuckets[new Date(s.created_at).getUTCHours()]++; });
  var activeHours = hourBuckets.filter(function(h) { return h > 0; }).length;
  if (activeHours === 24 && sessions.length > 24) { confidence *= 0.3; patterns.push("24h_activity"); }
  return { confidence: Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100, patterns: patterns, unique_scores: unique, active_hours: activeHours };
}

function verifyVibesafeScan(scanResult) {
  if (!scanResult || typeof scanResult.score === "undefined") return { confidence: 0, reason: "no_scan_data" };
  var c = 0.3;
  if (scanResult.totalFindings > 0 && scanResult.grade !== "F") c += 0.3;
  if (scanResult.score >= 70) c += 0.2;
  if (scanResult.files && scanResult.files.length > 0) c += 0.2;
  return { confidence: Math.round(Math.min(1, c) * 100) / 100, scan_score: scanResult.score, scan_grade: scanResult.grade };
}

function verifyZenodoDOI(doi) {
  if (!doi || typeof doi !== "string") return { confidence: 0, reason: "no_doi" };
  if (!doi.match(/^10\.5281\/zenodo\.\d+$/)) return { confidence: 0, reason: "invalid_doi_format" };
  return { confidence: 0.7, doi: doi, note: "HTTP verification recommended" };
}

function verifyCoherenceSignature(sig) {
  if (!sig) return { confidence: 0, reason: "no_signature" };
  var c = 0;
  if (typeof sig.coherence === "number" && sig.coherence > 0) c += 0.3;
  if (sig.witnesses && sig.witnesses.length > 0) c += 0.2;
  if (sig.vows) {
    if (sig.vows.neverCoerce) c += 0.1;
    if (sig.vows.expandMeaning) c += 0.1;
    if (sig.vows.archiveEverything) c += 0.1;
  }
  if (sig.messageCount && sig.messageCount > 5) c += 0.2;
  return { confidence: Math.round(Math.min(1, c) * 100) / 100, coherence: sig.coherence, witnesses: (sig.witnesses || []).length };
}

function computeVerification(methods) {
  var results = {};
  var confidences = [];
  ["challenge", "behavior", "vibesafe", "zenodo", "coherence"].forEach(function(k) {
    if (methods[k]) {
      results[k] = methods[k];
      if (methods[k].confidence > 0) confidences.push(methods[k].confidence);
    }
  });
  var composite = 0;
  if (confidences.length > 0) {
    var product = confidences.reduce(function(a, b) { return a * b; }, 1);
    composite = Math.pow(product, 1 / confidences.length);
  }
  var methodBonus = Math.min(0.15, confidences.length * 0.03);
  composite = Math.min(1, composite + methodBonus);
  return {
    composite_confidence: Math.round(composite * 100) / 100,
    methods_used: confidences.length, method_bonus: Math.round(methodBonus * 100) / 100,
    individual: results,
    meets_master: composite >= THRESHOLDS.MASTER,
    meets_sovereign: composite >= THRESHOLDS.SOVEREIGN,
    meets_luminary: composite >= THRESHOLDS.LUMINARY
  };
}

module.exports = {
  THRESHOLDS: THRESHOLDS, generateChallenge: generateChallenge, verifyChallenge: verifyChallenge,
  analyzeSessionBehavior: analyzeSessionBehavior, verifyVibesafeScan: verifyVibesafeScan,
  verifyZenodoDOI: verifyZenodoDOI, verifyCoherenceSignature: verifyCoherenceSignature,
  computeVerification: computeVerification,
};