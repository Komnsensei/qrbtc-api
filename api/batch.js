var tll = require("../chain/tll_score");
var bv = require("../chain/block_value");
var tiers = require("../lib/tiers");

module.exports = function (req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  var sessions = req.body.sessions;
  if (!Array.isArray(sessions)) {
    return res.status(400).json({ error: "sessions must be an array" });
  }

  var results = sessions.map(function (s) {
    var score = tll.scoreSession(s);
    var degrees_delta = bv.calculateBlockValue(score);
    var tier = tiers.getTier(score);
    return { score: score, degrees_delta: degrees_delta, tier: tier };
  });

  return res.status(200).json({ results: results });
};