import "../styles/globals.css";
import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "The Agnes Protocol — The End of Truth Begins Here",
  description: "A cinematic tech-thriller. #WhereIsJodyVernon",
  openGraph: {
    type: "website",
    url: "/",
    title: "The Agnes Protocol — The End of Truth Begins Here",
    description: "A cinematic tech-thriller. #WhereIsJodyVernon",
    images: ["/og-default.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Agnes Protocol — The End of Truth Begins Here",
    description: "A cinematic tech-thriller. #WhereIsJodyVernon",
    images: ["/og-default.jpg"],
  },
};

import CheckoutWiring from "./contest/CheckoutWiring";
import TestModeBanner from "../components/TestModeBanner";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Preload the cruise background to avoid any flash */}
        <link rel="preload" as="image" href="/images/score-bg.jpg" />
      </head>
      <body suppressHydrationWarning>
        <TestModeBanner />
        {children}
        {/* Global, invisible, zero animation/layout impact */}
        <CheckoutWiring />
      </body>
    </html>
  );
}
