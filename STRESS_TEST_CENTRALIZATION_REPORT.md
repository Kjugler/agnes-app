# Stress Test Centralization — Change Report

**Date:** Implementation complete  
**Scope:** Canonical flag strategy, email beta handling, subject prefix propagation, invite/referral coverage, social share footer.

---

## 1. Files Changed

### agnes-next

| File | Change |
|------|--------|
| `src/lib/emailConfig.ts` | Documented canonical flag strategy |
| `src/lib/emailBanner.ts` | Replaced large banner with short, tasteful body note |
| `src/lib/email/associateCommission.ts` | Pass `subject` to `applyGlobalEmailBanner`; use `finalSubject` |
| `src/lib/email/sendReferralEmail.ts` | Apply `applyGlobalEmailBanner` before sending (was bypassing) |
| `src/lib/email/shippingConfirmation.ts` | Apply `applyGlobalEmailBanner` (was bypassing) |
| `src/app/api/admin/jobs/send-no-purchase-reminders/route.ts` | Pass `subject` to banner; use `finalSubject` |
| `src/app/api/admin/jobs/send-non-participant-reminders/route.ts` | Pass `subject` to banner; use `finalSubject` |
| `src/app/api/admin/jobs/send-engaged-reminders/route.ts` | Pass `subject` to banner; use `finalSubject` |
| `src/app/api/admin/jobs/send-missionary-emails/route.ts` | Pass `subject` to banner; use `finalSubject` |
| `src/lib/shareCaption.ts` | Add stress-test footer when `NEXT_PUBLIC_STRESS_TEST_MODE=1` |
| `.env.local.example` | Updated stress-test flag documentation |

### deepquill

| File | Change |
|------|--------|
| `src/lib/emailBanner.cjs` | Check `STRESS_TEST_MODE` as master; derive from it; use short banner |
| `api/referrals/invite.cjs` | Apply `applyGlobalEmailBanner` before sending (was bypassing) |
| `server/routes/referFriend.cjs` | Apply `applyGlobalEmailBanner` before sending (was bypassing) |
| `lib/email/sendDailyReferralDigestEmail.cjs` | Apply `applyGlobalEmailBanner` (was bypassing) |

---

## 2. What Was Centralized

- **Canonical flag strategy:** `STRESS_TEST_MODE=1` is the master server-side flag. When set, email stress-test messaging turns on automatically in both agnes-next and deepquill. `EMAIL_CONTEST_BANNER=1` remains a legacy override.
- **Email body note:** Single shared text: *"Public beta stress test: purchases are simulated. No real charges or deliveries will occur."* — short, calm, professional. Applied via `applyGlobalEmailBanner()` in agnes-next and deepquill.
- **Subject prefix:** `[PUBLIC BETA TEST]` applied in one place (inside `applyGlobalEmailBanner`) when subject is passed.
- **Social share footer:** Single line in `buildShareCaption()`: *"Public beta test — simulated purchases only."* — appended when `NEXT_PUBLIC_STRESS_TEST_MODE=1`.

---

## 3. Email Paths — Subject Prefix

| Email Path | Now Inherits Subject Prefix? |
|------------|------------------------------|
| referralEmail.ts (Mailchimp) | ✔ Yes (already did) |
| sendReferralEmail.ts | ✔ Yes |
| associateCommission.ts | ✔ Yes |
| shippingConfirmation.ts | ✔ Yes |
| No-purchase reminder | ✔ Yes |
| Non-participant reminder | ✔ Yes |
| Engaged reminder | ✔ Yes |
| Missionary email | ✔ Yes |
| deepquill invite.cjs | ✔ Yes |
| deepquill referFriend.cjs | ✔ Yes |
| deepquill daily digest | ✔ Yes |
| deepquill purchase confirmation (stripe-webhook) | ✔ Yes (already did) |
| deepquill referrer commission (stripe-webhook) | ✔ Yes (already did) |
| deepquill eBook fulfillment | ✔ Yes (already did) |

---

## 4. Email Paths — Body Note

| Email Path | Now Inherits Body Note? |
|------------|-------------------------|
| referralEmail.ts (Mailchimp) | ✔ Yes |
| sendReferralEmail.ts | ✔ Yes |
| associateCommission.ts | ✔ Yes |
| shippingConfirmation.ts | ✔ Yes |
| No-purchase reminder | ✔ Yes |
| Non-participant reminder | ✔ Yes |
| Engaged reminder | ✔ Yes |
| Missionary email | ✔ Yes |
| deepquill invite.cjs | ✔ Yes |
| deepquill referFriend.cjs | ✔ Yes |
| deepquill daily digest | ✔ Yes |
| deepquill purchase confirmation | ✔ Yes |
| deepquill referrer commission | ✔ Yes |
| deepquill eBook fulfillment | ✔ Yes |

---

## 5. Social Share Text in Stress Test Mode

When `NEXT_PUBLIC_STRESS_TEST_MODE=1`, `buildShareCaption()` appends:

```
Public beta test — simulated purchases only.
```

to the end of both X and TT/IG/Truth captions. Same line across all platforms.

---

## 6. Intentionally Exempt Templates

| Template | Reason |
|----------|--------|
| Help request (`agnes-next/src/app/api/help/route.ts`) | Internal-only; sent to support inbox, not user-facing |
| agnes-next `orderConfirmation.ts` | Dead code; never imported or invoked. Purchase flow uses deepquill. |

---

## 7. Environment Variable Expectations

### agnes-next (.env.local)

```env
# For public beta stress test:
STRESS_TEST_MODE=1
NEXT_PUBLIC_STRESS_TEST_MODE=1

# Optional legacy override (prefer STRESS_TEST_MODE):
# EMAIL_CONTEST_BANNER=1
```

### deepquill (.env or .env.local)

```env
# For public beta stress test (enables email banner automatically):
STRESS_TEST_MODE=1

# Optional: for client-side UI in deepquill frontend (if any)
# NEXT_PUBLIC_STRESS_TEST_MODE=1

# Legacy override still supported:
# EMAIL_CONTEST_BANNER=1
```

**Note:** deepquill reads `STRESS_TEST_MODE` directly. When set, all deepquill emails (invite, referFriend, purchase confirmation, commission, fulfillment, daily digest) get the subject prefix and body note. No separate `EMAIL_CONTEST_BANNER` needed.

---

## 8. Manual Test Steps

### Friend referral email

1. Set `STRESS_TEST_MODE=1` in agnes-next and deepquill.
2. Trigger a friend invite (e.g., from refer page or EmailModal).
3. **Verify:** Subject starts with `[PUBLIC BETA TEST]`.
4. **Verify:** Email body has short note near top: *"Public beta stress test: purchases are simulated. No real charges or deliveries will occur."*

### Commission email

1. Complete a referral purchase (use test card 4242…).
2. **Verify:** Commission email to referrer has `[PUBLIC BETA TEST]` in subject.
3. **Verify:** Body has the short simulation notice.

### Purchase confirmation email

1. Complete a purchase (Stripe test mode).
2. **Verify:** Purchase confirmation has `[PUBLIC BETA TEST]` in subject.
3. **Verify:** Body has the short simulation notice.

### One reminder/admin email

1. Ensure a user qualifies for no-purchase or engaged reminder (or run job manually).
2. Trigger the job (e.g., cron or admin endpoint).
3. **Verify:** Email has `[PUBLIC BETA TEST]` in subject.
4. **Verify:** Body has the short simulation notice.

### Social share caption

1. Set `NEXT_PUBLIC_STRESS_TEST_MODE=1` in agnes-next.
2. Go to a share instructions page (e.g., `/share/x/1/instructions` or `/share/fb/1/instructions`).
3. Copy the caption (or view the pre-filled text).
4. **Verify:** Caption ends with *"Public beta test — simulated purchases only."*
5. Repeat for at least one other platform (TT, IG, Truth).

---

## 9. UX Philosophy Preserved

- Lightning page: trust notice (unchanged)
- Contest Entry: banner (unchanged)
- Emails: short body note + subject prefix (replaced large banner with tasteful note)
- Social shares: short caption footer (new)
- No broad UI regressions; no giant banners reintroduced on internal pages.
