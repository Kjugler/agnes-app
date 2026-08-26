import { PROVIDER_WARNING, readerLifecycleBannerText, readerLifecycleEditingEnabled } from '../readerLifecyclePreviewModel';
import {
  LOCAL_CLASSIFICATION_NOTE,
  NO_NURTURE_JOB,
  WEBSITE_PURCHASE_CANNOT_EDIT,
} from './readerLifecycleEditModel';
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
  const banner = readerLifecycleBannerText();
  const editingEnabled = readerLifecycleEditingEnabled();
  return (
    <div className={listStyles.page}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px 0' }}>
        Reader Lifecycle detail
      </h1>
      <p className={listStyles.banner} role="status">
        {banner}
      </p>
      <p className={listStyles.warning} role="note">
        {PROVIDER_WARNING}
      </p>
      <p className={listStyles.warning} role="note">
        {WEBSITE_PURCHASE_CANNOT_EDIT} {NO_NURTURE_JOB} {LOCAL_CLASSIFICATION_NOTE}
      </p>
      <ReaderLifecycleDetailClient readerProfileId={readerProfileId} editingEnabled={editingEnabled} />
    </div>
  );
}
