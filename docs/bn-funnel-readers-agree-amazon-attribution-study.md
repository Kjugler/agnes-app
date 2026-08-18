# Amazon Attribution Integration Study — `/readers-agree` Phase C

**Status:** Study only — **Amazon Attribution pending** Author Central claim review  
**Last revised:** 2026-08-17 (no fake tag values; clean URL fallback until Amazon provides tags)  
**Parent:** [`bn-funnel-readers-agree-v2-study.md`](bn-funnel-readers-agree-v2-study.md)  
**ASIN:** `B0GWQBDH66` (*The Agnes Protocol*)  
**Rule:** Do not modify code, schema, env, Amazon settings, commit, push, or deploy until Phase C is explicitly approved.

---

## Executive summary

**No Amazon Attribution implementation exists in the repository today.** All Amazon outbound links use a plain product URL (`https://www.amazon.com/dp/B0GWQBDH66#customerReviews`) with **no** `maas`, `aa_campaignid`, or other Amazon Attribution parameters.

**Recommended architecture (when tags available):** **Hybrid B + pass-through** — not a single URL for all traffic.

**Phase C until tags arrive:** Use **clean Amazon product URL only** (`https://www.amazon.com/dp/B0GWQBDH66`). **Do not invent** `maas` or other Attribution parameters. Architecture may be prepared to accept genuine Amazon-generated values later.

**Blocker:** Amazon Attribution pending Amazon’s review of the Simon McQuade **Author Central** claim for the existing IngramSpark-distributed title.

1. **Pass-through (primary):** When an ad click lands on `/readers-agree` with Amazon Attribution query parameters (common pattern for intermediate landing pages), **capture and forward those parameters unchanged** to the Amazon PDP on outbound click.
2. **Lookup fallback (secondary):** When the visitor arrives with only first-party UTMs (no `maas`), **resolve** to a pre-configured Amazon Attribution tag from a **central config map** keyed by derived channel/campaign.

**Granularity:** Start with **6–8 Amazon Attribution ad groups** (Meta Fred, Meta Helen, TikTok Jody, TikTok Helen, Newsletter, Referral, Organic/Direct). Expand only when reporting proves the split is useful.

**First-party funnel analytics remain primary.** Amazon Attribution is **supplemental** reporting inside Amazon Ads — it does **not** replace `Event` rows, `visitorId`, or UTM capture, and it **does not** feed Meta/TikTok Purchase events.

**Referral protection:** Our sponsor `ref` and Amazon’s `ref_` are **different parameters**. Amazon Attribution must not overwrite `$2 direct + $3 override` referral logic (Stripe checkout path).

---

## 1. Repository audit — what exists today

### Amazon product URLs & ASIN

| Location | URL / constant | Notes |
|----------|----------------|-------|
| `agnes-next/src/lib/metaAdLanding.ts` | `AMAZON_REVIEWS_URL` = `https://www.amazon.com/dp/B0GWQBDH66#customerReviews` | **Canonical constant** — review anchor, not buy PDP |
| Re-export | `agnes-next/src/lib/readerRecommendationLanding.ts` | Re-exports `AMAZON_REVIEWS_URL` |
| `/readers-agree` | `ReadersAgreeLandingClient.tsx` | Direct `href={AMAZON_REVIEWS_URL}` + Dorothy bridge to `/readers-agree/go/amazon` |
| `/readers-agree/go/amazon` | `go/amazon/page.tsx` | Bridge destination = `AMAZON_REVIEWS_URL` |
| `/readers-cant-put-it-down` | `MetaAdLandingClient.tsx` | External Amazon card → `AMAZON_REVIEWS_URL` |
| `/reader/continue` | `ContinueReadingClient.tsx` | Amazon link → `AMAZON_REVIEWS_URL` |
| V2 study (Phase C target) | `https://www.amazon.com/dp/B0GWQBDH66` | Buy PDP, **no** `#customerReviews` — not implemented yet |

**No other ASIN references** for this product in application code. **No Amazon Associates `tag=` parameter** in outbound links.

### Amazon Attribution tags

| Search | Result |
|--------|--------|
| `maas`, `aa_campaignid`, `aa_adgroupid`, `aa_creativeid`, `ref_=aa_maas` | **Not found** in codebase |
| `amazon attribution`, `Attribution` (Amazon Ads) | **Not found** |
| Env vars `AMAZON_*` | **Not found** in repo env templates |

**Conclusion:** Greenfield integration for Phase C.

### Campaign / source tracking (first-party)

| Mechanism | Location | Captured params |
|-----------|----------|-----------------|
| Funnel events | `agnes-next/src/lib/funnelTracking.ts` | `ref`, `code`, `utm_source`, `utm_medium`, `utm_campaign`, `fbclid`, `src`, `origin` |
| Internal navigation preserve | `READERS_AGREE_TRACKING_PARAM_KEYS` in `readerRecommendationLanding.ts` | Same set **except** `utm_content`, `ttclid`, Amazon `maas*` params |
| Middleware | `agnes-next/src/middleware.ts` | Sets `ap_ref` / `ref` cookies from `?ref=` |
| Event storage | `deepquill/lib/funnel/recordFunnelEvent.cjs` | `visitorId`, `ref`, `path`, `source`, spread `meta` (UTMs) |
| Admin reports | `deepquill/lib/funnel/buildFunnelReport.cjs` | Ad-attributed RA views = `utm_*` \|\| `fbclid` \|\| ad `origin` |
| Amazon click event | `READERS_AGREE_AMAZON_CLICK` | Fired on landing + bridge; **meta today does not include destination URL or campaign slice** |

### Gaps vs desired Phase C reporting

| Param | In funnel today? | Notes |
|-------|------------------|-------|
| `utm_content` | **No** | Creative-level Meta/TikTok — not in `getAttributionFromPage` or preserve keys |
| `ttclid` | **No** | TikTok click ID — not captured |
| `maas` / Amazon Attribution | **No** | Must add capture + forward |
| Outbound Amazon URL in click event | **No** | Recommend adding `destinationHost` + resolved `attributionKey` (not full URL with secrets) |

### Meta / TikTok pixels (separate from Amazon)

| Platform | File | Events used on-site |
|----------|------|---------------------|
| Meta | `agnes-next/src/lib/metaPixel.ts` | `PageView`, `ViewContent`, `InitiateCheckout`, `Purchase` |
| TikTok | `agnes-next/src/lib/tiktokPixel.ts` | `ViewContent`, `InitiateCheckout`, `CompletePayment` |

| Event | Where fired | Purchase source |
|-------|-------------|-----------------|
| `ViewContent` | `/readers-agree`, `/readers-cant-put-it-down`, sample chapters | N/A |
| `InitiateCheckout` | `checkout.ts` → Stripe catalog checkout | Direct site only |
| `Purchase` / `CompletePayment` | `OrderConfirmationClient.tsx`, `ThankYouClient.tsx` | **Stripe webhook-confirmed site purchase only** |

**No code attempts to send Amazon purchase data to Meta or TikTok.**

### Referral (`ref`) — separate from Amazon

| Mechanism | Purpose |
|-----------|---------|
| `ref` / `code` query + `ap_ref` cookie | Direct sponsor for **Stripe** referral commission ($2 + $3 override) |
| `checkout.ts` | `ref` → Stripe session metadata → `stripe-webhook.cjs` |

Amazon outbound clicks **do not** participate in Stripe referral commission today (Amazon purchase is off-platform).

---

## 2. Recommended Amazon Attribution architecture

### Options considered

| Option | Description | Verdict |
|--------|-------------|---------|
| **A — One URL for all** | Single Amazon Attribution tag on every outbound click | **Too coarse** — cannot compare Meta Fred vs Helen, TikTok vs newsletter |
| **B — Multiple tags by source/campaign** | Map incoming traffic → distinct Amazon tags | **Recommended (fallback path)** |
| **C — Pass-through only** | Forward `maas*` params from ad landing URL to Amazon click | **Recommended (primary path)** when ads append Amazon macro tags to landing URL |
| **D — Ad platform points directly to Amazon** | Skip landing page for Amazon measurement | **Rejected** — conflicts with `/readers-agree` funnel strategy |

### Recommended: **Hybrid B + C**

```
Ad click
  → /readers-agree?{utm_* & optional maas*}
       → capture: visitorId + UTMs + ref + maas* (session)
       → first-party: READERS_AGREE_PAGE_VIEW, later READERS_AGREE_AMAZON_CLICK
  → User clicks Amazon CTA
       → build Amazon URL:
            IF maas* captured → append to https://www.amazon.com/dp/B0GWQBDH66
            ELSE → config lookup(channel/campaign) → tagged URL
       → Amazon Attributes conversion (14-day window, Amazon reporting)
```

**Why hybrid:** Meta/TikTok ads can use Amazon’s **macro tag** pattern on the **landing page URL** (documented by Amazon and third-party guides for intermediate pages). That gives creative-level granularity without the site hard-coding dozens of full URLs. When macros are absent (newsletter link, referral SMS, organic), the **config map** supplies the correct tag.

### Recommended reporting granularity

| Amazon Attribution ad group (manual setup) | Site routing signal | Priority |
|---------------------------------------------|---------------------|----------|
| Meta — Fred | `utm_source=facebook` + `utm_campaign` matches Fred pattern **or** pass-through macros from Fred ads | High |
| Meta — Helen | Same for Helen campaign | High |
| TikTok — Jody | `utm_source=tiktok` + Jody campaign / creative | High |
| TikTok — Helen | TikTok + Helen campaign | High |
| Kindle Book Publishing — Newsletter 01 | `utm_source` / `utm_campaign` for Jason newsletter | Medium |
| Referral / Text-a-Friend | `ref` present, no paid UTM | Medium |
| Organic / Direct | No ad UTMs, no `ref` | Low (baseline) |

**Practical rule:** Create **one Amazon Attribution tag per row** Kris wants in Amazon reporting. The site maps traffic to those tags — it does not invent Amazon’s internal campaign IDs.

**Do not exceed ~10 tags initially.** More tags = more manual Amazon console work and more config maintenance for diminishing returns.

---

## 3. Preserve first-party attribution (required)

Before the visitor leaves `/readers-agree` for Amazon, continue recording:

| Field | Source | Today | Phase C enhancement |
|-------|--------|-------|---------------------|
| Event type | — | `READERS_AGREE_AMAZON_CLICK` | Keep |
| `visitorId` | `ap_funnel_vid` | ✓ in all funnel events | Keep |
| `utm_source` / `medium` / `campaign` | URL | ✓ in `Event.meta` | Add `utm_content` |
| `fbclid` | URL | ✓ | Keep |
| `ref` | URL / cookie | ✓ | Keep — **never drop for referral traffic** |
| `src`, `origin`, `v`, `code` | URL | Partial preserve on internal links | Extend preserve list if needed |
| Creative | — | **Gap** | Add `utm_content`, optional `v` |
| Amazon tag used | — | **Missing** | Add `amazonAttributionKey` (e.g. `meta-fred`, `pass-through`, `organic`) — not necessarily full URL |
| Resolved destination | — | **Missing** | Log ASIN + whether tag applied (avoid logging full query in prod if noisy) |

Amazon’s console reports **Amazon-attributed sales**. Our `Event` table reports **clicks and on-site funnel**. Join analysis is manual/export-based unless we build a future dashboard.

---

## 4. Configuration design (no scattered hard-coding)

### Principle

All Amazon Attribution destinations live in **one module + env**, consumed by a single **`buildAmazonProductUrl(attributionContext)`** helper. Components never embed tagged URLs.

### Recommended layout (smallest safe design)

| Piece | Location | Role |
|-------|----------|------|
| ASIN + base PDP URL | `agnes-next/src/lib/metaAdLanding.ts` | `AMAZON_PRODUCT_URL` = `https://www.amazon.com/dp/B0GWQBDH66` (Phase C) |
| Attribution config | **New** `agnes-next/src/lib/amazonAttribution.ts` | Param keys, resolver, pass-through rules |
| Tag values | **Env** (Vercel) | `AMAZON_ATTR_TAG_META_FRED`, etc. — each value is the **query suffix or full tagged URL** Amazon generated |
| Optional JSON map | Env `AMAZON_ATTR_TAG_MAP_JSON` | Campaign pattern → tag key — avoids 20 env vars if preferred |
| Session capture | `amazonAttribution.ts` + sessionStorage | Store incoming `maas`, `aa_*` for pass-through |

**Not recommended at current scale:** Database/admin UI for tags — adds CRUD and audit burden before we have volume.

**Not recommended:** Hard-coding Amazon-generated `maas=...` strings in React components.

### Example config shape (illustrative — not real tags)

```typescript
// amazonAttribution.ts — structure only; values come from env at runtime
type AttributionKey =
  | 'meta-fred' | 'meta-helen' | 'tiktok-jody' | 'tiktok-helen'
  | 'newsletter-01' | 'referral' | 'organic' | 'pass-through';

// Resolver priority:
// 1. Pass-through: if session has maas → merge onto AMAZON_PRODUCT_URL
// 2. ref present → referral tag (unless paid UTM overrides)
// 3. utm_source + utm_campaign rules → meta-fred, meta-helen, ...
// 4. default → organic
```

### Parameter naming collision (critical)

| Param | Owner | Must not confuse |
|-------|-------|------------------|
| `ref` | **Our** direct sponsor code | Stripe referral commission |
| `ref_` | **Amazon** Attribution marker (`ref_=aa_maas`) | Not our sponsor `ref` |

Implementation must treat these as **independent** query keys.

---

## 5. Manual steps — Kris in Amazon (separate from code)

### What code cannot do

- Create Amazon Attribution campaigns/ad groups/tags (Amazon Ads console only)
- Invent `maas` values — they are **issued by Amazon** when tags are created
- See Amazon conversion data inside our admin funnel report without export/API integration

### What Kris must do in Amazon Advertising

1. **Enroll** in [Amazon Attribution](https://advertising.amazon.com/amazon-attribution) (Seller/Vendor eligibility required).
2. **Register** the off-Amazon publisher(s): Meta/Facebook, TikTok, Email/Newsletter, Other/Custom as needed.
3. **Create an Attribution campaign** for *The Agnes Protocol* ASIN **`B0GWQBDH66`**.
4. For each reporting slice (Meta Fred, Meta Helen, TikTok Jody, …), **create an ad group** and generate its **Attribution tag**.
5. Choose destination type: **Product detail page (PDP)** for ASIN `B0GWQBDH66` — align with Phase C buy URL (no `#customerReviews`).
6. Copy each tag. Amazon typically provides either:
   - A **full product URL** including query parameters, or
   - A **query suffix** starting with `?maas=...` (often also `ref_=aa_maas`, `aa_campaignid`, etc.)
7. For Meta/TikTok with creative-level reporting, optionally request **macro-enabled tags** for the publisher (Facebook, TikTok) so ad platforms inject `{campaignid}`, `{adgroupid}`, `{creativeid}` at click time — used on **landing page URL** when running traffic through `/readers-agree`.

### Values to bring back for site config

For **each** ad group Kris creates, provide:

| Field | Example purpose |
|-------|-----------------|
| **Internal key** | `meta-fred`, `tiktok-jody`, … (our config map key) |
| **Tag type** | Full URL **or** query suffix only |
| **Tagged URL or suffix** | Exact string from Amazon console — **paste verbatim** |
| **Publisher** | Facebook, TikTok, Email, Other |
| **Amazon ad group name** | For human cross-reference |
| **Matching UTM rule** | e.g. `utm_campaign=meta_fred_*` — so devs wire the map |
| **Notes** | Kindle vs print — same ASIN; confirm marketplace US |

Store these in Vercel env or a secure doc — **not** committed to git if tags are considered sensitive campaign config.

### What we will **not** do

- Fabricate example `maas=maas_adg_api_...` URLs in the repo
- Mix Amazon Associates affiliate `tag=` with Attribution `maas` without explicit business approval

---

## 6. Meta / TikTok relationship — keep separate

| System | Measures | Feeds optimization? |
|--------|----------|---------------------|
| **Meta Pixel / TikTok Pixel** | On-site behavior + **Stripe Purchase** | Yes — platform ad optimization |
| **First-party funnel (`Event`)** | Full path including Amazon **click** | Internal only |
| **Amazon Attribution** | Amazon **purchase** after tagged click | Amazon Ads reporting only |

**Facts from codebase:**

- `Purchase` / `CompletePayment` fire only after **Stripe checkout success** on our domain.
- Amazon retailer purchases are **invisible** to Meta/TikTok pixels unless separately integrated (e.g. Amazon Marketing Cloud offline conversions, CAPI custom events from Amazon exports — **not implemented**, **not assumed**).

**Phase C must not:**

- Fire Meta/TikTok `Purchase` on Amazon outbound click
- Assume Amazon Attribution data auto-syncs to ad platforms
- Replace UTM-based ad reporting with Amazon-only reporting

**Optional future (out of Phase C scope):** Manual or batch upload of Amazon Attribution conversions to Meta/TikTok offline conversion APIs — requires separate study and Amazon export access.

---

## 7. Referral protection

| Concern | Rule |
|---------|------|
| Sponsor `ref` on site | Preserve through `/readers-agree` → sample chapters → Stripe checkout — unchanged |
| Amazon click with `ref` | May still append Amazon Attribution tag; **`ref` must remain** on site URLs for return visits |
| `$2 / $3 payout** | Triggered only by **Stripe** qualifying purchase — Amazon purchase does not use our webhook commission path |
| Override lineage | Unaffected by Amazon Attribution — do not modify `stripe-webhook.cjs` in Phase C |
| Referral Amazon tag | Optional separate Amazon Attribution ad group “Referral” for **Amazon-side** reporting only — does not replace sponsor `ref` for direct site sales |

---

## 8. Phase C — files that would eventually change

| File | Change |
|------|--------|
| **New** `agnes-next/src/lib/amazonAttribution.ts` | Resolver, pass-through capture, `buildAmazonProductUrl()` |
| `agnes-next/src/lib/metaAdLanding.ts` | Add `AMAZON_PRODUCT_URL`; keep or deprecate `AMAZON_REVIEWS_URL` for legacy pages |
| `agnes-next/src/lib/readerRecommendationLanding.ts` | Extend `READERS_AGREE_TRACKING_PARAM_KEYS`; re-export attribution helper |
| `agnes-next/src/lib/funnelTracking.ts` | Capture `utm_content`, optional `ttclid`, Amazon params on landing |
| `agnes-next/src/app/readers-agree/ReadersAgreeLandingClient.tsx` | Use `buildAmazonProductUrl()` for CTA + popup; enrich click event meta |
| `agnes-next/src/app/readers-agree/go/amazon/page.tsx` | Tagged bridge destination |
| `agnes-next/src/app/readers-agree/go/ReviewRedirectClient.tsx` | Tagged `destinationUrl` |
| `agnes-next/src/lib/readersAgreeMomentum.ts` | Possibly persist Amazon params across bridge (if session not enough) |
| `deepquill/lib/funnel/recordFunnelEvent.cjs` | Allowlist Amazon param keys in meta sanitization |
| `agnes-next/src/app/readers-cant-put-it-down/MetaAdLandingClient.tsx` | Later — same helper (out of Phase C if scoped to `/readers-agree` only) |
| Vercel env | `AMAZON_ATTR_TAG_*` values from Kris |

**Out of Phase C scope (per v2 plan):** B&N URLs, email capture, nurture, Jody, DB schema, payout logic.

---

## 9. Testing plan (when implemented)

### Pre-flight (Kris)

- [ ] Each Amazon Attribution tag opens PDP for `B0GWQBDH66` in US marketplace
- [ ] Tags recorded in config doc with internal keys

### Click-path QA (dev/staging)

1. Land with test UTMs: `/readers-agree?utm_source=facebook&utm_medium=cpc&utm_campaign=fred_test`
2. Click Amazon CTA → inspect outbound URL contains expected `maas` (pass-through or mapped tag)
3. Confirm `READERS_AGREE_AMAZON_CLICK` event includes `visitorId`, UTMs, `amazonAttributionKey`
4. Referral path: `/readers-agree?ref=TESTCODE` → Amazon click still has site `ref` on return URLs; sponsor attribution unchanged on `/catalog` checkout
5. Dorothy bridge: desktop popup + `/readers-agree/go/amazon` receives same tagged URL as direct click
6. Param survival: navigate `/readers-agree` → sample chapters → back — Amazon params still in session (if design uses sessionStorage)

### Amazon-side validation

- Use Amazon Attribution console **click / conversion** reports (24–72h lag typical)
- Test click from each configured channel; verify ad group receives traffic
- Confirm 14-day attribution window understood (industry standard for Amazon Attribution)

### Regression

- Meta/TikTok `ViewContent` still fires on `/readers-agree`
- No Meta/TikTok `Purchase` on Amazon click
- Stripe checkout `Purchase` unchanged

---

## 10. Blockers & dependencies

| Blocker | Severity | Mitigation |
|---------|----------|------------|
| **No Amazon tags created yet** | **Hard** | Kris completes Amazon Attribution setup; provides tag strings |
| **Phase C buy PDP vs review URL** | Medium | Tags must target buy PDP; v2 study locks ASIN without `#customerReviews` |
| **`utm_content` not captured** | Medium | Add in Phase C for creative-level first-party + mapping hints |
| **No `ttclid` capture** | Low | Add if TikTok ads use it; UTMs may suffice |
| **Intermediate page param loss** | Medium | Implement session capture on first landing; extend preserve keys |
| **Amazon vs Associates policy** | Low | Use Attribution tags only; do not add Associates `tag=` without legal review |
| **Reporting split brain** | Informational | Amazon sales ≠ Stripe sales — document for stakeholders |
| **Referral `ref` vs Amazon `ref_`** | Medium | Naming discipline in code/docs |

---

## 11. Related documents

| Document | Relationship |
|----------|--------------|
| [`bn-funnel-readers-agree-v2-study.md`](bn-funnel-readers-agree-v2-study.md) | Phase C Amazon/B&N buy PDPs |
| [`bn-funnel-readers-agree-v2-prospect-nurture-study.md`](bn-funnel-readers-agree-v2-prospect-nurture-study.md) | Referral `ref` preservation |
| [`funnel-analytics.md`](funnel-analytics.md) | First-party event architecture |
| [Amazon Attribution guide](https://advertising.amazon.com/library/guides/basics-of-amazon-attribution) | Official Amazon setup |

---

*Study only. Amazon Attribution is supplemental measurement; first-party funnel + referral compensation architecture remain authoritative for on-site behavior and Stripe payouts.*
