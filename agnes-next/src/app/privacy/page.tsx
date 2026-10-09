import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import PrivacyChoicesTrigger from '@/components/privacy/PrivacyChoicesTrigger';
import { HUB_THEME, hubContentWrapStyle, hubPageShellStyle } from '@/lib/hubTheme';

export const metadata: Metadata = {
  title: 'Privacy Policy | The Agnes Protocol',
  description:
    'How DeepQuill LLC collects, uses, and shares information on theagnesprotocol.com, and how to make privacy choices.',
};

const headingStyle = {
  fontSize: '1.35rem' as const,
  fontWeight: 700,
  margin: '28px 0 10px',
  color: HUB_THEME.text,
};

const bodyStyle = {
  fontSize: '16px' as const,
  lineHeight: 1.65,
  margin: '0 0 12px',
  color: HUB_THEME.text,
};

const listStyle = {
  ...bodyStyle,
  paddingLeft: 22,
};

export default function PrivacyPolicyPage() {
  return (
    <main style={hubPageShellStyle('2rem')}>
      <article style={{ ...hubContentWrapStyle(), maxWidth: 720 }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: HUB_THEME.textMuted }}>
          DeepQuill LLC · The Agnes Protocol
        </p>
        <h1 style={{ margin: '0 0 8px', fontSize: '2rem', lineHeight: 1.2, color: HUB_THEME.text }}>
          Privacy Policy
        </h1>
        <p style={{ ...bodyStyle, color: HUB_THEME.textMuted }}>
          Last updated October 9, 2026. This page describes the website
          theagnesprotocol.com as it works today.
        </p>
        <p style={bodyStyle}>
          You do not have to read this policy before browsing, reading samples, or
          buying a book. If you want to turn advertising measurement off, use{' '}
          <PrivacyChoicesTrigger color={HUB_THEME.text} />.
        </p>

        <h2 style={headingStyle}>Who we are</h2>
        <p style={bodyStyle}>
          DeepQuill LLC is a small independent publisher based in Utah, United
          States. We sell The Agnes Protocol and related digital content. Contact:{' '}
          <a href="mailto:hello@theagnesprotocol.com" style={{ color: HUB_THEME.text }}>
            hello@theagnesprotocol.com
          </a>
          .
        </p>

        <h2 style={headingStyle}>Information you give us</h2>
        <p style={bodyStyle}>
          If you enter an email to read sample chapters, we use that address to
          give you access and to operate the reader experience. That is not the
          same as signing up for marketing email. Optional update emails, when
          offered, are a separate choice.
        </p>
        <p style={bodyStyle}>
          If you buy directly from this site, Stripe collects payment details and
          the contact and shipping information needed to complete the order.
          We use that information to fulfill the purchase, send order-related
          email, and handle customer support. We do not receive your full payment
          card number.
        </p>

        <h2 style={headingStyle}>First-party site analytics</h2>
        <p style={bodyStyle}>
          We record operational events on our own systems so we can understand
          the reader journey: page views, sample reading, clicks to Amazon or
          Barnes &amp; Noble, returns from those retailers, checkout starts, and
          similar funnel events. Those records stay with DeepQuill. An advertising
          opt-out does not turn this internal measurement off.
        </p>

        <h2 style={headingStyle}>Advertising technologies</h2>
        <p style={bodyStyle}>
          Unless you opt out, or your browser sends Global Privacy Control, or you
          are in the European Union, United Kingdom, or Switzerland and have not
          consented, the site may load advertising measurement tools:
        </p>
        <ul style={listStyle}>
          <li>Meta Pixel</li>
          <li>TikTok Pixel</li>
          <li>Microsoft Universal Event Tracking (UET)</li>
          <li>Google advertising / measurement tags and Google Tag Manager</li>
        </ul>
        <p style={bodyStyle}>
          These tools may set or read cookies and identifiers such as _fbp, _fbc,
          fbclid, _ttp, ttclid, and similar Microsoft or Google advertising
          cookies. They help us see whether ads led to visits, sample reading, or
          direct purchases on this site.
        </p>
        <p style={bodyStyle}>
          We do not currently send purchase events through Meta Conversions API
          or TikTok Events API. We do not upload historical customer lists to
          advertising platforms. We do not sell customer lists.
        </p>

        <h2 style={headingStyle}>Amazon and Barnes &amp; Noble links</h2>
        <p style={bodyStyle}>
          When you click through to Amazon or Barnes &amp; Noble, we may record
          that click in our own analytics and, when advertising measurement is
          allowed, in advertising pixels as a non-purchase event. We do not
          receive Amazon or Barnes &amp; Noble purchase records at the person
          level. Measuring a retailer click is not the same as knowing that a
          retailer purchase occurred.
        </p>

        <h2 style={headingStyle}>Email</h2>
        <p style={bodyStyle}>
          Order and access emails are transactional. If we send marketing or
          update email, that mail should include a way to stop future marketing
          messages. Replying to hello@theagnesprotocol.com also works.
        </p>

        <h2 style={headingStyle}>Service providers</h2>
        <p style={bodyStyle}>
          We use companies that process information for us, including Stripe for
          payments and Mailchimp Transactional for sending email. Advertising
          platforms listed above receive information only when advertising
          measurement is allowed.
        </p>

        <h2 style={headingStyle}>Your choices</h2>
        <p style={bodyStyle}>
          Use Privacy Choices in the footer to allow or opt out of advertising
          measurement. Opting out does not block browsing, samples, checkout, or
          fulfillment.
        </p>
        <p style={bodyStyle}>
          If your browser sends Global Privacy Control (GPC), we treat that as an
          advertising opt-out. GPC stays in effect while the signal is present.
          We also remember the opt-out so advertising does not automatically
          resume if GPC is later turned off. You can allow advertising
          measurement later through Privacy Choices if GPC is no longer active.
        </p>
        <p style={bodyStyle}>
          Industry opt-out pages such as{' '}
          <a href="https://www.aboutads.info/choices" style={{ color: HUB_THEME.text }}>
            aboutads.info/choices
          </a>{' '}
          may also limit some interest-based ads in your browser.
        </p>

        <h2 style={headingStyle}>Visitors in the EU, UK, and Switzerland</h2>
        <p style={bodyStyle}>
          For visitors we identify as being in the European Union / EEA, the
          United Kingdom, or Switzerland, advertising cookies and pixels stay off
          until you accept advertising measurement. You can reject them and still
          use the site. If we cannot tell your country, we do not show this
          extra step to every visitor; we only require it when that region is
          identified.
        </p>

        <h2 style={headingStyle}>U.S. state privacy rights</h2>
        <p style={bodyStyle}>
          Some U.S. state laws give residents rights to know, delete, or opt out
          of certain advertising uses of personal information once a business
          meets size or volume thresholds. DeepQuill is a small publisher. If a
          law applies to you and to us, email hello@theagnesprotocol.com and we
          will work through the request. California visitors can use Privacy
          Choices as the advertising opt-out control described above.
        </p>

        <h2 style={headingStyle}>Retention, security, and children</h2>
        <p style={bodyStyle}>
          We keep order, reader, and analytics records as long as needed to
          fulfill purchases, operate the site, and understand the business, then
          as required for legal or accounting reasons. We use reasonable
          technical and organizational measures to protect information, but no
          website can promise perfect security.
        </p>
        <p style={bodyStyle}>
          This site is for a general adult audience. It is not directed to
          children under 13, and we do not knowingly collect personal information
          from children under 13.
        </p>

        <h2 style={headingStyle}>Changes</h2>
        <p style={bodyStyle}>
          If this policy changes in a meaningful way, we will update the date
          above.
        </p>

        <p style={{ ...bodyStyle, marginTop: 28 }}>
          <Link href="/catalog" style={{ color: HUB_THEME.text }}>
            Catalog
          </Link>
          {' · '}
          <Link href="/sample-chapters" style={{ color: HUB_THEME.text }}>
            Sample chapters
          </Link>
        </p>
      </article>
      <SiteFooter variant="light" />
    </main>
  );
}
