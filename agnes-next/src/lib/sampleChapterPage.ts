import { readFile } from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

const FILE_BY_ID: Record<string, string> = {
  '1': 'chapter1.pdf',
  '2': 'chapter2.pdf',
  '9': 'chapter9.pdf',
  '45': 'chapter45.pdf',
};

const sourceCache = new Map<string, Promise<Uint8Array>>();

function sourceBytes(chapterId: string): Promise<Uint8Array> | null {
  const fileName = FILE_BY_ID[chapterId];
  if (!fileName) return null;
  let pending = sourceCache.get(chapterId);
  if (!pending) {
    pending = readFile(path.join(process.cwd(), 'public', 'chapters', fileName)).then(
      (bytes) => new Uint8Array(bytes),
    );
    sourceCache.set(chapterId, pending);
  }
  return pending;
}

/** One page copied into a new PDF. Other pages' content streams are not included. */
export async function readSampleChapterPage(
  chapterId: string,
  pageNumber: number,
): Promise<{ pdf: Uint8Array; pageCount: number } | null> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;
  const bytes = sourceBytes(chapterId);
  if (!bytes) return null;
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(await bytes, { ignoreEncryption: false });
  } catch {
    sourceCache.delete(chapterId);
    return null;
  }
  const pageCount = source.getPageCount();
  if (pageNumber > pageCount) return null;
  const single = await PDFDocument.create();
  const [page] = await single.copyPages(source, [pageNumber - 1]);
  single.addPage(page);
  return { pdf: await single.save(), pageCount };
}
