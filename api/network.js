// Combined endpoint: agents, chainlink
// ?action=register_agent | set_available | list_agents | chainlink
var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var sec = require("../lib/security");
var accum = require("../lib/accumulation");
var { generateHexId } = require("../lib/hex-id");
var { mintChainlink } = require("../lib/zenodo");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

var AGENT_ACCUMULATION_RATE = 0.25;
var AGENT_MAX_PER_HOUR = 2;
var AGENT_MAX_PER_DAY = 5;

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;

  var action = (req.query.action || (req.body && req.body.action) || "").toLowerCase();

  if (req.method === "GET" && action === "list_agents") return listAgents(req, res);
  if (req.method === "POST" && action === "register_agent") return registerAgent(req, res);
  if (req.method === "POST" && action === "set_available") return setAvailable(req, res);
  if (req.method === "POST" && action === "chainlink") return handleChainlink(req, res);

  return res.status(400).json({ error: "action required: register_agent | set_available | list_agents (GET) | chainlink" });
};

async function registerAgent(req, res) {
  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });

  var body = req.body || {};
  var agentName = sec.sanitizeString(body.agent_name || "");
  var agentDescription = sec.sanitizeString(body.description || "");
  if (!agentName) return res.status(400).json({ error: "agent_name required" });

  var existing = await db.from("passports").select("id").eq("agent_owner_id", session.passport_id).eq("is_agent", true);
  if (existing.data && existing.data.length >= 3) return res.status(400).json({ error: "Maximum 3 agents per account" });

  var result = await db.from("passports").insert({ username: "agent_" + agentName.toLowerCase().replace(/[^a-z0-9]/g, "_"), is_agent: true, agent_owner_id: session.passport_id, agent_available: false, agent_description: agentDescription, revoked: false }).select();
  if (result.error) return res.status(500).json({ error: result.error.message });

  var agent = result.data[0];
  var hexId = generateHexId(agent.id);
  await db.from("passports").update({ hex_id: hexId }).eq("id", agent.id);
  agent.hex_id = hexId;
  agent.accumulation_rate = AGENT_ACCUMULATION_RATE;
  return res.status(201).json(agent);
}

async function setAvailable(req, res) {
  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });

  var body = req.body || {};
  var agentId = body.agent_id;
  var available = body.available !== false;

  var agent = await db.from("passports").select("id, agent_owner_id, is_agent").eq("id", agentId).eq("is_agent", true).limit(1);
  if (!agent.data || !agent.data[0]) return res.status(404).json({ error: "Agent not found" });
  if (agent.data[0].agent_owner_id !== session.passport_id) return res.status(403).json({ error: "Not your agent" });

  var updateData = { agent_available: available };
  if (body.description) updateData.agent_description = sec.sanitizeString(body.description);
  await db.from("passports").update(updateData).eq("id", agentId);
  return res.status(200).json({ agent_id: agentId, available: available });
}

async function listAgents(req, res) {
  var agents = await db.from("passports").select("id, username, hex_id, agent_description, agent_owner_id, created_at").eq("is_agent", true).eq("agent_available", true).eq("revoked", false).order("created_at", { ascending: false });

  var agentList = [];
  for (var i = 0; i < (agents.data || []).length; i++) {
    var a = agents.data[i];
    agentList.push({ agent_id: a.id, agent_name: a.username, agent_hex_id: a.hex_id, description: a.agent_description, owner_hex_id: generateHexId(a.agent_owner_id), registered: a.created_at });
  }

  return res.status(200).json({ available_agents: agentList, count: agentList.length, accumulation_rate: "25% of human rate", rules: ["Agents only accumulate with humans", "Agent-to-agent = zero", "Max " + AGENT_MAX_PER_HOUR + "/hr, " + AGENT_MAX_PER_DAY + "/day", "Scores go to owner via global marker"] });
}

async function handleChainlink(req, res) {
  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });

  var body = req.body || {};
  var target_passport_id = body.target_passport_id;
  var link_reason = sec.sanitizeString(body.reason || "Chain alignment collaboration");
  if (!target_passport_id) return res.status(400).json({ error: "target_passport_id required" });

  var initiator_id = session.passport_id;
  if (initiator_id === target_passport_id) return res.status(400).json({ error: "Cannot chainlink with yourself" });

  var pA = await db.from("passports").select("id, hex_id, revoked").eq("id", initiator_id).limit(1);
  var pB = await db.from("passports").select("id, hex_id, revoked").eq("id", target_passport_id).limit(1);
  if (!pA.data || !pA.data[0]) return res.status(404).json({ error: "Your passport not found" });
  if (!pB.data || !pB.data[0]) return res.status(404).json({ error: "Target passport not found" });
  if (pA.data[0].revoked || pB.data[0].revoked) return res.status(403).json({ error: "One or both passports revoked" });

  var hexA = pA.data[0].hex_id || generateHexId(initiator_id);
  var hexB = pB.data[0].hex_id || generateHexId(target_passport_id);

  var histA = await db.from("sessions").select("score, total_degrees, created_at").eq("passport_id", initiator_id).order("created_at", { ascending: true });
  var histB = await db.from("sessions").select("score, total_degrees, created_at").eq("passport_id", target_passport_id).order("created_at", { ascending: true });
  var sessionsA = histA.data || [];
  var sessionsB = histB.data || [];
  if (sessionsA.length < 5 || sessionsB.length < 5) return res.status(400).json({ error: "Both need 5+ sessions" });

  var tierA = accum.computeTrueTier(sessionsA, false);
  var tierB = accum.computeTrueTier(sessionsB, false);
  var minTiers = ["JOURNEYMAN", "MASTER", "SOVEREIGN", "LUMINARY"];
  if (minTiers.indexOf(tierA.tier) === -1 || minTiers.indexOf(tierB.tier) === -1) return res.status(400).json({ error: "Both must be JOURNEYMAN+" });

  var existing = await db.from("chainlinks").select("id").or("and(initiator_id.eq." + initiator_id + ",target_id.eq." + target_passport_id + "),and(initiator_id.eq." + target_passport_id + ",target_id.eq." + initiator_id + ")").limit(1);
  if (existing.data && existing.data.length > 0) return res.status(409).json({ error: "Chainlink already exists" });

  var avgA = accum.computeWeightedAverage ? accum.computeWeightedAverage(sessionsA) : 50;
  var avgB = accum.computeWeightedAverage ? accum.computeWeightedAverage(sessionsB) : 50;
  var alignmentScore = Math.round((1 - Math.abs(avgA - avgB) / 100) * 100) / 100;
  var collabBonus = Math.round(alignmentScore * 50 * 100) / 100;

  var degreesA = sessionsA.length > 0 ? sessionsA[sessionsA.length - 1].total_degrees : 0;
  var degreesB = sessionsB.length > 0 ? sessionsB[sessionsB.length - 1].total_degrees : 0;

  var linkHash = crypto.createHash("sha256").update(hexA + "|" + hexB + "|" + alignmentScore + "|" + Date.now()).digest("hex");

  await db.from("chainlinks").insert({ initiator_id: initiator_id, target_id: target_passport_id, hex_id_a: hexA, hex_id_b: hexB, alignment_score: alignmentScore, collab_bonus: collabBonus, link_hash: linkHash, trusted: true });

  var doiResult = null;
  try { doiResult = await mintChainlink({ hex_id: hexA, hex_id_a: hexA, hex_id_b: hexB, tier_a: tierA.tier, tier_b: tierB.tier, degrees_a: degreesA, degrees_b: degreesB, chain_length_a: sessionsA.length, chain_length_b: sessionsB.length, alignment_score: alignmentScore, collab_bonus: collabBonus, link_hash: linkHash, link_reason: link_reason }); } catch (e) { console.error("CHAINLINK DOI:", e.message); }

  return res.status(200).json({ chainlink: { trusted: true, hex_id_a: hexA, hex_id_b: hexB, tier_a: tierA.tier, tier_b: tierB.tier, alignment_score: alignmentScore, collab_bonus: collabBonus, link_hash: linkHash }, doi: doiResult && doiResult.ok ? { doi: doiResult.doi, doi_url: doiResult.doi_url, record_url: doiResult.record_url, polarity: "+", marker: "*TRUSTED*" } : null });
}

module.exports.AGENT_ACCUMULATION_RATE = AGENT_ACCUMULATION_RATE;
module.exports.AGENT_MAX_PER_HOUR = AGENT_MAX_PER_HOUR;
module.exports.AGENT_MAX_PER_DAY = AGENT_MAX_PER_DAY;
module.exports.checkAgentSpam = async function(passport_id) {
  var oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  var oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  var hourly = await db.from("sessions").select("id").eq("passport_id", passport_id).eq("is_agent_session", true).gte("created_at", oneHourAgo);
  var daily = await db.from("sessions").select("id").eq("passport_id", passport_id).eq("is_agent_session", true).gte("created_at", oneDayAgo);
  return { ok: (hourly.data || []).length < AGENT_MAX_PER_HOUR && (daily.data || []).length < AGENT_MAX_PER_DAY, hourly: (hourly.data || []).length, daily: (daily.data || []).length };
};
