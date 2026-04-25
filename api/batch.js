var auth = require("../lib/auth");

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status).json({ error: session.error });

  try {
    var body = req.body;
    var sessions = body.sessions;

    if (!sessions || !Array.isArray(sessions)) {
      return res.status(400).json({ error: "sessions array required" });
    }

    var results = [];
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      s.passport_id = session.passport_id;
      var r = await fetch(process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL + "/api/score" : "https://qrbtc-api.vercel.app/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": req.headers["x-api-key"] },
        body: JSON.stringify(s)
      });
      results.push(await r.json());
    }

    return res.status(200).json({ results: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};