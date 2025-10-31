"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type PointsResponse = {
  total: number;
  firstName: string | null;
  earned: { purchase_book: boolean };
};

export default function BadgePage() {
  const searchParams = useSearchParams();
  const sid = searchParams.get("sid");

  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState<number>(0);
  const [earnedPurchase, setEarnedPurchase] = useState<boolean>(false);
  const [confirmed, setConfirmed] = useState<boolean>(false);

  const actions = useMemo(
    () => [
      {
        label: "Bought the Book",
        pts: 500,
        href: undefined as string | undefined,
        earned: earnedPurchase,
      },
      { label: "Joined the Contest", pts: 250, href: "/contest", earned: false },
      { label: "Shared to X", pts: 100, href: "/share/x", earned: false },
      { label: "Shared to Instagram", pts: 100, href: "/share/ig", earned: false },
      { label: "Referred a Friend", pts: 200, href: "/contest/referral", earned: false },
      { label: "Weekly Digest Opt-in", pts: 50, href: "/subscribe", earned: false },
    ],
    [earnedPurchase]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/points/me", { cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const data: PointsResponse = await res.json();
        if (cancelled) return;
        setTotal(data.total);
        setEarnedPurchase(Boolean(data.earned?.purchase_book));
        if (sid) setConfirmed(true);
        // Keep localStorage in sync for fallback scenarios
        try {
          localStorage.setItem("points_total", String(data.total ?? 0));
          localStorage.setItem(
            "earned_purchase_book",
            String(Boolean(data.earned?.purchase_book))
          );
        } catch {}
      } catch {
        // Fallback to localStorage
        let localTotal = 0;
        let localEarnedPurchase = false;
        try {
          const stored = Number(localStorage.getItem("points_total") ?? "0");
          localTotal = Number.isFinite(stored) ? stored : 0;
          localEarnedPurchase = localStorage.getItem("earned_purchase_book") === "true";
        } catch {}

        if (sid) {
          // Confirmed purchase via return URL; award points locally
          localTotal += 500;
          localEarnedPurchase = true;
          setConfirmed(true);
          try {
            localStorage.setItem("points_total", String(localTotal));
            localStorage.setItem("earned_purchase_book", "true");
          } catch {}
        }
        if (!cancelled) {
          setTotal(localTotal);
          setEarnedPurchase(localEarnedPurchase);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sid]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Your Badge</h1>

      {confirmed && (
        <div className="mt-4 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-green-800">
          Thanks! Your purchase was confirmed and points were added.
        </div>
      )}

      <div className="mt-6 rounded-lg border bg-white p-5 shadow-sm">
        <div className="text-sm text-gray-600">Total Points</div>
        <div className="mt-1 text-4xl font-bold">
          {loading ? <span className="animate-pulse text-gray-400">…</span> : total}
        </div>
      </div>

      <div className="mt-8 space-y-2">
        {actions.map((a, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-md border bg-white px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={
                  "h-2.5 w-2.5 rounded-full " +
                  (a.earned ? "bg-green-500" : "bg-gray-300")
                }
                aria-hidden
              />
              <div className="font-medium">{a.label}</div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">{a.pts} pts</div>
              {a.href ? (
                <a
                  href={a.href}
                  className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Do it
                </a>
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-lg border bg-white p-6">
        <div className="text-lg font-semibold">You’re almost in first place.</div>
        <p className="mt-2 text-gray-700">
          There’s a hidden challenge worth 1,000+ bonus points. Catch the rabbit.
        </p>
        <a
          href="/contest/rabbit"
          className="mt-4 inline-flex rounded-md bg-black px-4 py-2 text-white hover:opacity-90"
        >
          Catch the Rabbit
        </a>
      </div>
    </div>
  );
}


