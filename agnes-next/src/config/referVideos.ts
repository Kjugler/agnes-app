export type ReferVideoId = 'fb1' | 'fb2' | 'fb3';

export interface ReferVideoConfig {
  id: ReferVideoId;
  label: string; // user-facing label
  thumbnailSrc: string; // points to /public/... path
  videoSrc: string; // points to /public/videos/... path
  description: string;
}

export const REFER_VIDEOS: ReferVideoConfig[] = [
  {
    id: 'fb1',
    label: 'Video 1 – "Agnes Protocol Intro"',
    thumbnailSrc: '/images/fb/fb1.png',
    videoSrc: '/videos/fb1.mp4',
    description: 'Quick teaser introducing The Agnes Protocol.',
  },
  {
    id: 'fb2',
    label: 'Video 2 – "Truth Under Siege"',
    thumbnailSrc: '/images/fb/fb2.png',
    videoSrc: '/videos/fb2.mp4',
    description: 'Highlights the end-of-truth theme and stakes.',
  },
  {
    id: 'fb3',
    label: 'Video 3 – "Play. Win. Ascend."',
    thumbnailSrc: '/images/fb/fb3.png',
    videoSrc: '/videos/fb3.mp4',
    description: 'Focuses on contest, prizes, and the game.',
  },
];

