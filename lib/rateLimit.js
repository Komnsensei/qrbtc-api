// Rate Limiting Middleware
// Provides comprehensive rate limiting for API endpoints

var crypto = require("crypto");

// Rate limiting configuration
var RateLimitConfig = {
  // Default limits per tier
  tiers: {
    free: {
      requests: 1000,
      window: 24 * 60 * 60 * 1000, // 24 hours
      burst: 1000 // requests per burst window
    },
    builder: {
      requests: 10000,
      window: 24 * 60 * 60 * 1000, // 24 hours
      burst: 1000
    },
    pro: {
      requests: 100000,
      window: 24 * 60 * 60 * 1000, // 24 hours
      burst: 1000
    },
    sovereign: {
      requests: Infinity,
      window: 24 * 60 * 60 * 1000, // 24 hours
      burst: Infinity
    }
  },

  // Burst protection settings
  burst: {
    window: 1000, // 1 second
    maxRequests: 1 // 1 request per second
  },

  // IP-based rate limiting
  ip: {
    enabled: true,
    requests: 100, // 100 requests per hour
    window: 60 * 60 * 1000 // 1 hour
  }
};

// In-memory rate limit storage (for production, use Redis)
var rateLimitStore = {};

// Rate limit key generator
function generateRateLimitKey(identifier, type) {
  return type + ":" + identifier;
}

// Get rate limit data
function getRateLimitData(key) {
  return rateLimitStore[key] || null;
}

// Set rate limit data
function setRateLimitData(key, data) {
  rateLimitStore[key] = data;
}

// Clean up expired rate limit data
function cleanupExpiredData() {
  var now = Date.now();
  var keys = Object.keys(rateLimitStore);

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var data = rateLimitStore[key];

    if (data && data.expiresAt && data.expiresAt < now) {
      delete rateLimitStore[key];
    }
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredData, 60 * 60 * 1000);

// Check rate limit
function checkRateLimit(identifier, tier, type) {
  var config = RateLimitConfig.tiers[tier] || RateLimitConfig.tiers.free;
  var key = generateRateLimitKey(identifier, type);
  var now = Date.now();
  var data = getRateLimitData(key);

  // Initialize if not exists
  if (!data) {
    data = {
      count: 0,
      windowStart: now,
      expiresAt: now + config.window,
      burstCount: 0,
      burstWindowStart: now
    };
    setRateLimitData(key, data);
  }

  // Check if window expired
  if (now - data.windowStart > config.window) {
    data.count = 0;
    data.windowStart = now;
    data.expiresAt = now + config.window;
  }

  // Check burst limit
  if (now - data.burstWindowStart > RateLimitConfig.burst.window) {
    data.burstCount = 0;
    data.burstWindowStart = now;
  }

  // Check if limit exceeded
  if (config.requests !== Infinity && data.count >= config.requests) {
    var resetTime = data.windowStart + config.window;
    var resetIn = Math.ceil((resetTime - now) / 1000);

    return {
      allowed: false,
      limit: config.requests,
      remaining: 0,
      reset: resetTime,
      resetIn: resetIn,
      reason: "daily_limit"
    };
  }

  // Check burst limit
  if (data.burstCount >= RateLimitConfig.burst.maxRequests) {
    var burstResetTime = data.burstWindowStart + RateLimitConfig.burst.window;
    var burstResetIn = Math.ceil((burstResetTime - now) / 1000);

    return {
      allowed: false,
      limit: RateLimitConfig.burst.maxRequests,
      remaining: 0,
      reset: burstResetTime,
      resetIn: burstResetIn,
      reason: "burst_limit"
    };
  }

  // Increment counters
  data.count++;
  data.burstCount++;
  setRateLimitData(key, data);

  return {
    allowed: true,
    limit: config.requests,
    remaining: config.requests === Infinity ? Infinity : config.requests - data.count,
    reset: data.windowStart + config.window,
    resetIn: Math.ceil((data.windowStart + config.window - now) / 1000),
    reason: "ok"
  };
}

// IP-based rate limiting
function checkIPRateLimit(ipHash) {
  if (!RateLimitConfig.ip.enabled) {
    return { allowed: true };
  }

  var key = generateRateLimitKey(ipHash, "ip");
  var now = Date.now();
  var data = getRateLimitData(key);

  // Initialize if not exists
  if (!data) {
    data = {
      count: 0,
      windowStart: now,
      expiresAt: now + RateLimitConfig.ip.window
    };
    setRateLimitData(key, data);
  }

  // Check if window expired
  if (now - data.windowStart > RateLimitConfig.ip.window) {
    data.count = 0;
    data.windowStart = now;
    data.expiresAt = now + RateLimitConfig.ip.window;
  }

  // Check if limit exceeded
  if (data.count >= RateLimitConfig.ip.requests) {
    var resetTime = data.windowStart + RateLimitConfig.ip.window;
    var resetIn = Math.ceil((resetTime - now) / 1000);

    return {
      allowed: false,
      limit: RateLimitConfig.ip.requests,
      remaining: 0,
      reset: resetTime,
      resetIn: resetIn,
      reason: "ip_limit"
    };
  }

  // Increment counter
  data.count++;
  setRateLimitData(key, data);

  return {
    allowed: true,
    limit: RateLimitConfig.ip.requests,
    remaining: RateLimitConfig.ip.requests - data.count,
    reset: data.windowStart + RateLimitConfig.ip.window,
    resetIn: Math.ceil((data.windowStart + RateLimitConfig.ip.window - now) / 1000),
    reason: "ok"
  };
}

// Hash IP address
function hashIP(req) {
  var ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  if (Array.isArray(ip)) ip = ip[0];
  ip = ip.split(",")[0].trim();
  return crypto.createHash("sha256").update(ip + "qrbtc-rate-limit").digest("hex").slice(0, 16);
}

// Rate limiting middleware
function rateLimitMiddleware(options) {
  options = options || {};

  return function(req, res, next) {
    var ipHash = hashIP(req);

    // Check IP-based rate limit first
    var ipCheck = checkIPRateLimit(ipHash);
    if (!ipCheck.allowed) {
      res.setHeader("X-RateLimit-Limit", ipCheck.limit);
      res.setHeader("X-RateLimit-Remaining", ipCheck.remaining);
      res.setHeader("X-RateLimit-Reset", ipCheck.reset);
      res.setHeader("Retry-After", ipCheck.resetIn);

      return res.status(429).json({
        error: "IP rate limit exceeded",
        details: {
          limit: ipCheck.limit,
          resetIn: ipCheck.resetIn + " seconds",
          reason: ipCheck.reason
        }
      });
    }

    // If user is authenticated, check user-based rate limit
    if (req.session && req.session.passport_id) {
      var userCheck = checkRateLimit(req.session.passport_id, req.session.tier || "free", "user");

      if (!userCheck.allowed) {
        res.setHeader("X-RateLimit-Limit", userCheck.limit);
        res.setHeader("X-RateLimit-Remaining", userCheck.remaining);
        res.setHeader("X-RateLimit-Reset", userCheck.reset);
        res.setHeader("Retry-After", userCheck.resetIn);

        return res.status(429).json({
          error: "Rate limit exceeded",
          details: {
            limit: userCheck.limit,
            resetIn: userCheck.resetIn + " seconds",
            reason: userCheck.reason
          }
        });
      }

      // Add rate limit info to response headers
      res.setHeader("X-RateLimit-Limit", userCheck.limit);
      res.setHeader("X-RateLimit-Remaining", userCheck.remaining);
      res.setHeader("X-RateLimit-Reset", userCheck.reset);
    }

    next();
  };
}

// Get rate limit info for a user
function getRateLimitInfo(passportId, tier) {
  var key = generateRateLimitKey(passportId, "user");
  var data = getRateLimitData(key);
  var config = RateLimitConfig.tiers[tier] || RateLimitConfig.tiers.free;

  if (!data) {
    return {
      limit: config.requests,
      used: 0,
      remaining: config.requests,
      reset: Date.now() + config.window
    };
  }

  return {
    limit: config.requests,
    used: data.count,
    remaining: config.requests === Infinity ? Infinity : config.requests - data.count,
    reset: data.windowStart + config.window
  };
}

// Reset rate limit for a user (admin function)
function resetRateLimit(passportId) {
  var key = generateRateLimitKey(passportId, "user");
  delete rateLimitStore[key];
  return true;
}

// Get rate limit statistics
function getRateLimitStats() {
  var stats = {
    totalKeys: Object.keys(rateLimitStore).length,
    byType: {},
    byTier: {}
  };

  var keys = Object.keys(rateLimitStore);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var parts = key.split(":");
    var type = parts[0];

    if (!stats.byType[type]) {
      stats.byType[type] = 0;
    }
    stats.byType[type]++;
  }

  return stats;
}

// Export rate limiting functions
module.exports = {
  RateLimitConfig: RateLimitConfig,
  checkRateLimit: checkRateLimit,
  checkIPRateLimit: checkIPRateLimit,
  rateLimitMiddleware: rateLimitMiddleware,
  getRateLimitInfo: getRateLimitInfo,
  resetRateLimit: resetRateLimit,
  getRateLimitStats: getRateLimitStats,
  cleanupExpiredData: cleanupExpiredData
};