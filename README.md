# QRBTC-API

[![DOI](https://zenodo.org/badge/doi/10.5281%2Fzenodo.19749909.svg)](https://doi.org/10.5281/zenodo.19749909)

**Behavioral Identity Protocol** — trust scoring through verifiable, chain-linked sessions.

No tokens. No wallets. No blockchain gas fees. Just a cryptographic ledger of *what you actually did*.

## Architecture

| Service | Endpoints |
|---------|-----------|
| **Identity** | passport create / read |
| **Ledger** (core) | score, batch, history, verify, spiral |
| **Analytics** | tiers, leaderboard, stats, compare |
| **Governance** | revoke, health |

## Live Endpoint

    https://qrbtc-api.vercel.app

## API Reference

### Identity Service

**POST /api/passport** — Create a new identity passport.

    { "username": "shawn" }

Returns: passport_id, username, created_at

**GET /api/passport?id=UUID** — Read the full identity surface: weighted score, integrity, tier, spiral position, block count.

---

### Ledger Service

**POST /api/score** — Submit a session. Scores 6 pillars, chains the block to the previous hash, checks revocation status.

    {
      "passport_id": "UUID",
      "labor": 9,
      "exchange": 8,
      "equality": 7,
      "presence": 8,
      "ratification": 9,
      "continuity": 8
    }

Returns: score, degrees_delta, total_degrees, tier, session_hash, previous_hash

**POST /api/batch** — Submit multiple sessions at once.

    {
      "passport_id": "UUID",
      "sessions": [
        { "labor": 9, "exchange": 8, "equality": 7, "presence": 8, "ratification": 9, "continuity": 8 },
        { "labor": 6, "exchange": 5, "equality": 7, "presence": 6, "ratification": 5, "continuity": 6 }
      ]
    }

**GET /api/history?id=UUID** — Full block-by-block audit trail with hashes.

**GET /api/verify?id=UUID** — Walk the chain. Verify every previous_hash links to the prior block. Returns chain_intact: true/false and any breaks.

**GET /api/spiral?id=UUID** — Current spiral position: total degrees, revolutions, angle.

---

### Analytics Service

**GET /api/tiers** — List all tier thresholds.

    SEED         0-19
    APPRENTICE   20-39
    JOURNEYMAN   40-59
    MASTER       60-74
    SOVEREIGN    75-89
    LUMINARY     90-100

**GET /api/leaderboard?limit=N** — Top passports ranked by weighted score (exponential decay, 0.85 per rank). Default limit: 10, max: 100.

**GET /api/stats** — Network-wide aggregates: total passports, active/revoked, total sessions, average score, total degrees.

**POST /api/compare** — Compare two passports side by side.

    { "a": "UUID", "b": "UUID" }

---

### Governance Layer

**POST /api/revoke** — Freeze a passport. Stops all new block submissions. Chain remains intact but stops growing.

    { "passport_id": "UUID" }

**GET /api/health** — System pulse. Database connectivity, passport/session counts, version.

---

## Scoring Model

Six weighted pillars:

| Pillar | Weight |
|---------------|--------|
| Labor | 1.0 |
| Exchange | 1.2 |
| Equality | 1.1 |
| Presence | 1.3 |
| Ratification | 1.5 |
| Continuity | 1.4 |

Raw score is normalized to 0-1 trust, mapped to 0-360 degrees per block, accumulated as total degrees (spiral).

**Weighted score** uses exponential decay (0.85^n) — recent sessions matter more than old ones.

**Integrity** is standard deviation across all session scores — lower means more consistent behavior.

## Chain Integrity

Every session block contains:

- **session_hash** — SHA-256 of score + degrees + total + previous_hash + timestamp
- **previous_hash** — the session_hash of the prior block (or "genesis" for block 1)

Tamper with any block and every subsequent hash breaks. Verifiable via /api/verify.

## Setup

### Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in your credentials in `.env.local`:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_ANON_KEY` - Supabase anonymous key
   - `SUPABASE_SERVICE_KEY` - Supabase service role key (admin access)
   - `VERCEL_OIDC_TOKEN` - Vercel OIDC token for deployment
   - `QRBTC_API_KEY` - Your QRBTC API key for testing

### Security Notes

⚠️ **IMPORTANT**: Never commit `.env.local` or any files containing credentials to version control.

- `.env.local` is included in `.gitignore`
- Use `.env.example` as a template for required environment variables
- Rotate credentials if they were ever committed to git
- Use different keys for development and production

### Deployment

Deploy to Vercel:
```bash
vercel deploy
```

## Stack

- **Runtime:** Vercel serverless (free tier)
- **Database:** Supabase PostgreSQL (free tier)
- **Language:** Node.js (CommonJS)
- **Dependencies:** @supabase/supabase-js (only one)
- **Cost:** USD 0

## License

MIT
