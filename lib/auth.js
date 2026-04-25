var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

var BURST_MS = 1000;
var WINDOW_MS = 24 * 60 * 60 * 1000;

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

async function authenticate(req, requiredScope) {
  var start = Date.now();
  var ip_hash = hashIP(req);
  var endpoint = req.url || "unknown";
  var method = req.method || "unknown";

  // 1. API Key lookup
  var key = req.headers["x-api-key"];
  if (!key) {
    logRequest({ endpoint: endpoint, method: method, status_code: 401, latency_ms: Date.now() - start, error: "Missing key", ip_hash: ip_hash });
    return { error: "Missing x-api-key header", status: 401 };
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

  // 2. Revoked check
  if (apiKey.revoked) {
    logRequest({ passport_id: apiKey.passport_id, endpoint: endpoint, method: method, status_code: 403, latency_ms: Date.now() - start, error: "Key revoked", tier: apiKey.tier, ip_hash: ip_hash });
    return { error: "API key revoked", status: 403 };
  }

  // 3. Scope check
  if (requiredScope && apiKey.scopes.indexOf(requiredScope) === -1) {
    logRequest({ passport_id: apiKey.passport_id, endpoint: endpoint, method: method, status_code: 403, latency_ms: Date.now() - start, error: "Scope: " + requiredScope, tier: apiKey.tier, ip_hash: ip_hash });
    return { error: "Insufficient scope. Required: " + requiredScope, status: 403 };
  }

  // 4. Daily reset check
  var now = Date.now();
  var windowStart = new Date(apiKey.request_window_start).getTime();
  var used = apiKey.requests_used;

  if (now - windowStart > WINDOW_MS) {
    used = 0;
    windowStart = now;
  }

  // 5. Limit enforcement
  if (used >= apiKey.requests_limit) {
    logRequest({ passport_id: apiKey.passport_id, endpoint: endpoint, method: method, status_code: 429, latency_ms: Date.now() - start, error: "Rate limited", tier: apiKey.tier, ip_hash: ip_hash });
    return {
      error: "Rate limit exceeded. Resets in " + Math.ceil((windowStart + WINDOW_MS - now) / 60000) + " minutes.",
      status: 429
    };
  }

  // 6. Burst protection
  var lastReq = new Date(apiKey.last_request_at).getTime();
  if (now - lastReq < BURST_MS) {
    logRequest({ passport_id: apiKey.passport_id, endpoint: endpoint, method: method, status_code: 429, latency_ms: Date.now() - start, error: "Burst", tier: apiKey.tier, ip_hash: ip_hash });
    return { error: "Too fast. Min interval: 1 second.", status: 429 };
  }

  // 7. Increment usage
  await db
    .from("api_keys")
    .update({
      requests_used: used + 1,
      last_request_at: new Date(now).toISOString(),
      request_window_start: new Date(windowStart).toISOString()
    })
    .eq("id", apiKey.id);

  // 8. Log success + proceed
  var latency = Date.now() - start;
  logRequest({ passport_id: apiKey.passport_id, endpoint: endpoint, method: method, status_code: 200, latency_ms: latency, tier: apiKey.tier, ip_hash: ip_hash });

  return {
    passport_id: apiKey.passport_id,
    tier: apiKey.tier,
    scopes: apiKey.scopes,
    requests_remaining: apiKey.requests_limit - used - 1
  };
}

module.exports = { authenticate: authenticate };