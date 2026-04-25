var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function (req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  var session = await auth.authenticate(req, "ledger:read");
  if (session.error) return res.status(session.status).json({ error: session.error });

  try {
    var passport_id = session.passport_id;

    var result = await db
      .from("sessions")
      .select("*")
      .eq("passport_id", passport_id)
      .order("created_at", { ascending: true });

    if (result.error) {
      return res.status(500).json({ error: result.error.message });
    }

    return res.status(200).json({
      passport_id: passport_id,
      count: result.data.length,
      sessions: result.data
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};