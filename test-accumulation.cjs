var q = require("./lib/qrbtc");
var t = require("./lib/tiers");
var g = require("./lib/governance");

console.log("=== TIER THRESHOLDS ===");
console.log(JSON.stringify(t.getAllTiers(), null, 2));

console.log("\n=== SCORE MATH ===");
console.log("WEIGHTS:", JSON.stringify(q.WEIGHTS));
console.log("MAX_RAW:", q.MAX_RAW);

// Simulate sessions
var scenarios = [
  { name: "PERFECT", inputs: {labor:10, exchange:10, equality:10, presence:10, ratification:10, continuity:10} },
  { name: "GREAT", inputs: {labor:8, exchange:8, equality:8, presence:8, ratification:9, continuity:8} },
  { name: "GOOD", inputs: {labor:7, exchange:7, equality:7, presence:7, ratification:7, continuity:7} },
  { name: "MID", inputs: {labor:5, exchange:5, equality:5, presence:5, ratification:5, continuity:5} },
  { name: "LOW", inputs: {labor:3, exchange:3, equality:3, presence:3, ratification:3, continuity:3} },
  { name: "GAMING (all 10s)", inputs: {labor:10, exchange:10, equality:10, presence:10, ratification:10, continuity:10} },
];

console.log("\n=== SCENARIO ANALYSIS ===");
scenarios.forEach(function(s) {
  var raw = q.computeScore(s.inputs);
  var enriched = g.enrichScore(raw, s.inputs, "test");
  var degrees = Math.round((enriched.adjusted_score / 100) * 360 * 100) / 100;
  console.log(s.name + ":");
  console.log("  raw=" + raw + " adjusted=" + enriched.adjusted_score + " tier=" + t.getTier(enriched.adjusted_score));
  console.log("  degrees/session=" + degrees);
  console.log("  modifier=" + enriched.governance_modifier + " notes=" + enriched.governance_notes.join(","));
  console.log("  vow_ok=" + enriched.vow_compliance);
});

// Accumulation to LUMINARY (95+)
console.log("\n=== ACCUMULATION ANALYSIS ===");
console.log("LUMINARY requires score >= 95 on a SINGLE session");
console.log("But degrees accumulate across sessions...");
console.log("");

// How many sessions to various degree milestones
var sessionScores = [100, 80, 70, 50, 30];
sessionScores.forEach(function(score) {
  var degreesPerSession = Math.round((score / 100) * 360 * 100) / 100;
  console.log("Score " + score + " = " + degreesPerSession + " degrees/session");
  console.log("  10 sessions = " + (degreesPerSession * 10).toFixed(1) + " degrees");
  console.log("  50 sessions = " + (degreesPerSession * 50).toFixed(1) + " degrees");
  console.log("  100 sessions = " + (degreesPerSession * 100).toFixed(1) + " degrees");
});

// Current problem: tier is based on LAST session score, not cumulative
console.log("\n=== CURRENT PROBLEM ===");
console.log("Tier is based on LAST SESSION SCORE, not cumulative performance.");
console.log("A bot could submit {all:10} once and immediately be LUMINARY.");
console.log("No human verification. No session pacing. No consistency check.");
console.log("Degrees accumulate forever with no decay.");