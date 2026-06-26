import type { Metadata } from 'next';
import AuthorPageClient from './AuthorPageClient';

const SITE_URL = 'https://www.theagnesprotocol.com';
const HERO_IMAGE = `${SITE_URL}/images/author/family-hero.jpg`;

export const metadata: Metadata = {
  title: 'Simon McQuade | Author of The Agnes Protocol',
  description:
    'Simon McQuade is the pen name of Kris Jugler, author of The Agnes Protocol - political suspense inspired by politics, media, AI, and public influence. Read sample chapters free.',
  openGraph: {
    title: 'Simon McQuade - Author of The Agnes Protocol',
    description:
      'Simon McQuade is the pen name of Kris Jugler, author of The Agnes Protocol - political suspense inspired by politics, media, AI, and public influence.',
    url: `${SITE_URL}/author`,
    type: 'profile',
    images: [
      {
        url: HERO_IMAGE,
        alt: 'Kris Jugler with family - author Simon McQuade',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Simon McQuade - Author of The Agnes Protocol',
    description:
      'Simon McQuade is the pen name of Kris Jugler, author of The Agnes Protocol. Read four free sample chapters.',
    images: [HERO_IMAGE],
  },
};

export default function AuthorPage() {
  return <AuthorPageClient />;
}
