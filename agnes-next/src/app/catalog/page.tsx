import { Suspense } from 'react';
import CatalogClient from './CatalogClient';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CatalogClient />
    </Suspense>
  );
}
