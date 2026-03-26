# Stress Test Messaging Audit

**Date:** Audit completed (analysis only, no code changes)  
**Scope:** All outbound email templates, social share scripts, and environment toggle usage.

---

## 1. EMAIL TEMPLATES

### Invite Friend / Referral Emails

| Email Name | File Path | Stress Test Message Present? | Subject Prefix Present? |
|------------|-----------|------------------------------|-------------------------|
| **Referral Email (Mailchimp)** | `agnes-next/src/lib/email/referralEmail.ts` | ✔ Present | ✔ Present |
| **Referral Email (SendReferralEmail - SMTP)** | `agnes-next/src/lib/email/sendReferralEmail.ts` | ❌ Missing | ❌ Missing |
| **Referral Invite (deepquill)** | `deepquill/api/referrals/invite.cjs` | ❌ Missing | ❌ Missing |
| **Refer Friend (deepquill)** | `deepquill/server/routes/referFriend.cjs` | ❌ Missing | ❌ Missing |

### Referral Purchase Notification

| Email Name | File Path | Stress Test Message Present? | Subject Prefix Present? |
|------------|-----------|------------------------------|-------------------------|
| **Commission Earned (agnes-next)** | `agnes-next/src/lib/email/associateCommission.ts` | ✔ Present | ❌ Missing (subject not passed to applyGlobalEmailBanner) |
| **Referrer Commission (deepquill)** | `deepquill/api/stripe-webhook.cjs` → `referrerCommissionEmail.cjs` | ✔ Present | ✔ Present |

### Purchase Confirmation

| Email Name | File Path | Stress Test Message Present? | Subject Prefix Present? |
|------------|-----------|------------------------------|-------------------------|
| **Purchase Confirmation (deepquill)** | `deepquill/api/stripe-webhook.cjs` → `purchaseEmail.cjs` | ✔ Present | ✔ Present |
| **Order Confirmation (agnes-next)** | `agnes-next/src/lib/email/orderConfirmation.ts` | ❌ Missing | ❌ Missing |
| **Note:** agnes-next orderConfirmation.ts is **dead code** — never imported or invoked. Purchase flow uses deepquill. |

### Shipping Confirmation

| Email Name | File Path | Stress Test Message Present? | Subject Prefix Present? |
|------------|-----------|------------------------------|-------------------------|
| **Shipping Confirmation** | `agnes-next/src/lib/email/shippingConfirmation.ts` | ❌ Missing | ❌ Missing |

### eBook Fulfillment

| Email Name | File Path | Stress Test Message Present? | Subject Prefix Present? |
|------------|-----------|------------------------------|-------------------------|
| **eBook Fulfillment** | `deepquill/scripts/process-fulfillments.cjs` → `fulfillmentEmail.cjs` | ✔ Present | ✔ Present |

### Contest Entry Confirmation

| Email Name | File Path | Stress Test Message Present? | Subject Prefix Present? |
|------------|-----------|------------------------------|-------------------------|
| **Contest Entry Confirmation** | N/A | N/A | N/A |
| **Note:** No contest entry confirmation email exists. Contest entry is form-only; no email is sent. |

### Scoreboard / Reminder Emails (Admin Jobs)

| Email Name | File Path | Stress Test Message Present? | Subject Prefix Present? |
|------------|-----------|------------------------------|-------------------------|
| **No Purchase Reminder** | `agnes-next/src/app/api/admin/jobs/send-no-purchase-reminders/route.ts` | ✔ Present | ❌ Missing (subject not passed to applyGlobalEmailBanner) |
| **Non-Participant Reminder** | `agnes-next/src/app/api/admin/jobs/send-non-participant-reminders/route.ts` | ✔ Present | ❌ Missing |
| **Engaged Reminder** | `agnes-next/src/app/api/admin/jobs/send-engaged-reminders/route.ts` | ✔ Present | ❌ Missing |
| **Missionary Email** | `agnes-next/src/app/api/admin/jobs/send-missionary-emails/route.ts` | ✔ Present | ❌ Missing |

### Daily Referral Digest

| Email Name | File Path | Stress Test Message Present? | Subject Prefix Present? |
|------------|-----------|------------------------------|-------------------------|
| **Daily Referral Digest** | `deepquill/lib/email/sendDailyReferralDigestEmail.cjs` | ❌ Missing | ❌ Missing |
| **Note:** Uses nodemailer.sendMail directly; bypasses sendEmail wrapper and banner. |

### Help Request (Internal)

| Email Name | File Path | Stress Test Message Present? | Subject Prefix Present? |
|------------|-----------|------------------------------|-------------------------|
| **Help Request** | `agnes-next/src/app/api/help/route.ts` | N/A | N/A |
| **Note:** Internal support email; no user-facing banner needed. |

---

## 2. SUBJECT PREFIX LOGIC

### Where Subject Lines Are Generated

- **agnes-next:** `applyGlobalEmailBanner()` in `agnes-next/src/lib/emailBanner.ts` adds `[PUBLIC BETA TEST]` prefix when `subject` is passed.
- **deepquill:** `applyGlobalEmailBanner()` in `deepquill/src/lib/emailBanner.cjs` adds `[PUBLIC BETA TEST]` prefix when `subject` is passed.

### Automatic Injection

- **Yes:** When `applyGlobalEmailBanner({ html, text, subject })` is called with `subject`, the prefix is added.
- **No:** When callers pass only `{ html }` (e.g., admin job routes), the subject is never modified.

### Templates That Bypass Logic

1. **Referral invite (deepquill)** — `referFriend.cjs` and `invite.cjs` use `transporter.sendMail()` directly; no banner.
2. **Referral (sendReferralEmail.ts)** — Uses nodemailer directly; no banner.
3. **Daily digest** — Uses nodemailer directly; no banner.
4. **Order confirmation (agnes-next)** — Dead code; no banner.
5. **Shipping confirmation** — Uses Mailchimp directly; no banner.
6. **Associate commission** — Calls `applyGlobalEmailBanner({ html, text })` but **not** `subject`; subject never prefixed.

---

## 3. SOCIAL SHARE SCRIPTS

### Share Caption Source

| File | Purpose | Beta Message Present? |
|------|---------|------------------------|
| `agnes-next/src/lib/shareCaption.ts` | Single source for X, TT, IG, Truth share captions | ❌ Missing |

### Share Caption Content (Current)

- **X:** `The internet isn't ready for this. *The Agnes Protocol* 15% off with code ${refCode} ${SITE_ROOT} #TheAgnesProtocol`
- **TT/IG/Truth:** `The internet isn't ready for this. *The Agnes Protocol* is exploding online. Use my code ${refCode} for 15% off and a chance to win a 6-day family cruise. ${SITE_ROOT} #TheAgnesProtocol #WhereIsJodyVernon`

**Expected stress test text:** `Public beta test – simulated purchases only` or equivalent.

### Share Instructions Pages

| Platform | File | Beta Message in Caption? |
|----------|------|--------------------------|
| Facebook | `agnes-next/src/app/share/fb/[variant]/instructions/page.tsx` | ❌ Uses buildShareCaption |
| X | `agnes-next/src/app/share/x/[variant]/instructions/page.tsx` | ❌ Uses buildShareCaption |
| TikTok | `agnes-next/src/app/share/tt/[variant]/instructions/page.tsx` | ❌ Uses buildShareCaption |
| Instagram | `agnes-next/src/app/share/ig/[variant]/instructions/page.tsx` | ❌ Uses buildShareCaption |
| Truth | `agnes-next/src/app/share/truth/[variant]/instructions/page.tsx` | ❌ Uses buildShareCaption |

### Copy-Link / Preview Link

- Share instructions use `buildShareCaption()` for copy-to-clipboard.
- No stress test variant exists.

---

## 4. ENVIRONMENT TOGGLE USAGE

### STRESS_TEST_MODE / NEXT_PUBLIC_STRESS_TEST_MODE

| Location | Flag | Purpose |
|----------|------|---------|
| `agnes-next/src/lib/emailConfig.ts` | `STRESS_TEST_MODE` | `shouldApplyEmailTestBanner()` — controls email banner |
| `agnes-next/src/components/StressTestBanner.tsx` | Both | Show/hide global banner |
| `agnes-next/src/components/StressTestLayoutWrapper.tsx` | Both | Layout padding when banner shown |
| `agnes-next/src/components/ContestEntryForm.tsx` | `NEXT_PUBLIC_STRESS_TEST_MODE` | Beta acknowledgment checkbox |
| `agnes-next/src/app/catalog/CatalogClient.tsx` | `NEXT_PUBLIC_STRESS_TEST_MODE` | Catalog stress test banner |
| `agnes-next/src/app/checkout/CheckoutClient.tsx` | `NEXT_PUBLIC_STRESS_TEST_MODE` | Checkout error page banner |
| `agnes-next/src/app/contest/ContestClient.tsx` | `NEXT_PUBLIC_STRESS_TEST_MODE` | Contest page banner |
| `agnes-next/src/app/contest/thank-you/ThankYouClient.tsx` | `NEXT_PUBLIC_STRESS_TEST_MODE` | Thank-you page banner |
| `agnes-next/src/app/contest/score/ScoreClient.tsx` | `NEXT_PUBLIC_STRESS_TEST_MODE` | Score page banner |
| `agnes-next/src/app/lightening/LighteningClient.tsx` | `NEXT_PUBLIC_STRESS_TEST_MODE` | Stress overlay, glitch frame |
| `agnes-next/src/app/the-protocol-challenge/ProtocolChallengeClient.tsx` | `NEXT_PUBLIC_STRESS_TEST_MODE` | Protocol challenge banner |

### deepquill Email Banner

| Location | Flag | Purpose |
|----------|------|---------|
| `deepquill/src/lib/emailBanner.cjs` | `EMAIL_CONTEST_BANNER` | Controls banner injection (NOT STRESS_TEST_MODE) |

**⚠️ Flag mismatch:** agnes-next uses `STRESS_TEST_MODE` for email banner; deepquill uses `EMAIL_CONTEST_BANNER`. If only `STRESS_TEST_MODE=1` is set, deepquill emails may not get the banner.

### Templates That Ignore the Flag

- Templates that bypass `applyGlobalEmailBanner` entirely:
  - deepquill/referFriend.cjs
  - deepquill/api/referrals/invite.cjs
  - deepquill/lib/email/sendDailyReferralDigestEmail.cjs
  - agnes-next/src/lib/email/sendReferralEmail.ts
  - agnes-next/src/lib/email/orderConfirmation.ts (dead)
  - agnes-next/src/lib/email/shippingConfirmation.ts

---

## 5. SUMMARY

### Email Templates — Gaps

| Template | Beta Message | Subject Prefix |
|----------|--------------|----------------|
| referralEmail.ts (Mailchimp) | ✔ | ✔ |
| sendReferralEmail.ts | ❌ | ❌ |
| deepquill invite.cjs | ❌ | ❌ |
| deepquill referFriend.cjs | ❌ | ❌ |
| associateCommission.ts | ✔ | ❌ |
| orderConfirmation.ts | ❌ | ❌ (dead) |
| shippingConfirmation.ts | ❌ | ❌ |
| No-purchase/Non-participant/Engaged/Missionary | ✔ | ❌ |
| Daily referral digest | ❌ | ❌ |
| deepquill purchase/commission/fulfillment | ✔ | ✔ |

### Social Share — Gaps

| Platform | Beta Message |
|----------|--------------|
| All (buildShareCaption) | ❌ Missing |

### Environment Toggle — Gaps

- deepquill uses `EMAIL_CONTEST_BANNER`; agnes-next uses `STRESS_TEST_MODE` for email banner.
- No unified toggle for stress test mode across both apps.

---

## 6. RECOMMENDED FIX (For Step 2)

1. **Centralize email banner:** Ensure all email send paths go through a single wrapper that applies banner + subject prefix when enabled.
2. **Unify flags:** Align deepquill to use `STRESS_TEST_MODE` (or `EMAIL_CONTEST_BANNER`) consistently with agnes-next.
3. **Fix subject prefix:** Pass `subject` to `applyGlobalEmailBanner` in all admin job routes and associateCommission.ts.
4. **Add stress test to share captions:** Extend `buildShareCaption()` to accept a stress-test flag and append `Public beta test – simulated purchases only` when enabled.
5. **Remove or fix dead code:** Either delete `agnes-next/src/lib/email/orderConfirmation.ts` or wire it with banner if it will be used.
