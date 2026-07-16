/**
 * Reader lifecycle — one state per visitor.
 *
 * UNKNOWN → READING → KNOWN → RETURNING → PURCHASER
 *
 * Jody (and all future reader features) should resolve status through
 * resolveReaderStatus() — never ad-hoc flags.
 */

export const READER_STATUS = {
  UNKNOWN: 'UNKNOWN',
  READING: 'READING',
  KNOWN: 'KNOWN',
  RETURNING: 'RETURNING',
  PURCHASER: 'PURCHASER',
} as const;

export type ReaderStatus = (typeof READER_STATUS)[keyof typeof READER_STATUS];

/** Lifecycle order (low → high). Higher stages subsume lower for messaging. */
export const READER_STATUS_LIFECYCLE: ReaderStatus[] = [
  READER_STATUS.UNKNOWN,
  READER_STATUS.READING,
  READER_STATUS.KNOWN,
  READER_STATUS.RETURNING,
  READER_STATUS.PURCHASER,
];

/**
 * Engagement metrics planned for Jody Dashboard (not implemented yet).
 * Add to buildJodyReport when sample data volume supports them.
 */
export const JODY_DASHBOARD_PLANNED_METRICS = [
  'averageMinutesReading',
  'averageChaptersRead',
  'mostCommonExitChapter',
  'returnRate',
  'averageDaysUntilReturn',
] as const;

export type JodyDashboardPlannedMetric = (typeof JODY_DASHBOARD_PLANNED_METRICS)[number];
