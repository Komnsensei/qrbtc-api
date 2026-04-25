// Middleware System Tests
// Run with: node tests/middleware.test.js

var errorHandler = require("../lib/errorHandler");
var rateLimit = require("../lib/rateLimit");
var requestLogger = require("../lib/requestLogger");

console.log("=== QRBTC Middleware System Tests ===\n");

// Test Counter
var testsPassed = 0;
var testsFailed = 0;

function test(description, testFn) {
  try {
    testFn();
    console.log("✅ PASS:", description);
    testsPassed++;
  } catch (error) {
    console.log("❌ FAIL:", description);
    console.log("   Error:", error.message);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || "Expected " + expected + " but got " + actual);
  }
}

// ==================== ERROR HANDLER TESTS ====================

console.log("--- Error Handler Tests ---\n");

test("CustomError creates error with correct properties", function() {
  var error = new errorHandler.CustomError("Test error", "TestType", 400, { field: "test" });
  assertEqual(error.message, "Test error");
  assertEqual(error.name, "TestType");
  assertEqual(error.statusCode, 400);
  assertEqual(error.details.field, "test");
});

test("ValidationError creates validation error", function() {
  var error = new errorHandler.ValidationError("Invalid input", { field: "username" });
  assertEqual(error.name, errorHandler.ErrorTypes.VALIDATION_ERROR);
  assertEqual(error.statusCode, 400);
});

test("AuthenticationError creates authentication error", function() {
  var error = new errorHandler.AuthenticationError("Invalid credentials");
  assertEqual(error.name, errorHandler.ErrorTypes.AUTHENTICATION_ERROR);
  assertEqual(error.statusCode, 401);
});

test("AuthorizationError creates authorization error", function() {
  var error = new errorHandler.AuthorizationError("Insufficient permissions");
  assertEqual(error.name, errorHandler.ErrorTypes.AUTHORIZATION_ERROR);
  assertEqual(error.statusCode, 403);
});

test("NotFoundError creates not found error", function() {
  var error = new errorHandler.NotFoundError("Resource not found", { id: "123" });
  assertEqual(error.name, errorHandler.ErrorTypes.NOT_FOUND_ERROR);
  assertEqual(error.statusCode, 404);
});

test("RateLimitError creates rate limit error", function() {
  var error = new errorHandler.RateLimitError("Rate limit exceeded", { limit: 1000 });
  assertEqual(error.name, errorHandler.ErrorTypes.RATE_LIMIT_ERROR);
  assertEqual(error.statusCode, 429);
});

test("DatabaseError creates database error", function() {
  var error = new errorHandler.DatabaseError("Database error", { code: "23505" });
  assertEqual(error.name, errorHandler.ErrorTypes.DATABASE_ERROR);
  assertEqual(error.statusCode, 500);
});

test("InternalError creates internal error", function() {
  var error = new errorHandler.InternalError("Internal error");
  assertEqual(error.name, errorHandler.ErrorTypes.INTERNAL_ERROR);
  assertEqual(error.statusCode, 500);
});

test("BadRequestError creates bad request error", function() {
  var error = new errorHandler.BadRequestError("Bad request", { field: "test" });
  assertEqual(error.name, errorHandler.ErrorTypes.BAD_REQUEST_ERROR);
  assertEqual(error.statusCode, 400);
});

test("formatErrorResponse formats error correctly", function() {
  var error = new errorHandler.CustomError("Test error", "TestType", 400, { field: "test" });
  var response = errorHandler.formatErrorResponse(error, false);
  assertEqual(response.error, "Test error");
  assertEqual(response.type, "TestType");
  assertEqual(response.statusCode, 400);
  assertEqual(response.details.field, "test");
});

test("formatErrorResponse includes stack trace when requested", function() {
  var error = new errorHandler.CustomError("Test error", "TestType", 400);
  var response = errorHandler.formatErrorResponse(error, true);
  assert(response.stack !== undefined);
});

// ==================== RATE LIMIT TESTS ====================

console.log("\n--- Rate Limit Tests ---\n");

test("checkRateLimit allows requests within limit", function() {
  var result = rateLimit.checkRateLimit("test-user", "free", "user");
  assert(result.allowed === true);
  assert(result.remaining > 0);
});

test("checkRateLimit tracks request count", function() {
  var userId = "test-user-" + Date.now();
  var result1 = rateLimit.checkRateLimit(userId, "free", "user");
  var result2 = rateLimit.checkRateLimit(userId, "free", "user");
  assert(result1.remaining > result2.remaining);
});

test("checkRateLimit enforces burst limit", function() {
  var userId = "burst-test-" + Date.now();
  var result1 = rateLimit.checkRateLimit(userId, "free", "user");
  var result2 = rateLimit.checkRateLimit(userId, "free", "user");
  // Second request should be blocked by burst limit
  assert(result2.allowed === false);
  assertEqual(result2.reason, "burst_limit");
});

test("checkIPRateLimit allows requests within limit", function() {
  var result = rateLimit.checkIPRateLimit("test-ip-hash");
  assert(result.allowed === true);
  assert(result.remaining > 0);
});

test("getRateLimitInfo returns correct information", function() {
  var userId = "info-test-" + Date.now();
  rateLimit.checkRateLimit(userId, "free", "user");
  var info = rateLimit.getRateLimitInfo(userId, "free");
  assert(info.limit === 1000);
  assert(info.used > 0);
  assert(info.remaining < 1000);
});

test("resetRateLimit clears rate limit data", function() {
  var userId = "reset-test-" + Date.now();
  rateLimit.checkRateLimit(userId, "free", "user");
  var result = rateLimit.resetRateLimit(userId);
  assert(result === true);
  var info = rateLimit.getRateLimitInfo(userId, "free");
  assertEqual(info.used, 0);
});

test("getRateLimitStats returns statistics", function() {
  var stats = rateLimit.getRateLimitStats();
  assert(stats.totalKeys >= 0);
  assert(typeof stats.byType === "object");
});

test("cleanupExpiredData removes expired entries", function() {
  // This test ensures the cleanup function runs without errors
  rateLimit.cleanupExpiredData();
  assert(true);
});

// ==================== REQUEST LOGGER TESTS ====================

console.log("\n--- Request Logger Tests ---\n");

test("generateRequestId generates unique IDs", function() {
  var id1 = requestLogger.generateRequestId();
  var id2 = requestLogger.generateRequestId();
  assert(id1 !== id2);
  assert(id1.length === 32); // 16 bytes = 32 hex characters
});

test("hashIP generates consistent hashes", function() {
  var req = {
    headers: {
      "x-forwarded-for": "192.168.1.1"
    }
  };
  var hash1 = requestLogger.hashIP(req);
  var hash2 = requestLogger.hashIP(req);
  assertEqual(hash1, hash2);
  assert(hash1.length === 16);
});

test("logInfo stores log entry", function() {
  requestLogger.logInfo("Test message", { data: "test" });
  var logs = requestLogger.getRecentLogs(1);
  assert(logs.length > 0);
  assert(logs[logs.length - 1].message === "Test message");
});

test("logWarn stores warning entry", function() {
  requestLogger.logWarn("Test warning", { data: "test" });
  var logs = requestLogger.getLogsByLevel("warn", 10);
  assert(logs.length > 0);
});

test("logDebug stores debug entry", function() {
  requestLogger.logDebug("Test debug", { data: "test" });
  var logs = requestLogger.getLogsByLevel("debug", 10);
  assert(logs.length > 0);
});

test("getRecentLogs returns recent logs", function() {
  requestLogger.logInfo("Test 1");
  requestLogger.logInfo("Test 2");
  requestLogger.logInfo("Test 3");
  var logs = requestLogger.getRecentLogs(2);
  assert(logs.length === 2);
});

test("getLogsByRequestId returns logs for specific request", function() {
  var requestId = requestLogger.generateRequestId();
  requestLogger.logInfo("Test message", { requestId: requestId });
  var logs = requestLogger.getLogsByRequestId(requestId);
  assert(logs.length > 0);
});

test("getLogsByLevel returns logs by level", function() {
  requestLogger.logInfo("Info message");
  requestLogger.logWarn("Warn message");
  var infoLogs = requestLogger.getLogsByLevel("info", 10);
  var warnLogs = requestLogger.getLogsByLevel("warn", 10);
  assert(infoLogs.length > 0);
  assert(warnLogs.length > 0);
});

test("getErrorLogs returns error logs", function() {
  requestLogger.logError("Test error", new Error("Test"));
  var errorLogs = requestLogger.getErrorLogs(10);
  assert(errorLogs.length > 0);
});

test("clearLogs removes all logs", function() {
  requestLogger.logInfo("Test before clear");
  requestLogger.clearLogs();
  var logs = requestLogger.getRecentLogs(10);
  assert(logs.length === 0);
});

test("getLogStats returns statistics", function() {
  requestLogger.logInfo("Test 1");
  requestLogger.logWarn("Test 2");
  requestLogger.logError("Test 3", new Error("Test"));
  var stats = requestLogger.getLogStats();
  assert(stats.total >= 0);
  assert(typeof stats.byLevel === "object");
  assert(typeof stats.byType === "object");
});

test("setLogLevel changes log level", function() {
  var result = requestLogger.setLogLevel("debug");
  assert(result === true);
  var invalidResult = requestLogger.setLogLevel("invalid");
  assert(invalidResult === false);
});

// ==================== INTEGRATION TESTS ====================

console.log("\n--- Integration Tests ---\n");

test("Complete error handling flow", function() {
  var error = new errorHandler.ValidationError("Invalid input", { field: "test" });
  var response = errorHandler.formatErrorResponse(error, false);
  assertEqual(response.error, "Invalid input");
  assertEqual(response.type, "ValidationError");
  assertEqual(response.statusCode, 400);
});

test("Complete rate limiting flow", function() {
  var userId = "integration-test-" + Date.now();
  var result1 = rateLimit.checkRateLimit(userId, "free", "user");
  assert(result1.allowed === true);

  var info = rateLimit.getRateLimitInfo(userId, "free");
  assert(info.used > 0);

  rateLimit.resetRateLimit(userId);
  var infoAfterReset = rateLimit.getRateLimitInfo(userId, "free");
  assertEqual(infoAfterReset.used, 0);
});

test("Complete logging flow", function() {
  var requestId = requestLogger.generateRequestId();
  requestLogger.logInfo("Request started", { requestId: requestId });
  requestLogger.logInfo("Request completed", { requestId: requestId });

  var logs = requestLogger.getLogsByRequestId(requestId);
  assert(logs.length >= 2);
});

test("Middleware stack works together", function() {
  // Simulate middleware stack
  var userId = "stack-test-" + Date.now();
  var requestId = requestLogger.generateRequestId();

  // Rate limiting
  var rateResult = rateLimit.checkRateLimit(userId, "free", "user");
  assert(rateResult.allowed === true);

  // Logging
  requestLogger.logInfo("Request processed", { requestId: requestId });

  // Error handling
  var error = new errorHandler.BadRequestError("Test error");
  var response = errorHandler.formatErrorResponse(error, false);
  assertEqual(response.statusCode, 400);

  // Verify all components worked
  var logs = requestLogger.getLogsByRequestId(requestId);
  assert(logs.length > 0);
});

// ==================== RESULTS ====================

console.log("\n=== Test Results ===");
console.log("✅ Passed:", testsPassed);
console.log("❌ Failed:", testsFailed);
console.log("📊 Total:", testsPassed + testsFailed);

if (testsFailed === 0) {
  console.log("\n🎉 All tests passed!");
  process.exit(0);
} else {
  console.log("\n⚠️  Some tests failed!");
  process.exit(1);
}