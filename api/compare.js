var tll = require("../chain/tll_score");
var bv = require("../chain/block_value");
var tiers = require("../lib/tiers");

module.exports = function (req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  var a = req.body.a;
  var b = req.body.b;
  if (!a || !b) {
    return res.status(400).json({ error: "Provide sessions a and b" });
  }

  function evaluate(s) {
    var score = tll.scoreSession(s);
    var dd = bv.calculateBlockValue(score);
    return { score: score, degrees_delta: dd, tier: tiers.getTier(score) };
  }

  var ra = evaluate(a);
  var rb = evaluate(b);

  return res.status(200).json({
    session_a: ra,
    session_b: rb,
    delta: Math.round((ra.score - rb.score) * 100) / 100
  });
};