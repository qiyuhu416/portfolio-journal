import { useEffect } from 'react';
import { useDrawer } from '@/routes/DrawerContext';
import { ArticleProvider } from '@/routes/ArticleContext';
import { bySlug } from '@/content';

export function ArticleDrawer() {
  const { openSlug, close } = useDrawer();

  useEffect(() => {
    if (!openSlug) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [openSlug, close]);

  if (!openSlug) return null;
  const target = bySlug[openSlug];
  if (!target) return null;

  const { meta, Body } = target;

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
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4,
              textTransform: 'uppercase', color: 'var(--ink-3)',
            }}
          >
            Peeking · {meta.num}
          </div>
        </div>

        <ArticleProvider value={meta}>
          <article style={{ padding: '36px 28px 96px', maxWidth: 720, margin: '0 auto' }}>
            <div
              style={{
                fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.4,
                textTransform: 'uppercase', color: meta.tint, marginBottom: 14,
              }}
            >
              {meta.quality}
            </div>
            <h1
              style={{
                fontFamily: 'var(--serif)', fontWeight: 400,
                fontSize: 'clamp(28px, 3.2vw, 42px)', lineHeight: 1.04, letterSpacing: -1,
                margin: 0, textWrap: 'balance',
              }}
            >
              {meta.title}
            </h1>
            <p
              style={{
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 17, lineHeight: 1.4, color: 'var(--ink-2)',
                margin: '14px 0 0',
              }}
            >
              {meta.dek}
            </p>
            <div className="article-body" style={{ marginTop: 28 }}>
              <Body />
            </div>
          </article>
        </ArticleProvider>
      </div>
    </>
  );
}
