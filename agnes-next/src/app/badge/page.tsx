import { Suspense } from "react";
import BadgeClient from "./BadgeClient";

export default function BadgePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-10">Loading…</div>}>
      <BadgeClient />
    </Suspense>
  );
}
