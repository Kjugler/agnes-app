import "../styles/globals.css";
import "../styles/terminal.css";

export const metadata = {
  title: "Agnes App",
  description: "Welcome to the Agnes Protocol App",
};

import { Suspense } from 'react';
import CheckoutWiring from "./contest/CheckoutWiring";
import StressTestBanner from "@/components/StressTestBanner";
import StressTestLayoutWrapper from "@/components/StressTestLayoutWrapper";

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
      <body suppressHydrationWarning={true}>
        <StressTestBanner />
        <StressTestLayoutWrapper>
          {children}
        </StressTestLayoutWrapper>
        {/* Global, invisible, zero animation/layout impact */}
        <Suspense fallback={null}>
          <CheckoutWiring />
        </Suspense>
      </body>
    </html>
  );
}
