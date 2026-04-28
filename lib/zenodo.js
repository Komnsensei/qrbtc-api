// Zenodo DOI Minting Engine — universal for all QuantumPass event types
// Deposits structured, LLM-readable JSON to Zenodo and publishes for permanent DOI

const { buildDoiContent, DOI_TYPES } = require('./doi-schema');

const ZENODO_BASE = process.env.ZENODO_USE_SANDBOX === 'true'
  ? 'https://sandbox.zenodo.org/api'
  : 'https://zenodo.org/api';

const ZENODO_TOKEN = process.env.ZENODO_TOKEN;

// Create a Zenodo deposit, upload content, publish → returns DOI
async function mintDOI(eventType, data) {
  if (!ZENODO_TOKEN) {
    console.error('[zenodo] No ZENODO_TOKEN configured');
    return { ok: false, error: 'No Zenodo token configured' };
  }

  const content = buildDoiContent(eventType, data);
  const filename = `quantumpass-${eventType}-${data.hex_id || 'system'}-${Date.now()}.json`;

  try {
    // Step 1: Create empty deposit
    const createRes = await fetch(ZENODO_BASE + '/deposit/depositions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ZENODO_TOKEN
      },
      body: JSON.stringify({
        metadata: {
          title: content.title,
          description: content.description,
          upload_type: 'dataset',
          creators: [{ name: 'QuantumPass Protocol' }],
          keywords: [
            'quantumpass', 'provenance', eventType,
            content.polarity === '+' ? 'positive-weight' : 'negative-weight',
            data.hex_id || 'system'
          ].filter(Boolean),
          notes: content.summary_for_llm,
          license: 'cc-by-4.0',
          communities: [{ identifier: 'passioncraft' }],
          related_identifiers: data.related_doi ? [{
            identifier: data.related_doi,
            relation: 'continues',
            scheme: 'doi'
          }] : []
        }
      })
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('[zenodo] Create failed:', err);
      return { ok: false, error: 'Zenodo create failed', detail: err };
    }

    const deposition = await createRes.json();
    const depositionId = deposition.id;
    const bucketUrl = deposition.links.bucket;

    // Step 2: Upload the JSON content file
    const fileContent = JSON.stringify(content, null, 2);
    const uploadRes = await fetch(bucketUrl + '/' + filename, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Authorization': 'Bearer ' + ZENODO_TOKEN
      },
      body: fileContent
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('[zenodo] Upload failed:', err);
      return { ok: false, error: 'Zenodo upload failed', detail: err };
    }

    // Step 3: Publish
    const pubRes = await fetch(ZENODO_BASE + '/deposit/depositions/' + depositionId + '/actions/publish', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + ZENODO_TOKEN }
    });

    if (!pubRes.ok) {
      const err = await pubRes.text();
      console.error('[zenodo] Publish failed:', err);
      return { ok: false, error: 'Zenodo publish failed', detail: err, deposition_id: depositionId };
    }

    const published = await pubRes.json();

    return {
      ok: true,
      doi: published.doi,
      doi_url: published.doi_url || ('https://doi.org/' + published.doi),
      record_id: published.id,
      record_url: published.links.record_html || published.links.html,
      event_type: eventType,
      polarity: content.polarity,
      hex_id: data.hex_id,
      summary: content.summary_for_llm
    };

  } catch (e) {
    console.error('[zenodo] mintDOI error:', e.message);
    return { ok: false, error: e.message };
  }
}

// Convenience wrappers
async function mintBirthCert(data) { return mintDOI(DOI_TYPES.BIRTH_CERT, data); }
async function mintSession(data) { return mintDOI(DOI_TYPES.SCORE_SESSION, data); }
async function mintBead(data) { return mintDOI(DOI_TYPES.BEAD_MINT, data); }
async function mintTierUp(data) { return mintDOI(DOI_TYPES.TIER_UP, data); }
async function mintDecay(data) { return mintDOI(DOI_TYPES.DECAY, data); }
async function mintAward(data) { return mintDOI(DOI_TYPES.AWARD, data); }
async function mintTrustRec(data) { return mintDOI(DOI_TYPES.TRUST_REC, data); }
async function mintChainlink(data) { return mintDOI(DOI_TYPES.CHAINLINK, data); }

module.exports = {
  mintDOI, DOI_TYPES,
  mintBirthCert, mintSession, mintBead, mintTierUp,
  mintDecay, mintAward, mintTrustRec, mintChainlink
};
