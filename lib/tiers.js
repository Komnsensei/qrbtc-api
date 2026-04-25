var TIERS = [
  { name: "SEED", min: 0, max: 40 },
  { name: "APPRENTICE", min: 40, max: 50 },
  { name: "JOURNEYMAN", min: 50, max: 60 },
  { name: "MASTER", min: 60, max: 70 },
  { name: "SOVEREIGN", min: 70, max: 80 },
  { name: "LUMINARY", min: 80, max: 90 },
  { name: "PERFECT", min: 90, max: 100 }
];

function getTier(score) {
  if (score >= 90) return "PERFECT";
  if (score >= 80) return "LUMINARY";
  if (score >= 70) return "SOVEREIGN";
  if (score >= 60) return "MASTER";
  if (score >= 50) return "JOURNEYMAN";
  if (score >= 40) return "APPRENTICE";
  return "SEED";
}

module.exports = { TIERS, getTier };