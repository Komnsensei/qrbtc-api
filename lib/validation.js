// Input Validation Library
// Custom validation functions for QRBTC API

var crypto = require("crypto");

// Validation result structure
function ValidationResult(isValid, errors, sanitized) {
  this.isValid = isValid;
  this.errors = errors || [];
  this.sanitized = sanitized || null;
}

// Sanitization functions
var Sanitizer = {
  // Remove potentially dangerous characters
  sanitizeString: function(input) {
    if (typeof input !== "string") return input;
    return input.trim().replace(/[<>]/g, "");
  },

  // Sanitize username
  sanitizeUsername: function(username) {
    if (typeof username !== "string") return username;
    // Allow alphanumeric, underscores, hyphens
    return username.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  },

  // Sanitize UUID
  sanitizeUUID: function(uuid) {
    if (typeof uuid !== "string") return uuid;
    // Remove any non-hex characters except hyphens
    return uuid.trim().replace(/[^a-fA-F0-9-]/g, "");
  },

  // Sanitize numeric input
  sanitizeNumber: function(input) {
    if (typeof input === "number") return input;
    if (typeof input !== "string") return NaN;
    var sanitized = input.trim().replace(/[^0-9.-]/g, "");
    return parseFloat(sanitized);
  },

  // Sanitize array input
  sanitizeArray: function(input) {
    if (!Array.isArray(input)) return [];
    return input.filter(function(item) {
      return item !== null && item !== undefined && item !== "";
    });
  },

  // Escape SQL-like patterns (basic protection)
  escapeSQL: function(input) {
    if (typeof input !== "string") return input;
    return input.replace(/['"\\]/g, "");
  },

  // Sanitize action parameter
  sanitizeAction: function(action) {
    if (typeof action !== "string") return "";
    // Only allow alphanumeric and underscores
    return action.trim().replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
  }
};

// Validation functions
var Validator = {
  // Validate UUID format
  isValidUUID: function(uuid) {
    if (typeof uuid !== "string") return false;
    var uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  },

  // Validate username
  isValidUsername: function(username) {
    if (typeof username !== "string") return false;
    if (username.length < 3 || username.length > 30) return false;
    var usernameRegex = /^[a-zA-Z0-9_-]+$/;
    return usernameRegex.test(username);
  },

  // Validate score (0-10)
  isValidScore: function(score) {
    var num = parseFloat(score);
    return !isNaN(num) && num >= 0 && num <= 10;
  },

  // Validate integer
  isValidInteger: function(input, min, max) {
    var num = parseInt(input);
    if (isNaN(num)) return false;
    if (min !== undefined && num < min) return false;
    if (max !== undefined && num > max) return false;
    return true;
  },

  // Validate email format
  isValidEmail: function(email) {
    if (typeof email !== "string") return false;
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Validate API key format
  isValidAPIKey: function(apiKey) {
    if (typeof apiKey !== "string") return false;
    // qrbtc_live_sk_ followed by 64 hex characters
    var apiKeyRegex = /^qrbtc_live_sk_[a-f0-9]{64}$/i;
    return apiKeyRegex.test(apiKey);
  },

  // Validate JWT token format
  isValidJWT: function(token) {
    if (typeof token !== "string") return false;
    var parts = token.split(".");
    return parts.length === 3;
  },

  // Validate action parameter
  isValidAction: function(action, allowedActions) {
    if (typeof action !== "string") return false;
    if (!allowedActions || !Array.isArray(allowedActions)) return false;
    return allowedActions.indexOf(action) !== -1;
  },

  // Validate tier
  isValidTier: function(tier) {
    if (typeof tier !== "string") return false;
    var validTiers = ["free", "builder", "pro", "sovereign"];
    return validTiers.indexOf(tier.toLowerCase()) !== -1;
  },

  // Validate scope
  isValidScope: function(scope) {
    if (typeof scope !== "string") return false;
    var validScopes = ["identity:read", "identity:write", "score:read", "score:write", "ledger:read", "ledger:write", "admin:all"];
    return validScopes.indexOf(scope) !== -1;
  },

  // Validate array of scores
  isValidScoreArray: function(scores) {
    if (!Array.isArray(scores)) return false;
    if (scores.length !== 6) return false;
    for (var i = 0; i < scores.length; i++) {
      if (!this.isValidScore(scores[i])) return false;
    }
    return true;
  },

  // Validate limit parameter
  isValidLimit: function(limit, defaultLimit, maxLimit) {
    var num = parseInt(limit);
    if (isNaN(num)) return defaultLimit;
    if (num < 1) return 1;
    if (num > maxLimit) return maxLimit;
    return num;
  },

  // Validate boolean
  isValidBoolean: function(input) {
    if (typeof input === "boolean") return input;
    if (typeof input === "string") {
      return input.toLowerCase() === "true";
    }
    return false;
  },

  // Validate date string
  isValidDateString: function(dateString) {
    if (typeof dateString !== "string") return false;
    var date = new Date(dateString);
    return !isNaN(date.getTime());
  },

  // Validate object structure
  isValidObject: function(input, requiredFields) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return false;
    }
    if (!requiredFields || !Array.isArray(requiredFields)) return true;
    for (var i = 0; i < requiredFields.length; i++) {
      if (!(requiredFields[i] in input)) return false;
    }
    return true;
  }
};

// Request validation schemas
var Schemas = {
  // Passport creation schema
  createPassport: function(body) {
    var errors = [];

    if (!body.username) {
      errors.push("username is required");
    } else {
      var sanitizedUsername = Sanitizer.sanitizeUsername(body.username);
      if (!Validator.isValidUsername(sanitizedUsername)) {
        errors.push("username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens");
      }
    }

    return new ValidationResult(errors.length === 0, errors, {
      username: Sanitizer.sanitizeUsername(body.username)
    });
  },

  // Score submission schema
  submitScore: function(body) {
    var errors = [];
    var sanitized = {};

    var requiredScores = ["labor", "exchange", "equality", "presence", "ratification", "continuity"];

    for (var i = 0; i < requiredScores.length; i++) {
      var scoreName = requiredScores[i];
      if (body[scoreName] === undefined || body[scoreName] === null) {
        errors.push(scoreName + " is required");
      } else if (!Validator.isValidScore(body[scoreName])) {
        errors.push(scoreName + " must be a number between 0 and 10");
      } else {
        sanitized[scoreName] = Sanitizer.sanitizeNumber(body[scoreName]);
      }
    }

    return new ValidationResult(errors.length === 0, errors, sanitized);
  },

  // API key creation schema
  createAPIKey: function(body) {
    var errors = [];

    if (!body.passport_id) {
      errors.push("passport_id is required");
    } else if (!Validator.isValidUUID(body.passport_id)) {
      errors.push("passport_id must be a valid UUID");
    }

    return new ValidationResult(errors.length === 0, errors, {
      passport_id: Sanitizer.sanitizeUUID(body.passport_id)
    });
  },

  // Passport comparison schema
  comparePassports: function(body) {
    var errors = [];

    if (!body.passport_a) {
      errors.push("passport_a is required");
    } else if (!Validator.isValidUUID(body.passport_a)) {
      errors.push("passport_a must be a valid UUID");
    }

    if (!body.passport_b) {
      errors.push("passport_b is required");
    } else if (!Validator.isValidUUID(body.passport_b)) {
      errors.push("passport_b must be a valid UUID");
    }

    return new ValidationResult(errors.length === 0, errors, {
      passport_a: Sanitizer.sanitizeUUID(body.passport_a),
      passport_b: Sanitizer.sanitizeUUID(body.passport_b)
    });
  },

  // Tier upgrade schema
  upgradeTier: function(body) {
    var errors = [];

    if (!body.tier) {
      errors.push("tier is required");
    } else if (!Validator.isValidTier(body.tier)) {
      errors.push("tier must be one of: free, builder, pro, sovereign");
    }

    var sanitizedTier = body.tier ? Sanitizer.sanitizeString(body.tier).toLowerCase() : undefined;

    return new ValidationResult(errors.length === 0, errors, {
      tier: sanitizedTier
    });
  },

  // Query parameter validation
  validateQuery: function(query, schema) {
    var errors = [];
    var sanitized = {};

    for (var param in schema) {
      var rules = schema[param];
      var value = query[param];

      if (rules.required && (value === undefined || value === null || value === "")) {
        errors.push(param + " is required");
        continue;
      }

      if (value !== undefined && value !== null && value !== "") {
        if (rules.type === "uuid" && !Validator.isValidUUID(value)) {
          errors.push(param + " must be a valid UUID");
        } else if (rules.type === "integer" && !Validator.isValidInteger(value, rules.min, rules.max)) {
          errors.push(param + " must be an integer" + (rules.min ? " >= " + rules.min : "") + (rules.max ? " <= " + rules.max : ""));
        } else if (rules.type === "action" && !Validator.isValidAction(value, rules.allowed)) {
          errors.push(param + " must be one of: " + rules.allowed.join(", "));
        } else if (rules.type === "boolean") {
          sanitized[param] = Validator.isValidBoolean(value);
        } else {
          sanitized[param] = Sanitizer.sanitizeString(value);
        }
      } else if (rules.default !== undefined) {
        sanitized[param] = rules.default;
      }
    }

    return new ValidationResult(errors.length === 0, errors, sanitized);
  }
};

// Middleware for validation
function validateRequest(schemaName) {
  return function(req, res, next) {
    var validationResult;

    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      if (schemaName === "createPassport") {
        validationResult = Schemas.createPassport(req.body);
      } else if (schemaName === "submitScore") {
        validationResult = Schemas.submitScore(req.body);
      } else if (schemaName === "createAPIKey") {
        validationResult = Schemas.createAPIKey(req.body);
      } else if (schemaName === "comparePassports") {
        validationResult = Schemas.comparePassports(req.body);
      } else if (schemaName === "upgradeTier") {
        validationResult = Schemas.upgradeTier(req.body);
      } else {
        return res.status(500).json({ error: "Unknown validation schema" });
      }
    } else {
      return next();
    }

    if (!validationResult.isValid) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.errors
      });
    }

    // Replace request body with sanitized data
    req.body = validationResult.sanitized;
    next();
  };
}

// Validate query parameters
function validateQueryParams(schema) {
  return function(req, res, next) {
    var validationResult = Schemas.validateQuery(req.query, schema);

    if (!validationResult.isValid) {
      return res.status(400).json({
        error: "Query parameter validation failed",
        details: validationResult.errors
      });
    }

    // Merge sanitized query params
    for (var param in validationResult.sanitized) {
      req.query[param] = validationResult.sanitized[param];
    }

    next();
  };
}

// Security validation for common attacks
var SecurityValidator = {
  // Check for SQL injection patterns
  detectSQLInjection: function(input) {
    if (typeof input !== "string") return false;
    var sqlPatterns = [
      /(\bunion\b.*\bselect\b)/i,
      /(\bselect\b.*\bfrom\b)/i,
      /(\binsert\b.*\binto\b)/i,
      /(\bdelete\b.*\bfrom\b)/i,
      /(\bupdate\b.*\bset\b)/i,
      /(\bdrop\b.*\btable\b)/i,
      /(\bexec\b|\bexecute\b)/i,
      /(\bxp_cmdshell\b)/i,
      /(\bsp_oacreate\b)/i,
      /(--|\#|\/\*|\*\/)/i,
      /(\bor\b.*=.*\bor\b)/i,
      /(\band\b.*=.*\band\b)/i,
      /;\s*\w+/i,  // Semicolon followed by command
      /(\bor\b|\band\b)\s*['"]/i  // OR/AND followed by quote
    ];

    for (var i = 0; i < sqlPatterns.length; i++) {
      if (sqlPatterns[i].test(input)) return true;
    }
    return false;
  },

  // Check for XSS patterns
  detectXSS: function(input) {
    if (typeof input !== "string") return false;
    var xssPatterns = [
      /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
      /<iframe\b[^>]*>([\s\S]*?)<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<img\b[^>]*src\s*=\s*["']?javascript:/gi,
      /<\?php/i,
      /<%/i
    ];

    for (var i = 0; i < xssPatterns.length; i++) {
      if (xssPatterns[i].test(input)) return true;
    }
    return false;
  },

  // Check for command injection
  detectCommandInjection: function(input) {
    if (typeof input !== "string") return false;
    var commandPatterns = [
      /[;&|`$]/,  // Command separators and special chars (removed parentheses)
      /\|\|/,
      /&&/,
      /`.*`/,
      /\$\(.*\)/
    ];

    for (var i = 0; i < commandPatterns.length; i++) {
      if (commandPatterns[i].test(input)) return true;
    }
    return false;
  },

  // Comprehensive security check
  checkSecurity: function(input) {
    if (typeof input !== "string") return { safe: true };

    var issues = [];

    if (this.detectSQLInjection(input)) {
      issues.push("SQL injection pattern detected");
    }

    if (this.detectXSS(input)) {
      issues.push("XSS pattern detected");
    }

    if (this.detectCommandInjection(input)) {
      issues.push("Command injection pattern detected");
    }

    return {
      safe: issues.length === 0,
      issues: issues
    };
  }
};

// Export all validation functions
module.exports = {
  ValidationResult: ValidationResult,
  Sanitizer: Sanitizer,
  Validator: Validator,
  Schemas: Schemas,
  validateRequest: validateRequest,
  validateQueryParams: validateQueryParams,
  SecurityValidator: SecurityValidator
};