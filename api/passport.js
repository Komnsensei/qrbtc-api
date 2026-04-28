var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var sec = require("../lib/security");
var http = require("http");

var db = supabase.createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function geolocateIP(ip) {
  return new Promise(function(resolve) {
    var url = "http://ip-api.com/json/" + ip + "?fields=status,country,countryCode,regionName,city,lat,lon,isp";
    http.get(url, function(res) {
      var d = "";
      res.on("data", function(c) { d += c; });
      res.on("end", function() {
        try { resolve(JSON.parse(d)); } catch(e) { resolve(null); }
      });
    }).on("error", function() { resolve(null); });
  });
}

function getClientIP(req) {
  var ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  if (Array.isArray(ip)) ip = ip[0];
  return ip.split(",")[0].trim();
}

module.exports = async function (req, res) {
  sec.applyHeaders(res);
  if (sec.preflight(req, res)) return;

  try {
    if (req.method === "POST") {
      var raw = req.body && req.body.username;
      if (!raw || !sec.isUsername(raw)) {
        return res.status(400).json({ error: "Username required (1-32 chars, alphanumeric/underscore/hyphen)" });
      }
      var username = sec.sanitizeString(raw).replace(/[^a-zA-Z0-9_-]/g, "");

      // Geolocate the client IP
      var clientIP = getClientIP(req);
      var geo = await geolocateIP(clientIP);

      var insertData = { username: username, revoked: false };

      if (geo && geo.status === "success") {
        insertData.lat = geo.lat;
        insertData.lon = geo.lon;
        insertData.city = geo.city || null;
        insertData.country = geo.country || null;
        insertData.country_code = geo.countryCode || null;
        insertData.region = geo.regionName || null;
      }

      var result = await db.from("passports").insert(insertData).select();
      if (result.error) return res.status(500).json({ error: result.error.message });
      return res.status(201).json(result.data[0]);
    }

    if (req.method === "GET") {
      var session = await auth.authenticate(req, "identity:read");
      if (session.error) return res.status(session.status || 401).json({ error: session.error });

      var passport = await db.from("passports").select("*").eq("id", session.passport_id).limit(1);
      if (!passport.data || passport.data.length === 0) return res.status(404).json({ error: "Passport not found" });
      return res.status(200).json(passport.data[0]);
    }

    return res.status(405).json({ error: "POST or GET only" });
  } catch (e) {
    console.error("PASSPORT:", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};