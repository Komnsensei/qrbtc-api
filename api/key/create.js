var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function generateKey() {
  return "qrbtc_live_sk_" + crypto.randomBytes(32).toString("hex");
}

module.exports = async function (req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    var passport_id = req.body && req.body.passport_id;
    if (!passport_id || typeof passport_id !== "string") {
      return res.status(400).json({ error: "passport_id required" });
    }

    var uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(passport_id)) {
      return res.status(400).json({ error: "passport_id must be a valid UUID" });
    }

    var passport = await db.from("passports").select("id, revoked").eq("id", passport_id).limit(1);
    if (!passport.data || passport.data.length === 0) {
      return res.status(404).json({ error: "Passport not found" });
    }
    if (passport.data[0].revoked) {
      return res.status(403).json({ error: "Passport revoked" });
    }

    var existing = await db.from("api_keys").select("id").eq("passport_id", passport_id).eq("revoked", false);
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
      return res.status(500).json({ error: insert.error.message, hint: insert.error.hint });
    }

    return res.status(201).json({
      api_key: raw_key,
      scopes: scopes,
      tier: "free",
      requests_limit: 1000,
      warning: "Save this key now. It will never be shown again."
    });
  } catch (e) {
    console.error("KEY CREATE CRASH:", e.message, e.stack);
    return res.status(500).json({ error: e.message });
  }
};