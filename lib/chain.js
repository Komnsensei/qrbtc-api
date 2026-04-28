// DOI Chain Lineage — tracks every DOI per user in sequence
// Each new DOI references the previous DOI, building an unbroken provenance chain
// Chain hash = SHA256(previous_chain_hash + current_doi + event_type + timestamp)

var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Get the latest chain entry for a passport
async function getLatestLink(passport_id) {
  var result = await db.from("doi_chain")
    .select("*")
    .eq("passport_id", passport_id)
    .order("position", { ascending: false })
    .limit(1);
  
  if (result.error || !result.data || result.data.length === 0) {
    return null;
  }
  return result.data[0];
}

// Get full chain for a passport
async function getFullChain(passport_id) {
  var result = await db.from("doi_chain")
    .select("*")
    .eq("passport_id", passport_id)
    .order("position", { ascending: true });
  
  return result.data || [];
}

// Compute chain hash: links current DOI to previous
function computeChainHash(previousChainHash, doi, eventType, timestamp) {
  var input = [
    previousChainHash || "genesis",
    doi,
    eventType,
    timestamp
  ].join("|");
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Append a new DOI to the chain
async function appendLink(passport_id, hex_id, doiResult, eventType, metadata) {
  if (!doiResult || !doiResult.ok) return null;

  var latest = await getLatestLink(passport_id);
  var position = latest ? latest.position + 1 : 0;
  var previousChainHash = latest ? latest.chain_hash : "genesis";
  var previousDoi = latest ? latest.doi : null;
  var now = new Date().toISOString();

  var chainHash = computeChainHash(previousChainHash, doiResult.doi, eventType, now);

  var link = {
    passport_id: passport_id,
    hex_id: hex_id,
    position: position,
    doi: doiResult.doi,
    doi_url: doiResult.doi_url || ("https://doi.org/" + doiResult.doi),
    record_id: doiResult.record_id || null,
    event_type: eventType,
    polarity: doiResult.polarity || "+",
    chain_hash: chainHash,
    previous_chain_hash: previousChainHash,
    previous_doi: previousDoi,
    metadata: metadata || {},
    created_at: now
  };

  var result = await db.from("doi_chain").insert(link).select();
  if (result.error) {
    console.error("[chain] Insert error:", result.error.message);
    return null;
  }

  return result.data[0];
}

// Verify chain integrity — walk from genesis, recompute every hash
async function verifyChain(passport_id) {
  var chain = await getFullChain(passport_id);
  if (chain.length === 0) return { valid: true, length: 0, errors: [] };

  var errors = [];
  for (var i = 0; i < chain.length; i++) {
    var link = chain[i];
    var expectedPrevHash = i === 0 ? "genesis" : chain[i - 1].chain_hash;
    var expectedPrevDoi = i === 0 ? null : chain[i - 1].doi;

    // Check position sequence
    if (link.position !== i) {
      errors.push({ position: i, error: "Position mismatch: expected " + i + ", got " + link.position });
    }

    // Check previous hash linkage
    if (link.previous_chain_hash !== expectedPrevHash) {
      errors.push({ position: i, error: "Previous hash mismatch at position " + i });
    }

    // Check previous DOI linkage
    if (link.previous_doi !== expectedPrevDoi) {
      errors.push({ position: i, error: "Previous DOI mismatch at position " + i });
    }

    // Recompute and verify chain hash
    var recomputed = computeChainHash(link.previous_chain_hash, link.doi, link.event_type, link.created_at);
    if (link.chain_hash !== recomputed) {
      errors.push({ position: i, error: "Chain hash invalid at position " + i + " — chain may be tampered" });
    }
  }

  return {
    valid: errors.length === 0,
    length: chain.length,
    head: chain[chain.length - 1],
    genesis: chain[0],
    errors: errors
  };
}

// Build LLM-readable chain summary — THIS is what goes into context
function buildChainContext(chain) {
  if (!chain || chain.length === 0) {
    return "No provenance chain. New user.";
  }

  var head = chain[chain.length - 1];
  var genesis = chain[0];
  var events = {};
  var polaritySum = 0;

  for (var i = 0; i < chain.length; i++) {
    var type = chain[i].event_type;
    events[type] = (events[type] || 0) + 1;
    polaritySum += chain[i].polarity === "+" ? 1 : -1;
  }

  var eventSummary = Object.keys(events).map(function(k) {
    return k + ":" + events[k];
  }).join(", ");

  var lines = [
    "QUANTUMPASS CHAIN — " + head.hex_id,
    "Chain length: " + chain.length + " DOIs",
    "Net polarity: " + (polaritySum >= 0 ? "+" : "") + polaritySum,
    "Events: " + eventSummary,
    "Genesis: " + genesis.doi + " (" + genesis.created_at + ")",
    "Head: " + head.doi + " (" + head.event_type + ", " + head.created_at + ")",
    "Chain hash: " + head.chain_hash.substring(0, 16) + "...",
    "Integrity: linked from genesis through " + chain.length + " blocks"
  ];

  // Last 5 events for immediate context
  var recent = chain.slice(-5);
  lines.push("Recent:");
  for (var j = 0; j < recent.length; j++) {
    var r = recent[j];
    lines.push("  [" + r.position + "] " + r.polarity + " " + r.event_type + " — " + r.doi);
  }

  return lines.join("\n");
}

module.exports = {
  getLatestLink,
  getFullChain,
  computeChainHash,
  appendLink,
  verifyChain,
  buildChainContext
};
