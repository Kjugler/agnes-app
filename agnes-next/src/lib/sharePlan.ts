import type { SharePlatform } from './shareAssets';
import type { DeviceType } from './device';

export type VideoDelivery = 'attachment' | 'inline' | 'none';

export type FbMethod = 'preview-dialog' | 'download-and-manual-share';

export type ShareAction = {
  id: string;
  label: string;
  intent: 'copy-caption' | 'download-video' | 'copy-preview-link' | 'open-share-dialog' | 'open-instructions';
  order: number;
};

export type SharePlan = {
  primaryActions: ShareAction[];
  videoDelivery: VideoDelivery;
  instructionsKey: 'desktop' | 'ios' | 'android';
  fbMethod: FbMethod | null;
  showVideoDownload: boolean;
};

function getSharePlan(
  platform: SharePlatform,
  _variant: number,
  device: DeviceType
): SharePlan {
  if (platform === 'fb') {
    return getFbSharePlan(device);
  }
  // TT, IG, X, Truth: same flow for all devices (download + manual share)
  return getDefaultSharePlan(platform, device);
}

function getFbSharePlan(device: DeviceType): SharePlan {
  if (device === 'desktop') {
    return {
      primaryActions: [
        { id: 'copy-caption', label: 'Copy Caption', intent: 'copy-caption', order: 1 },
        { id: 'share-fb', label: 'Share on Facebook', intent: 'open-share-dialog', order: 2 },
      ],
      videoDelivery: 'none',
      instructionsKey: 'desktop',
      fbMethod: 'preview-dialog',
      showVideoDownload: false,
    };
  }
  if (device === 'ios') {
    return {
      primaryActions: [
        { id: 'copy-caption', label: 'Copy Caption', intent: 'copy-caption', order: 1 },
        { id: 'download-video', label: 'Download Video', intent: 'download-video', order: 2 },
        { id: 'open-instructions', label: 'Next: How to Post to Facebook', intent: 'open-instructions', order: 3 },
      ],
      videoDelivery: 'attachment',
      instructionsKey: 'ios',
      fbMethod: 'download-and-manual-share',
      showVideoDownload: true,
    };
  }
  // android: Copy Caption + Post Video to Facebook (inline) + Next
  return {
    primaryActions: [
      { id: 'copy-caption', label: 'Copy Caption', intent: 'copy-caption', order: 1 },
      { id: 'download-video', label: 'Post Video to Facebook', intent: 'download-video', order: 2 },
      { id: 'open-instructions', label: 'Next: How to Post to Facebook', intent: 'open-instructions', order: 3 },
    ],
    videoDelivery: 'inline',
    instructionsKey: 'android',
    fbMethod: 'download-and-manual-share',
    showVideoDownload: true,
  };
}

function getDefaultSharePlan(platform: SharePlatform, device: DeviceType): SharePlan {
  const platformNames: Record<SharePlatform, string> = {
    fb: 'Facebook',
    ig: 'Instagram',
    x: 'X',
    tt: 'TikTok',
    truth: 'Truth Social',
  };
  const name = platformNames[platform];
  return {
    primaryActions: [
      { id: 'copy-caption', label: 'Copy Caption', intent: 'copy-caption', order: 1 },
      { id: 'download-video', label: 'Download Video', intent: 'download-video', order: 2 },
      { id: 'open-instructions', label: `Next: How to Post to ${name}`, intent: 'open-instructions', order: 3 },
    ],
    videoDelivery: device === 'android' ? 'inline' : 'attachment',
    instructionsKey: device === 'desktop' ? 'desktop' : device === 'ios' ? 'ios' : 'android',
    fbMethod: null,
    showVideoDownload: true,
  };
}

export { getSharePlan };
