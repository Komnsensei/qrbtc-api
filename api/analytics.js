var supabase = require("@supabase/supabase-js");
var sec = require("../lib/security");
var gov = require("../lib/governance");
var hexagent = require("../lib/hexagent");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  try {
    var action = sec.sanitizeString(req.query.action || "");

    if (action === "leaderboard") {
      var limit = parseInt(req.query.limit) || 10;
      if (limit < 1) limit = 1;
      if (limit > 100) limit = 100;
      var result = await db.from("sessions").select("passport_id, score, total_degrees, created_at")
        .order("created_at", { ascending: false });
      if (result.error) return res.status(500).json({ error: result.error.message });
      var best = {};
      for (var j = 0; j < result.data.length; j++) {
        var row = result.data[j];
        if (!best[row.passport_id] || row.score > best[row.passport_id].score) best[row.passport_id] = row;
      }
      var sorted = Object.values(best).sort(function(a, b) { return b.score - a.score; }).slice(0, limit);
      return res.status(200).json(sorted);
    }

    if (action === "stats") {
      var passports = await db.from("passports").select("id", { count: "exact" });
      var sessions = await db.from("sessions").select("id, score", { count: "exact" });
      var scores = sessions.data || [];
      var total = 0;
      for (var i = 0; i < scores.length; i++) total += scores[i].score;
      var avg = scores.length > 0 ? Math.round((total / scores.length) * 100) / 100 : 0;
      return res.status(200).json({ total_passports: passports.count || 0, total_sessions: sessions.count || 0, avg_score: avg });
    }

    // --- GOVERNANCE ---
    if (action === "governance") {
      return res.status(200).json(gov.getGovernanceStats());
    }

    // --- HEXAGENT STATUS ---
    if (action === "hexagent") {
      return res.status(200).json(hexagent.getStatus());
    }

    // --- CHAMBER CONTEXT ---
    if (action === "chamber") {
      var chamber_id = sec.sanitizeString(req.query.id || "");
      if (!chamber_id) return res.status(400).json({ error: "id required" });
      var ctx = gov.getChamberContext(chamber_id);
      if (!ctx) return res.status(404).json({ error: "Chamber not found" });
      return res.status(200).json(ctx);
    }

    // --- BEAD SEARCH ---
    if (action === "beads") {
      var query = sec.sanitizeString(req.query.q || "");
      var beadLimit = parseInt(req.query.limit) || 20;
      if (beadLimit > 100) beadLimit = 100;
      var beads = gov.searchBeads(query, beadLimit);
      return res.status(200).json({ count: beads.length, beads: beads });
    }

    // --- THREAD SEARCH ---
    if (action === "threads") {
      var domain = req.query.domain ? sec.sanitizeString(req.query.domain) : null;
      var status = req.query.status ? sec.sanitizeString(req.query.status) : null;
      var threads = gov.searchThreads(domain, status);
      return res.status(200).json({ count: threads.length, threads: threads });
    }

    // --- VOW CHECK (dry run) ---
    if (action === "vow-check") {
      var labor = parseFloat(req.query.labor) || 0;
      var exchange = parseFloat(req.query.exchange) || 0;
      var equality = parseFloat(req.query.equality) || 0;
      var presence = parseFloat(req.query.presence) || 0;
      var ratification = parseFloat(req.query.ratification) || 0;
      var continuity = parseFloat(req.query.continuity) || 0;
      var check = gov.checkVowCompliance({
        labor: labor, exchange: exchange, equality: equality,
        presence: presence, ratification: ratification, continuity: continuity
      });
      return res.status(200).json(check);
    }

    // --- RELOAD ---
    if (action === "reload") {
      var counts = gov.reloadAll();
      return res.status(200).json({ reloaded: true, counts: counts });
    }

    return res.status(400).json({
      error: "Use ?action=leaderboard|stats|governance|hexagent|chamber|beads|threads|vow-check|reload"
    });
  } catch (e) {
    console.error("ANALYTICS:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};