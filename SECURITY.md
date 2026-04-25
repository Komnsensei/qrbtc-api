# Security Guidelines

## Credential Management

### Environment Variables
- Never commit `.env.local` or any files containing real credentials
- Use `.env.example` as a template for required environment variables
- Rotate credentials immediately if they were ever exposed
- Use different credentials for development, staging, and production

### API Keys
- API keys are stored hashed in the database (`api_keys` table)
- Never log or expose raw API keys in responses
- Implement key rotation policies
- Use scoped permissions (e.g., `score:write`, `ledger:read`)

## Authentication & Authorization

### Current Implementation
- API key-based authentication via `lib/auth.js`
- Scope-based access control
- Passport revocation support

### Security Best Practices
- Always validate authentication before processing requests
- Check user permissions for each operation
- Implement rate limiting per API key
- Log authentication failures for monitoring

## Input Validation

### Required Validations
- Validate all user inputs before processing
- Sanitize data to prevent injection attacks
- Validate data types and ranges
- Check for required fields

### Examples
```javascript
// Validate score inputs (0-10 range)
if (score < 0 || score > 10) {
  return res.status(400).json({ error: "Score must be between 0 and 10" });
}
```

## Chain Integrity

### Hash Verification
- Every block contains `session_hash` and `previous_hash`
- Use `/api/verify` to check chain integrity
- Tamper detection breaks the entire chain

### Security Considerations
- Hash inputs include timestamp to prevent replay attacks
- Chain is immutable once created
- Revoked passports stop accepting new blocks

## Rate Limiting

### Recommended Limits
- Free tier: 1000 requests per day
- Builder tier: 10,000 requests per day
- Pro tier: 100,000 requests per day
- Sovereign tier: Unlimited

### Implementation
- Implement per-IP rate limiting
- Implement per-API-key rate limiting
- Use exponential backoff for rate limit errors

## Monitoring & Logging

### What to Log
- Authentication attempts (success/failure)
- API usage per key
- Error rates and types
- Chain verification failures

### Security Events
- Monitor for unusual patterns
- Alert on authentication failures
- Track revoked passport access attempts
- Monitor for API abuse

## Deployment Security

### Vercel Configuration
- Use environment variables for all secrets
- Enable Vercel's built-in security features
- Configure proper CORS settings
- Use HTTPS only

### Database Security
- Use Supabase Row Level Security (RLS)
- Limit service key usage to server-side code
- Regular database backups
- Monitor database access logs

## Incident Response

### If Credentials Are Exposed
1. Immediately rotate all exposed credentials
2. Review access logs for suspicious activity
3. Notify affected users if necessary
4. Update documentation and procedures

### Chain Tampering
1. Use `/api/verify` to identify broken blocks
2. Review audit logs for the time period
3. Consider passport revocation if severe
4. Document the incident for future prevention

## Compliance

### Data Protection
- User data stored in Supabase (GDPR compliant)
- Implement data deletion requests
- Regular security audits
- Privacy policy documentation

### API Security
- OWASP API Security Top 10 compliance
- Regular dependency updates
- Security testing in CI/CD
- Bug bounty program consideration
