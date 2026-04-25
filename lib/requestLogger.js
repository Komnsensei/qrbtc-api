// Request Logging Middleware
// Provides comprehensive request logging for monitoring and debugging

var crypto = require("crypto");

// Logging configuration
var LoggingConfig = {
  enabled: true,
  level: "debug", // debug, info, warn, error
  includeHeaders: false,
  includeBody: false,
  maxBodySize: 1024, // Maximum body size to log (bytes)
  sensitiveFields: ["password", "token", "secret", "key", "credit_card"],
  logFormat: "json" // json, text
};

// In-memory log storage (for production, use proper logging service)
var logStore = [];
var maxLogEntries = 1000;

// Log levels
var LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Current log level
var currentLogLevel = LogLevel[LoggingConfig.level.toUpperCase()] || LogLevel.DEBUG;

// Hash sensitive data
function hashSensitiveData(value) {
  if (typeof value !== "string") return value;
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);
}

// Sanitize request data
function sanitizeRequestData(data) {
  if (!data || typeof data !== "object") return data;

  var sanitized = {};

  for (var key in data) {
    if (data.hasOwnProperty(key)) {
      var isSensitive = LoggingConfig.sensitiveFields.some(function(field) {
        return key.toLowerCase().indexOf(field) !== -1;
      });

      if (isSensitive) {
        sanitized[key] = "***REDACTED***";
      } else if (typeof data[key] === "object" && data[key] !== null) {
        sanitized[key] = sanitizeRequestData(data[key]);
      } else {
        sanitized[key] = data[key];
      }
    }
  }

  return sanitized;
}

// Truncate body if too large
function truncateBody(body) {
  if (!body) return null;

  var bodyString = typeof body === "string" ? body : JSON.stringify(body);

  if (bodyString.length > LoggingConfig.maxBodySize) {
    return bodyString.substring(0, LoggingConfig.maxBodySize) + "... [truncated]";
  }

  return bodyString;
}

// Generate request ID
function generateRequestId() {
  return crypto.randomBytes(16).toString("hex");
}

// Hash IP address
function hashIP(req) {
  if (!req || !req.headers) {
    return "unknown";
  }
  var ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  if (Array.isArray(ip)) ip = ip[0];
  ip = ip.split(",")[0].trim();
  return crypto.createHash("sha256").update(ip + "qrbtc-logging").digest("hex").slice(0, 16);
}

// Get user agent
function getUserAgent(req) {
  if (!req || !req.headers) {
    return "unknown";
  }
  return req.headers["user-agent"] || "unknown";
}

// Get request duration
function getRequestDuration(startTime) {
  return Date.now() - startTime;
}

// Format log entry
function formatLogEntry(entry) {
  if (LoggingConfig.logFormat === "json") {
    return JSON.stringify(entry);
  } else {
    // Text format
    return [
      entry.timestamp,
      entry.level.toUpperCase(),
      entry.method,
      entry.url,
      entry.statusCode,
      entry.duration + "ms",
      entry.requestId
    ].join(" | ");
  }
}

// Store log entry
function storeLogEntry(entry) {
  logStore.push(entry);

  // Keep only the most recent entries
  if (logStore.length > maxLogEntries) {
    logStore.shift();
  }
}

// Log request
function logRequest(req, res, next) {
  if (!LoggingConfig.enabled) {
    return next();
  }

  var startTime = Date.now();
  var requestId = generateRequestId();
  var ipHash = hashIP(req);

  // Add request ID to request object
  req.requestId = requestId;
  req.startTime = startTime;

  // Log request start
  var requestLog = {
    timestamp: new Date().toISOString(),
    level: "info",
    type: "request_start",
    requestId: requestId,
    method: req.method,
    url: req.url,
    ipHash: ipHash,
    userAgent: getUserAgent(req),
    headers: LoggingConfig.includeHeaders ? req.headers : undefined
  };

  // Add body if enabled
  if (LoggingConfig.includeBody && req.body) {
    requestLog.body = truncateBody(sanitizeRequestData(req.body));
  }

  storeLogEntry(requestLog);
  console.log(formatLogEntry(requestLog));

  // Capture response
  var originalSend = res.send;
  var responseBody;

  res.send = function(data) {
    responseBody = data;
    originalSend.call(res, data);
  };

  // Log response when finished
  res.on("finish", function() {
    var duration = getRequestDuration(startTime);
    var responseLog = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 400 ? "error" : "info",
      type: "request_end",
      requestId: requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: duration,
      ipHash: ipHash,
      userAgent: getUserAgent(req)
    };

    // Add response size if available
    if (res.get("content-length")) {
      responseLog.responseSize = parseInt(res.get("content-length"));
    }

    storeLogEntry(responseLog);
    console.log(formatLogEntry(responseLog));
  });

  next();
}

// Log error
function logError(error, req) {
  if (!LoggingConfig.enabled) {
    return;
  }

  var errorLog = {
    timestamp: new Date().toISOString(),
    level: "error",
    type: "error",
    requestId: req.requestId || generateRequestId(),
    method: req.method,
    url: req.url,
    error: {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode
    },
    ipHash: hashIP(req),
    userAgent: getUserAgent(req)
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === "development" && error.stack) {
    errorLog.error.stack = error.stack;
  }

  // Add details if available
  if (error.details) {
    errorLog.error.details = error.details;
  }

  storeLogEntry(errorLog);
  console.error(formatLogEntry(errorLog));
}

// Log debug message
function logDebug(message, data) {
  if (currentLogLevel > LogLevel.DEBUG) {
    return;
  }

  var debugLog = {
    timestamp: new Date().toISOString(),
    level: "debug",
    type: "debug",
    message: message,
    data: data
  };

  storeLogEntry(debugLog);
  console.log(formatLogEntry(debugLog));
}

// Log info message
function logInfo(message, data) {
  if (currentLogLevel > LogLevel.INFO) {
    return;
  }

  var infoLog = {
    timestamp: new Date().toISOString(),
    level: "info",
    type: "info",
    message: message,
    data: data
  };

  storeLogEntry(infoLog);
  console.log(formatLogEntry(infoLog));
}

// Log warning message
function logWarn(message, data) {
  if (currentLogLevel > LogLevel.WARN) {
    return;
  }

  var warnLog = {
    timestamp: new Date().toISOString(),
    level: "warn",
    type: "warn",
    message: message,
    data: data
  };

  storeLogEntry(warnLog);
  console.warn(formatLogEntry(warnLog));
}

// Get recent logs
function getRecentLogs(limit) {
  limit = limit || 100;
  return logStore.slice(-limit);
}

// Get logs by request ID
function getLogsByRequestId(requestId) {
  return logStore.filter(function(log) {
    return log.requestId === requestId || (log.data && log.data.requestId === requestId);
  });
}

// Get logs by level
function getLogsByLevel(level, limit) {
  limit = limit || 100;
  return logStore
    .filter(function(log) {
      return log.level === level;
    })
    .slice(-limit);
}

// Get error logs
function getErrorLogs(limit) {
  return getLogsByLevel("error", limit);
}

// Clear logs
function clearLogs() {
  logStore = [];
  return true;
}

// Get log statistics
function getLogStats() {
  var stats = {
    total: logStore.length,
    byLevel: {},
    byType: {},
    byStatusCode: {},
    averageDuration: 0,
    errorRate: 0
  };

  var totalDuration = 0;
  var durationCount = 0;
  var errorCount = 0;

  for (var i = 0; i < logStore.length; i++) {
    var log = logStore[i];

    // Count by level
    if (!stats.byLevel[log.level]) {
      stats.byLevel[log.level] = 0;
    }
    stats.byLevel[log.level]++;

    // Count by type
    if (!stats.byType[log.type]) {
      stats.byType[log.type] = 0;
    }
    stats.byType[log.type]++;

    // Count by status code
    if (log.statusCode) {
      if (!stats.byStatusCode[log.statusCode]) {
        stats.byStatusCode[log.statusCode] = 0;
      }
      stats.byStatusCode[log.statusCode]++;

      // Count errors
      if (log.statusCode >= 400) {
        errorCount++;
      }
    }

    // Calculate average duration
    if (log.duration) {
      totalDuration += log.duration;
      durationCount++;
    }
  }

  // Calculate averages
  if (durationCount > 0) {
    stats.averageDuration = Math.round(totalDuration / durationCount);
  }

  if (logStore.length > 0) {
    stats.errorRate = Math.round((errorCount / logStore.length) * 100);
  }

  return stats;
}

// Set log level
function setLogLevel(level) {
  var newLevel = LogLevel[level.toUpperCase()];
  if (newLevel !== undefined) {
    currentLogLevel = newLevel;
    LoggingConfig.level = level.toLowerCase();
    return true;
  }
  return false;
}

// Export logging functions
module.exports = {
  LoggingConfig: LoggingConfig,
  LogLevel: LogLevel,
  logRequest: logRequest,
  logError: logError,
  logDebug: logDebug,
  logInfo: logInfo,
  logWarn: logWarn,
  getRecentLogs: getRecentLogs,
  getLogsByRequestId: getLogsByRequestId,
  getLogsByLevel: getLogsByLevel,
  getErrorLogs: getErrorLogs,
  clearLogs: clearLogs,
  getLogStats: getLogStats,
  setLogLevel: setLogLevel,
  generateRequestId: generateRequestId,
  hashIP: hashIP
};