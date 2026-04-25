const WEIGHTS = {
  labor: 1.0,
  exchange: 1.2,
  equality: 1.1,
  presence: 1.3,
  ratification: 1.5,
  continuity: 1.4
};

function computeScore(session) {
  let total = 0;
  for (const key in WEIGHTS) {
    const value = Number(session[key] || 0);
    total += value * WEIGHTS[key];
  }
  return Math.round(total * 100) / 100;
}

function normalize(score, max = 100) {
  const raw = Math.max(0, Math.min(1, score / max));
  return Math.round(raw * 1000) / 1000;
}

function spiralDegree(trust) {
  return Math.round(trust * 360 * 100) / 100;
}

function assignTier(trust) {
  if (trust < 0.2) return "SEED";
  if (trust < 0.4) return "APPRENTICE";
  if (trust < 0.6) return "JOURNEYMAN";
  if (trust < 0.75) return "MASTER";
  if (trust < 0.9) return "SOVEREIGN";
  return "LUMINARY";
}

module.exports = { computeScore, normalize, spiralDegree, assignTier };