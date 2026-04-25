module.exports = function (req, res) {
  var score = parseFloat(req.query.score);
  if (isNaN(score)) {
    return res.status(400).json({ error: "Provide ?score=NUMBER" });
  }
  var angle = Math.round((score / 100) * 360 * 100) / 100;
  return res.status(200).json({ score: score, angle: angle });
};