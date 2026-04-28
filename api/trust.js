var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var sec = require("../lib/security");
var accum = require("../lib/accumulation");
var { generateHexId } = require("../lib/hex-id");
var { mintTrustRec } = require("../lib/zenodo");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });

  try {
    var body = req.body || {};
    var target_passport_id = body.passport_id;
    var context = sec.sanitizeString(body.context || "Collaboration trust building");

    if (!target_passport_id) {
      return res.status(400).json({ error: "passport_id required" });
    }

    var recommender_id = session.passport_id;
    if (recommender_id === target_passport_id) {
      return res.status(400).json({ error: "Cannot recommend yourself" });
    }

    // Check recommender has enough sessions (min 5)
    var recSessions = await db.from("sessions")
      .select("score, created_at")
      .eq("passport_id", recommender_id)
      .order("created_at", { ascending: true });
    if (!recSessions.data || recSessions.data.length < 5) {
      return res.status(400).json({ error: "Need at least 5 sessions to issue trust recommendations" });
    }

    // Check not already recommended recently (30 day cooldown)
    var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    var existing = await db.from("trust_recommendations")
      .select("id")
      .eq("recommender_id", recommender_id)
      .eq("passport_id", target_passport_id)
      .gte("created_at", thirtyDaysAgo)
      .limit(1);
    if (existing.data && existing.data.length > 0) {
      return res.status(409).json({ error: "Already recommended this user within 30 days" });
    }

    // Get both passports
    var recPassport = await db.from("passports").select("id, hex_id").eq("id", recommender_id).limit(1);
    var tgtPassport = await db.from("passports").select("id, hex_id, revoked").eq("id", target_passport_id).limit(1);

    if (!tgtPassport.data || !tgtPassport.data[0]) return res.status(404).json({ error: "Target passport not found" });
    if (tgtPassport.data[0].revoked) return res.status(403).json({ error: "Target passport revoked" });

    var recommenderHexId = recPassport.data[0].hex_id || generateHexId(recommender_id);
    var targetHexId = tgtPassport.data[0].hex_id || generateHexId(target_passport_id);

    // Recommender tier determines weight
    var recTier = accum.computeTrueTier(recSessions.data, false);
    var weightMap = { INITIATE: 0.1, SEED: 0.2, JOURNEYMAN: 0.4, MASTER: 0.6, SOVEREIGN: 0.8, LUMINARY: 1.0 };
    var weight = weightMap[recTier.tier] || 0.1;

    // Mint DOI
    var doiResult = null;
    try {
      doiResult = await mintTrustRec({
        hex_id: targetHexId,
        recommender_hex_id: recommenderHexId,
        recommender_tier: recTier.tier,
        recommendation_weight: weight,
        context: context
      });
    } catch (doiErr) {
      console.error("TRUST DOI ERROR:", doiErr.message);
    }

    // Store recommendation
    await db.from("trust_recommendations").insert({
      passport_id: target_passport_id,
      recommender_id: recommender_id,
      hex_id: targetHexId,
      recommender_hex_id: recommenderHexId,
      recommender_tier: recTier.tier,
      recommendation_weight: weight,
      context: context,
      doi: doiResult && doiResult.ok ? doiResult.doi : null,
      doi_url: doiResult && doiResult.ok ? doiResult.doi_url : null
    });

    return res.status(200).json({
      target_hex_id: targetHexId,
      recommender_hex_id: recommenderHexId,
      recommender_tier: recTier.tier,
      weight: weight,
      context: context,
      doi: doiResult && doiResult.ok ? {
        doi: doiResult.doi,
        doi_url: doiResult.doi_url,
        polarity: "+"
      } : null
    });
  } catch (e) {
    console.error("TRUST:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};
