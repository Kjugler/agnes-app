declare global {
  interface Window {
    uetq?: unknown[] | { push: (...args: unknown[]) => void };
    UET?: new (o: { ti: string; q?: unknown }) => { push: (event: string) => void };
  }
}

export function getMicrosoftUetTagId(): string | null {
  const id = process.env.NEXT_PUBLIC_MICROSOFT_UET_TAG_ID?.trim();
  return id || null;
}

/** UET loads when tag ID is set (production or dev with env configured). */
export function isMicrosoftUetEnabled(): boolean {
  return Boolean(getMicrosoftUetTagId());
}
