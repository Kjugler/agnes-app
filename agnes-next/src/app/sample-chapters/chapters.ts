/**
 * Chapter configuration for sample chapters.
 * Maps reader route IDs to PDF URLs and titles.
 */
export const CHAPTERS: Record<string, { title: string; pdfUrl: string }> = {
  '1': { title: 'Chapter 1', pdfUrl: '/chapters/chapter1.pdf' },
  '2': { title: 'Chapter 2', pdfUrl: '/chapters/chapter2.pdf' },
  '9': { title: 'Chapter 9', pdfUrl: '/chapters/chapter9.pdf' },
  '45': { title: 'Chapter 45', pdfUrl: '/chapters/chapter45.pdf' },
};

export function getChapter(id: string) {
  return CHAPTERS[id] ?? null;
}

export function isValidChapterId(id: string): id is keyof typeof CHAPTERS {
  return id in CHAPTERS;
}
