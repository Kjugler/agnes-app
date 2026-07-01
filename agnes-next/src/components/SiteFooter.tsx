import Link from 'next/link';
import { HUB_THEME } from '@/lib/hubTheme';

type SiteFooterProps = {
  /** `green` = legacy terminal sample-chapters; `muted` = dark pages; `light` = light hub pages */
  variant?: 'green' | 'muted' | 'light';
};

export default function SiteFooter({ variant = 'muted' }: SiteFooterProps) {
  const linkColor =
    variant === 'green'
      ? '#00ff00'
      : variant === 'light'
        ? HUB_THEME.text
        : 'rgba(245, 245, 245, 0.65)';
  const textColor =
    variant === 'green'
      ? '#00ff00'
      : variant === 'light'
        ? HUB_THEME.textMuted
        : 'rgba(245, 245, 245, 0.55)';

  return (
    <footer
      style={{
        textAlign: 'center',
        marginTop: '40px',
        paddingBottom: '24px',
        fontSize: '0.9rem',
        color: textColor,
      }}
    >
      <p style={{ margin: '0 0 12px 0' }}>
        <Link href="/author" style={{ color: linkColor, textDecoration: 'underline' }}>
          About the Author
        </Link>
        {' · '}
        <Link href="/sample-chapters" style={{ color: linkColor, textDecoration: 'underline' }}>
          Sample Chapters
        </Link>
        {' · '}
        <Link href="/catalog" style={{ color: linkColor, textDecoration: 'underline' }}>
          Catalog
        </Link>
      </p>
      <p style={{ margin: '0 0 8px 0' }}>© 2025 DeepQuill LLC – All Rights Reserved</p>
      <p style={{ margin: '0 0 8px 0' }}>
        Contact:{' '}
        <a href="mailto:hello@theagnesprotocol.com" style={{ color: linkColor }}>
          hello@theagnesprotocol.com
        </a>
      </p>
      {(variant === 'green' || variant === 'light') && (
        <p style={{ margin: 0 }}>All purchases are final. Contact us with any issues.</p>
      )}
    </footer>
  );
}
