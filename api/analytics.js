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
        if (req.method !== "GET") {
          errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("GET only"));
        }

        var action = req.query.action;

        // Validate action parameter
        var allowedActions = ["leaderboard", "stats"];
        if (!validation.Validator.isValidAction(action, allowedActions)) {
          errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("Invalid action", {
            allowed: allowedActions.join(", ")
          }));
        }

        if (action === "leaderboard") {
          var limit = validation.Validator.isValidLimit(req.query.limit, 10, 100);

          try {
            var result = await db
              .from("sessions")
              .select("passport_id, score, total_degrees, created_at")
              .order("score", { ascending: false })
              .limit(limit);

            if (result.error) {
              errorHandler.handleDatabaseError(result.error);
            }

            return errorHandler.sendSuccessResponse(res, { leaderboard: result.data });
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        if (action === "stats") {
          try {
            var passports = await db.from("passports").select("id", { count: "exact" });
            var sessions = await db.from("sessions").select("id, score", { count: "exact" });

            var scores = sessions.data || [];
            var total = 0;
            for (var i = 0; i < scores.length; i++) total += scores[i].score;
            var avg = scores.length > 0 ? Math.round((total / scores.length) * 100) / 100 : 0;

            return errorHandler.sendSuccessResponse(res, {
              total_passports: passports.count || 0,
              total_sessions: sessions.count || 0,
              avg_score: avg
            });
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("Unknown action. Use: ?action=leaderboard | stats"));
      })(req, res, function(err) {
        errorHandler.errorHandler(err, req, res);
      });
    });
  });
};