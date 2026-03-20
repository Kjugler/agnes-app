import { Metadata } from 'next';
import { redirect } from 'next/navigation';

type Props = {
  searchParams: Promise<{ v?: string; ref?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const v = Number(params.v || '1');
  const validV = [1, 2, 3].includes(v) ? v : 1;

  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://agnes-dev.ngrok-free.app';
  const image = `${origin}/images/fb/fb${validV}.jpg`;
  const video = `${origin}/videos/ig${validV}.mp4`;
  const pageUrl = `${origin}/s/ig?v=${validV}${params.ref ? `&ref=${encodeURIComponent(params.ref)}` : ''}`;

  const title = 'The Agnes Protocol — The End of Truth Begins Here';
  const desc = 'A cinematic thriller that weaponizes truth. #WhereIsJodyVernon';

  return {
    title,
    description: desc,
    openGraph: {
      url: pageUrl,
      type: 'video.other',
      title,
      description: desc,
      images: [{ url: image, width: 1200, height: 630 }],
      videos: [{ url: video, type: 'video/mp4', width: 1280, height: 720 }],
    },
    twitter: { card: 'player', title, description: desc, images: [image] },
  };
}

export default async function IGSharePage({ searchParams }: Props) {
  await searchParams;
  redirect('/');
}
