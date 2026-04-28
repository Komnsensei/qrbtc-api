var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var sec = require("../lib/security");
var { generateHexId } = require("../lib/hex-id");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Agent accumulation rate (25% of human)
var AGENT_ACCUMULATION_RATE = 0.25;

// Anti-spam: max agent sessions per hour (prevents mass chatting)
var AGENT_MAX_PER_HOUR = 2;
var AGENT_MAX_PER_DAY = 5;

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;

  try {
    // POST — register agent
    if (req.method === "POST") {
      var session = await auth.authenticate(req, "score:write");
      if (session.error) return res.status(session.status || 401).json({ error: session.error });

      var body = req.body || {};
      var action = body.action || "register";

      if (action === "register") {
        var agentName = sec.sanitizeString(body.agent_name || "");
        var agentDescription = sec.sanitizeString(body.description || "");

        if (!agentName) return res.status(400).json({ error: "agent_name required" });

        // Check owner doesn't already have too many agents (max 3)
        var existing = await db.from("passports")
          .select("id")
          .eq("agent_owner_id", session.passport_id)
          .eq("is_agent", true);
        if (existing.data && existing.data.length >= 3) {
          return res.status(400).json({ error: "Maximum 3 agents per account" });
        }

        // Create agent passport
        var result = await db.from("passports").insert({
          username: "agent_" + agentName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
          is_agent: true,
          agent_owner_id: session.passport_id,
          agent_available: false,
          agent_description: agentDescription,
          revoked: false
        }).select();

        if (result.error) return res.status(500).json({ error: result.error.message });

        var agent = result.data[0];
        var hexId = generateHexId(agent.id);
        await db.from("passports").update({ hex_id: hexId }).eq("id", agent.id);

        agent.hex_id = hexId;
        agent.accumulation_rate = AGENT_ACCUMULATION_RATE;

        return res.status(201).json(agent);
      }

      if (action === "set_available") {
        var agentId = body.agent_id;
        var available = body.available !== false;

        // Verify ownership
        var agent = await db.from("passports")
          .select("id, agent_owner_id, is_agent")
          .eq("id", agentId)
          .eq("is_agent", true)
          .limit(1);

        if (!agent.data || !agent.data[0]) return res.status(404).json({ error: "Agent not found" });
        if (agent.data[0].agent_owner_id !== session.passport_id) {
          return res.status(403).json({ error: "Not your agent" });
        }

        await db.from("passports").update({
          agent_available: available,
          agent_description: body.description ? sec.sanitizeString(body.description) : undefined
        }).eq("id", agentId);

        return res.status(200).json({ agent_id: agentId, available: available });
      }

      return res.status(400).json({ error: "Unknown action. Use: register, set_available" });
    }

    // GET — list available agents (public)
    if (req.method === "GET") {
      var agents = await db.from("passports")
        .select("id, username, hex_id, agent_description, agent_owner_id, created_at")
        .eq("is_agent", true)
        .eq("agent_available", true)
        .eq("revoked", false)
        .order("created_at", { ascending: false });

      // Get owner hex_ids
      var agentList = [];
      for (var i = 0; i < (agents.data || []).length; i++) {
        var a = agents.data[i];
        var ownerHex = generateHexId(a.agent_owner_id);
        agentList.push({
          agent_id: a.id,
          agent_name: a.username,
          agent_hex_id: a.hex_id,
          description: a.agent_description,
          owner_hex_id: ownerHex,
          registered: a.created_at
        });
      }

      return res.status(200).json({
        available_agents: agentList,
        count: agentList.length,
        accumulation_rate: AGENT_ACCUMULATION_RATE + " (25% of human rate)",
        rules: [
          "Agents only accumulate when interacting with humans",
          "Agent-to-agent sessions score zero",
          "Max " + AGENT_MAX_PER_HOUR + " sessions/hour, " + AGENT_MAX_PER_DAY + "/day per agent",
          "All agent scores go to owner's account via global marker"
        ]
      });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (e) {
    console.error("AGENTS:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};

// Export anti-spam check for use in score.js
module.exports.AGENT_ACCUMULATION_RATE = AGENT_ACCUMULATION_RATE;
module.exports.AGENT_MAX_PER_HOUR = AGENT_MAX_PER_HOUR;
module.exports.AGENT_MAX_PER_DAY = AGENT_MAX_PER_DAY;

module.exports.checkAgentSpam = async function(passport_id) {
  var oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  var oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  var hourly = await db.from("sessions")
    .select("id")
    .eq("passport_id", passport_id)
    .eq("is_agent_session", true)
    .gte("created_at", oneHourAgo);

  var daily = await db.from("sessions")
    .select("id")
    .eq("passport_id", passport_id)
    .eq("is_agent_session", true)
    .gte("created_at", oneDayAgo);

  var hourCount = (hourly.data || []).length;
  var dayCount = (daily.data || []).length;

  return {
    ok: hourCount < AGENT_MAX_PER_HOUR && dayCount < AGENT_MAX_PER_DAY,
    hourly: hourCount,
    daily: dayCount,
    hourly_limit: AGENT_MAX_PER_HOUR,
    daily_limit: AGENT_MAX_PER_DAY
  };
};
