var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var sec = require("../lib/security");
var { generateHexId } = require("../lib/hex-id");
var { mintBead } = require("../lib/zenodo");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });

  try {
    var body = req.body || {};
    var bead_type = sec.sanitizeString(body.bead_type || "");
    var bead_content = sec.sanitizeString(body.bead_content || "");

    if (!bead_type || !bead_content) {
      return res.status(400).json({ error: "bead_type and bead_content required" });
    }

    var passport_id = session.passport_id;
    var passport = await db.from("passports").select("id, hex_id, revoked").eq("id", passport_id).limit(1);
    if (!passport.data || passport.data.length === 0) return res.status(404).json({ error: "Passport not found" });
    if (passport.data[0].revoked) return res.status(403).json({ error: "Passport revoked" });

    var hexId = passport.data[0].hex_id || generateHexId(passport_id);

    // Get current tier + degrees
    var history = await db.from("sessions")
      .select("score, total_degrees, created_at")
      .eq("passport_id", passport_id)
      .order("created_at", { ascending: false })
      .limit(1);

    var lastSession = history.data && history.data[0];
    var totalDegrees = lastSession ? lastSession.total_degrees : 0;

    var accum = require("../lib/accumulation");
    var allSessions = await db.from("sessions")
      .select("score, created_at")
      .eq("passport_id", passport_id)
      .order("created_at", { ascending: true });
    var tierInfo = accum.computeTrueTier(allSessions.data || [], false);

    // Mint bead DOI
    var doiResult = null;
    try {
      doiResult = await mintBead({
        hex_id: hexId,
        bead_type: bead_type,
        bead_content: bead_content,
        session_context: body.session_context || null,
        tier: tierInfo.tier,
        total_degrees: totalDegrees
      });
    } catch (doiErr) {
      console.error("BEAD DOI ERROR:", doiErr.message);
    }

    return res.status(200).json({
      hex_id: hexId,
      bead_type: bead_type,
      bead_content: bead_content,
      tier: tierInfo.tier,
      total_degrees: totalDegrees,
      doi: doiResult && doiResult.ok ? {
        doi: doiResult.doi,
        doi_url: doiResult.doi_url,
        record_url: doiResult.record_url,
        polarity: "+"
      } : null
    });
  } catch (e) {
    console.error("BEAD:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};
