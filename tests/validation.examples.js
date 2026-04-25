// Additional Validation Examples
// Run with: node tests/validation.examples.js

var validation = require("../lib/validation");

console.log("=== Additional Validation Examples ===\n");

// Example 1: Real-world passport creation
console.log("--- Example 1: Passport Creation ---");
var passportInput = {
  username: "john_doe-2024"
};
var passportResult = validation.Schemas.createPassport(passportInput);
console.log("Input:", passportInput);
console.log("Valid:", passportResult.isValid);
console.log("Sanitized:", passportResult.sanitized);
console.log();

// Example 2: Invalid passport creation
console.log("--- Example 2: Invalid Passport Creation ---");
var invalidPassport = {
  username: "ab" // Too short
};
var invalidResult = validation.Schemas.createPassport(invalidPassport);
console.log("Input:", invalidPassport);
console.log("Valid:", invalidResult.isValid);
console.log("Errors:", invalidResult.errors);
console.log();

// Example 3: Score submission
console.log("--- Example 3: Score Submission ---");
var scoreInput = {
  labor: 9,
  exchange: 8,
  equality: 7,
  presence: 8,
  ratification: 9,
  continuity: 8
};
var scoreResult = validation.Schemas.submitScore(scoreInput);
console.log("Input:", scoreInput);
console.log("Valid:", scoreResult.isValid);
console.log("Sanitized:", scoreResult.sanitized);
console.log();

// Example 4: Invalid score submission
console.log("--- Example 4: Invalid Score Submission ---");
var invalidScore = {
  labor: 11, // Invalid: > 10
  exchange: 8,
  equality: 7,
  presence: 8,
  ratification: 9,
  continuity: 8
};
var invalidScoreResult = validation.Schemas.submitScore(invalidScore);
console.log("Input:", invalidScore);
console.log("Valid:", invalidScoreResult.isValid);
console.log("Errors:", invalidScoreResult.errors);
console.log();

// Example 5: API key creation
console.log("--- Example 5: API Key Creation ---");
var apiKeyInput = {
  passport_id: "123e4567-e89b-12d3-a456-426614174000"
};
var apiKeyResult = validation.Schemas.createAPIKey(apiKeyInput);
console.log("Input:", apiKeyInput);
console.log("Valid:", apiKeyResult.isValid);
console.log("Sanitized:", apiKeyResult.sanitized);
console.log();

// Example 6: Security check on malicious input
console.log("--- Example 6: Security Check ---");
var maliciousInputs = [
  "1' OR '1'='1",
  "<script>alert('xss')</script>",
  "test; rm -rf /",
  "safe_input_123"
];

maliciousInputs.forEach(function(input) {
  var check = validation.SecurityValidator.checkSecurity(input);
  console.log("Input:", input);
  console.log("Safe:", check.safe);
  if (!check.safe) {
    console.log("Issues:", check.issues);
  }
  console.log();
});

// Example 7: Query parameter validation
console.log("--- Example 7: Query Parameter Validation ---");
var queryInput = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  limit: "50",
  action: "history"
};
var querySchema = {
  id: { type: "uuid", required: true },
  limit: { type: "integer", min: 1, max: 100, default: 10 },
  action: { type: "action", allowed: ["history", "compare", "revoke"], required: true }
};
var queryResult = validation.Schemas.validateQuery(queryInput, querySchema);
console.log("Input:", queryInput);
console.log("Valid:", queryResult.isValid);
console.log("Sanitized:", queryResult.sanitized);
console.log();

// Example 8: Sanitization examples
console.log("--- Example 8: Sanitization Examples ---");
var sanitizationExamples = [
  { input: "john@doe#123", sanitizer: "sanitizeUsername" },
  { input: "<script>alert('xss')</script>", sanitizer: "sanitizeString" },
  { input: "123.45abc", sanitizer: "sanitizeNumber" },
  { input: "GetHistory", sanitizer: "sanitizeAction" }
];

sanitizationExamples.forEach(function(example) {
  var result = validation.Sanitizer[example.sanitizer](example.input);
  console.log(example.sanitizer + ":");
  console.log("  Input: " + example.input);
  console.log("  Output: " + result);
  console.log();
});

// Example 9: Validation examples
console.log("--- Example 9: Validation Examples ---");
var validationExamples = [
  { input: "123e4567-e89b-12d3-a456-426614174000", validator: "isValidUUID" },
  { input: "john_doe-123", validator: "isValidUsername" },
  { input: 5, validator: "isValidScore" },
  { input: "test@example.com", validator: "isValidEmail" },
  { input: "free", validator: "isValidTier" }
];

validationExamples.forEach(function(example) {
  var result = validation.Validator[example.validator](example.input);
  console.log(example.validator + ":");
  console.log("  Input: " + example.input);
  console.log("  Valid: " + result);
  console.log();
});

// Example 10: Complete flow with security
console.log("--- Example 10: Complete Flow with Security ---");
var userInput = "test<script>alert('xss')</script>";
console.log("Original input:", userInput);

// Step 1: Sanitize
var sanitized = validation.Sanitizer.sanitizeString(userInput);
console.log("After sanitization:", sanitized);

// Step 2: Security check
var securityCheck = validation.SecurityValidator.checkSecurity(sanitized);
console.log("Security check:", securityCheck.safe ? "SAFE" : "UNSAFE");
if (!securityCheck.safe) {
  console.log("Security issues:", securityCheck.issues);
}

// Step 3: Use if safe
if (securityCheck.safe) {
  console.log("Input is safe to use!");
} else {
  console.log("Input rejected due to security concerns!");
}
console.log();

console.log("=== Examples Complete ===");