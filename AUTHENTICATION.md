# Enhanced Authentication System

## Overview

The QRBTC API now features a comprehensive authentication and authorization system with multiple authentication methods, enhanced security features, and robust rate limiting.

## Authentication Methods

### 1. API Key Authentication

**Usage:**
```bash
curl -X POST https://qrbtc-api.vercel.app/api/score \
  -H "x-api-key: qrbtc_live_sk_6e93bdf9efe0c648d02148f9defaf8f94b1da6653fcb8fa97c8fded445cbed32" \
  -H "Content-Type: application/json" \
  -d '{"labor": 9, "exchange": 8, "equality": 7, "presence": 8, "ratification": 9, "continuity": 8}'
```

**Features:**
- Secure SHA-256 hashed keys stored in database
- Scope-based permissions
- Rate limiting per key
- Burst protection (1 second minimum between requests)
- Daily usage tracking

### 2. JWT Token Authentication

**Usage:**
```bash
curl -X GET https://qrbtc-api.vercel.app/api/passport \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwYXNzcG9ydF9pZCI6InV1aWQtdGVzdCIsInRpZXIiOiJmcmVlIiwic2NvcGVzIjpbInNjb3JlOndyaXRlIiwibGVkZ2VyOnJlYWQiLCJpZGVudGl0eTpyZWFkIl19.signature"
```

**Features:**
- Stateless authentication
- 24-hour token expiry
- HS256 signature verification
- Embedded scope and tier information
- No database lookup for validation

## Security Features

### 1. Security Headers

All API responses include comprehensive security headers:

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### 2. CORS Configuration

Configurable CORS headers for cross-origin requests:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, x-api-key
Access-Control-Max-Age: 86400
```

### 3. Rate Limiting

**Tier-based limits:**
- Free: 1,000 requests/day
- Builder: 10,000 requests/day
- Pro: 100,000 requests/day
- Sovereign: Unlimited

**Burst protection:**
- Minimum 1 second between requests
- Configurable per environment

### 4. IP Whitelisting

Optional IP-based access control:

```bash
# Enable in environment variables
ENABLE_IP_WHITELIST=true
```

### 5. Admin Override

Admin users bypass rate limits:

```javascript
// Check if user is admin
if (session.is_admin) {
  // No rate limiting applied
}
```

## Scope System

### Available Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `identity:read` | Read passport information | GET /api/passport |
| `score:write` | Submit session scores | POST /api/score |
| `ledger:read` | Read session history | GET /api/ledger?action=history |
| `ledger:write` | Revoke passports | POST /api/ledger?action=revoke |

### Scope Assignment

API keys are created with default scopes:
```javascript
var scopes = ["score:write", "ledger:read", "identity:read"];
```

## Rate Limiting Details

### Daily Window
- 24-hour rolling window
- Automatic reset when window expires
- Per-key tracking

### Response Headers

Rate limit information included in responses:
```json
{
  "requests_remaining": 999,
  "tier": "free",
  "auth_type": "api_key"
}
```

### Error Responses

**Rate limit exceeded:**
```json
{
  "error": "Rate limit exceeded. Resets in 45 minutes.",
  "status": 429
}
```

**Burst protection:**
```json
{
  "error": "Too fast. Min interval: 1 second.",
  "status": 429
}
```

## Request Logging

All authentication attempts are logged to `request_logs` table:

```javascript
{
  "passport_id": "uuid",
  "endpoint": "/api/score",
  "method": "POST",
  "status_code": 200,
  "latency_ms": 45,
  "auth_type": "api_key",
  "tier": "free",
  "ip_hash": "a1b2c3d4e5f6g7h8"
}
```

## Environment Variables

Required environment variables:

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# JWT Configuration
JWT_SECRET=your_jwt_secret_key

# CORS Configuration
CORS_ORIGIN=https://yourdomain.com

# IP Whitelisting
ENABLE_IP_WHITELIST=false
```

## API Key Management

### Create API Key

```bash
curl -X POST https://qrbtc-api.vercel.app/api/key/create \
  -H "Content-Type: application/json" \
  -d '{"passport_id": "your-passport-id"}'
```

**Response:**
```json
{
  "api_key": "qrbtc_live_sk_6e93bdf9efe0c648d02148f9defaf8f94b1da6653fcb8fa97c8fded445cbed32",
  "scopes": ["score:write", "ledger:read", "identity:read"],
  "tier": "free",
  "requests_limit": 1000,
  "warning": "Save this key now. It will never be shown again."
}
```

### Revoke API Key

```sql
UPDATE api_keys SET revoked = true WHERE key_hash = 'your_key_hash';
```

## JWT Token Generation

### Generate JWT Token

```javascript
var auth = require("./lib/auth");

var payload = {
  passport_id: "user-uuid",
  tier: "free",
  scopes: ["score:write", "ledger:read", "identity:read"]
};

var token = auth.generateJWT(payload);
// Returns: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Verify JWT Token

```javascript
var auth = require("./lib/auth");

var payload = auth.verifyJWT(token);
// Returns: { passport_id: "user-uuid", tier: "free", scopes: [...], iat: 1234567890, exp: 1234654290 }
// Or: null if invalid
```

## Error Handling

### Authentication Errors

**Missing credentials:**
```json
{
  "error": "Missing x-api-key header or valid JWT token",
  "status": 401
}
```

**Invalid API key:**
```json
{
  "error": "Invalid API key",
  "status": 401
}
```

**Revoked key:**
```json
{
  "error": "API key revoked",
  "status": 403
}
```

**Insufficient scope:**
```json
{
  "error": "Insufficient scope. Required: score:write",
  "status": 403
}
```

## Security Best Practices

### 1. Key Management
- Never commit API keys to version control
- Rotate keys regularly
- Use different keys for different environments
- Revoke compromised keys immediately

### 2. JWT Security
- Use strong JWT secrets (32+ characters)
- Set appropriate token expiry times
- Implement token refresh mechanisms
- Store tokens securely (httpOnly cookies)

### 3. Rate Limiting
- Monitor rate limit usage
- Implement client-side retry logic
- Use exponential backoff for rate limit errors
- Alert on unusual usage patterns

### 4. Monitoring
- Monitor authentication failures
- Track rate limit violations
- Alert on revoked key access attempts
- Review audit logs regularly

## Migration Guide

### From Old Authentication

**Old way:**
```javascript
var session = await auth.authenticate(req, "score:write");
```

**New way (same interface, enhanced features):**
```javascript
var session = await auth.authenticate(req, "score:write");
// Now includes: is_admin, auth_type, enhanced logging
```

### Adding Security Headers

**Old way:**
```javascript
module.exports = async function (req, res) {
  // Your code here
};
```

**New way:**
```javascript
module.exports = async function (req, res) {
  auth.applySecurityHeaders(res);
  auth.applyCORSHeaders(res);

  if (auth.handlePreflight(req, res)) return;

  // Your code here
};
```

## Testing

### Test API Key Authentication

```bash
# Valid request
curl -X POST https://qrbtc-api.vercel.app/api/score \
  -H "x-api-key: your-valid-key" \
  -H "Content-Type: application/json" \
  -d '{"labor": 9, "exchange": 8, "equality": 7, "presence": 8, "ratification": 9, "continuity": 8}'

# Invalid key
curl -X POST https://qrbtc-api.vercel.app/api/score \
  -H "x-api-key: invalid-key" \
  -H "Content-Type: application/json" \
  -d '{"labor": 9, "exchange": 8, "equality": 7, "presence": 8, "ratification": 9, "continuity": 8}'
```

### Test JWT Authentication

```bash
# Generate token (server-side)
var token = auth.generateJWT({
  passport_id: "test-id",
  tier: "free",
  scopes: ["score:write"]
});

# Use token
curl -X POST https://qrbtc-api.vercel.app/api/score \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" \
  -d '{"labor": 9, "exchange": 8, "equality": 7, "presence": 8, "ratification": 9, "continuity": 8}'
```

## Troubleshooting

### Common Issues

**1. CORS errors**
- Check `CORS_ORIGIN` environment variable
- Ensure preflight requests are handled
- Verify allowed headers configuration

**2. Rate limiting issues**
- Check `requests_limit` in database
- Verify `request_window_start` is current
- Review burst protection settings

**3. JWT validation failures**
- Verify `JWT_SECRET` matches between generation and verification
- Check token expiry time
- Ensure token format is correct

**4. Authentication failures**
- Verify API key hash matches database
- Check key is not revoked
- Ensure required scopes are assigned

## Performance Considerations

### Database Optimization
- Index `key_hash` column in `api_keys` table
- Index `passport_id` in `request_logs` table
- Consider caching frequently accessed keys

### Caching Strategy
- Cache JWT verification results
- Implement rate limit caching
- Use Redis for distributed rate limiting

### Monitoring
- Track authentication latency
- Monitor rate limit hit rates
- Alert on unusual authentication patterns

## Future Enhancements

1. **OAuth2 Integration** - Support for OAuth2 providers
2. **Multi-factor Authentication** - Optional 2FA for sensitive operations
3. **Token Refresh** - Automatic token refresh mechanism
4. **Advanced Rate Limiting** - Sliding window, token bucket algorithms
5. **Webhook Support** - Authentication event webhooks
6. **Audit Trail** - Enhanced audit logging with tamper detection