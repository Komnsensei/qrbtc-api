var crypto = require("crypto");

function hashSession(session, score, totalDegrees) {
  var payload = JSON.stringify({
    session: session,
    score: score,
    total: totalDegrees,
    t: Date.now()
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

module.exports = { hashSession };