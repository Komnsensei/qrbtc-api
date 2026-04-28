var supabase = require('@supabase/supabase-js');
var auth = require('../lib/auth');
var sec = require('../lib/security');
var chain = require('../lib/chain');

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;

  try {
    var action = sec.sanitizeString(req.query.action || (req.body && req.body.action) || '');

    if (action === 'history') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
      var session = await auth.authenticate(req, 'ledger:read');
      if (session.error) return res.status(session.status || 401).json({ error: session.error });
      var result = await db.from('sessions').select('*').eq('passport_id', session.passport_id).order('created_at', { ascending: true });
      if (result.error) return res.status(500).json({ error: result.error.message });
      return res.status(200).json({ passport_id: session.passport_id, count: result.data.length, sessions: result.data });
    }

    if (action === 'compare') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
      var session = await auth.authenticate(req, 'ledger:read');
      if (session.error) return res.status(session.status || 401).json({ error: session.error });
      var id_a = req.body && req.body.passport_a;
      var id_b = req.body && req.body.passport_b;
      if (!id_a || !id_b || !sec.isUUID(id_a) || !sec.isUUID(id_b)) return res.status(400).json({ error: 'Two valid passport UUIDs required' });
      var a = await db.from('sessions').select('score').eq('passport_id', id_a);
      var b = await db.from('sessions').select('score').eq('passport_id', id_b);
      function avg(arr) { if (!arr || arr.length === 0) return 0; var sum = 0; for (var i = 0; i < arr.length; i++) sum += arr[i].score; return Math.round((sum / arr.length) * 100) / 100; }
      return res.status(200).json({ passport_a: { id: id_a, sessions: (a.data || []).length, avg_score: avg(a.data) }, passport_b: { id: id_b, sessions: (b.data || []).length, avg_score: avg(b.data) }, delta: Math.round((avg(a.data) - avg(b.data)) * 100) / 100 });
    }

    if (action === 'revoke') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
      var session = await auth.authenticate(req, 'score:write');
      if (session.error) return res.status(session.status || 401).json({ error: session.error });
      var update = await db.from('passports').update({ revoked: true }).eq('id', session.passport_id);
      if (update.error) return res.status(500).json({ error: update.error.message });
      return res.status(200).json({ passport_id: session.passport_id, revoked: true, message: 'Passport revoked.' });
    }

    // === CHAIN LINEAGE ACTIONS ===

    if (action === 'chain') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
      var session = await auth.authenticate(req, 'ledger:read');
      if (session.error) return res.status(session.status || 401).json({ error: session.error });
      var fullChain = await chain.getFullChain(session.passport_id);
      var context = chain.buildChainContext(fullChain);
      return res.status(200).json({ chain: fullChain, length: fullChain.length, context_for_llm: context });
    }

    if (action === 'chain_head') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
      var session = await auth.authenticate(req, 'ledger:read');
      if (session.error) return res.status(session.status || 401).json({ error: session.error });
      var head = await chain.getLatestLink(session.passport_id);
      return res.status(200).json({ head: head, position: head ? head.position : -1 });
    }

    if (action === 'chain_verify') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
      var session = await auth.authenticate(req, 'ledger:read');
      if (session.error) return res.status(session.status || 401).json({ error: session.error });
      var verification = await chain.verifyChain(session.passport_id);
      return res.status(200).json(verification);
    }

    if (action === 'chain_context') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
      var session = await auth.authenticate(req, 'ledger:read');
      if (session.error) return res.status(session.status || 401).json({ error: session.error });
      var chainData = await chain.getFullChain(session.passport_id);
      var summary = chain.buildChainContext(chainData);
      return res.status(200).json({ context: summary, length: chainData.length, head_hash: chainData.length > 0 ? chainData[chainData.length - 1].chain_hash : null });
    }

    return res.status(400).json({ error: 'Use ?action=history | compare | revoke | chain | chain_head | chain_verify | chain_context' });
  } catch (e) {
    console.error('LEDGER:', e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
};
