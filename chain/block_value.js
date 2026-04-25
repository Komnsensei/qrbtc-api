function calculateBlockValue(score) {
  var delta = (score / 100) * 360;
  return Math.round(delta * 100) / 100;
}

module.exports = { calculateBlockValue };