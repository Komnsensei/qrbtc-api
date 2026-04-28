var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var sec = require("../lib/security");
var accum = require("../lib/accumulation");
var { generateHexId } = require("../lib/hex-id");
var { mintAward } = require("../lib/zenodo");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Awards can only be issued by admin (HexAgent governance)
  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });
  if (!session.is_admin) return res.status(403).json({ error: "Awards can only be issued by HexAgent governance (admin)" });

  try {
    var body = req.body || {};
    var target_passport_id = body.passport_id;
    var award_name = sec.sanitizeString(body.award_name || "");
    var award_reason = sec.sanitizeString(body.award_reason || "");
    var degrees_bonus = parseFloat(body.degrees_bonus) || 0;

    if (!target_passport_id || !award_name) {
      return res.status(400).json({ error: "passport_id and award_name required" });
    }

    if (degrees_bonus < 0 || degrees_bonus > 100) {
      return res.status(400).json({ error: "degrees_bonus must be 0-100" });
    }

    var passport = await db.from("passports").select("id, hex_id, revoked").eq("id", target_passport_id).limit(1);
    if (!passport.data || !passport.data[0]) return res.status(404).json({ error: "Passport not found" });
    if (passport.data[0].revoked) return res.status(403).json({ error: "Passport revoked" });

    var hexId = passport.data[0].hex_id || generateHexId(target_passport_id);

    // Get current tier
    var allSessions = await db.from("sessions")
      .select("score, created_at")
      .eq("passport_id", target_passport_id)
      .order("created_at", { ascending: true });
    var tierInfo = accum.computeTrueTier(allSessions.data || [], false);

    // Mint award DOI
    var doiResult = null;
    try {
      doiResult = await mintAward({
        hex_id: hexId,
        award_name: award_name,
        award_reason: award_reason,
        degrees_bonus: degrees_bonus,
        tier: tierInfo.tier
      });
    } catch (doiErr) {
      console.error("AWARD DOI ERROR:", doiErr.message);
    }

    // Store award
    await db.from("awards").insert({
      passport_id: target_passport_id,
      hex_id: hexId,
      award_name: award_name,
      award_reason: award_reason,
      degrees_bonus: degrees_bonus,
      tier_at_time: tierInfo.tier,
      doi: doiResult && doiResult.ok ? doiResult.doi : null,
      doi_url: doiResult && doiResult.ok ? doiResult.doi_url : null
    });

    return res.status(200).json({
      hex_id: hexId,
      award_name: award_name,
      award_reason: award_reason,
      degrees_bonus: degrees_bonus,
      tier: tierInfo.tier,
      doi: doiResult && doiResult.ok ? {
        doi: doiResult.doi,
        doi_url: doiResult.doi_url,
        polarity: "+"
      } : null
    });
  } catch (e) {
    console.error("AWARD:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};
