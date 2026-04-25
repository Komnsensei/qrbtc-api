var WEIGHTS = {
  labor: 0.20,
  exchange: 0.15,
  equality: 0.15,
  presence: 0.20,
  ratification: 0.15,
  continuity: 0.15
};

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
  var score = (total / 10) * 100;
  return Math.round(score * 100) / 100;
}

module.exports = {
  computeScore: computeScore,
  WEIGHTS: WEIGHTS
};