var supabase = require("@supabase/supabase-js");
var sec = require("../lib/security");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  try {
    // Get all passports with geo data
    var passports = await db.from("passports")
      .select("id, username, created_at, lat, lon, city, country, country_code, region")
      .eq("revoked", false)
      .order("created_at", { ascending: true });

    if (passports.error) return res.status(500).json({ error: passports.error.message });

    // Get sessions with scores for each passport
    var sessions = await db.from("sessions")
      .select("passport_id, score, total_degrees, created_at")
      .order("created_at", { ascending: true });

    var sessionMap = {};
    if (sessions.data) {
      for (var i = 0; i < sessions.data.length; i++) {
        var s = sessions.data[i];
        if (!sessionMap[s.passport_id]) sessionMap[s.passport_id] = [];
        sessionMap[s.passport_id].push(s);
      }
    }

    // Build chain: each passport is a node, connections go in order of creation
    var nodes = [];
    var links = [];

    for (var j = 0; j < passports.data.length; j++) {
      var p = passports.data[j];
      var pSessions = sessionMap[p.id] || [];
      var bestScore = 0;
      var totalDegrees = 0;
      for (var k = 0; k < pSessions.length; k++) {
        if (pSessions[k].score > bestScore) bestScore = pSessions[k].score;
        totalDegrees += pSessions[k].total_degrees || 0;
      }

      nodes.push({
        id: p.id,
        username: p.username,
        lat: p.lat || null,
        lon: p.lon || null,
        city: p.city || null,
        country: p.country || null,
        country_code: p.country_code || null,
        region: p.region || null,
        created_at: p.created_at,
        score: bestScore,
        total_degrees: totalDegrees,
        sessions: pSessions.length,
        index: j
      });

      // Chain link to previous node
      if (j > 0) {
        links.push({
          source: passports.data[j - 1].id,
          target: p.id,
          type: "chain"
        });
      }
    }

    return res.status(200).json({
      total: nodes.length,
      nodes: nodes,
      links: links
    });
  } catch (e) {
    console.error("MAP:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};