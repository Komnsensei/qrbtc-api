var tiers = require("./tiers");

function buildPassport(data) {
  var normalizedScore = Math.min((data.total_degrees % 360) / 360 * 100, 100);
  return {
    total_degrees: data.total_degrees,
    block_count: data.block_count,
    tier: tiers.getTier(normalizedScore)
  };
}

module.exports = { buildPassport };