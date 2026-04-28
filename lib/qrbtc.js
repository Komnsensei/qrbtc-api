var WEIGHTS = {
  labor: 1.0,
  exchange: 1.2,
  equality: 1.1,
  presence: 1.3,
  ratification: 1.5,
  continuity: 1.4
};

var MAX_RAW = 10 * (1.0 + 1.2 + 1.1 + 1.3 + 1.5 + 1.4);

function computeScore(inputs) {
  var total = 0;
  var keys = Object.keys(WEIGHTS);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var val = parseFloat(inputs[k]) || 0;
    if (val < 0) val = 0;
    if (val > 10) val = 10;
    total += val * WEIGHTS[k];
  }
  var score = (total / MAX_RAW) * 100;
  return Math.round(score * 100) / 100;
}

module.exports = {
  computeScore: computeScore,
  WEIGHTS: WEIGHTS,
  MAX_RAW: MAX_RAW
};