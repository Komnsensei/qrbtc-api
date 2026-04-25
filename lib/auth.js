var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function authenticate(req, requiredScope) {
  var key = req.headers["x-api-key"];

  if (!key) {
    return { error: "Missing x-api-key header", status: 401 };
  }

  var key_hash = crypto.createHash("sha256").update(key).digest("hex");

  var result = await db
    .from("api_keys")
    .select("id, passport_id, scopes, tier, requests_used, requests_limit, revoked")
    .eq("key_hash", key_hash)
    .limit(1);

  if (!result.data || result.data.length === 0) {
    return { error: "Invalid API key", status: 401 };
  }

  var apiKey = result.data[0];

  if (apiKey.revoked) {
    return { error: "API key revoked", status: 403 };
  }

  if (apiKey.requests_used >= apiKey.requests_limit) {
    return { error: "Rate limit exceeded", status: 429 };
  }

  if (requiredScope && apiKey.scopes.indexOf(requiredScope) === -1) {
    return { error: "Insufficient scope. Required: " + requiredScope, status: 403 };
  }

  await db
    .from("api_keys")
    .update({ requests_used: apiKey.requests_used + 1 })
    .eq("id", apiKey.id);

  return {
    passport_id: apiKey.passport_id,
    tier: apiKey.tier,
    scopes: apiKey.scopes
  };
}

module.exports = { authenticate: authenticate };