// Combined endpoint: bead, award, trust
// ?action=bead | award | trust
var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var sec = require("../lib/security");
var accum = require("../lib/accumulation");
var { generateHexId } = require("../lib/hex-id");
var { mintBead, mintAward, mintTrustRec } = require("../lib/zenodo");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  var action = (req.query.action || req.body.action || "").toLowerCase();

  if (action === "bead") return handleBead(req, res);
  if (action === "award") return handleAward(req, res);
  if (action === "trust") return handleTrust(req, res);
  return res.status(400).json({ error: "action required: bead | award | trust" });
};

async function handleBead(req, res) {
  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });

  var body = req.body || {};
  var bead_type = sec.sanitizeString(body.bead_type || "");
  var bead_content = sec.sanitizeString(body.bead_content || "");
  if (!bead_type || !bead_content) return res.status(400).json({ error: "bead_type and bead_content required" });

  var passport_id = session.passport_id;
  var passport = await db.from("passports").select("id, hex_id, revoked").eq("id", passport_id).limit(1);
  if (!passport.data || !passport.data[0]) return res.status(404).json({ error: "Passport not found" });
  if (passport.data[0].revoked) return res.status(403).json({ error: "Passport revoked" });

  var hexId = passport.data[0].hex_id || generateHexId(passport_id);
  var history = await db.from("sessions").select("score, total_degrees, created_at").eq("passport_id", passport_id).order("created_at", { ascending: false }).limit(1);
  var lastSession = history.data && history.data[0];
  var totalDegrees = lastSession ? lastSession.total_degrees : 0;
  var allSessions = await db.from("sessions").select("score, created_at").eq("passport_id", passport_id).order("created_at", { ascending: true });
  var tierInfo = accum.computeTrueTier(allSessions.data || [], false);

  var doiResult = null;
  try {
    doiResult = await mintBead({ hex_id: hexId, bead_type: bead_type, bead_content: bead_content, session_context: body.session_context || null, tier: tierInfo.tier, total_degrees: totalDegrees });
  } catch (e) { console.error("BEAD DOI:", e.message); }

  await db.from("beads").insert({ passport_id: passport_id, hex_id: hexId, bead_type: bead_type, bead_content: bead_content, session_context: body.session_context || null, tier_at_time: tierInfo.tier, total_degrees: totalDegrees, doi: doiResult && doiResult.ok ? doiResult.doi : null, doi_url: doiResult && doiResult.ok ? doiResult.doi_url : null });

  return res.status(200).json({ hex_id: hexId, bead_type: bead_type, bead_content: bead_content, tier: tierInfo.tier, total_degrees: totalDegrees, doi: doiResult && doiResult.ok ? { doi: doiResult.doi, doi_url: doiResult.doi_url, record_url: doiResult.record_url, polarity: "+" } : null });
}

async function handleAward(req, res) {
  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });
  if (!session.is_admin) return res.status(403).json({ error: "Awards require HexAgent governance (admin)" });

  var body = req.body || {};
  var target_passport_id = body.passport_id;
  var award_name = sec.sanitizeString(body.award_name || "");
  var award_reason = sec.sanitizeString(body.award_reason || "");
  var degrees_bonus = parseFloat(body.degrees_bonus) || 0;
  if (!target_passport_id || !award_name) return res.status(400).json({ error: "passport_id and award_name required" });
  if (degrees_bonus < 0 || degrees_bonus > 100) return res.status(400).json({ error: "degrees_bonus must be 0-100" });

  var passport = await db.from("passports").select("id, hex_id, revoked").eq("id", target_passport_id).limit(1);
  if (!passport.data || !passport.data[0]) return res.status(404).json({ error: "Passport not found" });
  if (passport.data[0].revoked) return res.status(403).json({ error: "Passport revoked" });

  var hexId = passport.data[0].hex_id || generateHexId(target_passport_id);
  var allSessions = await db.from("sessions").select("score, created_at").eq("passport_id", target_passport_id).order("created_at", { ascending: true });
  var tierInfo = accum.computeTrueTier(allSessions.data || [], false);

  var doiResult = null;
  try { doiResult = await mintAward({ hex_id: hexId, award_name: award_name, award_reason: award_reason, degrees_bonus: degrees_bonus, tier: tierInfo.tier }); } catch (e) { console.error("AWARD DOI:", e.message); }

  await db.from("awards").insert({ passport_id: target_passport_id, hex_id: hexId, award_name: award_name, award_reason: award_reason, degrees_bonus: degrees_bonus, tier_at_time: tierInfo.tier, doi: doiResult && doiResult.ok ? doiResult.doi : null, doi_url: doiResult && doiResult.ok ? doiResult.doi_url : null });

  return res.status(200).json({ hex_id: hexId, award_name: award_name, award_reason: award_reason, degrees_bonus: degrees_bonus, tier: tierInfo.tier, doi: doiResult && doiResult.ok ? { doi: doiResult.doi, doi_url: doiResult.doi_url, polarity: "+" } : null });
}

async function handleTrust(req, res) {
  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });

  var body = req.body || {};
  var target_passport_id = body.passport_id;
  var context = sec.sanitizeString(body.context || "Collaboration trust building");
  if (!target_passport_id) return res.status(400).json({ error: "passport_id required" });
  var recommender_id = session.passport_id;
  if (recommender_id === target_passport_id) return res.status(400).json({ error: "Cannot recommend yourself" });

  var recSessions = await db.from("sessions").select("score, created_at").eq("passport_id", recommender_id).order("created_at", { ascending: true });
  if (!recSessions.data || recSessions.data.length < 5) return res.status(400).json({ error: "Need at least 5 sessions to issue trust recommendations" });

  var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  var existing = await db.from("trust_recommendations").select("id").eq("recommender_id", recommender_id).eq("passport_id", target_passport_id).gte("created_at", thirtyDaysAgo).limit(1);
  if (existing.data && existing.data.length > 0) return res.status(409).json({ error: "Already recommended within 30 days" });

  var recPassport = await db.from("passports").select("id, hex_id").eq("id", recommender_id).limit(1);
  var tgtPassport = await db.from("passports").select("id, hex_id, revoked").eq("id", target_passport_id).limit(1);
  if (!tgtPassport.data || !tgtPassport.data[0]) return res.status(404).json({ error: "Target passport not found" });
  if (tgtPassport.data[0].revoked) return res.status(403).json({ error: "Target passport revoked" });

  var recommenderHexId = recPassport.data[0].hex_id || generateHexId(recommender_id);
  var targetHexId = tgtPassport.data[0].hex_id || generateHexId(target_passport_id);

  var recTier = accum.computeTrueTier(recSessions.data, false);
  var weightMap = { INITIATE: 0.1, SEED: 0.2, JOURNEYMAN: 0.4, MASTER: 0.6, SOVEREIGN: 0.8, LUMINARY: 1.0 };
  var weight = weightMap[recTier.tier] || 0.1;

  var doiResult = null;
  try { doiResult = await mintTrustRec({ hex_id: targetHexId, recommender_hex_id: recommenderHexId, recommender_tier: recTier.tier, recommendation_weight: weight, context: context }); } catch (e) { console.error("TRUST DOI:", e.message); }

  await db.from("trust_recommendations").insert({ passport_id: target_passport_id, recommender_id: recommender_id, hex_id: targetHexId, recommender_hex_id: recommenderHexId, recommender_tier: recTier.tier, recommendation_weight: weight, context: context, doi: doiResult && doiResult.ok ? doiResult.doi : null, doi_url: doiResult && doiResult.ok ? doiResult.doi_url : null });

  return res.status(200).json({ target_hex_id: targetHexId, recommender_hex_id: recommenderHexId, recommender_tier: recTier.tier, weight: weight, context: context, doi: doiResult && doiResult.ok ? { doi: doiResult.doi, doi_url: doiResult.doi_url, polarity: "+" } : null });
}
