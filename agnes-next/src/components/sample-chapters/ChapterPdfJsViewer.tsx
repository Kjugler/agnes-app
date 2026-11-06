'use client';

import { useEffect, useRef, useState } from 'react';
import { loadPdfJs, type PdfJsDocument, type PdfJsModule } from '@/lib/loadPdfJs';

type ChapterPdfJsViewerProps = {
  pagePath: string;
  title: string;
  pageNumber: number;
  onDocumentLoaded: (pageCount: number) => void;
  onPageDenied?: () => void;
};

export function ChapterPdfJsViewer({
  pagePath,
  title,
  pageNumber,
  onDocumentLoaded,
  onPageDenied,
}: ChapterPdfJsViewerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PdfJsDocument | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pageCount, setPageCount] = useState(0);
  const onLoadedRef = useRef(onDocumentLoaded);
  const onDeniedRef = useRef(onPageDenied);
  onLoadedRef.current = onDocumentLoaded;
  onDeniedRef.current = onPageDenied;

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<PdfJsModule['getDocument']> | null = null;

    (async () => {
      try {
        const res = await fetch(pagePath, { credentials: 'include', cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 403) {
          onDeniedRef.current?.();
          setStatus('error');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }
        const reportedCount = Number(res.headers.get('X-Sample-Page-Count'));
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({
          data: bytes,
          disableRange: true,
          disableStream: true,
          isEvalSupported: false,
        });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }
        pdfRef.current = pdf;
        const count =
          Number.isInteger(reportedCount) && reportedCount > 0 ? reportedCount : pdf.numPages;
        setPageCount(count);
        setStatus('ready');
        onLoadedRef.current(count);
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
      const pdf = pdfRef.current;
      pdfRef.current = null;
      if (pdf) void pdf.destroy();
    };
  }, [pagePath]);

  useEffect(() => {
    if (status !== 'ready') return;
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!pdf || !canvas || !frame || pageNumber < 1 || (pageCount > 0 && pageNumber > pageCount)) return;

    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    let lastKey = '';

    const paint = async () => {
      const width = Math.max(280, Math.min(Math.floor(frame.clientWidth - 8), 840));
      const key = `${pageNumber}:${width}`;
      if (key === lastKey) return;
      lastKey = key;
      const page = await pdf.getPage(1);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const cssScale = width / base.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: cssScale * dpr });
      const context = canvas.getContext('2d');
      if (!context) return;
      renderTask?.cancel();
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      const task = page.render({ canvasContext: context, viewport });
      renderTask = task;
      try {
        await task.promise;
      } catch (err) {
        const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
        if (name === 'RenderingCancelledException') return;
        throw err;
      }
    };

    paint().catch(() => {
      if (!cancelled) setStatus('error');
    });

    const observer = new ResizeObserver(() => {
      paint().catch(() => {
        if (!cancelled) setStatus('error');
      });
    });
    observer.observe(frame);

    return () => {
      cancelled = true;
      renderTask?.cancel();
      observer.disconnect();
    };
  }, [pageCount, pageNumber, status]);

  return (
    <div ref={frameRef} className="chapter-one-canvas-wrap" data-testid="chapter-pdf-frame">
      {status === 'loading' ? <p className="chapter-one-status">Opening chapter…</p> : null}
      {status === 'error' ? (
        <p className="chapter-one-status" role="alert">
          This chapter couldn&apos;t be opened here. Please try again in a moment.
        </p>
      ) : null}
      <canvas
        ref={canvasRef}
        data-testid="chapter-pdf-canvas"
        aria-label={pageCount ? `${title}, page ${pageNumber} of ${pageCount}` : title}
        hidden={status !== 'ready'}
      />
    </div>
  );
}
