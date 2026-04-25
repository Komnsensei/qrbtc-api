var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function (req, res) {
  // Apply security headers
  auth.applySecurityHeaders(res);
  auth.applyCORSHeaders(res);

  // Handle preflight requests
  if (auth.handlePreflight(req, res)) return;

  var action = req.query.action || (req.body && req.body.action);

  if (action === "history") {
    if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

    var session = await auth.authenticate(req, "ledger:read");
    if (session.error) return res.status(session.status).json({ error: session.error });

    var result = await db
      .from("sessions")
      .select("*")
      .eq("passport_id", session.passport_id)
      .order("created_at", { ascending: true });

    if (result.error) return res.status(500).json({ error: result.error.message });

    return res.status(200).json({
      passport_id: session.passport_id,
      count: result.data.length,
      sessions: result.data
    });
  }

  if (action === "compare") {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    var session = await auth.authenticate(req, "ledger:read");
    if (session.error) return res.status(session.status).json({ error: session.error });

    var id_a = req.body.passport_a;
    var id_b = req.body.passport_b;
    if (!id_a || !id_b) return res.status(400).json({ error: "passport_a and passport_b required" });

    var a = await db.from("sessions").select("score").eq("passport_id", id_a);
    var b = await db.from("sessions").select("score").eq("passport_id", id_b);

    if (!a.data || !b.data) return res.status(500).json({ error: "Query failed" });

    function avg(arr) {
      if (arr.length === 0) return 0;
      var sum = 0;
      for (var i = 0; i < arr.length; i++) sum += arr[i].score;
      return Math.round((sum / arr.length) * 100) / 100;
    }

    return res.status(200).json({
      passport_a: { id: id_a, sessions: a.data.length, avg_score: avg(a.data) },
      passport_b: { id: id_b, sessions: b.data.length, avg_score: avg(b.data) },
      delta: Math.round((avg(a.data) - avg(b.data)) * 100) / 100
    });
  }

  if (action === "revoke") {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    var session = await auth.authenticate(req, "score:write");
    if (session.error) return res.status(session.status).json({ error: session.error });

    var update = await db
      .from("passports")
      .update({ revoked: true })
      .eq("id", session.passport_id);

    if (update.error) return res.status(500).json({ error: update.error.message });

    return res.status(200).json({
      passport_id: session.passport_id,
      revoked: true,
      message: "Passport revoked. No further blocks accepted."
    });
  }

  return res.status(400).json({
    error: "Unknown action. Use: ?action=history | compare | revoke"
  });
};