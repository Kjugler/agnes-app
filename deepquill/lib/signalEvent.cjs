// deepquill/lib/signalEvent.cjs
// Generate ribbon event text and create SignalEvent

const { prisma } = require('../server/prisma.cjs');

function buildEventText(signal) {
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

async function createSignalEvent(signalId, customText) {
  if (!prisma) return;

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

module.exports = {
  buildEventText,
  createSignalEvent,
};
