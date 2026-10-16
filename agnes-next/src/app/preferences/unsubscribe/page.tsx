import type { Metadata } from 'next';
import SiteFooter from '@/components/SiteFooter';
import { hubContentWrapStyle, hubPageShellStyle } from '@/lib/hubTheme';
import UnsubscribeClient from './UnsubscribeClient';

export const metadata: Metadata = {
  title: 'Unsubscribe | The Agnes Protocol',
  description: 'Stop promotional email from The Agnes Protocol.',
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';
  return (
    <main style={hubPageShellStyle('2rem')}>
      <article style={hubContentWrapStyle()}>
        <UnsubscribeClient token={token} />
      </article>
      <SiteFooter variant="light" />
    </main>
  );
}
