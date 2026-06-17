import { useEffect, useRef } from 'react';
import { useDrawer } from '@/routes/DrawerContext';
import { ArticleProvider } from '@/routes/ArticleContext';
import { ExperienceChip } from '@/components/ExperienceChip';
import { bySlug, findQuadrantBySlug } from '@/content';

export function ArticleDrawer() {
  const { openSlug, close } = useDrawer();
  const drawerRef = useRef<HTMLDivElement>(null);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    if (!openSlug) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [openSlug, close]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const drawer = e.currentTarget;
    const currentScrollY = drawer.scrollTop;
    // Close if scrolled up past top (scrollY is 0 or negative delta)
    if (currentScrollY < lastScrollYRef.current && currentScrollY <= 0) {
      close();
    }
    lastScrollYRef.current = currentScrollY;
  };

  if (!openSlug) return null;
  const target = bySlug[openSlug];
  if (!target) return null;

  const { meta, Body } = target;
  // "Home-page articles" — those listed under any quadrant in
  // quadrants.json (Reflection / Create / Learn / Work) — render in PEEK
  // mode inside the drawer: only the first section is visible, with a
  // CTA at the bottom that takes the user to the full article view.
  // Inline-only side articles (not on the home page) render in full,
  // because the drawer IS their primary surface.
  const isHomePageArticle = !!findQuadrantBySlug(openSlug);

  const openFullArticle = () => {
    close();
    window.location.hash = `#article:${openSlug}`;
  };

  return (
    <>
      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 150,
          background: 'rgba(31,30,27,0.32)',
          animation: 'drawerFade .2s ease',
        }}
      />
      <div
        ref={drawerRef}
        onScroll={handleScroll}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(560px, 92vw)',
          zIndex: 160,
          background: 'var(--bg)',
          boxShadow: '-16px 0 48px rgba(31,30,27,0.18)',
          overflowY: 'auto',
          animation: 'drawerSlide .28s cubic-bezier(.2,.7,.2,1)',
        }}
      >
        <div
          style={{
            position: 'sticky', top: 0, zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px',
            background: 'rgba(250,248,243,0.92)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <button
            onClick={close}
            aria-label="Close peek"
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 22, lineHeight: 1, color: 'var(--ink-2)',
              padding: 0, borderRadius: 14,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(31,30,27,0.06)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            ×
          </button>
          <div
            style={{
              font: 'var(--text-caption-2)',
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            Peeking · {meta.num}
          </div>
        </div>

        <ArticleProvider value={meta}>
          <article style={{ padding: '36px 28px 96px', maxWidth: 720, margin: '0 auto' }}>
            <div
              style={{
                font: 'var(--text-caption-2)',
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: meta.tint,
                marginBottom: 14,
              }}
            >
              {meta.quality}
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-primary)',
                fontWeight: 400,
                fontSize: 'clamp(28px, 3.2vw, 42px)',
                lineHeight: 1.04,
                margin: 0,
                textWrap: 'balance',
              }}
            >
              {meta.title}
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: '17px',
                fontWeight: 400,
                lineHeight: 1.4,
                color: 'var(--ink-2)',
                margin: '14px 0 0',
              }}
            >
              {meta.dek}
            </p>
            {meta.experiences && meta.experiences.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 20,
                paddingBottom: 18,
                borderBottom: '1px solid var(--line)',
                font: 'var(--text-caption-1)',
                color: 'var(--ink-3)',
              }}>
                <span style={{ marginRight: 4 }}>Reflected from</span>
                {meta.experiences.map((exp, i) => (
                  <ExperienceChip key={i} exp={exp} tint={meta.tint} />
                ))}
              </div>
            )}
            <div
              className={`article-body${isHomePageArticle ? ' peek-mode' : ''}`}
              style={{ marginTop: 28 }}
            >
              <Body />
            </div>
            {isHomePageArticle && (
              <button
                type="button"
                onClick={openFullArticle}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 28,
                  padding: '18px 22px',
                  background: 'transparent',
                  border: `1px solid ${meta.tint}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-primary)',
                  fontSize: '17px',
                  fontWeight: 400,
                  lineHeight: 1.4,
                  color: meta.tint,
                  textAlign: 'left',
                  transition: 'background .15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `color-mix(in srgb, ${meta.tint} 8%, transparent)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Read the full article →
              </button>
            )}
          </article>
        </ArticleProvider>
      </div>
    </>
  );
}
