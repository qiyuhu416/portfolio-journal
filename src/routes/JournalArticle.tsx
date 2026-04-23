import { useEffect, useMemo, useRef, useState } from 'react';
import type { NavFn } from '@/App';
import { ArticleProvider } from '@/routes/ArticleContext';
import { DrawerProvider } from '@/routes/DrawerContext';
import { ArticleDrawer } from '@/components/ArticleDrawer';
import { bySlug, articles, findQuadrantBySlug } from '@/content';
import './JournalArticle.css';

type Props = { slug: string; onClose: () => void; onNav: NavFn };

type NextInfo = {
  slug: string;
  title: string;
  dek?: string;
  tag?: string;
  meta?: string;
  quadrantLabel?: string;
  quadrantTint?: string;
};

function computeNext(currentSlug: string): NextInfo | null {
  // Prefer the next item in the same quadrant so context stays consistent.
  const currentQ = findQuadrantBySlug(currentSlug);
  if (currentQ) {
    const idx = currentQ.items.findIndex((it) => it.href === `#article:${currentSlug}`);
    if (idx >= 0) {
      for (let off = 1; off <= currentQ.items.length; off++) {
        const item = currentQ.items[(idx + off) % currentQ.items.length];
        if (item.href.startsWith('#article:')) {
          const s = item.href.slice(9);
          if (s !== currentSlug) {
            return {
              slug: s, title: item.title, dek: item.dek, tag: item.tag, meta: item.meta,
              quadrantLabel: currentQ.label, quadrantTint: currentQ.tint,
            };
          }
        }
      }
    }
  }
  // Fallback: next article in global order across all quadrants.
  const globalIdx = articles.findIndex((a) => a.meta.slug === currentSlug);
  if (globalIdx >= 0 && articles.length > 1) {
    const n = articles[(globalIdx + 1) % articles.length];
    if (n.meta.slug !== currentSlug) {
      const nq = findQuadrantBySlug(n.meta.slug);
      return {
        slug: n.meta.slug, title: n.meta.title, dek: n.meta.dek,
        quadrantLabel: nq?.label, quadrantTint: nq?.tint,
      };
    }
  }
  return null;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

const SPLIT_MIN_WIDTH = 960;

export function JournalArticle({ slug, onClose, onNav }: Props) {
  const entry = bySlug[slug] ?? articles[0];
  const meta = entry.meta;
  const Body = entry.Body;
  const quadrant = findQuadrantBySlug(slug);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [progress, setProgress] = useState(0);
  const [viewportW, setViewportW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );

  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // modal → fullscreen on scroll
  const modalT = clamp(scrollTop / 280, 0, 1);
  const restMaxWidth = 1140;
  const gutterX = Math.max(32, (viewportW - restMaxWidth) / 2) * (1 - modalT);
  const gutterY = 40 * (1 - modalT);
  const modalRadius = 14 * (1 - modalT);
  const modalShadow = `0 ${30 * (1 - modalT)}px ${80 * (1 - modalT)}px rgba(31,30,27,${0.18 * (1 - modalT)})`;
  const backdropAlpha = 0.32 * (1 - modalT);
  const sidebarT = clamp((modalT - 0.75) / 0.25, 0, 1);

  // hero: padded "modal" at top → full-bleed as you scroll through the first ~260px
  const heroT = clamp(scrollTop / 260, 0, 1);
  const heroPadX = 40 * (1 - heroT);
  const heroPadTop = 32 * (1 - heroT);
  const heroRadius = 8 * (1 - heroT);

  // scroll tracking — also resets to top when slug changes so clicking
  // "Next" doesn't leave you stranded at the bottom of the new article.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    setScrollTop(0);
    setProgress(0);
    const onScroll = () => {
      setScrollTop(el.scrollTop);
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? el.scrollTop / max : 0);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [slug]);

  const next = useMemo(() => computeNext(slug), [slug]);

  // ESC to close
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Lock body scroll behind the overlay
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: meta.title, url }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(url); } catch {}
  };

  return (
    <DrawerProvider>
    <ArticleProvider value={meta}>
      <div
        onClick={(e) => { if (e.target === e.currentTarget && modalT < 0.1) onClose(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: `rgba(31,30,27,${backdropAlpha})`,
          ['--article-tint' as string]: meta.tint,
        }}
      >
        {/* modal container — centered at rest, expands to fullscreen on scroll */}
        <div style={{
          position: 'absolute',
          top: gutterY, bottom: gutterY, left: gutterX, right: gutterX,
          background: 'var(--bg)',
          borderRadius: modalRadius,
          boxShadow: modalShadow,
          overflow: 'hidden',
        }}>
          {/* reading progress — thin line above everything */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 12, pointerEvents: 'none' }}>
            <div style={{ height: '100%', background: meta.tint, width: `${progress * 100}%`, transition: 'width .1s linear' }} />
          </div>

          {/* floating section rail — centered layouts only.
              In split layout the rail lives inside the left column instead. */}
          {meta.layout !== 'split' && sidebarT > 0.01 && meta.sections && meta.sections.length > 0 && (
            <aside style={{
              position: 'fixed', top: '50%', right: 48,
              width: 200,
              opacity: sidebarT,
              // Vertically center + slide in from the right as sidebarT ramps up.
              transform: `translateY(-50%) translateX(${16 * (1 - sidebarT)}px)`,
              pointerEvents: sidebarT > 0.5 ? 'auto' : 'none',
              zIndex: 8,
            }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4,
                textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 14,
              }}>
                In this piece
              </div>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {meta.sections.map((s) => (
                  <a key={s.id} href={`#${s.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      const el = scrollRef.current?.querySelector(`#${s.id}`) as HTMLElement | null;
                      if (el && scrollRef.current) {
                        scrollRef.current.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
                      }
                    }}
                    style={{
                      fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.35,
                      color: 'var(--ink-3)', textDecoration: 'none',
                      borderLeft: '1px solid var(--line)', paddingLeft: 12,
                    }}>
                    {s.label}
                  </a>
                ))}
              </nav>
            </aside>
          )}

          {/* scroll container */}
          <div
            ref={scrollRef}
            style={{
              height: '100%', overflowY: 'auto',
              background: 'var(--bg)',
            }}
          >
          {/* sticky top bar */}
          <div
            style={{
              position: 'sticky', top: 0, zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 24px',
              background: 'rgba(250,248,243,0.85)',
              backdropFilter: 'blur(10px)',
              borderBottom: `1px solid rgba(233,227,214,${clamp(scrollTop / 40, 0, 1) * 0.8})`,
              transition: 'border-color .2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 22, lineHeight: 1, color: 'var(--ink-2)',
                  padding: 0, borderRadius: 14,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(31,30,27,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                ×
              </button>
              {quadrant && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 0.8, color: 'var(--ink-3)' }}>
                  From{' '}
                  <span style={{ color: 'var(--ink)', fontWeight: 500, textTransform: 'none' }}>
                    {quadrant.label}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={handleShare}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', borderRadius: 6,
                border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 0.8, color: 'var(--ink-2)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(31,30,27,0.06)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }}>↑</span>
              <span>Share</span>
            </button>
          </div>

          {/* hero figure — padded like a modal at rest, expands full-bleed on scroll */}
          <figure
            style={{
              margin: 0,
              padding: `${heroPadTop}px ${heroPadX}px 0`,
            }}
          >
            <div
              style={{
                height: 420,
                background: meta.surface,
                borderRadius: heroRadius,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{
                position: 'absolute', inset: 0,
                background: 'repeating-linear-gradient(45deg, transparent 0 18px, rgba(255,255,255,0.18) 18px 19px)',
              }} />
              <div style={{
                position: 'absolute', top: 22, left: 26,
                fontFamily: 'var(--mono)', fontSize: 10, color: meta.tint,
                letterSpacing: 0.5, opacity: 0.8,
              }}>
                {meta.num} · {meta.quality.toUpperCase()}
              </div>
              <div style={{
                position: 'absolute', bottom: 22, right: 26,
                fontFamily: 'var(--mono)', fontSize: 10, color: meta.tint,
                letterSpacing: 0.6, opacity: 0.7,
              }}>
                {meta.date} · {meta.readtime} min
              </div>
            </div>
          </figure>

          {(() => {
            const useSplit = meta.layout === 'split' && viewportW >= SPLIT_MIN_WIDTH;

            const titleBlock = (
              <>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.4,
                  textTransform: 'uppercase', color: meta.tint, marginBottom: 16,
                }}>
                  {meta.quality}
                </div>
                <h1 style={{
                  fontFamily: 'var(--serif)', fontWeight: 400,
                  fontSize: useSplit
                    ? 'clamp(36px, 3.6vw, 52px)'
                    : 'clamp(44px, 6vw, 68px)',
                  lineHeight: 1.04, letterSpacing: -1.5,
                  margin: 0,
                }}>
                  {meta.title}
                </h1>
                <p style={{
                  fontFamily: 'var(--serif)', fontStyle: 'italic',
                  fontSize: useSplit ? 18 : 22,
                  lineHeight: 1.45, color: 'var(--ink-2)',
                  marginTop: 16,
                }}>
                  {meta.dek}
                </p>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  marginTop: 28, paddingTop: 18,
                  borderTop: '1px solid var(--line)',
                  fontSize: 13, color: 'var(--ink-3)',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 15,
                    background: meta.tint,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 15,
                  }}>q</div>
                  <div>By <b style={{ color: 'var(--ink)' }}>Qiyu Hu</b></div>
                </div>
              </>
            );

            const sectionRail = meta.sections && meta.sections.length > 0 && (
              <nav style={{ marginTop: 32 }}>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4,
                  textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 14,
                }}>
                  In this piece
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {meta.sections.map((s) => (
                    <a key={s.id} href={`#${s.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const el = scrollRef.current?.querySelector(`#${s.id}`) as HTMLElement | null;
                        if (el && scrollRef.current) {
                          scrollRef.current.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
                        }
                      }}
                      style={{
                        fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.35,
                        color: 'var(--ink-3)', textDecoration: 'none',
                        borderLeft: '1px solid var(--line)', paddingLeft: 12,
                        paddingTop: 4, paddingBottom: 4,
                      }}>
                      {s.label}
                    </a>
                  ))}
                </div>
              </nav>
            );

            if (useSplit) {
              return (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(280px, 340px) 1fr',
                  gap: 72,
                  maxWidth: 1240,
                  margin: '0 auto',
                  padding: '56px 48px 0',
                }}>
                  <div style={{ position: 'sticky', top: 80, alignSelf: 'start' }}>
                    {titleBlock}
                    {sectionRail}
                  </div>
                  <div>
                    <div className="article-body split-layout" style={{ paddingBottom: 60 }}>
                      <Body />
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <>
                <article style={{ maxWidth: 780, margin: '0 auto', padding: '48px 32px 24px' }}>
                  {titleBlock}
                </article>
                <div className="article-body" style={{ paddingBottom: 60 }}>
                  <Body />
                </div>
              </>
            );
          })()}

          {/* next article — quadrant-aware, falls back to global order */}
          {next && (
            <section style={{
              maxWidth: 720,
              margin: '64px auto 0',
              padding: '40px 32px 120px',
              borderTop: '1px solid var(--line)',
            }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6,
                textTransform: 'uppercase', color: 'var(--ink-3)',
                marginBottom: 20,
              }}>
                {next.quadrantLabel ? `Next in ${next.quadrantLabel}` : 'Next'}
              </div>

              <a
                href={`#article:${next.slug}`}
                onClick={(e) => { e.preventDefault(); onNav('article:' + next.slug); }}
                style={{
                  display: 'block', textDecoration: 'none', color: 'var(--ink)',
                }}
                onMouseEnter={(e) => {
                  const arrow = e.currentTarget.querySelector('[data-next-arrow]') as HTMLElement | null;
                  if (arrow) arrow.style.transform = 'translateX(6px)';
                }}
                onMouseLeave={(e) => {
                  const arrow = e.currentTarget.querySelector('[data-next-arrow]') as HTMLElement | null;
                  if (arrow) arrow.style.transform = 'translateX(0)';
                }}
              >
                {next.tag && (
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4,
                    textTransform: 'uppercase',
                    color: next.quadrantTint ?? meta.tint,
                    marginBottom: 12,
                  }}>
                    {next.tag}
                  </div>
                )}
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 14,
                  fontFamily: 'var(--serif)', fontWeight: 400,
                  fontSize: 'clamp(28px, 3.2vw, 42px)', lineHeight: 1.08,
                  letterSpacing: -1, color: 'var(--ink)', textWrap: 'balance',
                }}>
                  {next.title}
                  <span data-next-arrow style={{
                    fontFamily: 'var(--mono)', fontSize: 16, lineHeight: 1,
                    color: 'var(--ink-3)',
                    transition: 'transform .2s cubic-bezier(.2,.7,.2,1)',
                  }}>→</span>
                </div>
                {next.dek && (
                  <div style={{
                    fontFamily: 'var(--serif)', fontStyle: 'italic',
                    fontSize: 17, lineHeight: 1.45, color: 'var(--ink-3)',
                    marginTop: 8, maxWidth: 520, textWrap: 'pretty',
                  }}>
                    {next.dek}
                  </div>
                )}
              </a>
            </section>
          )}
          </div>
        </div>
      </div>
      <ArticleDrawer />
    </ArticleProvider>
    </DrawerProvider>
  );
}
