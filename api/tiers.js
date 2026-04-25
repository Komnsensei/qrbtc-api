var tiers = require("../lib/tiers");

module.exports = function (req, res) {
  return res.status(200).json({ tiers: tiers.TIERS });
};