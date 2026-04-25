var supabase = require("@supabase/supabase-js");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function (req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  try {
    var passports = await db.from("passports").select("id", { count: "exact", head: true });
    var sessions = await db.from("sessions").select("id", { count: "exact", head: true });

    var db_connected = !passports.error && !sessions.error;

    return res.status(200).json({
      status: db_connected ? "operational" : "degraded",
      version: "3.0",
      db: db_connected ? "connected" : "unreachable",
      passports: passports.count || 0,
      sessions: sessions.count || 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      status: "down",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};