import "../styles/globals.css";

export const metadata = {
  title: "Agnes App",
  description: "Welcome to the Agnes Protocol App",
};

import CheckoutWiring from "./contest/CheckoutWiring";

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
        {children}
        {/* Global, invisible, zero animation/layout impact */}
        <CheckoutWiring />
      </body>
    </html>
  );
}
