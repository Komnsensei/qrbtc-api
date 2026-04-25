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

  var session = await auth.authenticate(req, "ledger:read");
  if (session.error) return res.status(session.status).json({ error: session.error });

  try {
    var body = req.body;
    var id_a = body.passport_a;
    var id_b = body.passport_b;
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

    var avg_a = avg(a.data);
    var avg_b = avg(b.data);

    return res.status(200).json({
      passport_a: { id: id_a, sessions: a.data.length, avg_score: avg_a },
      passport_b: { id: id_b, sessions: b.data.length, avg_score: avg_b },
      delta: Math.round((avg_a - avg_b) * 100) / 100
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};