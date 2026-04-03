import "../styles/globals.css";
import "../styles/terminal.css";

import type { Metadata } from "next";
import { Suspense } from "react";
import CheckoutWiring from "./contest/CheckoutWiring";
import StressTestChrome from "@/components/StressTestChrome";

const SITE_URL = "https://www.theagnesprotocol.com";

export const metadata: Metadata = {
  title: "This is not normal.",
  description: "Something is happening. You weren't supposed to see this.",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "This is not normal.",
    description: "Something is happening. You weren't supposed to see this.",
    url: SITE_URL,
    type: "website",
    images: [
      {
        url: "/og/ghost-writers.jpg",
        alt: "The Agnes Protocol",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "This is not normal.",
    description: "Something is happening. You weren't supposed to see this.",
    images: ["/og/ghost-writers.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* Preload the cruise background to avoid any flash */}
        <link rel="preload" as="image" href="/images/score-bg.jpg" />
      </head>
      <body suppressHydrationWarning={true}>
        <StressTestChrome>{children}</StressTestChrome>
        {/* Global, invisible, zero animation/layout impact */}
        <Suspense fallback={null}>
          <CheckoutWiring />
        </Suspense>
      </body>
    </html>
  );
}
