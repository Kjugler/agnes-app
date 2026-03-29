import Link from "next/link";

type SearchParams = Promise<{ to?: string; code?: string; v?: string; src?: string }>;

export default async function Page({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (await searchParams) ?? {};
  const fallback = "/start";
  const to = typeof sp.to === "string" && sp.to.startsWith("http") ? sp.to : fallback;

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: '#0a0a0a',
      color: '#f5f5f5',
    }}>
      <div style={{
        maxWidth: '448px',
        width: '100%',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(0, 0, 0, 0.4)',
        padding: '24px',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '20px',
          fontWeight: 600,
          color: '#f5f5f5',
          margin: 0,
        }}>
          Redirecting…
        </h1>
        <p style={{
          marginTop: '8px',
          fontSize: '14px',
          color: 'rgba(245, 245, 245, 0.6)',
        }}>
          If you aren't redirected automatically, use the link below.
        </p>
        <Link
          href={to}
          style={{
            marginTop: '16px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            background: '#10b981',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 500,
            color: '#000',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#059669';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#10b981';
          }}
        >
          Continue
        </Link>
      </div>
    </main>
  );
}
