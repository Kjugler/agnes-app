import Link from 'next/link';
import ReaderLifecyclePreviewClient from './ReaderLifecyclePreviewClient';
import {
  PROVIDER_WARNING,
  readerLifecycleBannerText,
} from './readerLifecyclePreviewModel';
import styles from './preview.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ReaderLifecyclePreviewPage() {
  const banner = readerLifecycleBannerText();
  return (
    <div className={styles.page}>
      <p style={{ margin: '0 0 12px 0' }}>
        <Link href="/admin" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Admin home
        </Link>
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px 0' }}>
        Reader Lifecycle preview
      </h1>
      <p className={styles.banner} role="status">
        {banner}
      </p>
      <p className={styles.warning} role="note">
        {PROVIDER_WARNING}
      </p>
      <p className={styles.lede}>
        Operational workbench for classified readers. Primary queues are mutually exclusive. This
        screen does not replace Reader Manager and does not send email.
      </p>
      <ReaderLifecyclePreviewClient />
    </div>
  );
}
