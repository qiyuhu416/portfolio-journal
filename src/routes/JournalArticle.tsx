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

  // Bottom overscroll: phase 1 shrinks the fullscreen modal back toward rest,
  // phase 2 acts like pull-to-close (handle + caption + dismiss).
  const [exitPull, setExitPull] = useState(0);
  const DEFLATE_DIST = 280;
  const exitDeflate = clamp(exitPull / DEFLATE_DIST, 0, 1);
  const exitCloseAmt = Math.max(0, exitPull - DEFLATE_DIST);

  // modal → fullscreen on scroll (reversed by exitDeflate when user bottom-overscrolls)
  const baseModalT = clamp(scrollTop / 280, 0, 1);
  const modalT = baseModalT * (1 - exitDeflate);
  const restMaxWidth = 1140;
  const gutterX = Math.max(32, (viewportW - restMaxWidth) / 2) * (1 - modalT);
  const gutterY = 40 * (1 - modalT);
  const modalRadius = 14 * (1 - modalT);
  const modalShadow = `0 ${30 * (1 - modalT)}px ${80 * (1 - modalT)}px rgba(31,30,27,${0.18 * (1 - modalT)})`;
  const backdropAlpha = 0.32 * (1 - modalT);
  const sidebarT = clamp((modalT - 0.75) / 0.25, 0, 1);

  // hero: padded "modal" at top → full-bleed as you scroll through the first ~260px
  const baseHeroT = clamp(scrollTop / 260, 0, 1);
  const heroT = baseHeroT * (1 - exitDeflate);
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

  // Pull-to-close at TOP: wheel-up at scrollTop=0 → modal dismisses.
  // Pull-to-close at BOTTOM: two-phase — first the modal shrinks back to rest
  // (exitDeflate reverses fullscreen state), then further wheel-down past the
  // deflate distance triggers the drag animation + close.
  const [pull, setPull] = useState(0);
  const pullResetTimer = useRef<number | null>(null);
  const exitResetTimer = useRef<number | null>(null);
  const closingRef = useRef(false);
  // Threshold raised from 160 → 220 so closing feels intentional, not
  // accidental (paired with the diminishing-input-rate curve below, this
  // means a single trackpad flick can't trip the close).
  const PULL_THRESHOLD = 220;
  // Past this point, each new wheel pixel produces less pull — the gesture
  // gets harder the further you go (rubber-band-style resistance).
  const PULL_SOFT_KNEE = 80;
  // Convert raw pull into the visual displacement amount. Power < 1 = the
  // modal moves a lot at first, then plateaus — feels like dragging a heavy
  // spring rather than sliding a tile.
  const visualPullAmount = (raw: number) => Math.pow(Math.max(0, raw), 0.72) * 2.0;
  // Diminishing accumulation: first PULL_SOFT_KNEE pixels accumulate at full
  // rate; past that, each new wheel-pixel produces a smaller pull increment
  // (rate falls off as pull grows).
  const pullRate = (current: number) =>
    current < PULL_SOFT_KNEE ? 0.45 : 0.45 / (1 + (current - PULL_SOFT_KNEE) / 120);
  // Bottom-exit dwell gate: once the modal has deflated back to rest, the
  // same scroll gesture cannot keep accumulating into pull-to-close. The user
  // must pause (gesture ends) and start a new wheel-down to cross the gate.
  const GESTURE_GAP = 400; // ms of wheel silence = end of gesture
  const DEFLATE_DWELL = 1500; // ms to hold the deflated state before auto-reset
  const lastBottomWheelAtRef = useRef(0);
  const deflateLatchedRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (closingRef.current) return;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      // Top: wheel-up at top → pull to close. Accumulation rate decays past
      // PULL_SOFT_KNEE so the gesture genuinely resists past the easy zone.
      if (e.deltaY < 0 && atTop) {
        e.preventDefault();
        setPull((p) => {
          const next = Math.min(420, p + Math.abs(e.deltaY) * pullRate(p));
          if (next >= PULL_THRESHOLD && !closingRef.current) {
            closingRef.current = true;
            window.setTimeout(() => onClose(), 180);
          }
          return next;
        });
        if (pullResetTimer.current) window.clearTimeout(pullResetTimer.current);
        pullResetTimer.current = window.setTimeout(() => {
          if (!closingRef.current) setPull(0);
        }, 320);
        return;
      }
      // Bottom: wheel-down at bottom → deflate first (phase 1), dwell at rest,
      // then a separate wheel-down gesture pulls to close (phase 2).
      if (e.deltaY > 0 && atBottom) {
        e.preventDefault();
        const now = Date.now();
        const sameGesture = now - lastBottomWheelAtRef.current < GESTURE_GAP;
        lastBottomWheelAtRef.current = now;
        // Starting a new gesture (after a pause) clears the latch, so the
        // next burst of scroll is allowed to cross into pull-to-close.
        if (!sameGesture) deflateLatchedRef.current = false;

        setExitPull((p) => {
          // Dwell gate: if we're already latched in the same gesture, freeze
          // at the deflated position. The user has to lift and try again.
          if (deflateLatchedRef.current) return DEFLATE_DIST;

          // Phase 1 (deflate) uses full rate so the modal shrinks back
          // responsively; phase 2 (close pull) uses the diminishing rate
          // measured against the post-deflate pull amount.
          const phase2Pull = Math.max(0, p - DEFLATE_DIST);
          const rate = p < DEFLATE_DIST ? 0.45 : pullRate(phase2Pull);
          const next = Math.min(DEFLATE_DIST + 420, p + Math.abs(e.deltaY) * rate);

          // Crossing phase 1 → phase 2 mid-gesture triggers the latch and
          // clamps pull so close cannot fire on the same gesture.
          if (p < DEFLATE_DIST && next >= DEFLATE_DIST) {
            deflateLatchedRef.current = true;
            return DEFLATE_DIST;
          }

          if (next - DEFLATE_DIST >= PULL_THRESHOLD && !closingRef.current) {
            closingRef.current = true;
            window.setTimeout(() => onClose(), 180);
          }
          return next;
        });

        if (exitResetTimer.current) window.clearTimeout(exitResetTimer.current);
        exitResetTimer.current = window.setTimeout(() => {
          if (!closingRef.current) {
            setExitPull(0);
            deflateLatchedRef.current = false;
          }
        }, DEFLATE_DWELL);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (pullResetTimer.current) window.clearTimeout(pullResetTimer.current);
      if (exitResetTimer.current) window.clearTimeout(exitResetTimer.current);
    };
  }, [onClose]);

  const pullNorm = clamp(pull / PULL_THRESHOLD, 0, 1);
  // Visual displacement uses a sub-linear curve: small pulls produce
  // big movement (responsive feel), large pulls plateau (resistance feel).
  // Pairs with the diminishing-input-rate above so the modal looks like it's
  // physically resisting the user.
  const visualPull = visualPullAmount(pull) + visualPullAmount(exitCloseAmt);
  const modalPullY = visualPull * 0.45;
  const modalPullScale = 1 - visualPull * 0.0008;
  const exitPullNorm = clamp(exitCloseAmt / PULL_THRESHOLD, 0, 1);

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
          transform: `translateY(${modalPullY}px) scale(${modalPullScale})`,
          transformOrigin: '50% 0',
          transition: pull === 0 && exitPull === 0 ? 'transform .28s cubic-bezier(.2,.7,.2,1), top .24s, bottom .24s, left .24s, right .24s, border-radius .24s' : 'none',
        }}>
          {/* pull-to-close handle: appears on overscroll, widens + darkens past threshold */}
          <div style={{
            position: 'absolute', top: 10, left: '50%',
            transform: `translateX(-50%) translateY(${pull * 0.25}px)`,
            width: 44 + pullNorm * 40,
            height: 4,
            borderRadius: 2,
            background: pullNorm >= 1 ? meta.tint : 'var(--ink-4)',
            opacity: clamp(pull / 24, 0, 1),
            transition: pull === 0 ? 'opacity .2s, width .2s, background .15s' : 'background .15s',
            pointerEvents: 'none',
            zIndex: 20,
          }} />
          <div style={{
            position: 'absolute', top: 24, left: '50%',
            transform: `translateX(-50%) translateY(${pull * 0.25}px)`,
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: pullNorm >= 1 ? meta.tint : 'var(--ink-3)',
            opacity: clamp((pull - 30) / 40, 0, 1),
            pointerEvents: 'none',
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}>
            {pullNorm >= 1 ? 'Release to close' : 'Keep pulling'}
          </div>

          {/* bottom pull-to-close: mirrored handle + caption that appears only
              after the modal has deflated back to rest (phase 2 of exit-pull). */}
          <div style={{
            position: 'absolute', bottom: 10, left: '50%',
            transform: `translateX(-50%) translateY(${exitCloseAmt * -0.25}px)`,
            width: 44 + exitPullNorm * 40,
            height: 4,
            borderRadius: 2,
            background: exitPullNorm >= 1 ? meta.tint : 'var(--ink-4)',
            opacity: clamp(exitCloseAmt / 24, 0, 1),
            transition: exitPull === 0 ? 'opacity .2s, width .2s, background .15s' : 'background .15s',
            pointerEvents: 'none',
            zIndex: 20,
          }} />
          <div style={{
            position: 'absolute', bottom: 24, left: '50%',
            transform: `translateX(-50%) translateY(${exitCloseAmt * -0.25}px)`,
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: exitPullNorm >= 1 ? meta.tint : 'var(--ink-3)',
            opacity: clamp((exitCloseAmt - 30) / 40, 0, 1),
            pointerEvents: 'none',
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}>
            {exitPullNorm >= 1 ? 'Release to close' : 'Keep pulling'}
          </div>

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
              height: '100%', overflowY: 'auto', overflowX: 'hidden',
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
