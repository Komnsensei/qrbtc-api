var crypto = require("crypto");
var supabase = require("@supabase/supabase-js");
var qrbtc = require("../lib/qrbtc");
var tiers = require("../lib/tiers");
var auth = require("../lib/auth");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  var session = await auth.authenticate(req, "score:write");
  if (session.error) return res.status(session.status).json({ error: session.error });

  try {
    var body = req.body;
    var passport_id = session.passport_id;

    var passport = await db
      .from("passports")
      .select("id, revoked")
      .eq("id", passport_id)
      .limit(1);

    if (!passport.data || passport.data.length === 0) {
      return res.status(404).json({ error: "Passport not found" });
    }

    if (passport.data[0].revoked) {
      return res.status(403).json({ error: "Passport revoked. No new blocks accepted." });
    }

    var labor = parseFloat(body.labor) || 0;
    var exchange = parseFloat(body.exchange) || 0;
    var equality = parseFloat(body.equality) || 0;
    var presence = parseFloat(body.presence) || 0;
    var ratification = parseFloat(body.ratification) || 0;
    var continuity = parseFloat(body.continuity) || 0;

    var score = qrbtc.computeScore({
      labor: labor, exchange: exchange, equality: equality,
      presence: presence, ratification: ratification, continuity: continuity
    });

    var degrees_delta = Math.round((score / 100) * 360 * 100) / 100;

    var lastSession = await db
      .from("sessions")
      .select("total_degrees, session_hash")
      .eq("passport_id", passport_id)
      .order("created_at", { ascending: false })
      .limit(1);

    var prev_total = 0;
    var previous_hash = "genesis";

    if (lastSession.data && lastSession.data.length > 0) {
      prev_total = lastSession.data[0].total_degrees;
      previous_hash = lastSession.data[0].session_hash;
    }

    var total_degrees = Math.round((prev_total + degrees_delta) * 100) / 100;

    var now = new Date();
    var hash_ts = now.getTime();
    var hashInput = score + "|" + degrees_delta + "|" + total_degrees + "|" + previous_hash + "|" + hash_ts;
    var session_hash = crypto.createHash("sha256").update(hashInput).digest("hex");

    var insert = await db.from("sessions").insert({
      passport_id: passport_id,
      score: score,
      degrees_delta: degrees_delta,
      total_degrees: total_degrees,
      session_hash: session_hash,
      previous_hash: previous_hash,
      hash_ts: hash_ts,
      created_at: now.toISOString()
    });

    if (insert.error) {
      return res.status(500).json({ error: insert.error.message });
    }

    var tier = tiers.getTier(score);

    return res.status(200).json({
      score: score,
      degrees_delta: degrees_delta,
      total_degrees: total_degrees,
      tier: tier,
      session_hash: session_hash,
      previous_hash: previous_hash
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};