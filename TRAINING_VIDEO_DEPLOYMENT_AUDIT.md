# Training Video Deployment Audit

**Date:** Audit completed (no code changes)  
**Scope:** References to `/training/` assets; SITE_URL usage across email, referral, share, and redirect flows.

---

## 1. Training Video References

### Every page/component/file that references `/training/`

| File Path | Current Asset Path(s) | Public-Facing in Beta? |
|-----------|------------------------|------------------------|
| `agnes-next/src/app/share/fb/[variant]/instructions/page.tsx` | `/training/fb-instructions-iPhone.mp4` (iOS)<br>`/training/fb-instructions-android.mp4` (Android) | ✔ Yes — share instructions |
| `agnes-next/src/app/share/x/[variant]/instructions/page.tsx` | `/training/x-instructions-iPhone.mp4` (iOS)<br>`/training/x-instructions-android.mp4` (Android) | ✔ Yes |
| `agnes-next/src/app/share/tt/[variant]/instructions/page.tsx` | `/training/tt-instructions-ios.mp4` (iOS)<br>`/training/tt-instructions-android.mp4` (Android) | ✔ Yes |
| `agnes-next/src/app/share/ig/[variant]/instructions/page.tsx` | `/training/ig-instructions-ios.mp4` (iOS only) | ✔ Yes |
| `agnes-next/src/app/contest/share/tiktok/TikTokShareClient.tsx` | `/training/jody-tiktok-training.mp4` (via `JodyTrainingModal` `videoSrc`) | ✔ Yes — contest TikTok share flow |
| `agnes-next/src/app/contest/share/truth/TruthShareClient.tsx` | `/training/jody-truth-training.mp4` (via `JodyTrainingModal` `videoSrc`) | ✔ Yes — contest Truth share flow |
| `agnes-next/src/components/JodyAssistant.tsx` | `/training/jody-ig-training.mp4` (IG variant) | ✔ Yes — shown in share/contest flows |

### Summary of Training Assets Referenced

| Asset | Used By |
|-------|---------|
| fb-instructions-iPhone.mp4 | fb instructions page |
| fb-instructions-android.mp4 | fb instructions page |
| x-instructions-iPhone.mp4 | x instructions page |
| x-instructions-android.mp4 | x instructions page |
| tt-instructions-ios.mp4 | tt instructions page |
| tt-instructions-android.mp4 | tt instructions page |
| ig-instructions-ios.mp4 | ig instructions page |
| jody-tiktok-training.mp4 | TikTokShareClient (JodyTrainingModal) |
| jody-truth-training.mp4 | TruthShareClient (JodyTrainingModal) |
| jody-ig-training.mp4 | JodyAssistant (IG variant) |

**All 10 training assets** are used in public-facing flows (share instructions, contest share modals, Jody assistant).

---

## 2. Centralization vs Hardcoding

**Current state: HARDCODED across multiple components.**

- No shared config or helper for training video URLs.
- Each of the 7 files above embeds the path string directly.
- `shareAssets.ts` and `referVideos.ts` centralize `/videos/` paths — but **not** `/training/`.
- Training paths are scattered with no single source of truth.

---

## 3. Proposed Safest Low-Risk Change

### One shared mapping/config for training video URLs

**Create:** `agnes-next/src/config/trainingVideos.ts` (or `lib/trainingVideos.ts`)

```ts
// Map keys to external URLs when TRAINING_VIDEO_BASE_URL is set
// Fallback to relative /training/... for local dev (when files exist)
export const TRAINING_VIDEO_KEYS = {
  FB_INSTRUCTIONS_IOS: 'fb-instructions-iPhone.mp4',
  FB_INSTRUCTIONS_ANDROID: 'fb-instructions-android.mp4',
  X_INSTRUCTIONS_IOS: 'x-instructions-iPhone.mp4',
  X_INSTRUCTIONS_ANDROID: 'x-instructions-android.mp4',
  TT_INSTRUCTIONS_IOS: 'tt-instructions-ios.mp4',
  TT_INSTRUCTIONS_ANDROID: 'tt-instructions-android.mp4',
  IG_INSTRUCTIONS_IOS: 'ig-instructions-ios.mp4',
  JODY_TIKTOK: 'jody-tiktok-training.mp4',
  JODY_TRUTH: 'jody-truth-training.mp4',
  JODY_IG: 'jody-ig-training.mp4',
} as const;

export function getTrainingVideoUrl(key: keyof typeof TRAINING_VIDEO_KEYS): string {
  const base = process.env.NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL;
  const filename = TRAINING_VIDEO_KEYS[key];
  if (base) {
    return `${base.replace(/\/$/, '')}/${filename}`;
  }
  return `/training/${filename}`;
}
```

**Env var:** `NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL` — e.g. `https://cdn.example.com/agnes-training` or Vercel Blob / S3 / CDN.

**Edits required:**
- 7 files switch from hardcoded `/training/...` to `getTrainingVideoUrl('KEY')`.
- Minimal, localized changes.
- **No impact on public/videos** — shareAssets, referVideos, and `/videos/` paths stay as-is.

**Deploy flow:**
1. Upload training videos to external host (CDN, Vercel Blob, S3, etc.).
2. Set `NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL` in Vercel (or .env) to that base URL.
3. No training files in repo or Vercel bundle.

---

## 4. SITE_URL / NEXT_PUBLIC_SITE_URL Usage

### Email links

| Location | Purpose |
|----------|---------|
| `deepquill/server/routes/referFriend.cjs` | `siteRoot` (APP_BASE_URL \|\| SITE_ROOT) — referral link in email: `${siteRoot}/start?ref=...`, video URL: `${siteRoot}/videos/${vidId}.mp4` |
| `deepquill/api/referrals/invite.cjs` | `siteUrl` (origin or envConfig.SITE_URL) — referral URL: `new URL('/refer', siteUrl)`, thumbnail URL: `new URL(thumbnailPath, siteUrl)` |
| `agnes-next/src/lib/email/associateCommission.ts` | `siteUrl` (NEXT_PUBLIC_SITE_URL \|\| SITE_URL) — payout preferences link in commission email |

### Referral links

| Location | Purpose |
|----------|---------|
| `deepquill/server/routes/referFriend.cjs` | `siteRoot` — `/start?ref=...` and `/videos/{videoId}.mp4` in referral emails |
| `deepquill/api/referrals/invite.cjs` | `siteUrl` — `/refer?code=...&v=...&src=email` |
| `agnes-next/src/app/api/refer/route.ts` | `NEXT_PUBLIC_SITE_URL` — redirect/fetch for referral flow |

### Share links

| Location | Purpose |
|----------|---------|
| `agnes-next/src/app/share/[platform]/[variant]/layout.tsx` | `BASE_URL` (NEXT_PUBLIC_SITE_URL \|\| SITE_URL) — OG meta, share URLs |
| `agnes-next/src/app/share/fb/[variant]/instructions/page.tsx` | `baseUrl` (window.origin \|\| NEXT_PUBLIC_SITE_URL) — buildTrackingLink, buildFbPreviewUrl |
| `agnes-next/src/app/share/x/[variant]/instructions/page.tsx` | Same pattern |
| `agnes-next/src/app/share/tt/[variant]/instructions/page.tsx` | Same pattern |
| `agnes-next/src/app/share/ig/[variant]/instructions/page.tsx` | Same pattern |
| `agnes-next/src/app/share/truth/[variant]/instructions/page.tsx` | Same pattern |
| `agnes-next/src/app/share/[platform]/[variant]/ShareLandingClient.tsx` | `baseUrl` |
| `agnes-next/src/lib/shareHelpers.ts` | `buildTrackingLink`, `buildShareUrl`, `buildFbPreviewUrl` — receive `baseUrl` from callers |
| `agnes-next/src/lib/shareCaption.ts` | `SITE_ROOT` (NEXT_PUBLIC_SITE_ROOT) — link in share captions |

### Redirect logic

| Location | Purpose |
|----------|---------|
| `deepquill/api/create-checkout-session.cjs` | `envConfig.SITE_URL` — success/cancel redirect URLs for Stripe checkout |
| `agnes-next/src/app/api/contest/login/route.ts` | `siteUrl` — CORS / redirect validation |
| `deepquill/api/stripe-webhook.cjs` | `siteUrl` / `APP_BASE_URL` — various post-purchase redirects |

### Other

| Location | Purpose |
|----------|---------|
| `deepquill/scripts/process-fulfillments.cjs` | `envConfig.SITE_URL` — eBook download URL: `${SITE_URL}/api/ebook/download?token=...` |
| `agnes-next/src/lib/urls.ts` | `absoluteUrl()` — uses NEXT_PUBLIC_SITE_URL / SITE_URL to build absolute URLs |
| `agnes-next/src/app/api/track/route.ts` | Default origin for tracking |

---

## 5. Training vs Public Videos

| Folder | Status | Notes |
|--------|--------|-------|
| `public/videos/` | Tracked, deployable | Used by shareAssets, referVideos, referFriend email video links — all under 100MB |
| `public/training/` | Ignored, not deployable | Several files >100MB; need external hosting |

**Recommendation:** Introduce `NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL` only for training. Leave SITE_URL / NEXT_PUBLIC_SITE_URL logic unchanged for emails, referrals, shares, and redirects.
