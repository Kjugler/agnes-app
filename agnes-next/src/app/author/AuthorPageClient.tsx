'use client';

import Link from 'next/link';
import { useEffect, useRef, type CSSProperties } from 'react';
import { trackMeta } from '@/lib/metaPixel';
import { trackTikTok } from '@/lib/tiktokPixel';
import SiteFooter from '@/components/SiteFooter';

const HERO_SRC = '/images/author/family-hero.jpg';

const primaryCtaStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '14px 24px',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  borderRadius: '8px',
  background: '#00ff7f',
  color: '#0a0a0a',
  border: 'none',
};

const secondaryCtaStyle: CSSProperties = {
  ...primaryCtaStyle,
  background: 'transparent',
  color: '#00ffe5',
  border: '2px solid #00ffe5',
};

const sectionHeadingStyle: CSSProperties = {
  margin: '0 0 24px 0',
  fontSize: '1.5rem',
  fontWeight: 600,
  color: '#00ff7f',
};

const bodyStyle: CSSProperties = {
  fontSize: '17px',
  lineHeight: 1.75,
  color: '#d8d8d8',
};

function CtaPair({ primaryOnly = false }: { primaryOnly?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '32px' }}>
      <Link href="/sample-chapters" style={primaryCtaStyle}>
        Read Sample Chapters
      </Link>
      {!primaryOnly && (
        <Link href="/catalog" style={secondaryCtaStyle}>
          Buy the Book
        </Link>
      )}
    </div>
  );
}

export default function AuthorPageClient() {
  const viewFiredRef = useRef(false);

  useEffect(() => {
    if (viewFiredRef.current) return;
    viewFiredRef.current = true;
    trackTikTok('ViewContent', {
      content_id: 'author',
      content_name: 'Simon McQuade Author Page',
      content_type: 'product',
    });
    trackMeta('ViewContent', {
      content_ids: ['author'],
      content_name: 'Simon McQuade Author Page',
      content_type: 'product',
    });
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f5f5f5' }}>
      {/* Hero — trust anchor */}
      <section
        style={{
          background: 'linear-gradient(180deg, #f4f0e8 0%, #ebe6dc 100%)',
          color: '#1a1a1a',
          padding: '48px 20px 56px',
        }}
      >
        <div style={{ maxWidth: '920px', margin: '0 auto' }}>
          <p
            style={{
              margin: '0 0 12px 0',
              fontSize: '13px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#5c5348',
              fontWeight: 600,
            }}
          >
            About the Author
          </p>
          <h1
            style={{
              margin: '0 0 8px 0',
              fontSize: 'clamp(1.85rem, 4vw, 2.5rem)',
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#141414',
            }}
          >
            Meet Simon McQuade
          </h1>
          <p
            style={{
              margin: '0 0 28px 0',
              fontSize: 'clamp(1.05rem, 2.5vw, 1.25rem)',
              fontWeight: 500,
              color: '#4a4338',
            }}
          >
            The pen name of Kris Jugler
          </p>

          <figure style={{ margin: 0 }}>
            <img
              src={HERO_SRC}
              alt="Kris Jugler smiling outdoors with two young sons in front of flowering greenery"
              decoding="async"
              fetchPriority="high"
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                maxWidth: '100%',
                borderRadius: '8px',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.12)',
                filter: 'brightness(1.03) contrast(1.02) saturate(1.04)',
              }}
            />
            <figcaption
              style={{
                marginTop: '14px',
                fontSize: '14px',
                lineHeight: 1.55,
                color: '#5c5348',
                fontStyle: 'italic',
              }}
            >
              Husband, father, and grandfather — the life behind the pen name.
            </figcaption>
          </figure>

          <p
            style={{
              margin: '28px 0 0 0',
              fontSize: '17px',
              lineHeight: 1.75,
              color: '#2a2620',
            }}
          >
            Simon McQuade writes political suspense. Kris Jugler lived the life that made those
            stories necessary. Before you read <em>The Agnes Protocol</em>, you deserve to know
            there is a real person on the other side of the page.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '28px' }}>
            <Link href="/sample-chapters" style={primaryCtaStyle}>
              Read Sample Chapters
            </Link>
            <Link
              href="/catalog"
              style={{
                ...secondaryCtaStyle,
                color: '#1a5c4a',
                borderColor: '#1a5c4a',
              }}
            >
              Buy the Book
            </Link>
          </div>
        </div>
      </section>

      {/* Biography */}
      <section style={{ padding: '56px 20px', borderTop: '1px solid #222' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <h2 style={sectionHeadingStyle}>The road to the page</h2>
          <div style={bodyStyle}>
            <p style={{ margin: '0 0 1.1em 0' }}>
              Kris Jugler grew up in South Ogden, Utah — a kid who learned early that the world
              does not always meet you where you are.
            </p>
            <p style={{ margin: '0 0 1.1em 0' }}>
              At fourteen, he was homeless in Ogden. Athletics did not fix everything, but it gave
              him structure when little else did: discipline, teammates, and proof that effort could
              open doors that seemed permanently closed.
            </p>
            <p style={{ margin: '0 0 1.1em 0' }}>
              A track scholarship took him to the College of Eastern Utah. A football scholarship
              later brought him to Weber State. Sport was never the whole story, but it was part of
              how he survived — and how he learned to compete without losing himself.
            </p>
            <p style={{ margin: '0 0 1.1em 0' }}>
              He went on to work for the U.S. government, including two years at the Pentagon. That
              experience did not make him cynical. It made him watchful. He saw how politics,
              media, influence, and public opinion interact when the stakes are real — and how
              easily a narrative can replace the truth if no one pushes back.
            </p>
            <p style={{ margin: 0 }}>
              Today he is a husband, father, grandfather, and coach. He writes because stories are
              how he makes sense of what he has seen — and because readers deserve fiction that
              respects their intelligence.
            </p>
          </div>
        </div>
      </section>

      {/* Why The Agnes Protocol */}
      <section
        style={{
          padding: '56px 20px',
          background: '#080808',
          borderTop: '1px solid #222',
        }}
      >
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <h2 style={{ ...sectionHeadingStyle, color: '#00ffe5' }}>Why The Agnes Protocol</h2>
          <div style={{ ...bodyStyle, color: '#c8c8c8' }}>
            <p style={{ margin: '0 0 1.1em 0' }}>
              <em>The Agnes Protocol</em> is fiction. The questions it asks are not.
            </p>
            <p style={{ margin: '0 0 1.1em 0' }}>
              Kris spent years watching how information moves — who shapes it, who benefits, and how
              quickly a crowd can be steered when curiosity gives way to certainty. Politics,
              media, influence, and artificial intelligence all play a part. The novel sits at that
              intersection: truth versus narrative, and what happens when the two diverge.
            </p>
            <p style={{ margin: 0 }}>
              It is not a manifesto and not a prediction. It is a story that lets readers sit with
              uncomfortable possibilities — and decide for themselves what matters. Simon McQuade
              exists to tell that kind of fiction clearly, without preaching and without pretending
              to have every answer.
            </p>
          </div>
        </div>
      </section>

      {/* Why Simon McQuade */}
      <section style={{ padding: '56px 20px', borderTop: '1px solid #222' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <h2 style={sectionHeadingStyle}>Why Simon McQuade</h2>
          <div style={bodyStyle}>
            <p style={{ margin: '0 0 1.1em 0' }}>
              Kris Jugler publishes nonfiction under his own name. His autobiography,{' '}
              <em>Death Couldn&apos;t Convince Me</em>, tells his life plainly — a different kind of
              truth, and a different contract with the reader.
            </p>
            <p style={{ margin: '0 0 1.1em 0' }}>
              Fiction needed its own lane. <strong>Simon McQuade</strong> is that lane: a separate
              brand for suspense, a clear signal about what you are picking up, and room for the
              work to stand on story rather than biography.
            </p>
            <p style={{ margin: 0 }}>
              The name is on the cover. The person behind it is real. That separation is
              intentional.
            </p>
          </div>
        </div>
      </section>

      {/* Prior work */}
      <section
        style={{
          padding: '56px 20px',
          background: '#080808',
          borderTop: '1px solid #222',
        }}
      >
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <h2 style={{ ...sectionHeadingStyle, color: '#00ffe5' }}>Prior work</h2>
          <div style={{ ...bodyStyle, color: '#c8c8c8' }}>
            <p style={{ margin: '0 0 1.1em 0' }}>
              <em>Death Couldn&apos;t Convince Me</em> — Kris Jugler&apos;s autobiography. A
              firsthand account of survival, faith, and the long road from homelessness to a life
              built piece by piece.
            </p>
            <p style={{ margin: 0 }}>
              You do not need to read the memoir to enjoy <em>The Agnes Protocol</em>. But if you
              want to understand the author, both books point at the same conviction: truth is worth
              the cost of telling it.
            </p>
          </div>
        </div>
      </section>

      {/* Reader invitation */}
      <section style={{ padding: '56px 20px 48px', borderTop: '1px solid #222' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <h2 style={sectionHeadingStyle}>Start reading</h2>
          <div style={bodyStyle}>
            <p style={{ margin: '0 0 1.1em 0' }}>
              If you&apos;re wondering what all the excitement is about, don&apos;t take my word for
              it. Read the first four chapters. By then, you&apos;ll know whether this story is for
              you.
            </p>
          </div>
          <CtaPair primaryOnly />
        </div>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <SiteFooter variant="muted" />
        </div>
      </section>
    </main>
  );
}
