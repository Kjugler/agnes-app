# Deployment Readiness Report

**Date:** 2025-03-21  
**Objective:** Prepare current architecture for production deployment without redesigning flow or UX.

---

## 1. Executive Summary

| Status | Count |
|--------|-------|
| Blockers | 2 |
| Warnings | 4 |
| Minimal fixes applied | 3 |

The codebase has solid production hardening (admin keys, debug routes, rate limiting) but relies on **SQLite** and **file-based databases**, which are incompatible with Vercel serverless. Deploy to **Railway** or **Render** with persistent disk, or migrate to **Neon/Postgres** before Vercel.

---

## 2. Environment / Config Readiness

### 2.1 Required Environment Variables

#### agnes-next (Vercel or similar)

| Variable | Required | Production | Notes |
|----------|----------|------------|-------|
| `NEXT_PUBLIC_SITE_URL` | Yes | Yes | Throws in production if missing (share layout, getSiteUrl) |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | Yes | Deepquill URL for proxy; defaults to localhost:5055 |
| `DEEPQUILL_URL` | Yes* | Yes | Server-side deepquill URL (admin routes); *same as above in most setups |
| `DATABASE_URL` | Yes | Yes | See §2.4 – SQLite won't work on Vercel |
| `ADMIN_KEY` | Yes | Yes | Required for admin/moderation; set in both apps |
| `STRIPE_WEBHOOK_SECRET` | Yes | Yes | From Stripe Dashboard for production webhook |

#### deepquill (Railway/Render)

| Variable | Required | Production | Notes |
|----------|----------|------------|-------|
| `DATABASE_URL` | Yes | Yes | Postgres URL for Neon/Railway; SQLite for local |
| `STRIPE_SECRET_KEY` | Yes | Yes | Env validates format on boot |
| `STRIPE_WEBHOOK_SECRET` | Yes | Yes | Webhook verification |
| `ADMIN_KEY` | Yes | Yes | Must match agnes-next |
| `SITE_URL` | Yes | Yes | For emails, redirects; falls back to localhost in dev only |
| `PORT` | No | Auto | Railway/Render set; fallback 5055 for local |
| `FULFILLMENT_DATABASE_URL` | No | Optional | When Order in separate DB |

### 2.2 ADMIN_KEY Alignment

- **agnes-next** sends `x-admin-key` to deepquill for: points/award (proxy), approve-signal, approve-review, approve-all, signal/create, reviews/create.
- **deepquill** `api/points/award.cjs` checks `ADMIN_KEY`.
- **Action:** Set `ADMIN_KEY` to the same value in both apps. In production without it, award/admin routes return 403.

### 2.3 Deepquill Base URLs

| Consumer | Env var | Default | Production |
|----------|---------|---------|------------|
| agnes-next proxy (deepquillProxy) | `NEXT_PUBLIC_API_BASE_URL` | localhost:5055 | `https://deepquill.railway.app` (or equivalent) |
| agnes-next admin routes | `DEEPQUILL_URL` | localhost:5055 | Same as above |
| agnes-next refer route | `NEXT_PUBLIC_API_BASE_URL` | localhost:5055 | Same |
| agnes-next refer-friend | `DEEPQUILL_API_BASE` | localhost:5055 | Same |

**Recommendation:** Use one env (`NEXT_PUBLIC_API_BASE_URL`) and, where needed, alias to `DEEPQUILL_URL` so both point to the same URL.

### 2.4 Stripe Keys / Webhook

- Stripe webhook is received at **agnes-next** `/api/stripe/webhook`, which proxies to deepquill.
- Production: Point Stripe Dashboard to `https://your-agnes-domain.com/api/stripe/webhook`.
- `STRIPE_WEBHOOK_SECRET` must be set in deepquill for verification.
- Agnès-next does not hold Stripe secrets (proxy-only).

### 2.5 Cookie / Session / Domain

- Contest login sets `contest_user_id`, `contest_email`, `user_email` with:
  - `secure: true` when origin is HTTPS (and not localhost)
  - `sameSite: 'lax'`
  - `path: '/'`
- Domain is not set (current origin). For subdomain setups, consider explicit domain.

### 2.6 Database Connection Assumptions

| App | Current | Production (Vercel) | Production (Railway) |
|-----|---------|---------------------|----------------------|
| agnes-next | SQLite file | Not supported | Use Postgres (Neon) or persistent disk |
| deepquill | SQLite file | N/A (serverful) | Use Postgres or persistent disk |

**Blocker:** Vercel serverless uses ephemeral filesystem. SQLite `file:./dev.db` will not persist. Options:
1. Deploy agnes-next to Railway/Render (persistent disk).
2. Migrate both apps to Postgres (Neon) + Prisma provider change.

---

## 3. Production Breakpoints

### 3.1 Will Break on Vercel (agnes-next)

| Issue | Severity | Mitigation |
|-------|----------|------------|
| SQLite file DB | Blocker | Migrate to Neon/Postgres or deploy to Railway |
| In-memory rate limiting | Warning | Replace with Redis/Vercel KV or Upstash |
| `kill-port` in predev | Warning | Dev-only; remove or guard for prod |

### 3.2 Local / Dev Assumptions in Code

| Location | Assumption | Impact |
|----------|------------|--------|
| `contest/score` route | `new URL(..., 'http://localhost:5055')` | Harmless – only used for path construction; actual request uses `API_BASE_URL` |
| `deepquillProxy.ts` | `NEXT_PUBLIC_API_BASE_URL \|\| 'http://localhost:5055'` | Dev default; must be set in production |
| Various | `DEEPQUILL_URL \|\| 'http://localhost:5055'` | Same; must be set in production |
| `contest/login` CORS | Localhost origins allowed | Correct; production origins must be explicit |

### 3.3 Routes Requiring Special Production Config

| Route | Config | Notes |
|-------|--------|-------|
| `/api/admin/moderation/*` | `ADMIN_KEY` + `x-admin-key` | 403 without valid key in prod |
| `/api/debug/*` | N/A | Returns 404 in production |
| `/api/contest/login` | CORS origins | Add production domain to allowed origins |
| `/api/track` | CORS | Same |
| `/api/stripe/webhook` | Stripe webhook URL | Must be production URL in Stripe Dashboard |

---

## 4. Files Changed

| File | Change |
|------|--------|
| `deepquill/server/index.cjs` | Use `process.env.PORT \|\| 5055` for Railway/Render |
| `agnes-next/.env.local.example` | Added `NEXT_PUBLIC_API_BASE_URL`, `DEEPQUILL_URL` production placeholders |
| `deepquill/.env.example` | Added `PORT` comment for production |

---

## 5. Blockers

| # | Blocker | Resolution |
|---|---------|------------|
| 1 | **SQLite on Vercel** | Deploy agnes-next to Railway/Render, or migrate to Postgres (Neon) |
| 2 | **SQLite for deepquill** | Use Postgres (Neon) or persistent volume on Railway/Render |

---

## 6. Warnings

| # | Warning | Notes |
|---|---------|------|
| 1 | Rate limiting is in-memory | Won't work across serverless instances; use Redis/Vercel KV |
| 2 | `NEXT_PUBLIC_*` baked at build time | Set env vars before Vercel build |
| 3 | Stripe webhook must reach agnes-next | Ensure URL is reachable; ngrok for local testing |
| 4 | Two databases (agnes-next + deepquill) | FULFILLMENT_DATABASE_URL when Order lives in agnes-next DB |

---

## 7. Recommended Deployment Order

1. **Provision databases**
   - Neon Postgres (or Railway Postgres) for deepquill.
   - If agnes-next keeps SQLite, deploy to Railway with persistent disk; else same Postgres.

2. **Deploy deepquill**
   - Railway or Render.
   - Set `DATABASE_URL`, `STRIPE_*`, `ADMIN_KEY`, `SITE_URL`.
   - Start command: `node server/index.cjs` or `npm run start-server`.
   - Confirm `PORT` is used (now reads from env).

3. **Deploy agnes-next**
   - Vercel (only after Postgres migration) or Railway.
   - Set `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, `DEEPQUILL_URL`, `ADMIN_KEY`, `DATABASE_URL`.

4. **Configure Stripe**
   - Add production webhook URL.
   - Update `STRIPE_WEBHOOK_SECRET` in deepquill.

5. **Smoke test**
   - Use checklist below.

---

## 8. Production Smoke Test Checklist

```markdown
## Pre-deploy
- [ ] DATABASE_URL points to production DB (not local file)
- [ ] ADMIN_KEY set in both apps (same value)
- [ ] NEXT_PUBLIC_API_BASE_URL = deepquill production URL
- [ ] NEXT_PUBLIC_SITE_URL = agnes-next production URL
- [ ] STRIPE_WEBHOOK_SECRET = production webhook secret
- [ ] Stripe Dashboard webhook URL = https://your-domain.com/api/stripe/webhook

## Post-deploy
- [ ] Homepage loads
- [ ] Contest entry: enter email → redirect works
- [ ] Contest score: score displays (no 503)
- [ ] Create checkout session: redirects to Stripe
- [ ] (Optional) Complete test purchase: webhook → points awarded
- [ ] Admin without key: 403
- [ ] /api/debug/prisma: 404
```

---

## 9. Dead-Code / Legacy Cleanup Watchlist

| Item | Location | Risk | Action |
|------|----------|------|--------|
| GET `/api/points` | agnes-next | Low | No remaining callers (CurrentScoreButton uses contest/score). Consider deprecation. |
| ordersStore / orders.cjs / adminOrders | deepquill | Low | Legacy JSON store; fulfillment uses Prisma. Future cleanup. |
| useScore hook | agnes-next | Low | Unused by ScoreClient; retained for possible future use. |
| me/score endpoint | agnes-next | Low | No client consumers; both proxy to points/me. |

---

## 10. Summary

- **Minimal fixes:** deepquill PORT, env example updates.
- **Blockers:** SQLite on serverless (Vercel).
- **Deployment path:** Railway/Render for both apps with Postgres or persistent disk, or migrate to Postgres first.
- **Smoke test:** Use checklist above after deploy.
