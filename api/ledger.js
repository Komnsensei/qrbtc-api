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
        var action = req.query.action || (req.body && req.body.action);

        // Validate action parameter
        var allowedActions = ["history", "compare", "revoke"];
        if (!validation.Validator.isValidAction(action, allowedActions)) {
          errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("Invalid action", {
            allowed: allowedActions.join(", ")
          }));
        }

        if (action === "history") {
          if (req.method !== "GET") {
            errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("GET only"));
          }

          var session = await auth.authenticate(req, "ledger:read");
          if (session.error) {
            errorHandler.handleAuthenticationError(session.error);
          }

          try {
            var result = await db
              .from("sessions")
              .select("*")
              .eq("passport_id", session.passport_id)
              .order("created_at", { ascending: true });

            if (result.error) {
              errorHandler.handleDatabaseError(result.error);
            }

            return errorHandler.sendSuccessResponse(res, {
              passport_id: session.passport_id,
              count: result.data.length,
              sessions: result.data
            });
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        if (action === "compare") {
          if (req.method !== "POST") {
            errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("POST only"));
          }

          var session = await auth.authenticate(req, "ledger:read");
          if (session.error) {
            errorHandler.handleAuthenticationError(session.error);
          }

          // Validate request body
          var validationResult = validation.Schemas.comparePassports(req.body);
          errorHandler.handleValidationError(validationResult);

          var body = validationResult.sanitized;
          var id_a = body.passport_a;
          var id_b = body.passport_b;

          try {
            var a = await db.from("sessions").select("score").eq("passport_id", id_a);
            var b = await db.from("sessions").select("score").eq("passport_id", id_b);

            if (!a.data || !b.data) {
              errorHandler.handleDatabaseError(new Error("Query failed"));
            }

            function avg(arr) {
              if (arr.length === 0) return 0;
              var sum = 0;
              for (var i = 0; i < arr.length; i++) sum += arr[i].score;
              return Math.round((sum / arr.length) * 100) / 100;
            }

            return errorHandler.sendSuccessResponse(res, {
              passport_a: { id: id_a, sessions: a.data.length, avg_score: avg(a.data) },
              passport_b: { id: id_b, sessions: b.data.length, avg_score: avg(b.data) },
              delta: Math.round((avg(a.data) - avg(b.data)) * 100) / 100
            });
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        if (action === "revoke") {
          if (req.method !== "POST") {
            errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("POST only"));
          }

          var session = await auth.authenticate(req, "score:write");
          if (session.error) {
            errorHandler.handleAuthenticationError(session.error);
          }

          try {
            var update = await db
              .from("passports")
              .update({ revoked: true })
              .eq("id", session.passport_id);

            if (update.error) {
              errorHandler.handleDatabaseError(update.error);
            }

            return errorHandler.sendSuccessResponse(res, {
              passport_id: session.passport_id,
              revoked: true,
              message: "Passport revoked. No further blocks accepted."
            });
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("Unknown action. Use: ?action=history | compare | revoke"));
      })(req, res, function(err) {
        errorHandler.errorHandler(err, req, res);
      });
    });
  });
};