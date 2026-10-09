import { cookies, headers } from 'next/headers';
import {
  AD_CHOICE_COOKIE,
  PRIVACY_CHOICE_HEADER,
  PRIVACY_GPC_HEADER,
  PRIVACY_REGION_COOKIE,
  PRIVACY_REGION_HEADER,
  buildAdvertisingConsentSnapshot,
  parseAdChoice,
  parsePrivacyRegion,
  requestHasGpc,
  type AdvertisingConsentSnapshot,
} from './advertisingConsent';

export async function getServerAdvertisingConsentSnapshot(): Promise<AdvertisingConsentSnapshot> {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const region =
    parsePrivacyRegion(headerStore.get(PRIVACY_REGION_HEADER)) ||
    parsePrivacyRegion(cookieStore.get(PRIVACY_REGION_COOKIE)?.value) ||
    'US';
  const choice = parseAdChoice(
    headerStore.get(PRIVACY_CHOICE_HEADER) || cookieStore.get(AD_CHOICE_COOKIE)?.value,
  );
  const gpc =
    requestHasGpc(headerStore.get(PRIVACY_GPC_HEADER)) ||
    requestHasGpc(headerStore.get('sec-gpc'));

  return buildAdvertisingConsentSnapshot({ region, choice, gpc });
}
