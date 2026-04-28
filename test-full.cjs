var accum = require("./lib/accumulation");
var vibe = require("./lib/vibesafe");
var gov = require("./lib/governance");
var q = require("./lib/qrbtc");

console.log("=== TIER REQUIREMENTS ===");
console.log(JSON.stringify(accum.TIER_REQUIREMENTS, null, 2));

console.log("\n=== DIMINISHING RETURNS ===");
[1, 5, 10, 25, 50, 100, 200].forEach(function(n) {
  var d = accum.computeDegreesDelta(80, n);
  console.log("Session #" + n + ": base=" + d.base_degrees + " factor=" + d.diminishing_factor + " actual=" + d.adjusted_degrees);
});

console.log("\n=== BOT SIMULATION: 100 perfect sessions in 1 day ===");
var botSessions = [];
var baseTime = Date.now() - (24 * 60 * 60 * 1000);
for (var i = 0; i < 100; i++) {
  botSessions.push({ score: 100, created_at: new Date(baseTime + (i * 60000)).toISOString() });
}
var botTier = accum.computeTrueTier(botSessions, false);
console.log("Bot tier: " + botTier.tier + " (avg=" + botTier.weighted_avg + " consistency=" + botTier.consistency + " days=" + botTier.days_active + ")");
var botBehavior = vibe.analyzeSessionBehavior(botSessions);
console.log("Bot behavior confidence: " + botBehavior.confidence + " patterns: " + botBehavior.patterns.join(", "));

console.log("\n=== HUMAN SIMULATION: ~50 sessions over 30 days ===");
var humanSessions = [];
var dayBase = Date.now() - (30 * 24 * 60 * 60 * 1000);
for (var d = 0; d < 30; d++) {
  var sessionsToday = Math.floor(Math.random() * 3);
  for (var s = 0; s < sessionsToday; s++) {
    var hour = 9 + Math.floor(Math.random() * 10);
    var score = 55 + Math.floor(Math.random() * 35);
    humanSessions.push({
      score: score,
      created_at: new Date(dayBase + (d * 86400000) + (hour * 3600000) + (Math.random() * 3600000)).toISOString()
    });
  }
}
humanSessions.sort(function(a, b) { return new Date(a.created_at) - new Date(b.created_at); });
var humanTier = accum.computeTrueTier(humanSessions, true);
console.log("Human sessions: " + humanSessions.length);
console.log("Human tier: " + humanTier.tier + " (avg=" + humanTier.weighted_avg + " consistency=" + humanTier.consistency + " days=" + humanTier.days_active + ")");
if (humanTier.progress) console.log("Progress to " + humanTier.progress.next_tier + ":", JSON.stringify(humanTier.progress, null, 2));
var humanBehavior = vibe.analyzeSessionBehavior(humanSessions);
console.log("Human behavior confidence: " + humanBehavior.confidence + " patterns: " + humanBehavior.patterns.join(", "));

console.log("\n=== CHALLENGE TEST ===");
var ch = vibe.generateChallenge("test-passport");
console.log("Challenge:", JSON.stringify(ch));

console.log("\n=== COMPOSITE VERIFICATION (5 methods) ===");
var composite = vibe.computeVerification({
  challenge: { confidence: 0.9 },
  behavior: { confidence: 0.8 },
  vibesafe: { confidence: 0.7 },
  zenodo: { confidence: 0.7 },
  coherence: { confidence: 0.6 }
});
console.log(JSON.stringify(composite, null, 2));

console.log("\n=== GOVERNANCE + ACCUMULATION TOGETHER ===");
var inputs = { labor: 8, exchange: 7, equality: 8, presence: 7, ratification: 9, continuity: 7 };
var rawScore = q.computeScore(inputs);
var enriched = gov.enrichScore(rawScore, inputs, "test");
var degreesCalc = accum.computeDegreesDelta(enriched.adjusted_score, 25);
console.log("Score: raw=" + rawScore + " adjusted=" + enriched.adjusted_score);
console.log("Degrees: base=" + degreesCalc.base_degrees + " diminished=" + degreesCalc.adjusted_degrees + " (factor=" + degreesCalc.diminishing_factor + ")");