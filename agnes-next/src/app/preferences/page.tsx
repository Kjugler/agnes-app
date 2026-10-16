import type { Metadata } from 'next';
import SiteFooter from '@/components/SiteFooter';
import { hubContentWrapStyle, hubPageShellStyle } from '@/lib/hubTheme';
import PreferencesClient from './PreferencesClient';

export const metadata: Metadata = {
  title: 'Email preferences | The Agnes Protocol',
  description: 'Optional promotional email for readers of The Agnes Protocol.',
};

export default function PreferencesPage() {
  return (
    <main style={hubPageShellStyle('2rem')}>
      <article style={hubContentWrapStyle()}>
        <PreferencesClient />
      </article>
      <SiteFooter variant="light" />
    </main>
  );
}
