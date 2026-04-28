var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var sec = require("../lib/security");
var accum = require("../lib/accumulation");
var { generateHexId } = require("../lib/hex-id");
var { mintChainlink } = require("../lib/zenodo");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });

  try {
    var body = req.body || {};
    var target_passport_id = body.target_passport_id;
    var link_reason = sec.sanitizeString(body.reason || "Chain alignment collaboration");

    if (!target_passport_id) {
      return res.status(400).json({ error: "target_passport_id required" });
    }

    var initiator_id = session.passport_id;
    if (initiator_id === target_passport_id) {
      return res.status(400).json({ error: "Cannot chainlink with yourself" });
    }

    // Get both passports
    var pA = await db.from("passports").select("id, hex_id, revoked").eq("id", initiator_id).limit(1);
    var pB = await db.from("passports").select("id, hex_id, revoked").eq("id", target_passport_id).limit(1);

    if (!pA.data || !pA.data[0]) return res.status(404).json({ error: "Your passport not found" });
    if (!pB.data || !pB.data[0]) return res.status(404).json({ error: "Target passport not found" });
    if (pA.data[0].revoked || pB.data[0].revoked) return res.status(403).json({ error: "One or both passports revoked" });

    var hexA = pA.data[0].hex_id || generateHexId(initiator_id);
    var hexB = pB.data[0].hex_id || generateHexId(target_passport_id);

    // Get session histories for both
    var histA = await db.from("sessions").select("score, total_degrees, created_at")
      .eq("passport_id", initiator_id).order("created_at", { ascending: true });
    var histB = await db.from("sessions").select("score, total_degrees, created_at")
      .eq("passport_id", target_passport_id).order("created_at", { ascending: true });

    var sessionsA = histA.data || [];
    var sessionsB = histB.data || [];

    // Both must have at least 5 sessions
    if (sessionsA.length < 5 || sessionsB.length < 5) {
      return res.status(400).json({ error: "Both parties need at least 5 sessions to chainlink" });
    }

    var tierA = accum.computeTrueTier(sessionsA, false);
    var tierB = accum.computeTrueTier(sessionsB, false);

    // Both must be at least JOURNEYMAN
    var minTiers = ["JOURNEYMAN", "MASTER", "SOVEREIGN", "LUMINARY"];
    if (minTiers.indexOf(tierA.tier) === -1 || minTiers.indexOf(tierB.tier) === -1) {
      return res.status(400).json({ error: "Both parties must be at least JOURNEYMAN tier to chainlink" });
    }

    // Check for existing chainlink
    var existing = await db.from("chainlinks")
      .select("id")
      .or("and(initiator_id.eq." + initiator_id + ",target_id.eq." + target_passport_id + "),and(initiator_id.eq." + target_passport_id + ",target_id.eq." + initiator_id + ")")
      .limit(1);

    if (existing.data && existing.data.length > 0) {
      return res.status(409).json({ error: "Chainlink already exists between these passports" });
    }

    // Compute alignment score (how similar their scoring patterns are)
    var avgA = accum.computeWeightedAverage(sessionsA);
    var avgB = accum.computeWeightedAverage(sessionsB);
    var alignmentScore = Math.round((1 - Math.abs(avgA - avgB) / 100) * 100) / 100;

    // Collab bonus = alignment * 50 degrees each
    var collabBonus = Math.round(alignmentScore * 50 * 100) / 100;

    var degreesA = sessionsA.length > 0 ? sessionsA[sessionsA.length - 1].total_degrees : 0;
    var degreesB = sessionsB.length > 0 ? sessionsB[sessionsB.length - 1].total_degrees : 0;

    var linkHash = crypto.createHash("sha256")
      .update(hexA + "|" + hexB + "|" + alignmentScore + "|" + Date.now())
      .digest("hex");

    // Store chainlink
    await db.from("chainlinks").insert({
      initiator_id: initiator_id,
      target_id: target_passport_id,
      hex_id_a: hexA,
      hex_id_b: hexB,
      alignment_score: alignmentScore,
      collab_bonus: collabBonus,
      link_hash: linkHash,
      trusted: true,
      created_at: new Date().toISOString()
    });

    // Apply bonus degrees to both passports' latest session totals
    // (This would need a degrees_bonus column or special session entry)

    // Mint *TRUSTED* CHAINLINK DOI
    var doiResult = null;
    try {
      doiResult = await mintChainlink({
        hex_id: hexA,
        hex_id_a: hexA,
        hex_id_b: hexB,
        tier_a: tierA.tier,
        tier_b: tierB.tier,
        degrees_a: degreesA,
        degrees_b: degreesB,
        chain_length_a: sessionsA.length,
        chain_length_b: sessionsB.length,
        alignment_score: alignmentScore,
        collab_bonus: collabBonus,
        link_hash: linkHash,
        link_reason: link_reason
      });
    } catch (doiErr) {
      console.error("CHAINLINK DOI ERROR:", doiErr.message);
    }

    return res.status(200).json({
      chainlink: {
        trusted: true,
        hex_id_a: hexA,
        hex_id_b: hexB,
        tier_a: tierA.tier,
        tier_b: tierB.tier,
        alignment_score: alignmentScore,
        collab_bonus: collabBonus,
        link_hash: linkHash
      },
      doi: doiResult && doiResult.ok ? {
        doi: doiResult.doi,
        doi_url: doiResult.doi_url,
        record_url: doiResult.record_url,
        polarity: "+",
        marker: "*TRUSTED*"
      } : null
    });
  } catch (e) {
    console.error("CHAINLINK:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};
