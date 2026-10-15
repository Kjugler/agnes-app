/**
 * PDF.js 4.10.38, the same build as the breakpoint proof of concept.
 * Loaded from this app so chapter rendering does not depend on a CDN.
 */

export const PDFJS_SCRIPT_PATH = '/vendor/pdfjs/4.10.38/pdf.min.mjs';
export const PDFJS_WORKER_PATH = '/vendor/pdfjs/4.10.38/pdf.worker.min.mjs';

export type PdfJsModule = {
  getDocument: (src: Record<string, unknown>) => {
    promise: Promise<PdfJsDocument>;
    destroy: () => void;
  };
  GlobalWorkerOptions: { workerSrc: string };
};

export type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
  destroy: () => Promise<void> | void;
};

export type PdfJsPage = {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
};

export async function loadPdfJs(): Promise<PdfJsModule> {
  const importer = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<PdfJsModule>;
  const pdfjs = await importer(PDFJS_SCRIPT_PATH);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_PATH;
  return pdfjs;
}
