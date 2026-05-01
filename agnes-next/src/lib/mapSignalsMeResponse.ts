/**
 * Maps DeepQuill /api/signals/me JSON rows to Signal Room client signal shape.
 */
export type MappedMySignal = {
  id: string;
  text: string;
  title: string | null;
  type: string | null;
  content: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  locationTag: string | null;
  tags: unknown;
  discussionEnabled: boolean;
  isSystem: boolean;
  createdAt: string;
  userEmail: string | null;
  userFirstName: string | null;
  isAuthor: boolean;
  replyCount: number;
  acknowledgeCount: number;
  acknowledged: boolean;
  replies: Array<{
    id: string;
    text: string;
    createdAt: Date | string;
    userEmail?: string | null;
    userFirstName?: string | null;
  }>;
  approvedAt: string | null;
  moderationStatus: string | null;
  heldReason: string | null;
  heldAt: string | null;
  rejectedAt: string | null;
};

export function mapSignalsMeRows(rows: Record<string, unknown>[]): MappedMySignal[] {
  return rows.map((s) => ({
    id: String(s.id),
    text: String(s.text ?? ''),
    title: (s.title as string) ?? null,
    type: (s.type as string) ?? null,
    content: (s.content as string) ?? null,
    mediaType: (s.mediaType as string) ?? null,
    mediaUrl: (s.mediaUrl as string) ?? null,
    locationTag: (s.locationTag as string) ?? null,
    tags: s.tags,
    discussionEnabled: s.discussionEnabled !== false,
    isSystem: !!(s.isSystem as boolean),
    createdAt: s.createdAt as string,
    userEmail: (s.userEmail as string) ?? null,
    userFirstName: (s.userFirstName as string) ?? null,
    isAuthor: true,
    replyCount: 0,
    acknowledgeCount: 0,
    acknowledged: false,
    replies: [],
    approvedAt: (s.approvedAt as string) ?? null,
    moderationStatus: (s.moderationStatus as string) ?? null,
    heldReason: (s.heldReason as string) ?? null,
    heldAt: (s.heldAt as string) ?? null,
    rejectedAt: (s.rejectedAt as string) ?? null,
  }));
}
