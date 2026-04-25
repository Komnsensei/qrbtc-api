var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function (req, res) {
  if (req.method === "POST") {
    try {
      var body = req.body;
      var username = body.username;
      if (!username) return res.status(400).json({ error: "username required" });

      var insert = await db.from("passports").insert({
        username: username,
        revoked: false
      }).select();

      if (insert.error) return res.status(500).json({ error: insert.error.message });

      return res.status(201).json(insert.data[0]);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "GET") {
    var session = await auth.authenticate(req, "identity:read");
    if (session.error) return res.status(session.status).json({ error: session.error });

    try {
      var passport_id = session.passport_id;

      var passport = await db
        .from("passports")
        .select("*")
        .eq("id", passport_id)
        .limit(1);

      if (!passport.data || passport.data.length === 0) {
        return res.status(404).json({ error: "Passport not found" });
      }

      return res.status(200).json(passport.data[0]);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "POST or GET only" });
};