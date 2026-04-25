// Centralized Error Handling Middleware
// Provides consistent error handling across all API endpoints

// Error types
var ErrorTypes = {
  VALIDATION_ERROR: "ValidationError",
  AUTHENTICATION_ERROR: "AuthenticationError",
  AUTHORIZATION_ERROR: "AuthorizationError",
  NOT_FOUND_ERROR: "NotFoundError",
  RATE_LIMIT_ERROR: "RateLimitError",
  DATABASE_ERROR: "DatabaseError",
  INTERNAL_ERROR: "InternalError",
  BAD_REQUEST_ERROR: "BadRequestError"
};

// HTTP status codes
var HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// Custom error class
function CustomError(message, type, statusCode, details) {
  this.name = type;
  this.message = message;
  this.statusCode = statusCode;
  this.details = details || {};
  this.timestamp = new Date().toISOString();
  Error.captureStackTrace(this, this.constructor);
}

CustomError.prototype = Object.create(Error.prototype);
CustomError.prototype.constructor = CustomError;

// Specific error types
function ValidationError(message, details) {
  CustomError.call(this, message, ErrorTypes.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, details);
}
ValidationError.prototype = Object.create(CustomError.prototype);
ValidationError.prototype.constructor = ValidationError;

function AuthenticationError(message, details) {
  CustomError.call(this, message, ErrorTypes.AUTHENTICATION_ERROR, HttpStatus.UNAUTHORIZED, details);
}
AuthenticationError.prototype = Object.create(CustomError.prototype);
AuthenticationError.prototype.constructor = AuthenticationError;

function AuthorizationError(message, details) {
  CustomError.call(this, message, ErrorTypes.AUTHORIZATION_ERROR, HttpStatus.FORBIDDEN, details);
}
AuthorizationError.prototype = Object.create(CustomError.prototype);
AuthorizationError.prototype.constructor = AuthorizationError;

function NotFoundError(message, details) {
  CustomError.call(this, message, ErrorTypes.NOT_FOUND_ERROR, HttpStatus.NOT_FOUND, details);
}
NotFoundError.prototype = Object.create(CustomError.prototype);
NotFoundError.prototype.constructor = NotFoundError;

function RateLimitError(message, details) {
  CustomError.call(this, message, ErrorTypes.RATE_LIMIT_ERROR, HttpStatus.TOO_MANY_REQUESTS, details);
}
RateLimitError.prototype = Object.create(CustomError.prototype);
RateLimitError.prototype.constructor = RateLimitError;

function DatabaseError(message, details) {
  CustomError.call(this, message, ErrorTypes.DATABASE_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, details);
}
DatabaseError.prototype = Object.create(CustomError.prototype);
DatabaseError.prototype.constructor = DatabaseError;

function InternalError(message, details) {
  CustomError.call(this, message, ErrorTypes.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, details);
}
InternalError.prototype = Object.create(CustomError.prototype);
InternalError.prototype.constructor = InternalError;

function BadRequestError(message, details) {
  CustomError.call(this, message, ErrorTypes.BAD_REQUEST_ERROR, HttpStatus.BAD_REQUEST, details);
}
BadRequestError.prototype = Object.create(CustomError.prototype);
BadRequestError.prototype.constructor = BadRequestError;

// Error response formatter
function formatErrorResponse(error, includeStackTrace) {
  includeStackTrace = includeStackTrace || false;

  var response = {
    error: error.message || "An error occurred",
    type: error.name || ErrorTypes.INTERNAL_ERROR,
    statusCode: error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
    timestamp: error.timestamp || new Date().toISOString()
  };

  // Add details if available
  if (error.details && Object.keys(error.details).length > 0) {
    response.details = error.details;
  }

  // Add stack trace in development or if requested
  if (includeStackTrace && error.stack) {
    response.stack = error.stack;
  }

  // Add request ID if available
  if (error.requestId) {
    response.requestId = error.requestId;
  }

  return response;
}

// Error handler middleware
function errorHandler(err, req, res, next) {
  // Log error
  logError(err, req);

  // Determine if we should include stack trace
  var includeStackTrace = process.env.NODE_ENV === "development" || process.env.DEBUG === "true";

  // Format error response
  var errorResponse = formatErrorResponse(err, includeStackTrace);

  // Set appropriate status code
  var statusCode = err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;

  // Send error response
  res.status(statusCode).json(errorResponse);
}

// Async error wrapper
function asyncHandler(fn) {
  return function(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Validation error helper
function handleValidationError(validationResult) {
  if (!validationResult.isValid) {
    throw new ValidationError("Validation failed", {
      errors: validationResult.errors
    });
  }
  return validationResult.sanitized;
}

// Database error helper
function handleDatabaseError(error) {
  // Check for common database errors
  if (error.code === "23505") { // Unique violation
    throw new BadRequestError("Resource already exists", {
      field: error.detail
    });
  }

  if (error.code === "23503") { // Foreign key violation
    throw new BadRequestError("Referenced resource does not exist", {
      field: error.detail
    });
  }

  if (error.code === "23502") { // Not null violation
    throw new BadRequestError("Required field is missing", {
      field: error.column
    });
  }

  // Generic database error
  throw new DatabaseError("Database operation failed", {
    code: error.code,
    message: error.message
  });
}

// Not found helper
function handleNotFound(resource, identifier) {
  throw new NotFoundError(resource + " not found", {
    resource: resource,
    identifier: identifier
  });
}

// Authentication error helper
function handleAuthenticationError(message) {
  throw new AuthenticationError(message || "Authentication required");
}

// Authorization error helper
function handleAuthorizationError(message) {
  throw new AuthorizationError(message || "Insufficient permissions");
}

// Rate limit error helper
function handleRateLimitError(limit, resetIn) {
  throw new RateLimitError("Rate limit exceeded", {
    limit: limit,
    resetIn: resetIn
  });
}

// Error logging
function logError(error, req) {
  var logData = {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode
    },
    request: {
      method: req.method,
      url: req.url,
      headers: {
        "user-agent": req.headers["user-agent"],
        "x-api-key": req.headers["x-api-key"] ? "***" : undefined
      }
    }
  };

  // Add details if available
  if (error.details) {
    logData.error.details = error.details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === "development" && error.stack) {
    logData.error.stack = error.stack;
  }

  // Log to console (in production, use proper logging service)
  console.error(JSON.stringify(logData));
}

// Error response helper
function sendErrorResponse(res, error, includeStackTrace) {
  includeStackTrace = includeStackTrace || false;

  var errorResponse = formatErrorResponse(error, includeStackTrace);
  var statusCode = error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;

  return res.status(statusCode).json(errorResponse);
}

// Success response helper
function sendSuccessResponse(res, data, statusCode) {
  statusCode = statusCode || HttpStatus.OK;

  var response = {
    success: true,
    data: data,
    timestamp: new Date().toISOString()
  };

  return res.status(statusCode).json(response);
}

// Paginated response helper
function sendPaginatedResponse(res, data, pagination) {
  var response = {
    success: true,
    data: data,
    pagination: pagination,
    timestamp: new Date().toISOString()
  };

  return res.status(HttpStatus.OK).json(response);
}

// Export error handling functions
module.exports = {
  ErrorTypes: ErrorTypes,
  HttpStatus: HttpStatus,
  CustomError: CustomError,
  ValidationError: ValidationError,
  AuthenticationError: AuthenticationError,
  AuthorizationError: AuthorizationError,
  NotFoundError: NotFoundError,
  RateLimitError: RateLimitError,
  DatabaseError: DatabaseError,
  InternalError: InternalError,
  BadRequestError: BadRequestError,
  formatErrorResponse: formatErrorResponse,
  errorHandler: errorHandler,
  asyncHandler: asyncHandler,
  handleValidationError: handleValidationError,
  handleDatabaseError: handleDatabaseError,
  handleNotFound: handleNotFound,
  handleAuthenticationError: handleAuthenticationError,
  handleAuthorizationError: handleAuthorizationError,
  handleRateLimitError: handleRateLimitError,
  logError: logError,
  sendErrorResponse: sendErrorResponse,
  sendSuccessResponse: sendSuccessResponse,
  sendPaginatedResponse: sendPaginatedResponse
};