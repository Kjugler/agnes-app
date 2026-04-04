import "../styles/globals.css";
import "../styles/terminal.css";

import type { Metadata } from "next";
import { Suspense } from "react";
import CheckoutWiring from "./contest/CheckoutWiring";
import StressTestChrome from "@/components/StressTestChrome";

const SITE_URL = "https://www.theagnesprotocol.com";
/** Absolute URL for crawlers (og:image, Twitter cards). */
const OG_IMAGE_URL = `${SITE_URL}/og/ghost-writers.jpg`;
const OG_IMAGE = {
  url: OG_IMAGE_URL,
  width: 1200,
  height: 630,
  alt: "The Agnes Protocol",
} as const;

export const metadata: Metadata = {
  title: "This is not normal.",
  description: "Something is happening. You weren't supposed to see this.",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "This is not normal.",
    description: "Something is happening. You weren't supposed to see this.",
    url: SITE_URL,
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "This is not normal.",
    description: "Something is happening. You weren't supposed to see this.",
    images: [OG_IMAGE],
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
