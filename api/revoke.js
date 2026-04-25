var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status).json({ error: session.error });

  try {
    var passport_id = session.passport_id;

    var update = await db
      .from("passports")
      .update({ revoked: true })
      .eq("id", passport_id);

    if (update.error) return res.status(500).json({ error: update.error.message });

    return res.status(200).json({
      passport_id: passport_id,
      revoked: true,
      message: "Passport revoked. No further blocks accepted."
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};