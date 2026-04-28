var auth = require("../lib/auth");
var sec = require("../lib/security");
var chain = require("../lib/chain");

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;

  var session = await auth.authenticate(req, "ledger:read");
  if (session.error) return res.status(session.status || 401).json({ error: session.error });

  try {
    var action = req.query.action || "full";

    if (action === "full") {
      // Full chain with LLM-readable context
      var fullChain = await chain.getFullChain(session.passport_id);
      var context = chain.buildChainContext(fullChain);
      return res.status(200).json({
        chain: fullChain,
        length: fullChain.length,
        context_for_llm: context
      });
    }

    if (action === "head") {
      // Just the latest link
      var head = await chain.getLatestLink(session.passport_id);
      return res.status(200).json({
        head: head,
        position: head ? head.position : -1
      });
    }

    if (action === "verify") {
      // Verify chain integrity
      var verification = await chain.verifyChain(session.passport_id);
      return res.status(200).json(verification);
    }

    if (action === "context") {
      // Just the LLM-readable summary — what gets injected into prompts
      var chainData = await chain.getFullChain(session.passport_id);
      var summary = chain.buildChainContext(chainData);
      return res.status(200).json({
        context: summary,
        length: chainData.length,
        head_hash: chainData.length > 0 ? chainData[chainData.length - 1].chain_hash : null
      });
    }

    return res.status(400).json({ error: "action must be: full, head, verify, or context" });

  } catch (e) {
    console.error("CHAIN:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};
