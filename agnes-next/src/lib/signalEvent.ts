import { prisma } from '@/lib/db';

/**
 * Generate ribbon event text from signal content.
 * Examples:
 * - "Signal detected — Bangkok warehouse footage uploaded."
 * - "Archive update — orphanage rooftop photo added."
 * - "New theory prompt — Does anyone really control the Protocol?"
 */
function buildEventText(signal: {
  type?: string | null;
  title?: string | null;
  content?: string | null;
  text: string;
  mediaType?: string | null;
}): string {
  const title = signal.title || signal.content || signal.text;
  const type = signal.type || '';

  if (type === 'ARCHIVE') {
    return `Archive update — ${title}.`;
  }
  if (type === 'PLAYER_QUESTION' || type === 'PODCASTER_PROMPT') {
    return `New theory prompt — ${title}`;
  }
  if (signal.mediaType === 'video' && title) {
    return `Signal detected — ${title}.`;
  }
  if (signal.mediaType === 'image' && title) {
    return `Signal detected — ${title}.`;
  }

  return `Signal detected — ${title}.`;
}

export async function createSignalEvent(signalId: string, customText?: string): Promise<void> {
  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    select: { type: true, title: true, content: true, text: true, mediaType: true },
  });

  if (!signal) return;

  const eventText = customText ?? buildEventText(signal);

  await prisma.signalEvent.create({
    data: { signalId, eventText },
  });
}
