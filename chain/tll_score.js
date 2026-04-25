const WEIGHTS = {
  labor: 1.0,
  exchange: 1.2,
  equality: 1.1,
  presence: 1.3,
  ratification: 1.5,
  continuity: 1.4
};

const MAX_RAW = 10 * (1.0 + 1.2 + 1.1 + 1.3 + 1.5 + 1.4);

function scoreSession(session) {
  let raw = 0;
  for (var key in WEIGHTS) {
    raw += Number(session[key] || 0) * WEIGHTS[key];
  }
  var normalized = (raw / MAX_RAW) * 100;
  return Math.round(normalized * 100) / 100;
}

module.exports = { scoreSession, WEIGHTS, MAX_RAW };