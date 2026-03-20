# Restore Baseline Plan — Full e8ae7b6 Machine

**Objective:** Restore the complete deploy baseline from commit `e8ae7b6` as an exact snapshot. No hybrid, no new webhook/order/cap logic. Validate the machine first.

---

## Step 1: Preserve Current Work

Run from repo root `c:\dev\agnes-app`:

```powershell
cd c:\dev\agnes-app

# Stage all changes (modified, deleted, untracked)
git add -A

# Verify
git status

# Commit
git commit -m "webhook-complete: post-purchase sync, beta caps, lightening baseline"

# Create branch and tag
git branch webhook-complete-2026-03-19
git tag webhook-complete-2026-03-19

# Verify
git log -1 --oneline
git branch -v | Select-String "webhook-complete"
git tag -l "webhook-complete*"
```

---

## Step 2: Create Restore Branch and Restore Full Baseline

```powershell
cd c:\dev\agnes-app

# Create new branch from e8ae7b6 (exact snapshot of deploy baseline)
git checkout -b restore-baseline-2026-03-20 e8ae7b6

# Verify — working tree is now exactly e8ae7b6
git log -1 --oneline
# Should show: e8ae7b6 Stress test centralization, contest entry nav fix, signals spec, training video audit
```

**Result:** Branch `restore-baseline-2026-03-20` contains the full e8ae7b6 tree. No selective restore — the entire repo is e8ae7b6.

---

## Step 3: Follow-Up — Run Restored Baseline Locally

### 3.1 Install Dependencies

```powershell
cd c:\dev\agnes-app\agnes-next
npm install

cd c:\dev\agnes-app\deepquill
npm install
```

### 3.2 Database Setup

e8ae7b6 uses Prisma with SQLite. Both agnes-next and deepquill have their own `prisma/` folders. Use a shared DB or separate DBs per project.

**Option A — Shared DB (recommended for local):**

```powershell
# Ensure DATABASE_URL in both .env files points to same path, e.g.:
# agnes-next/.env: DATABASE_URL="file:./prisma/dev.db"
# deepquill/.env: DATABASE_URL="file:../agnes-next/prisma/dev.db"
# (or use absolute path)

cd c:\dev\agnes-app\agnes-next
npx prisma generate
npx prisma migrate dev
# Or if migrations fail: npx prisma db push

cd c:\dev\agnes-app\deepquill
npx prisma generate
# Schema should match; if deepquill has its own migrations, run them
```

**Option B — Fresh DB:**

```powershell
cd c:\dev\agnes-app\agnes-next
Remove-Item -Force prisma/dev.db -ErrorAction SilentlyContinue
npx prisma migrate dev
npx prisma generate

cd c:\dev\agnes-app\deepquill
npx prisma generate
# Point DATABASE_URL to agnes-next/prisma/dev.db if shared
```

### 3.3 Video Asset — Lightning.mp4

LighteningClient uses `src="/videos/lightning.mp4"` (lowercase). e8ae7b6 has `Lightning.mp4` (capital L). On case-sensitive hosts (e.g. Linux), this can 404.

**Fix (choose one):**

```powershell
# Option 1: Rename to match LighteningClient
cd c:\dev\agnes-app\agnes-next\public\videos
Rename-Item Lightning.mp4 lightning.mp4

# Option 2: Or edit LighteningClient.tsx to use "/videos/Lightning.mp4"
```

### 3.4 Webhook Testing (Local)

For checkout → webhook flow locally:

- **Option A:** Use Stripe CLI: `stripe listen --forward-to localhost:3002/api/stripe/webhook` (or deepquill URL if webhook hits deepquill directly)
- **Option B:** Use ngrok: expose agnes-next, set Stripe webhook URL to `https://your-ngrok.ngrok-free.app/api/stripe/webhook`

### 3.5 Env Vars

**agnes-next:**

- `DATABASE_URL` — path to SQLite DB
- `NEXT_PUBLIC_API_BASE_URL` — e.g. `http://localhost:5055` (deepquill)
- `NEXT_PUBLIC_TERMINAL_URL` — e.g. `http://localhost:5173` (Vite terminal)
- `NEXT_PUBLIC_SITE_URL` — for ngrok (optional)

**deepquill:**

- `DATABASE_URL` — path to SQLite DB (same as agnes-next if shared)
- `STRIPE_SECRET_KEY` — Stripe test key
- `STRIPE_WEBHOOK_SECRET` — for webhook verification
- `MAILCHIMP_TRANSACTIONAL_KEY` — for emails
- Price IDs: `STRIPE_PRICE_PAPERBACK`, `STRIPE_PRICE_EBOOK`, etc.

### 3.6 Start Services

**Terminal 1 — Deepquill Vite (terminal app, port 5173):**

```powershell
cd c:\dev\agnes-app\deepquill
npm run dev
```

**Terminal 2 — Deepquill Express (API, port 5055):**

```powershell
cd c:\dev\agnes-app\deepquill
npm run start-server
```

**Terminal 3 — Agnes-next (port 3002):**

```powershell
cd c:\dev\agnes-app\agnes-next
npm run dev
```

**Note:** Deepquill has two processes: `npm run dev` (Vite on 5173) and `npm run start-server` (Express on 5055). Run both in separate terminals.

---

## Step 4: Verification Checklist

Run through these flows to confirm the restored baseline matches the intended deploy experience.

### Entry Flow

| # | Action | Expected |
|---|--------|----------|
| 1 | Visit `http://localhost:3002` | Redirect to `/lightening` |
| 2 | Visit `http://localhost:3002/start` | Redirect to `/lightening` |
| 3 | Visit `http://localhost:3002/entry` | Redirect to `/lightening` |

### Lightening

| # | Action | Expected |
|---|--------|----------|
| 4 | On lightening page | CinematicVideo plays Lightning.mp4 |
| 5 | Click Continue (or wait for video end) | 3-way split: terminal, protocol, or contest |

### 3-Way Splitter

| # | Action | Expected |
|---|--------|----------|
| 6 | In incognito, lightening → Continue | Randomly lands on terminal, protocol, or contest |
| 7 | With `terminal_discovery_complete` cookie | 2-way split only (protocol or contest) |

### Terminal Flow

| # | Action | Expected |
|---|--------|----------|
| 8 | If terminal variant | Navigate to `/terminal-proxy` (Vite app loads) |
| 9 | Complete terminal discovery | 250 pts awarded; `terminal_discovery_complete` cookie set |

### Checkout Journey

| # | Action | Expected |
|---|--------|----------|
| 10 | From contest: click Buy → checkout | Stripe Checkout opens |
| 11 | Complete test payment (4242...) | Redirect to success URL |
| 12 | Webhook processes | Purchase, Customer, Ledger, ReferralConversion created |

### Congratulations Page

| # | Action | Expected |
|---|--------|----------|
| 13 | After checkout success | Thank-you / congratulations page |
| 14 | Purchase points | 500 pts in score |

### Email Experience

| # | Action | Expected |
|---|--------|----------|
| 15 | After purchase | Purchase confirmation email (if Mailchimp configured) |
| 16 | With referral | Referrer commission email |

### Score Behavior

| # | Action | Expected |
|---|--------|----------|
| 17 | Visit `/contest/score` | Points breakdown, purchase points visible |
| 18 | Session-based lookup | Score reflects purchase by session_id |

---

## Step 5: Troubleshooting

| Issue | Check |
|-------|-------|
| Lightning video 404 | Rename `Lightning.mp4` → `lightning.mp4` or fix path in LighteningClient |
| Terminal-proxy 503 | Ensure `npm run dev` in deepquill (Vite on 5173) is running |
| Webhook fails | STRIPE_WEBHOOK_SECRET, ngrok URL if testing locally |
| Score shows 0 | DB shared? Prisma migrate run? Purchase created by webhook? |
| Entry goes to contest only | LighteningClient + entryVariant restored; clear cookies |

---

## Summary of Commands (Copy-Paste)

```powershell
cd c:\dev\agnes-app

# 1. Preserve current work
git add -A
git commit -m "webhook-complete: post-purchase sync, beta caps, lightening baseline"
git branch webhook-complete-2026-03-19
git tag webhook-complete-2026-03-19

# 2. Create restore branch from e8ae7b6
git checkout -b restore-baseline-2026-03-20 e8ae7b6

# 3. Install and setup
cd agnes-next; npm install; npx prisma generate; npx prisma migrate dev; cd ..
cd deepquill; npm install; npx prisma generate; cd ..

# 4. Fix video path (if needed)
# Rename-Item agnes-next/public/videos/Lightning.mp4 lightning.mp4

# 5. Start services (3 terminals)
# Terminal 1: cd deepquill; npm run dev
# Terminal 2: cd deepquill; npm run start-server
# Terminal 3: cd agnes-next; npm run dev
```
