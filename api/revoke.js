var supabase = require("@supabase/supabase-js");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    var body = req.body;
    var passport_id = body.passport_id;

    if (!passport_id) {
      return res.status(400).json({ error: "passport_id required" });
    }

    var passport = await db
      .from("passports")
      .select("id, username, revoked")
      .eq("id", passport_id)
      .limit(1);

    if (!passport.data || passport.data.length === 0) {
      return res.status(404).json({ error: "Passport not found" });
    }

    if (passport.data[0].revoked) {
      return res.status(400).json({ error: "Already revoked" });
    }

    var update = await db
      .from("passports")
      .update({ revoked: true })
      .eq("id", passport_id);

    if (update.error) {
      return res.status(500).json({ error: update.error.message });
    }

    return res.status(200).json({
      passport_id: passport_id,
      username: passport.data[0].username,
      revoked: true,
      message: "Passport frozen. No new blocks accepted."
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};