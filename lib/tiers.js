var TIERS = [
  { name: "INITIATE",   min: 0,  max: 20 },
  { name: "SEED",       min: 20, max: 40 },
  { name: "JOURNEYMAN", min: 40, max: 60 },
  { name: "MASTER",     min: 60, max: 80 },
  { name: "SOVEREIGN",  min: 80, max: 95 },
  { name: "LUMINARY",   min: 95, max: 100 }
];

function getTier(score) {
  for (var i = TIERS.length - 1; i >= 0; i--) {
    if (score >= TIERS[i].min) return TIERS[i].name;
  }
  return "INITIATE";
}

function getAllTiers() {
  return TIERS;
}

module.exports = {
  getTier: getTier,
  getAllTiers: getAllTiers,
  TIERS: TIERS
};