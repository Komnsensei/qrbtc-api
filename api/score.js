var supabase = require("@supabase/supabase-js");
var tll = require("../chain/tll_score");
var bv = require("../chain/block_value");
var h = require("../chain/hash");
var tiers = require("../lib/tiers");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    var passport_id = req.body.passport_id;
    var session = {
      labor: req.body.labor,
      exchange: req.body.exchange,
      equality: req.body.equality,
      presence: req.body.presence,
      ratification: req.body.ratification,
      continuity: req.body.continuity
    };

    var score = tll.scoreSession(session);
    var degrees_delta = bv.calculateBlockValue(score);

    var last = await db
      .from("sessions")
      .select("total_degrees")
      .eq("passport_id", passport_id)
      .order("created_at", { ascending: false })
      .limit(1);

    var previous = 0;
    if (last.data && last.data.length > 0) {
      previous = last.data[0].total_degrees;
    }

    var total_degrees = Math.round((previous + degrees_delta) * 100) / 100;
    var session_hash = h.hashSession(session, score, total_degrees);
    var tier = tiers.getTier(score);

    var insert = await db.from("sessions").insert({
      passport_id: passport_id,
      labor: session.labor,
      exchange: session.exchange,
      equality: session.equality,
      presence: session.presence,
      ratification: session.ratification,
      continuity: session.continuity,
      score: score,
      degrees_delta: degrees_delta,
      total_degrees: total_degrees,
      session_hash: session_hash
    });

    if (insert.error) {
      return res.status(500).json({ error: insert.error.message });
    }

    return res.status(200).json({
      score: score,
      degrees_delta: degrees_delta,
      total_degrees: total_degrees,
      tier: tier,
      session_hash: session_hash
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};