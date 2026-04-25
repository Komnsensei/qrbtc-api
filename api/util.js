var tiers = require("../lib/tiers");
var supabase = require("@supabase/supabase-js");
var auth = require("../lib/auth");
var validation = require("../lib/validation");
var errorHandler = require("../lib/errorHandler");
var rateLimit = require("../lib/rateLimit");
var requestLogger = require("../lib/requestLogger");

var db = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

var dbPublic = supabase.createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function (req, res) {
  // Apply security headers
  auth.applySecurityHeaders(res);
  auth.applyCORSHeaders(res);

  // Handle preflight requests
  if (auth.handlePreflight(req, res)) return;

  // Apply rate limiting
  rateLimit.rateLimitMiddleware()(req, res, function() {
    // Apply request logging
    requestLogger.logRequest(req, res, function() {
      // Main request handler
      errorHandler.asyncHandler(async function() {
        var action = req.query.action;

        // Validate action parameter
        var allowedActions = ["tiers", "spiral", "health", "billing", "upgrade", "logs"];
        if (!validation.Validator.isValidAction(action, allowedActions)) {
          errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("Invalid action", {
            allowed: allowedActions.join(", ")
          }));
        }

        if (action === "tiers") {
          try {
            var result = await dbPublic.from("tiers").select("*").order("requests_limit", { ascending: true });
            if (result.error) {
              return errorHandler.sendSuccessResponse(res, { tiers: tiers.getAllTiers() });
            }
            return errorHandler.sendSuccessResponse(res, { tiers: result.data });
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        if (action === "spiral") {
          var id = req.query.id;
          if (!id) {
            errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("id required"));
          }

          // Validate UUID
          if (!validation.Validator.isValidUUID(id)) {
            errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("Invalid UUID format"));
          }

          try {
            var s = await dbPublic
              .from("sessions")
              .select("total_degrees")
              .eq("passport_id", id)
              .order("created_at", { ascending: false })
              .limit(1);
            if (!s.data || s.data.length === 0) {
              errorHandler.handleNotFound("Sessions", id);
            }
            var total = s.data[0].total_degrees;
            return errorHandler.sendSuccessResponse(res, {
              total_degrees: total,
              spiral_angle: Math.round((total % 360) * 100) / 100
            });
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        if (action === "health") {
          try {
            var start = Date.now();
            var check = await dbPublic.from("passports").select("id").limit(1);
            var latency = Date.now() - start;
            return errorHandler.sendSuccessResponse(res, {
              status: "operational",
              version: "3.2.0",
              db_latency_ms: latency,
              db_connected: !check.error,
              timestamp: new Date().toISOString()
            });
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        if (action === "billing") {
          if (req.method !== "GET") {
            errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("GET only"));
          }

          var session = await auth.authenticate(req, "identity:read");
          if (session.error) {
            errorHandler.handleAuthenticationError(session.error);
          }

          try {
            var keyData = await db
              .from("api_keys")
              .select("tier, requests_used, requests_limit, billing_status, upgrade_requested")
              .eq("passport_id", session.passport_id)
              .eq("revoked", false);

            if (!keyData.data || keyData.data.length === 0) {
              errorHandler.handleNotFound("API Key", session.passport_id);
            }

            var k = keyData.data[0];

            var tierInfo = await db
              .from("tiers")
              .select("*")
              .eq("name", k.tier)
              .limit(1);

            var keys_used = keyData.data.length;
            var keys_limit = tierInfo.data && tierInfo.data.length > 0 ? tierInfo.data[0].key_limit : 1;
            var features = tierInfo.data && tierInfo.data.length > 0 ? tierInfo.data[0].features : [];

            var tierOrder = ["free", "builder", "pro", "sovereign"];
            var currentIdx = tierOrder.indexOf(k.tier);
            var nextTier = currentIdx < tierOrder.length - 1 ? tierOrder[currentIdx + 1] : null;

            return errorHandler.sendSuccessResponse(res, {
              passport_id: session.passport_id,
              tier: k.tier,
              requests_used: k.requests_used,
              requests_limit: k.requests_limit,
              keys_used: keys_used,
              keys_limit: keys_limit,
              features: features,
              billing_status: k.billing_status,
              upgrade_available: nextTier !== null,
              next_tier: nextTier
            });
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        if (action === "upgrade") {
          if (req.method !== "POST") {
            errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("POST only"));
          }

          var session = await auth.authenticate(req, "score:write");
          if (session.error) {
            errorHandler.handleAuthenticationError(session.error);
          }

          // Validate request body
          var validationResult = validation.Schemas.upgradeTier(req.body);
          errorHandler.handleValidationError(validationResult);

          var body = validationResult.sanitized;
          var targetTier = body.tier;

          try {
            var currentKey = await db
              .from("api_keys")
              .select("id, tier")
              .eq("passport_id", session.passport_id)
              .eq("revoked", false)
              .limit(1);

            if (!currentKey.data || currentKey.data.length === 0) {
              errorHandler.handleNotFound("API Key", session.passport_id);
            }

            var tierOrder = ["free", "builder", "pro", "sovereign"];
            var currentIdx = tierOrder.indexOf(currentKey.data[0].tier);
            var targetIdx = tierOrder.indexOf(targetTier);

            if (targetIdx <= currentIdx) {
              errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("Can only upgrade. Current: " + currentKey.data[0].tier));
            }

            var newTier = await db
              .from("tiers")
              .select("*")
              .eq("name", targetTier)
              .limit(1);

            if (!newTier.data || newTier.data.length === 0) {
              errorHandler.handleNotFound("Tier", targetTier);
            }

            var update = await db
              .from("api_keys")
              .update({
                tier: targetTier,
                requests_limit: newTier.data[0].requests_limit,
                upgrade_requested: true,
                billing_status: targetTier === "free" ? "unpaid" : "pending"
              })
              .eq("id", currentKey.data[0].id);

            if (update.error) {
              errorHandler.handleDatabaseError(update.error);
            }

            return errorHandler.sendSuccessResponse(res, {
              passport_id: session.passport_id,
              previous_tier: currentKey.data[0].tier,
              new_tier: targetTier,
              requests_limit: newTier.data[0].requests_limit,
              key_limit: newTier.data[0].key_limit,
              features: newTier.data[0].features,
              billing_status: "pending",
              message: "Upgrade applied. Stripe payment will activate when billing goes live."
            });
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        if (action === "logs") {
          if (req.method !== "GET") {
            errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("GET only"));
          }

          var session = await auth.authenticate(req, "score:write");
          if (session.error) {
            errorHandler.handleAuthenticationError(session.error);
          }

          var limit = validation.Validator.isValidLimit(req.query.limit, 50, 500);

          try {
            var logs = await db
              .from("request_logs")
              .select("*")
              .order("timestamp", { ascending: false })
              .limit(limit);

            if (logs.error) {
              errorHandler.handleDatabaseError(logs.error);
            }

            var total = await db.from("request_logs").select("id", { count: "exact" });

            var errors = 0;
            var totalLatency = 0;
            for (var i = 0; i < logs.data.length; i++) {
              if (logs.data[i].status_code >= 400) errors++;
              totalLatency += logs.data[i].latency_ms || 0;
            }

            return errorHandler.sendSuccessResponse(res, {
              total_logged: total.count || 0,
              showing: logs.data.length,
              error_rate: logs.data.length > 0 ? Math.round((errors / logs.data.length) * 100) + "%" : "0%",
              avg_latency_ms: logs.data.length > 0 ? Math.round(totalLatency / logs.data.length) : 0,
              logs: logs.data
            });
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("Unknown action. Use: ?action=tiers | spiral | health | billing | upgrade | logs"));
      })(req, res, function(err) {
        errorHandler.errorHandler(err, req, res);
      });
    });
  });
};