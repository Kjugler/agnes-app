// Readers Agree v2 lead capture helpers (Phase D).

const READERS_AGREE_V2_SOURCE = 'readers-agree-v2';

function siteUrl() {
  return (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://www.theagnesprotocol.com'
  ).replace(/\/$/, '');
}

function deriveChannel(utm = {}) {
  if (utm.fbclid || utm.utm_source === 'facebook' || utm.utm_source === 'meta') {
    return 'meta';
  }
  if (utm.utm_source === 'tiktok') return 'tiktok';
  if (utm.ref || utm.code) return 'referral';
  if (utm.utm_source) return String(utm.utm_source);
  return 'unknown';
}

function buildLeadAttributionSnapshot({
  visitorId,
  ref,
  code,
  utm = {},
  captureSurface,
  retailerOrigin,
}) {
  return {
    visitorId: visitorId || null,
    ref: ref || null,
    code: code || null,
    utm_source: utm.utm_source || null,
    utm_medium: utm.utm_medium || null,
    utm_campaign: utm.utm_campaign || null,
    fbclid: utm.fbclid || null,
    src: utm.src || null,
    origin: utm.origin || null,
    v: utm.v || null,
    channel: deriveChannel({ ...utm, ref, code }),
    captureSurface: captureSurface || 'landing',
    retailerOrigin: retailerOrigin || null,
    enrolledAt: new Date().toISOString(),
  };
}

function buildSampleChaptersUrlFromAttribution(attribution) {
  const base = siteUrl();
  const params = new URLSearchParams();
  const keys = [
    'ref',
    'code',
    'src',
    'v',
    'origin',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'fbclid',
  ];
  for (const key of keys) {
    const value = attribution?.[key];
    if (value) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${base}/sample-chapters?${qs}` : `${base}/sample-chapters`;
}

function buildRedirectPathFromAttribution(attribution) {
  const full = buildSampleChaptersUrlFromAttribution(attribution);
  const pathStart = full.indexOf('/sample-chapters');
  return pathStart >= 0 ? full.slice(pathStart) : '/sample-chapters';
}

async function upsertReadersAgreeReaderProfile(prisma, userId, { attribution, consentAccepted }) {
  const now = new Date();
  const existing = await prisma.readerProfile.findUnique({ where: { userId } });

  const nurtureFields =
    existing?.prospectNurtureEnrolledAt == null
      ? {
          prospectNurtureEnrolledAt: now,
          prospectNurtureStep: 0,
          prospectNurtureLastSentAt: null,
        }
      : {};

  const data = {
    source: READERS_AGREE_V2_SOURCE,
    readerType: 'prospect',
    status: 'active',
    emailUpdatesConsent: consentAccepted === true,
    emailMarketingConsentAt: consentAccepted === true ? now : undefined,
    leadAttribution: attribution,
    ...nurtureFields,
  };

  if (existing) {
    return prisma.readerProfile.update({
      where: { userId },
      data: {
        ...data,
        leadAttribution: attribution,
      },
    });
  }

  return prisma.readerProfile.create({
    data: {
      userId,
      ...data,
    },
  });
}

module.exports = {
  READERS_AGREE_V2_SOURCE,
  buildLeadAttributionSnapshot,
  buildSampleChaptersUrlFromAttribution,
  buildRedirectPathFromAttribution,
  upsertReadersAgreeReaderProfile,
  deriveChannel,
};
