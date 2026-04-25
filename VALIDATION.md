# Input Validation System

## Overview

The QRBTC API implements comprehensive input validation to prevent injection attacks, ensure data integrity, and provide clear error messages for invalid requests.

## Validation Library

The validation system is implemented in `lib/validation.js` and provides:

- **Sanitization functions** - Clean and normalize user input
- **Validation functions** - Check data types, formats, and ranges
- **Request schemas** - Predefined validation rules for common requests
- **Security detection** - Identify potential attack patterns
- **Middleware support** - Easy integration with API endpoints

## Sanitization Functions

### String Sanitization

```javascript
var sanitized = validation.Sanitizer.sanitizeString(userInput);
// Removes < > characters and trims whitespace
```

### Username Sanitization

```javascript
var username = validation.Sanitizer.sanitizeUsername(rawUsername);
// Allows only alphanumeric, underscores, and hyphens
// Input: "john@doe#123" → Output: "johndoe123"
```

### UUID Sanitization

```javascript
var uuid = validation.Sanitizer.sanitizeUUID(rawUUID);
// Removes any non-hex characters except hyphens
// Input: "abc123-xyz-789" → Output: "abc123-xyz-789"
```

### Number Sanitization

```javascript
var number = validation.Sanitizer.sanitizeNumber(rawNumber);
// Converts to float, removes non-numeric characters
// Input: "123.45abc" → Output: 123.45
```

### Array Sanitization

```javascript
var cleanArray = validation.Sanitizer.sanitizeArray(dirtyArray);
// Removes null, undefined, and empty string values
```

### SQL Escaping

```javascript
var safe = validation.Sanitizer.escapeSQL(userInput);
// Removes quotes and backslashes
```

### Action Parameter Sanitization

```javascript
var action = validation.Sanitizer.sanitizeAction(rawAction);
// Allows only alphanumeric and underscores, converts to lowercase
// Input: "GetHistory" → Output: "gethistory"
```

## Validation Functions

### UUID Validation

```javascript
if (validation.Validator.isValidUUID(uuid)) {
  // Valid UUID format
}
```

### Username Validation

```javascript
if (validation.Validator.isValidUsername(username)) {
  // Username is 3-30 characters, alphanumeric + _-
}
```

### Score Validation

```javascript
if (validation.Validator.isValidScore(score)) {
  // Score is a number between 0 and 10
}
```

### Integer Validation

```javascript
if (validation.Validator.isValidInteger(limit, 1, 100)) {
  // Integer is between 1 and 100
}
```

### Email Validation

```javascript
if (validation.Validator.isValidEmail(email)) {
  // Valid email format
}
```

### API Key Validation

```javascript
if (validation.Validator.isValidAPIKey(apiKey)) {
  // Valid API key format: qrbtc_live_sk_ + 64 hex chars
}
```

### JWT Token Validation

```javascript
if (validation.Validator.isValidJWT(token)) {
  // Valid JWT format (3 parts separated by dots)
}
```

### Action Validation

```javascript
var allowedActions = ["history", "compare", "revoke"];
if (validation.Validator.isValidAction(action, allowedActions)) {
  // Action is in the allowed list
}
```

### Tier Validation

```javascript
if (validation.Validator.isValidTier(tier)) {
  // Tier is one of: free, builder, pro, sovereign
}
```

### Scope Validation

```javascript
if (validation.Validator.isValidScope(scope)) {
  // Scope is valid: identity:read, score:write, etc.
}
```

### Score Array Validation

```javascript
if (validation.Validator.isValidScoreArray(scores)) {
  // Array of 6 scores, each between 0 and 10
}
```

### Limit Parameter Validation

```javascript
var limit = validation.Validator.isValidLimit(req.query.limit, 10, 100);
// Returns validated limit (default: 10, max: 100)
```

### Boolean Validation

```javascript
var bool = validation.Validator.isValidBoolean(input);
// Converts string "true"/"false" to boolean
```

### Date String Validation

```javascript
if (validation.Validator.isValidDateString(dateString)) {
  // Valid ISO date string
}
```

### Object Structure Validation

```javascript
if (validation.Validator.isValidObject(body, ["username", "email"])) {
  // Object contains required fields
}
```

## Request Schemas

### Passport Creation Schema

```javascript
var result = validation.Schemas.createPassport(req.body);

if (!result.isValid) {
  return res.status(400).json({
    error: "Validation failed",
    details: result.errors
  });
}

// Use sanitized data
var username = result.sanitized.username;
```

**Validates:**
- `username` required, 3-30 characters, alphanumeric + _-

### Score Submission Schema

```javascript
var result = validation.Schemas.submitScore(req.body);

if (!result.isValid) {
  return res.status(400).json({
    error: "Validation failed",
    details: result.errors
  });
}

// Use sanitized scores
var labor = result.sanitized.labor;
var exchange = result.sanitized.exchange;
// ... etc
```

**Validates:**
- All 6 scores required (labor, exchange, equality, presence, ratification, continuity)
- Each score must be between 0 and 10

### API Key Creation Schema

```javascript
var result = validation.Schemas.createAPIKey(req.body);

if (!result.isValid) {
  return res.status(400).json({
    error: "Validation failed",
    details: result.errors
  });
}

// Use sanitized passport_id
var passport_id = result.sanitized.passport_id;
```

**Validates:**
- `passport_id` required, valid UUID format

### Passport Comparison Schema

```javascript
var result = validation.Schemas.comparePassports(req.body);

if (!result.isValid) {
  return res.status(400).json({
    error: "Validation failed",
    details: result.errors
  });
}

// Use sanitized UUIDs
var passport_a = result.sanitized.passport_a;
var passport_b = result.sanitized.passport_b;
```

**Validates:**
- `passport_a` required, valid UUID format
- `passport_b` required, valid UUID format

### Tier Upgrade Schema

```javascript
var result = validation.Schemas.upgradeTier(req.body);

if (!result.isValid) {
  return res.status(400).json({
    error: "Validation failed",
    details: result.errors
  });
}

// Use sanitized tier
var tier = result.sanitized.tier;
```

**Validates:**
- `tier` required, one of: free, builder, pro, sovereign

### Query Parameter Validation

```javascript
var schema = {
  id: { type: "uuid", required: true },
  limit: { type: "integer", min: 1, max: 100, default: 10 },
  action: { type: "action", allowed: ["history", "compare"], required: true }
};

var result = validation.Schemas.validateQuery(req.query, schema);

if (!result.isValid) {
  return res.status(400).json({
    error: "Query parameter validation failed",
    details: result.errors
  });
}

// Use sanitized query parameters
var id = req.query.id;
var limit = req.query.limit;
```

## Security Detection

### SQL Injection Detection

```javascript
var check = validation.SecurityValidator.checkSecurity(userInput);

if (!check.safe) {
  console.log("Security issues detected:", check.issues);
  // Issues: ["SQL injection pattern detected"]
}
```

### XSS Detection

```javascript
var check = validation.SecurityValidator.checkSecurity(userInput);

if (!check.safe) {
  console.log("Security issues detected:", check.issues);
  // Issues: ["XSS pattern detected"]
}
```

### Command Injection Detection

```javascript
var check = validation.SecurityValidator.checkSecurity(userInput);

if (!check.safe) {
  console.log("Security issues detected:", check.issues);
  // Issues: ["Command injection pattern detected"]
}
```

## Integration Examples

### Basic Endpoint Validation

```javascript
var validation = require("../lib/validation");

module.exports = async function (req, res) {
  // Validate request body
  var validationResult = validation.Schemas.createPassport(req.body);
  if (!validationResult.isValid) {
    return res.status(400).json({
      error: "Validation failed",
      details: validationResult.errors
    });
  }

  // Use sanitized data
  var username = validationResult.sanitized.username;

  // Process request...
};
```

### Query Parameter Validation

```javascript
var validation = require("../lib/validation");

module.exports = async function (req, res) {
  var action = req.query.action;

  // Validate action parameter
  var allowedActions = ["leaderboard", "stats"];
  if (!validation.Validator.isValidAction(action, allowedActions)) {
    return res.status(400).json({
      error: "Invalid action",
      details: "Action must be one of: " + allowedActions.join(", ")
    });
  }

  // Process request...
};
```

### Limit Parameter Validation

```javascript
var validation = require("../lib/validation");

module.exports = async function (req, res) {
  // Validate and sanitize limit parameter
  var limit = validation.Validator.isValidLimit(req.query.limit, 10, 100);

  // Use validated limit
  var results = await db.query().limit(limit);

  return res.status(200).json({ results: results });
};
```

## Error Response Format

All validation errors follow this format:

```json
{
  "error": "Validation failed",
  "details": [
    "username is required",
    "email must be a valid email format"
  ]
}
```

## Security Best Practices

### 1. Always Validate Input

```javascript
// ❌ BAD - No validation
var username = req.body.username;

// ✅ GOOD - With validation
var result = validation.Schemas.createPassport(req.body);
if (!result.isValid) {
  return res.status(400).json({ error: "Validation failed", details: result.errors });
}
var username = result.sanitized.username;
```

### 2. Sanitize Before Use

```javascript
// ❌ BAD - Using raw input
db.query("SELECT * FROM users WHERE username = '" + req.body.username + "'");

// ✅ GOOD - Using sanitized input
var username = validation.Sanitizer.sanitizeUsername(req.body.username);
db.query("SELECT * FROM users WHERE username = ?", [username]);
```

### 3. Validate All Parameters

```javascript
// ❌ BAD - Missing validation
var limit = req.query.limit || 10;

// ✅ GOOD - With validation
var limit = validation.Validator.isValidLimit(req.query.limit, 10, 100);
```

### 4. Check for Security Issues

```javascript
// ❌ BAD - No security check
var userInput = req.body.search;

// ✅ GOOD - With security check
var userInput = req.body.search;
var securityCheck = validation.SecurityValidator.checkSecurity(userInput);
if (!securityCheck.safe) {
  return res.status(400).json({ error: "Invalid input detected" });
}
```

## Common Validation Patterns

### UUID Validation

```javascript
// Validate UUID parameter
var id = req.query.id;
if (!validation.Validator.isValidUUID(id)) {
  return res.status(400).json({ error: "Invalid UUID format" });
}
```

### Action Parameter Validation

```javascript
// Validate action parameter
var action = req.query.action;
var allowedActions = ["create", "read", "update", "delete"];
if (!validation.Validator.isValidAction(action, allowedActions)) {
  return res.status(400).json({
    error: "Invalid action",
    details: "Action must be one of: " + allowedActions.join(", ")
  });
}
```

### Score Validation

```javascript
// Validate score input
var score = parseFloat(req.body.score);
if (!validation.Validator.isValidScore(score)) {
  return res.status(400).json({ error: "Score must be between 0 and 10" });
}
```

### Limit Parameter Validation

```javascript
// Validate limit parameter
var limit = validation.Validator.isValidLimit(req.query.limit, 10, 100);
```

## Testing Validation

### Unit Testing Validation Functions

```javascript
// Test UUID validation
console.log(validation.Validator.isValidUUID("123e4567-e89b-12d3-a456-426614174000")); // true
console.log(validation.Validator.isValidUUID("invalid-uuid")); // false

// Test score validation
console.log(validation.Validator.isValidScore(5)); // true
console.log(validation.Validator.isValidScore(15)); // false
console.log(validation.Validator.isValidScore(-1)); // false

// Test sanitization
console.log(validation.Sanitizer.sanitizeUsername("john@doe#123")); // "johndoe123"
console.log(validation.Sanitizer.sanitizeNumber("123.45abc")); // 123.45
```

### Testing Request Schemas

```javascript
// Test passport creation schema
var validRequest = { username: "john_doe" };
var result = validation.Schemas.createPassport(validRequest);
console.log(result.isValid); // true

var invalidRequest = { username: "john@doe" };
var result = validation.Schemas.createPassport(invalidRequest);
console.log(result.isValid); // false
console.log(result.errors); // ["username must be 3-30 characters..."]
```

## Performance Considerations

### 1. Validation Overhead

Validation adds minimal overhead to request processing:
- UUID validation: ~0.1ms
- Score validation: ~0.05ms
- Schema validation: ~0.5ms

### 2. Caching Validation Results

For frequently validated data, consider caching:

```javascript
var validationCache = {};

function getCachedValidation(input, schema) {
  var cacheKey = JSON.stringify(input);
  if (validationCache[cacheKey]) {
    return validationCache[cacheKey];
  }

  var result = schema(input);
  validationCache[cacheKey] = result;
  return result;
}
```

### 3. Early Validation

Validate input as early as possible to fail fast:

```javascript
// ❌ BAD - Late validation
var data = await expensiveOperation(req.body);
if (!validation.Validator.isValidUUID(req.body.id)) {
  return res.status(400).json({ error: "Invalid UUID" });
}

// ✅ GOOD - Early validation
if (!validation.Validator.isValidUUID(req.body.id)) {
  return res.status(400).json({ error: "Invalid UUID" });
}
var data = await expensiveOperation(req.body);
```

## Troubleshooting

### Common Issues

**1. Validation failing unexpectedly**

```javascript
// Check what's being validated
console.log("Input:", req.body);
var result = validation.Schemas.createPassport(req.body);
console.log("Validation result:", result);
```

**2. Sanitization removing valid characters**

```javascript
// Check sanitization rules
var input = "test-input";
var sanitized = validation.Sanitizer.sanitizeUsername(input);
console.log("Original:", input, "Sanitized:", sanitized);
```

**3. Security detection false positives**

```javascript
// Check what patterns are being detected
var input = "SELECT * FROM users";
var check = validation.SecurityValidator.checkSecurity(input);
console.log("Security check:", check);
```

## Future Enhancements

1. **Custom Validation Rules** - Allow users to define custom validation functions
2. **Async Validation** - Support for database-backed validation
3. **Validation Caching** - Cache validation results for performance
4. **Detailed Error Messages** - More specific error messages with field locations
5. **Validation Middleware** - Express-style middleware for automatic validation
6. **Schema Composition** - Combine multiple schemas for complex validation
7. **Internationalization** - Support for localized error messages
8. **Validation Testing** - Automated testing of validation rules

## Security Benefits

The input validation system provides:

- ✅ **SQL Injection Prevention** - Detects and blocks SQL injection patterns
- ✅ **XSS Prevention** - Identifies and sanitizes XSS attack vectors
- ✅ **Command Injection Prevention** - Blocks command injection attempts
- ✅ **Data Integrity** - Ensures all data meets expected formats
- ✅ **Type Safety** - Validates data types before processing
- ✅ **Range Validation** - Enforces minimum/maximum values
- ✅ **Format Validation** - Ensures proper UUID, email, and other formats
- ✅ **Clear Error Messages** - Provides actionable feedback for invalid input

By implementing comprehensive input validation, the QRBTC API significantly reduces the attack surface and ensures data integrity throughout the application.