export function baseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";
}

export function withUtm(path: string, source: string): string {
  const u = new URL(path, baseUrl());
  u.searchParams.set("utm_source", source);
  return u.toString();
}

export const shareTargets = {
  facebook: (url: string) =>
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  x: (url: string, text?: string) =>
    `https://x.com/intent/tweet?url=${encodeURIComponent(url)}${text ? `&text=${encodeURIComponent(text)}` : ""}`,
  linkedin: (url: string) =>
    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  tiktok: (url: string, text?: string) => {
    // TikTok doesn't have a direct share URL, so we use the creative tools
    // Users can copy the URL and paste it in TikTok
    const caption = text ? `${text}\n${url}` : url;
    return `https://www.tiktok.com/upload?lang=en`;
  },
};


