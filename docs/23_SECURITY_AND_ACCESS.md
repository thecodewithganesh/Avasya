# 23 — Security & Access

## Auth model (dual-mode, no silent fallback)

```
request arrives
   ├─ Bearer JWT present?  → verify HS256 (Supabase secret), aud=authenticated, exp, sub
   │      valid   → resolve/auto-provision user (role-less) → RBAC applies
   │      invalid → 401 (even if a demo header is also present — never silently degrade)
   └─ no Bearer?  → X-Officer-Email demo header (MVP/demo mode)
```

- Auto-provisioned users are **role-less** (`SUPABASE_AUTO_PROVISION=true`): a valid login can't approve anything until an admin grants officer — RBAC untouched.
- 9 auth tests cover: valid JWT, tampered, expired, unconfigured-secret, and demo-header regression.

## Secrets placement

| Secret | Lives in |
|---|---|
| `SUPABASE_JWT_SECRET`, service-role key, `DATABASE_URL` | backend env only |
| Supabase **anon** key, public URL | frontend (safe by design) |
| LLM model path / CLI path | backend env only |

## RBAC

Officer / analyst / admin roles gate mutating routes (approvals, overrides, ingestion). Read endpoints are open in demo mode, behind auth when Supabase is enabled.

## Audit

Every approval/override writes to the audit table (actor, action, entity, payload, timestamp) — the officer action trail is immutable and reviewable.

## Known MVP gaps (documented)

No rate limiting, no refresh-token rotation, demo header accepts any well-formed email. All tracked for post-MVP (`30_FUTURE_SCALING_PLAN.md` Phase 7/8).
