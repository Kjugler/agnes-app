import {
  PROVIDER_WARNING,
  READ_ONLY_BANNER,
} from '../readerLifecyclePreviewModel';
import ReaderLifecycleDetailClient from './ReaderLifecycleDetailClient';
import listStyles from '../preview.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ReaderLifecycleDetailPage({
  params,
}: {
  params: Promise<{ readerProfileId: string }>;
}) {
  const { readerProfileId } = await params;
  return (
    <div className={listStyles.page}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px 0' }}>
        Reader Lifecycle detail
      </h1>
      <p className={listStyles.banner} role="status">
        {READ_ONLY_BANNER}
      </p>
      <p className={listStyles.warning} role="note">
        {PROVIDER_WARNING}
      </p>
      <ReaderLifecycleDetailClient readerProfileId={readerProfileId} />
    </div>
  );
}
