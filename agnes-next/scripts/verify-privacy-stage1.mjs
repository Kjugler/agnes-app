import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const layout = read('src/app/layout.tsx');
assert.match(layout, /PrivacyConsentRoot/);
assert.match(layout, /AdvertisingTags/);
assert.match(layout, /buildGoogleConsentDefaultScript/);
assert.match(layout, /strategy="beforeInteractive"/);
assert.doesNotMatch(layout, /<MetaPixel[\s>/]/);
assert.doesNotMatch(layout, /<TikTokPixel[\s>/]/);
assert.doesNotMatch(layout, /<MicrosoftUET[\s>/]/);
assert.doesNotMatch(layout, /<GoogleAds[\s>/]/);
assert.doesNotMatch(layout, /<GoogleTagManager[\s>/]/);

const tags = read('src/components/privacy/AdvertisingTags.tsx');
assert.match(tags, /if \(!snapshot\.allowed\) return null/);
assert.match(tags, /applyGoogleConsentUpdate\(snapshot\.allowed\)/);
assert.match(tags, /<MetaPixel/);
assert.match(tags, /<TikTokPixel/);
assert.match(tags, /<MicrosoftUET/);
assert.match(tags, /<GoogleAds/);
assert.match(tags, /<GoogleTagManager/);

const footer = read('src/components/SiteFooter.tsx');
assert.match(footer, /\/privacy/);
assert.match(footer, /PrivacyChoicesTrigger/);

assert.equal(fs.existsSync(path.join(root, 'src/app/privacy/page.tsx')), true);
assert.equal(fs.existsSync(path.join(root, 'src/app/terms/page.tsx')), false);

const checkout = read('src/lib/checkout.ts');
assert.doesNotMatch(checkout, /I agree to the Privacy Policy/);
assert.match(checkout, /trackFunnelEvent/);

const funnel = read('src/lib/funnelTracking.ts');
assert.match(funnel, /\/api\/funnel\/event/);
assert.doesNotMatch(funnel, /mayUseAdvertisingMeasurement/);

const helper = read('src/lib/privacy/advertisingConsentClient.ts');
assert.match(helper, /export function mayUseAdvertisingMeasurement/);
assert.match(helper, /readGpc/);
assert.match(helper, /applyGoogleConsentUpdate/);

const consentMode = read('src/lib/privacy/googleConsentMode.ts');
assert.match(consentMode, /ad_user_data/);
assert.match(consentMode, /ad_personalization/);
assert.doesNotMatch(consentMode, /googletagmanager\.com\/gtm\.js/);

const middleware = read('src/middleware.ts');
assert.match(middleware, /nextWithPrivacy/);
assert.match(middleware, /computeAdvertisingPrivacyState/);

const apply = read('src/lib/privacy/applyAdvertisingPrivacy.ts');
assert.match(apply, /secGpc: request\.headers.get\('sec-gpc'\)/);
assert.match(apply, /x-vercel-ip-country/);

const core = read('src/lib/privacy/advertisingConsent.ts');
assert.match(core, /export function requestHasGpc/);
assert.match(core, /isResolvedGeoCountry/);

const policy = read('src/app/privacy/page.tsx');
assert.doesNotMatch(policy, /Conversions API is currently active/i);
assert.match(policy, /do not currently send purchase events through Meta Conversions API/i);
assert.match(policy, /Amazon/);
assert.match(policy, /Barnes/);

const gtm = read('src/components/analytics/GoogleTagManager.tsx');
assert.match(gtm, /strategy="afterInteractive"/);
const ads = read('src/components/analytics/GoogleAds.tsx');
assert.match(ads, /strategy="afterInteractive"/);
assert.doesNotMatch(ads, /consent','default'/);

const uet = read('src/components/analytics/MicrosoftUET.tsx');
assert.match(uet, /ad_storage: 'denied'/);
assert.match(uet, /ad_storage: 'granted'/);

console.log('verify-privacy-stage1: ok');
