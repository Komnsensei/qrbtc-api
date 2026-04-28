var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

var BURST_MS = 1000;
var WINDOW_MS = 24 * 60 * 60 * 1000;
REPLACE
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable not set. JWT auth will not work.");
  JWT_SECRET = "UNSET-DO-NOT-USE-IN-PRODUCTION";
}
var JWT_EXPIRY = "24h";

// Security headers
var SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
};

// CORS configuration
var CORS_CONFIG = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
  "Access-Control-Max-Age": "86400"
};

async function logRequest(data) {
  try {
    await db.from("request_logs").insert(data);
  } catch (e) {
    // silent — logging should never break requests
  }
}

function hashIP(req) {
  var ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  if (Array.isArray(ip)) ip = ip[0];
  ip = ip.split(",")[0].trim();
  return crypto.createHash("sha256").update(ip + "qrbtc-salt").digest("hex").slice(0, 16);
}

function applySecurityHeaders(res) {
  for (var header in SECURITY_HEADERS) {
    res.setHeader(header, SECURITY_HEADERS[header]);
  }
}

function applyCORSHeaders(res) {
  for (var header in CORS_CONFIG) {
    res.setHeader(header, CORS_CONFIG[header]);
  }
}

function handlePreflight(req, res) {
  if (req.method === "OPTIONS") {
    applyCORSHeaders(res);
    return res.status(204).end();
  }
  return false;
}

// JWT Token functions
function generateJWT(payload) {
  var header = { alg: "HS256", typ: "JWT" };
  var now = Math.floor(Date.now() / 1000);
  var tokenPayload = {
    ...payload,
    iat: now,
    exp: now + (24 * 60 * 60) // 24 hours
  };

  var encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  var encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString("base64url");
  var signature = crypto.createHmac("sha256", JWT_SECRET)
    .update(encodedHeader + "." + encodedPayload)
    .digest("base64url");

  return encodedHeader + "." + encodedPayload + "." + signature;
}

function verifyJWT(token) {
  try {
    var parts = token.split(".");
    if (parts.length !== 3) return null;

    var header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    var payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    var signature = parts[2];

    var expectedSignature = crypto.createHmac("sha256", JWT_SECRET)
      .update(parts[0] + "." + parts[1])
      .digest("base64url");

    if (signature !== expectedSignature) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch (e) {
    return null;
  }
}

// Admin check function
async function isAdmin(passport_id) {
  try {
    var result = await db
      .from("passports")
      .select("is_admin")
      .eq("id", passport_id)
      .limit(1);

    return result.data && result.data.length > 0 && result.data[0].is_admin === true;
  } catch (e) {
    return false;
  }
}

// IP whitelist check
async function isIPWhitelisted(ip_hash) {
  try {
    var result = await db
      .from("ip_whitelist")
      .select("id")
      .eq("ip_hash", ip_hash)
      .eq("active", true)
      .limit(1);

    return result.data && result.data.length > 0;
  } catch (e) {
    return false;
  }
}

async function authenticate(req, requiredScope) {
  var start = Date.now();
  var ip_hash = hashIP(req);
  var endpoint = req.url || "unknown";
  var method = req.method || "unknown";

  // Check IP whitelist if enabled
  if (process.env.ENABLE_IP_WHITELIST === "true") {
    var whitelisted = await isIPWhitelisted(ip_hash);
    if (!whitelisted) {
      logRequest({ endpoint: endpoint, method: method, status_code: 403, latency_ms: Date.now() - start, error: "IP not whitelisted", ip_hash: ip_hash });
      return { error: "IP not whitelisted", status: 403 };
    }
  }

  // Try JWT token first
  var authHeader = req.headers["authorization"];
  var jwtPayload = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    var token = authHeader.substring(7);
    jwtPayload = verifyJWT(token);

    if (jwtPayload) {
      // JWT authentication successful
      var isAdminUser = await isAdmin(jwtPayload.passport_id);

      // Log JWT authentication
      var latency = Date.now() - start;
      logRequest({
        passport_id: jwtPayload.passport_id,
        endpoint: endpoint,
        method: method,
        status_code: 200,
        latency_ms: latency,
        auth_type: "jwt",
        tier: jwtPayload.tier || "unknown",
        ip_hash: ip_hash
      });

      return {
        passport_id: jwtPayload.passport_id,
        tier: jwtPayload.tier || "unknown",
        scopes: jwtPayload.scopes || [],
        is_admin: isAdminUser,
        auth_type: "jwt"
      };
    }
  }

  // Fall back to API key authentication
  var key = req.headers["x-api-key"];
  if (!key) {
    logRequest({ endpoint: endpoint, method: method, status_code: 401, latency_ms: Date.now() - start, error: "Missing credentials", ip_hash: ip_hash });
    return { error: "Missing x-api-key header or valid JWT token", status: 401 };
  }

  var key_hash = crypto.createHash("sha256").update(key).digest("hex");

  var result = await db
    .from("api_keys")
    .select("id, passport_id, scopes, tier, requests_used, requests_limit, revoked, last_request_at, request_window_start")
    .eq("key_hash", key_hash)
    .limit(1);

  if (!result.data || result.data.length === 0) {
    logRequest({ endpoint: endpoint, method: method, status_code: 401, latency_ms: Date.now() - start, error: "Invalid key", ip_hash: ip_hash });
    return { error: "Invalid API key", status: 401 };
  }

  var apiKey = result.data[0];

  // Revoked check
  if (apiKey.revoked) {
    logRequest({ passport_id: apiKey.passport_id, endpoint: endpoint, method: method, status_code: 403, latency_ms: Date.now() - start, error: "Key revoked", tier: apiKey.tier, ip_hash: ip_hash });
    return { error: "API key revoked", status: 403 };
  }

  // Scope check
  if (requiredScope && apiKey.scopes.indexOf(requiredScope) === -1) {
    logRequest({ passport_id: apiKey.passport_id, endpoint: endpoint, method: method, status_code: 403, latency_ms: Date.now() - start, error: "Scope: " + requiredScope, tier: apiKey.tier, ip_hash: ip_hash });
    return { error: "Insufficient scope. Required: " + requiredScope, status: 403 };
  }

  // Admin check for rate limit bypass
  var isAdminUser = await isAdmin(apiKey.passport_id);

  // Daily reset check
  var now = Date.now();
  var windowStart = new Date(apiKey.request_window_start).getTime();
  var used = apiKey.requests_used;

  if (now - windowStart > WINDOW_MS) {
    used = 0;
    windowStart = now;
  }

  // Limit enforcement (bypass for admins)
  if (!isAdminUser && used >= apiKey.requests_limit) {
    logRequest({ passport_id: apiKey.passport_id, endpoint: endpoint, method: method, status_code: 429, latency_ms: Date.now() - start, error: "Rate limited", tier: apiKey.tier, ip_hash: ip_hash });
    return {
      error: "Rate limit exceeded. Resets in " + Math.ceil((windowStart + WINDOW_MS - now) / 60000) + " minutes.",
      status: 429
    };
  }

  // Burst protection (bypass for admins)
  var lastReq = new Date(apiKey.last_request_at).getTime();
  if (!isAdminUser && now - lastReq < BURST_MS) {
    logRequest({ passport_id: apiKey.passport_id, endpoint: endpoint, method: method, status_code: 429, latency_ms: Date.now() - start, error: "Burst", tier: apiKey.tier, ip_hash: ip_hash });
    return { error: "Too fast. Min interval: 1 second.", status: 429 };
  }

  // Increment usage
  await db
    .from("api_keys")
    .update({
      requests_used: used + 1,
      last_request_at: new Date(now).toISOString(),
      request_window_start: new Date(windowStart).toISOString()
    })
    .eq("id", apiKey.id);

  // Log success + proceed
  var latency = Date.now() - start;
  logRequest({
    passport_id: apiKey.passport_id,
    endpoint: endpoint,
    method: method,
    status_code: 200,
    latency_ms: latency,
    auth_type: "api_key",
    tier: apiKey.tier,
    ip_hash: ip_hash
  });

  return {
    passport_id: apiKey.passport_id,
    tier: apiKey.tier,
    scopes: apiKey.scopes,
    requests_remaining: apiKey.requests_limit - used - 1,
    is_admin: isAdminUser,
    auth_type: "api_key"
  };
}

// Middleware wrapper for Express-like usage
function authMiddleware(requiredScope) {
  return async function(req, res, next) {
    applySecurityHeaders(res);
    applyCORSHeaders(res);

    if (handlePreflight(req, res)) return;

    var session = await authenticate(req, requiredScope);
    if (session.error) {
      return res.status(session.status).json({ error: session.error });
    }

    req.session = session;
    next();
  };
}

module.exports = {
  authenticate: authenticate,
  generateJWT: generateJWT,
  verifyJWT: verifyJWT,
  applySecurityHeaders: applySecurityHeaders,
  applyCORSHeaders: applyCORSHeaders,
  handlePreflight: handlePreflight,
  authMiddleware: authMiddleware,
  SECURITY_HEADERS: SECURITY_HEADERS,
  CORS_CONFIG: CORS_CONFIG
};