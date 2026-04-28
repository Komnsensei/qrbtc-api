// HexAgent Identity — fraud-safe user numbering
// Users get a HexAgent-only ID that appears on DOIs instead of usernames/real names

const crypto = require('crypto');

// Generate a deterministic hex ID from passport UUID
// Format: HX-XXXXXX (6 hex chars derived from passport_id)
function generateHexId(passportId) {
  const hash = crypto.createHash('sha256').update(passportId + ':hexagent:identity').digest('hex');
  return 'HX-' + hash.substring(0, 6).toUpperCase();
}

// Verify a hex ID matches a passport
function verifyHexId(hexId, passportId) {
  return hexId === generateHexId(passportId);
}

module.exports = { generateHexId, verifyHexId };
