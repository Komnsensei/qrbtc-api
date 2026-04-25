var crypto = require("crypto");
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
        if (req.method === "POST") {
          // Validate request body
          var validationResult = validation.Schemas.createPassport(req.body);
          errorHandler.handleValidationError(validationResult);

          var body = validationResult.sanitized;
          var username = body.username;

          try {
            var insert = await db.from("passports").insert({
              username: username,
              revoked: false,
              is_admin: false
            }).select();

            if (insert.error) {
              errorHandler.handleDatabaseError(insert.error);
            }

            return errorHandler.sendSuccessResponse(res, insert.data[0], 201);
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        if (req.method === "GET") {
          var session = await auth.authenticate(req, "identity:read");
          if (session.error) {
            errorHandler.handleAuthenticationError(session.error);
          }

          try {
            var passport_id = session.passport_id;

            var passport = await db
              .from("passports")
              .select("*")
              .eq("id", passport_id)
              .limit(1);

            if (!passport.data || passport.data.length === 0) {
              errorHandler.handleNotFound("Passport", passport_id);
            }

            return errorHandler.sendSuccessResponse(res, passport.data[0]);
          } catch (err) {
            errorHandler.handleDatabaseError(err);
          }
        }

        errorHandler.sendErrorResponse(res, new errorHandler.BadRequestError("POST or GET only"));
      })(req, res, function(err) {
        errorHandler.errorHandler(err, req, res);
      });
    });
  });
};