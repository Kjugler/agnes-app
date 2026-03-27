# Storage System Of Record

## Canonical Source Of Truth

`deepquill` on Railway is the sole canonical mutable datastore for production.

This means all business state that can change over time must be owned by deepquill:
- users and identity
- contest state, points, ledger
- purchases, referrals, conversions
- signal room data (signals, replies, comments, moderation/reviews)

`agnes-next` must not become a second canonical database for production business state.

## Storage Ownership

### Deepquill / Railway owns
- Prisma schema and migrations for canonical business data
- Canonical read/write API routes for mutable state
- Integrity/business rules for contest, referrals, purchases, and signal room

### Agnes-next / Vercel owns
- Frontend rendering, routing, middleware, user interaction
- Proxy routes that forward canonical business operations to deepquill
- Non-canonical UI/session convenience state

### Blob/static media storage owns
- Immutable media assets (videos, PDFs, images, training files)
- Delivery URLs for static content

Blob/static storage must not be treated as canonical business database state.

## Launch-Safety Guardrail

For production safety:
- Prefer `deepquill` proxy routes for canonical state (`/api/points/me`, contest/signal/referral routes proxied to deepquill).
- Keep local frontend DB debug/legacy endpoints disabled in production.
- Avoid adding new production routes in `agnes-next` that write/read canonical mutable business state directly via local Prisma.

## Drift Warning

Stale duplicate storage (frontend-local DB artifacts, old blob DB assumptions, parallel schemas) can cause split-brain behavior.

If a new feature needs mutable business data:
1. Implement canonical write/read in deepquill first.
2. Expose via deepquill API.
3. Consume in agnes-next via proxy or server fetch to deepquill.
