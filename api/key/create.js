var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var validation = require("../lib/validation");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function generateKey() {
  var raw = crypto.randomBytes(32).toString("hex");
  return "qrbtc_live_sk_" + raw;
}

module.exports = async function (req, res) {
  // Apply security headers
  auth.applySecurityHeaders(res);
  auth.applyCORSHeaders(res);

  // Handle preflight requests
  if (auth.handlePreflight(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    // Validate request body
    var validationResult = validation.Schemas.createAPIKey(req.body);
    if (!validationResult.isValid) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.errors
      });
    }

    var body = validationResult.sanitized;
    var passport_id = body.passport_id;

    var passport = await db
      .from("passports")
      .select("id, revoked")
      .eq("id", passport_id)
      .limit(1);

    if (!passport.data || passport.data.length === 0) {
      return res.status(404).json({ error: "Passport not found" });
    }

    if (passport.data[0].revoked) {
      return res.status(403).json({ error: "Passport revoked" });
    }

    var existing = await db
      .from("api_keys")
      .select("id")
      .eq("passport_id", passport_id)
      .eq("revoked", false);

    if (existing.data && existing.data.length > 0) {
      return res.status(409).json({ error: "Active key already exists. Revoke it first." });
    }

    var raw_key = generateKey();
    var key_hash = crypto.createHash("sha256").update(raw_key).digest("hex");

    var scopes = ["score:write", "ledger:read", "identity:read"];

    var insert = await db.from("api_keys").insert({
      passport_id: passport_id,
      key_hash: key_hash,
      scopes: scopes,
      tier: "free",
      requests_used: 0,
      requests_limit: 1000
    });

    if (insert.error) {
      return res.status(500).json({ error: insert.error.message });
    }

    return res.status(201).json({
      api_key: raw_key,
      scopes: scopes,
      tier: "free",
      requests_limit: 1000,
      warning: "Save this key now. It will never be shown again."
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};