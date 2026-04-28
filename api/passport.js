var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var sec = require("../lib/security");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;

  try {
    if (req.method === "POST") {
      var ip_hash = sec.hashIP(req);
      var recentCheck = await db.from("passports").select("id").eq("created_by_ip", ip_hash).gte("created_at", new Date(Date.now() - 86400000).toISOString());
      if (recentCheck.data && recentCheck.data.length >= 5) {
        return res.status(429).json({ error: "Too many passports created. Limit: 5 per day." });
      }

      var raw = req.body && req.body.username;
      if (!raw || !sec.isUsername(raw)) {
        return res.status(400).json({ error: "Username required (1-32 chars, alphanumeric/underscore/hyphen)" });
      }
      var username = sec.sanitizeString(raw).replace(/[^a-zA-Z0-9_-]/g, "");

      var result = await db.from("passports").insert({ username: username, revoked: false, created_by_ip: ip_hash }).select();
      if (result.error) return res.status(500).json({ error: result.error.message });
      return res.status(201).json(result.data[0]);
    }

    if (req.method === "GET") {
      var session = await auth.authenticate(req, "identity:read");
      if (session.error) return res.status(session.status || 401).json({ error: session.error });

      var passport = await db.from("passports").select("*").eq("id", session.passport_id).limit(1);
      if (!passport.data || passport.data.length === 0) return res.status(404).json({ error: "Passport not found" });
      return res.status(200).json(passport.data[0]);
    }

    return res.status(405).json({ error: "POST or GET only" });
  } catch (e) {
    console.error("PASSPORT:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};