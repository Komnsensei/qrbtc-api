var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function (req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "POST") {
      var username = req.body && req.body.username;
      if (!username || typeof username !== "string" || username.length < 1 || username.length > 32) {
        return res.status(400).json({ error: "Username required (1-32 chars)" });
      }
      username = username.trim().replace(/[^a-zA-Z0-9_-]/g, "");

      console.log("ENV CHECK:", { url: !!process.env.SUPABASE_URL, key: !!process.env.SUPABASE_SERVICE_KEY });

      var result = await db.from("passports").insert({
        username: username,
        revoked: false
      }).select();

      console.log("DB RESULT:", JSON.stringify(result));

      if (result.error) {
        return res.status(500).json({ error: result.error.message, code: result.error.code, hint: result.error.hint });
      }

      return res.status(201).json(result.data[0]);
    }

    if (req.method === "GET") {
      var session = await auth.authenticate(req, "identity:read");
      if (session.error) return res.status(session.status || 401).json({ error: session.error });

      var passport = await db.from("passports").select("*").eq("id", session.passport_id).limit(1);
      if (!passport.data || passport.data.length === 0) {
        return res.status(404).json({ error: "Passport not found" });
      }
      return res.status(200).json(passport.data[0]);
    }

    return res.status(405).json({ error: "POST or GET only" });
  } catch (e) {
    console.error("PASSPORT CRASH:", e.message, e.stack);
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
};