// Validation System Tests
// Run with: node tests/validation.test.js

var validation = require("../lib/validation");

console.log("=== QRBTC Validation System Tests ===\n");

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

// ==================== SANITIZATION TESTS ====================

console.log("\n--- Sanitization Tests ---\n");

test("sanitizeString removes dangerous characters", function() {
  var input = "<script>alert('xss')</script>";
  var result = validation.Sanitizer.sanitizeString(input);
  assertEqual(result, "scriptalert('xss')/script", "Should remove < and >");
});

test("sanitizeUsername allows valid characters", function() {
  var input = "john_doe-123";
  var result = validation.Sanitizer.sanitizeUsername(input);
  assertEqual(result, "john_doe-123", "Should keep valid characters");
});

test("sanitizeUsername removes invalid characters", function() {
  var input = "john@doe#123";
  var result = validation.Sanitizer.sanitizeUsername(input);
  assertEqual(result, "johndoe123", "Should remove @ and #");
});

test("sanitizeUUID keeps valid format", function() {
  var input = "123e4567-e89b-12d3-a456-426614174000";
  var result = validation.Sanitizer.sanitizeUUID(input);
  assertEqual(result, "123e4567-e89b-12d3-a456-426614174000", "Should keep valid UUID");
});

test("sanitizeUUID removes invalid characters", function() {
  var input = "123e4567-e89b-12d3-a456-426614174000@xyz";
  var result = validation.Sanitizer.sanitizeUUID(input);
  assertEqual(result, "123e4567-e89b-12d3-a456-426614174000", "Should remove @xyz");
});

test("sanitizeNumber converts string to number", function() {
  var input = "123.45";
  var result = validation.Sanitizer.sanitizeNumber(input);
  assertEqual(result, 123.45, "Should convert to number");
});

test("sanitizeNumber removes non-numeric characters", function() {
  var input = "123.45abc";
  var result = validation.Sanitizer.sanitizeNumber(input);
  assertEqual(result, 123.45, "Should remove abc");
});

test("sanitizeArray removes null values", function() {
  var input = [1, 2, null, 3, undefined, "", 4];
  var result = validation.Sanitizer.sanitizeArray(input);
  assertEqual(result.length, 4, "Should remove null, undefined, and empty string");
});

test("escapeSQL removes quotes", function() {
  var input = "test'quote\"backslash\\";
  var result = validation.Sanitizer.escapeSQL(input);
  assertEqual(result, "testquotebackslash", "Should remove quotes and backslashes");
});

test("sanitizeAction converts to lowercase", function() {
  var input = "GetHistory";
  var result = validation.Sanitizer.sanitizeAction(input);
  assertEqual(result, "gethistory", "Should convert to lowercase");
});

// ==================== VALIDATION TESTS ====================

console.log("\n--- Validation Tests ---\n");

test("isValidUUID accepts valid UUID", function() {
  var uuid = "123e4567-e89b-12d3-a456-426614174000";
  assert(validation.Validator.isValidUUID(uuid), "Should accept valid UUID");
});

test("isValidUUID rejects invalid UUID", function() {
  var uuid = "invalid-uuid";
  assert(!validation.Validator.isValidUUID(uuid), "Should reject invalid UUID");
});

test("isValidUsername accepts valid username", function() {
  var username = "john_doe-123";
  assert(validation.Validator.isValidUsername(username), "Should accept valid username");
});

test("isValidUsername rejects short username", function() {
  var username = "ab";
  assert(!validation.Validator.isValidUsername(username), "Should reject short username");
});

test("isValidUsername rejects long username", function() {
  var username = "a".repeat(31);
  assert(!validation.Validator.isValidUsername(username), "Should reject long username");
});

test("isValidUsername rejects invalid characters", function() {
  var username = "john@doe";
  assert(!validation.Validator.isValidUsername(username), "Should reject invalid characters");
});

test("isValidScore accepts valid score", function() {
  assert(validation.Validator.isValidScore(5), "Should accept valid score");
  assert(validation.Validator.isValidScore(0), "Should accept 0");
  assert(validation.Validator.isValidScore(10), "Should accept 10");
});

test("isValidScore rejects invalid score", function() {
  assert(!validation.Validator.isValidScore(-1), "Should reject negative score");
  assert(!validation.Validator.isValidScore(11), "Should reject score > 10");
  assert(!validation.Validator.isValidScore("invalid"), "Should reject non-number");
});

test("isValidInteger accepts valid integer", function() {
  assert(validation.Validator.isValidInteger(5, 1, 10), "Should accept valid integer");
  assert(validation.Validator.isValidInteger(1, 1, 10), "Should accept minimum value");
  assert(validation.Validator.isValidInteger(10, 1, 10), "Should accept maximum value");
});

test("isValidInteger rejects invalid integer", function() {
  assert(!validation.Validator.isValidInteger(0, 1, 10), "Should reject below minimum");
  assert(!validation.Validator.isValidInteger(11, 1, 10), "Should reject above maximum");
});

test("isValidEmail accepts valid email", function() {
  assert(validation.Validator.isValidEmail("test@example.com"), "Should accept valid email");
});

test("isValidEmail rejects invalid email", function() {
  assert(!validation.Validator.isValidEmail("invalid"), "Should reject invalid email");
  assert(!validation.Validator.isValidEmail("test@"), "Should reject incomplete email");
});

test("isValidAPIKey accepts valid API key", function() {
  var apiKey = "qrbtc_live_sk_" + "a".repeat(64);
  assert(validation.Validator.isValidAPIKey(apiKey), "Should accept valid API key");
});

test("isValidAPIKey rejects invalid API key", function() {
  assert(!validation.Validator.isValidAPIKey("invalid"), "Should reject invalid API key");
  assert(!validation.Validator.isValidAPIKey("qrbtc_live_sk_" + "a".repeat(63)), "Should reject short key");
});

test("isValidJWT accepts valid JWT format", function() {
  var jwt = "header.payload.signature";
  assert(validation.Validator.isValidJWT(jwt), "Should accept valid JWT format");
});

test("isValidJWT rejects invalid JWT format", function() {
  assert(!validation.Validator.isValidJWT("invalid"), "Should reject invalid JWT");
  assert(!validation.Validator.isValidJWT("header.payload"), "Should reject incomplete JWT");
});

test("isValidAction accepts valid action", function() {
  var allowedActions = ["create", "read", "update", "delete"];
  assert(validation.Validator.isValidAction("create", allowedActions), "Should accept valid action");
});

test("isValidAction rejects invalid action", function() {
  var allowedActions = ["create", "read", "update", "delete"];
  assert(!validation.Validator.isValidAction("invalid", allowedActions), "Should reject invalid action");
});

test("isValidTier accepts valid tier", function() {
  assert(validation.Validator.isValidTier("free"), "Should accept free tier");
  assert(validation.Validator.isValidTier("builder"), "Should accept builder tier");
  assert(validation.Validator.isValidTier("pro"), "Should accept pro tier");
  assert(validation.Validator.isValidTier("sovereign"), "Should accept sovereign tier");
});

test("isValidTier rejects invalid tier", function() {
  assert(!validation.Validator.isValidTier("invalid"), "Should reject invalid tier");
});

test("isValidScope accepts valid scope", function() {
  assert(validation.Validator.isValidScope("identity:read"), "Should accept identity:read");
  assert(validation.Validator.isValidScope("score:write"), "Should accept score:write");
});

test("isValidScope rejects invalid scope", function() {
  assert(!validation.Validator.isValidScope("invalid"), "Should reject invalid scope");
});

test("isValidScoreArray accepts valid score array", function() {
  var scores = [5, 6, 7, 8, 9, 10];
  assert(validation.Validator.isValidScoreArray(scores), "Should accept valid score array");
});

test("isValidScoreArray rejects invalid score array", function() {
  var scores = [5, 6, 7, 8, 9]; // Only 5 scores
  assert(!validation.Validator.isValidScoreArray(scores), "Should reject incomplete array");

  var invalidScores = [5, 6, 7, 8, 9, 11]; // Score > 10
  assert(!validation.Validator.isValidScoreArray(invalidScores), "Should reject invalid score");
});

test("isValidLimit returns default for invalid input", function() {
  var result = validation.Validator.isValidLimit("invalid", 10, 100);
  assertEqual(result, 10, "Should return default for invalid input");
});

test("isValidLimit clamps to maximum", function() {
  var result = validation.Validator.isValidLimit(150, 10, 100);
  assertEqual(result, 100, "Should clamp to maximum");
});

test("isValidLimit clamps to minimum", function() {
  var result = validation.Validator.isValidLimit(0, 10, 100);
  assertEqual(result, 1, "Should clamp to minimum");
});

test("isValidBoolean converts string to boolean", function() {
  assert(validation.Validator.isValidBoolean("true") === true, "Should convert 'true' to true");
  assert(validation.Validator.isValidBoolean("false") === false, "Should convert 'false' to false");
  assert(validation.Validator.isValidBoolean(true) === true, "Should accept boolean true");
});

test("isValidDateString accepts valid date", function() {
  assert(validation.Validator.isValidDateString("2024-01-01T00:00:00Z"), "Should accept valid ISO date");
});

test("isValidDateString rejects invalid date", function() {
  assert(!validation.Validator.isValidDateString("invalid"), "Should reject invalid date");
});

test("isValidObject accepts valid object", function() {
  var obj = { username: "test", email: "test@example.com" };
  assert(validation.Validator.isValidObject(obj, ["username", "email"]), "Should accept valid object");
});

test("isValidObject rejects missing fields", function() {
  var obj = { username: "test" };
  assert(!validation.Validator.isValidObject(obj, ["username", "email"]), "Should reject missing fields");
});

// ==================== SCHEMA TESTS ====================

console.log("\n--- Schema Tests ---\n");

test("createPassport schema accepts valid input", function() {
  var body = { username: "john_doe" };
  var result = validation.Schemas.createPassport(body);
  assert(result.isValid, "Should accept valid input");
  assertEqual(result.sanitized.username, "john_doe", "Should sanitize username");
});

test("createPassport schema rejects missing username", function() {
  var body = {};
  var result = validation.Schemas.createPassport(body);
  assert(!result.isValid, "Should reject missing username");
  assert(result.errors.indexOf("username is required") !== -1, "Should have username error");
});

test("createPassport schema rejects invalid username", function() {
  var body = { username: "ab" };
  var result = validation.Schemas.createPassport(body);
  assert(!result.isValid, "Should reject short username");
});

test("submitScore schema accepts valid input", function() {
  var body = {
    labor: 9,
    exchange: 8,
    equality: 7,
    presence: 8,
    ratification: 9,
    continuity: 8
  };
  var result = validation.Schemas.submitScore(body);
  assert(result.isValid, "Should accept valid input");
});

test("submitScore schema rejects missing score", function() {
  var body = {
    labor: 9,
    exchange: 8,
    equality: 7,
    presence: 8,
    ratification: 9
    // Missing continuity
  };
  var result = validation.Schemas.submitScore(body);
  assert(!result.isValid, "Should reject missing score");
});

test("submitScore schema rejects invalid score", function() {
  var body = {
    labor: 11, // Invalid: > 10
    exchange: 8,
    equality: 7,
    presence: 8,
    ratification: 9,
    continuity: 8
  };
  var result = validation.Schemas.submitScore(body);
  assert(!result.isValid, "Should reject invalid score");
});

test("createAPIKey schema accepts valid input", function() {
  var body = { passport_id: "123e4567-e89b-12d3-a456-426614174000" };
  var result = validation.Schemas.createAPIKey(body);
  assert(result.isValid, "Should accept valid input");
});

test("createAPIKey schema rejects missing passport_id", function() {
  var body = {};
  var result = validation.Schemas.createAPIKey(body);
  assert(!result.isValid, "Should reject missing passport_id");
});

test("createAPIKey schema rejects invalid UUID", function() {
  var body = { passport_id: "invalid-uuid" };
  var result = validation.Schemas.createAPIKey(body);
  assert(!result.isValid, "Should reject invalid UUID");
});

test("comparePassports schema accepts valid input", function() {
  var body = {
    passport_a: "123e4567-e89b-12d3-a456-426614174000",
    passport_b: "987e6543-e89b-12d3-a456-426614174999"
  };
  var result = validation.Schemas.comparePassports(body);
  assert(result.isValid, "Should accept valid input");
});

test("comparePassports schema rejects missing passport", function() {
  var body = {
    passport_a: "123e4567-e89b-12d3-a456-426614174000"
    // Missing passport_b
  };
  var result = validation.Schemas.comparePassports(body);
  assert(!result.isValid, "Should reject missing passport");
});

test("upgradeTier schema accepts valid input", function() {
  var body = { tier: "pro" };
  var result = validation.Schemas.upgradeTier(body);
  assert(result.isValid, "Should accept valid input");
});

test("upgradeTier schema rejects missing tier", function() {
  var body = {};
  var result = validation.Schemas.upgradeTier(body);
  assert(!result.isValid, "Should reject missing tier");
});

test("upgradeTier schema rejects invalid tier", function() {
  var body = { tier: "invalid" };
  var result = validation.Schemas.upgradeTier(body);
  assert(!result.isValid, "Should reject invalid tier");
});

test("validateQuery accepts valid query", function() {
  var query = { id: "123e4567-e89b-12d3-a456-426614174000", limit: "50" };
  var schema = {
    id: { type: "uuid", required: true },
    limit: { type: "integer", min: 1, max: 100, default: 10 }
  };
  var result = validation.Schemas.validateQuery(query, schema);
  assert(result.isValid, "Should accept valid query");
});

test("validateQuery rejects missing required field", function() {
  var query = { limit: "50" };
  var schema = {
    id: { type: "uuid", required: true },
    limit: { type: "integer", min: 1, max: 100, default: 10 }
  };
  var result = validation.Schemas.validateQuery(query, schema);
  assert(!result.isValid, "Should reject missing required field");
});

// ==================== SECURITY TESTS ====================

console.log("\n--- Security Detection Tests ---\n");

test("detectSQLInjection identifies SQL injection", function() {
  var input = "1' OR '1'='1";
  var check = validation.SecurityValidator.checkSecurity(input);
  assert(!check.safe, "Should detect SQL injection");
  assert(check.issues.length > 0, "Should have security issues");
});

test("detectSQLInjection identifies UNION SELECT", function() {
  var input = "1 UNION SELECT * FROM users";
  var check = validation.SecurityValidator.checkSecurity(input);
  assert(!check.safe, "Should detect UNION SELECT");
});

test("detectXSS identifies XSS attack", function() {
  var input = "<script>alert('xss')</script>";
  var check = validation.SecurityValidator.checkSecurity(input);
  assert(!check.safe, "Should detect XSS");
});

test("detectXSS identifies javascript: protocol", function() {
  var input = "javascript:alert('xss')";
  var check = validation.SecurityValidator.checkSecurity(input);
  assert(!check.safe, "Should detect javascript: protocol");
});

test("detectCommandInjection identifies command injection", function() {
  var input = "test; rm -rf /";
  var check = validation.SecurityValidator.checkSecurity(input);
  assert(!check.safe, "Should detect command injection");
});

test("detectCommandInjection identifies pipe operator", function() {
  var input = "test | cat /etc/passwd";
  var check = validation.SecurityValidator.checkSecurity(input);
  assert(!check.safe, "Should detect pipe operator");
});

test("checkSecurity accepts safe input", function() {
  var input = "safe_input_123";
  var check = validation.SecurityValidator.checkSecurity(input);
  assert(check.safe, "Should accept safe input");
  assert(check.issues.length === 0, "Should have no security issues");
});

// ==================== INTEGRATION TESTS ====================

console.log("\n--- Integration Tests ---\n");

test("Complete passport creation flow", function() {
  var rawInput = { username: "john@doe#123" };
  var result = validation.Schemas.createPassport(rawInput);

  assert(result.isValid, "Should validate successfully");
  assertEqual(result.sanitized.username, "johndoe123", "Should sanitize username");
});

test("Complete score submission flow", function() {
  var rawInput = {
    labor: "9.5",
    exchange: "8.2",
    equality: "7.8",
    presence: "8.1",
    ratification: "9.3",
    continuity: "8.7"
  };
  var result = validation.Schemas.submitScore(rawInput);

  assert(result.isValid, "Should validate successfully");
  assertEqual(result.sanitized.labor, 9.5, "Should convert to number");
  assertEqual(result.sanitized.exchange, 8.2, "Should convert to number");
});

test("Security check on user input", function() {
  var userInput = "test<script>alert('xss')</script>";
  var sanitized = validation.Sanitizer.sanitizeString(userInput);
  var securityCheck = validation.SecurityValidator.checkSecurity(sanitized);

  assert(securityCheck.safe, "Should be safe after sanitization");
});

test("Query parameter validation with defaults", function() {
  var query = {}; // No parameters provided
  var schema = {
    limit: { type: "integer", min: 1, max: 100, default: 10 },
    offset: { type: "integer", min: 0, default: 0 }
  };
  var result = validation.Schemas.validateQuery(query, schema);

  assert(result.isValid, "Should use defaults");
  assertEqual(result.sanitized.limit, 10, "Should use default limit");
  assertEqual(result.sanitized.offset, 0, "Should use default offset");
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