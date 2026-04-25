var crypto = require("crypto");

var HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
  "Access-Control-Max-Age": "86400"
};

function applyHeaders(res) {
  for (var h in HEADERS) res.setHeader(h, HEADERS[h]);
}

function preflight(req, res) {
  if (req.method === "OPTIONS") {
    applyHeaders(res);
    res.status(204).end();
    return true;
  }
  return false;
}

function sanitizeString(s) {
  if (typeof s !== "string") return "";
  return s.trim().replace(/[<>"'`;]/g, "").slice(0, 500);
}

function isUUID(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function isUsername(s) {
  return typeof s === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(s.trim());
}

function isScore(n) {
  var v = parseFloat(n);
  return !isNaN(v) && v >= 0 && v <= 10;
}

function hashIP(req) {
  var ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  if (Array.isArray(ip)) ip = ip[0];
  ip = ip.split(",")[0].trim();
  return crypto.createHash("sha256").update(ip + "qrbtc-salt").digest("hex").slice(0, 16);
}

module.exports = {
  applyHeaders: applyHeaders,
  preflight: preflight,
  sanitizeString: sanitizeString,
  isUUID: isUUID,
  isUsername: isUsername,
  isScore: isScore,
  hashIP: hashIP
};