import '../styles/globals.css'; // keep this

export const metadata = {
  title: 'Agnes App',
  description: 'Welcome to the Agnes Protocol App',
};

// ⬇️ assumes you placed the generic wiring at src/components/CheckoutWiring.tsx
import CheckoutWiring from './contest/CheckoutWiring';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        {/* Global, invisible, zero animation/layout impact */}
        <CheckoutWiring />
      </body>
    </html>
  );
}

