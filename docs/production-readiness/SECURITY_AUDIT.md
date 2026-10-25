# Security claims and measured coverage

Scope: source review and local tests; production secrets/configuration, deployed controls and live-user security are not verified.

| Claim | Classification | Evidence / missing proof |
|---|---|---|
| HS256/RS256/ES256 verification | Implemented; finite local test coverage | server/auth.mjs; signature, issuer, audience, exp/iat/nbf checks; production JWKS rotation/provider behavior unverified |
| Session and account revocation | Implemented and locally tested | E02/E12 and import-012-regressions; D1 session lookup fails closed on errors |
| Edge header stripping | Implemented and locally tested | server/cloudflare-entry.mjs; imported public-edge regression tests |
| Tenant isolation and anonymous claim | Implemented and locally tested | ownership, racing claims, IDOR and deletion tests; not a formal isolation proof |
| Rate limiting | Partially implemented | in-memory Map in server/auth.mjs is per isolate; no global quota proof |
| Input/body limits | Implemented and locally tested | server/worker.mjs rejects request bodies above 40,000 UTF-8 bytes, not the old report's claimed 2 MB |
| Idempotency and atomic revision checks | Implemented and locally tested | store.batch gates, concurrent first-write and replay regression tests |
| Refresh lifecycle | Missing/unverified | no /v1/auth/refresh; production provider integration remains open |
| Sensitive logging | Implemented with finite local coverage | logger allowlist/redaction assertions; actual production log retention/access controls unverified |
| Encrypted scheduled backups | Unsupported operational claim | no scripts/backup-d1.mjs or deployed scheduler/key-recovery proof; a separate local synthetic encrypted restore drill is verified |
| External monitoring/alerts | Unsupported deployment claim | no evidence for old report's five-location minute-by-minute monitors |

The historical SECURITY_REPORT.md also names issuer/audience values different from source defaults. Actual values are environment-configured; a report cannot establish deployment configuration. No generative-AI feature was evaluated or changed. No clinical safety or zero-leakage guarantee is established.
