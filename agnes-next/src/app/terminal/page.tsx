import { Suspense } from 'react';

export default function TerminalPage() {
  // Embed terminal Vite app via iframe
  // The iframe src uses a relative path that will be proxied by the route handler
  // Include ?embed=1 to disable AB split redirect in Vite app
  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      <iframe
        src="/terminal-proxy/?embed=1"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
        title="Terminal"
      />
    </div>
  );
}
