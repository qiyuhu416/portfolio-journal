import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavFn } from '@/App';
import { ArticleProvider, ArticleScrollProvider } from '@/routes/ArticleContext';
import { DrawerProvider } from '@/routes/DrawerContext';
import { ArticleDrawer } from '@/components/ArticleDrawer';
import { ExperienceChip } from '@/components/ExperienceChip';
import { EditMode } from '@/components/EditMode';
import { bySlug, articles, findQuadrantBySlug } from '@/content';
import './JournalArticle.css';

type Props = {
  slug: string;
  /** When present, scroll to the section with this id once the article
   *  mounts (instead of starting at the top). Set by deep-link routes
   *  like `#article:slug:sectionId` — see App.tsx route parsing. */
  initialSectionId?: string | null;
  onClose: () => void;
  onNav: NavFn;
};

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

export function JournalArticle({ slug, initialSectionId, onClose, onNav }: Props) {
  const entry = bySlug[slug] ?? articles[0];
  const meta = entry.meta;
  const Body = entry.Body;
  const quadrant = findQuadrantBySlug(slug);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [progress, setProgress] = useState(0);
  // Active section id — last section whose heading is above the reading line
  // (~30% from the top of the scroll viewport). Drives the TOC rail highlight.
  const [activeSection, setActiveSection] = useState<string>('');
  // Hide the sticky top bar on scroll-down past TOP_BAR_HIDE_AT, restore on
  // scroll-up. Same pattern Medium and Substack use — keeps controls
  // discoverable without parking them on the canvas.
  const [topBarHidden, setTopBarHidden] = useState(false);
  // Hover override — when the cursor is in the top strip of the viewport,
  // the bar peeks back even if scroll says it should be hidden. A short
  // leave-delay lets the cursor travel between the hover trap and the bar
  // itself without the bar yo-yo-ing.
  const [topBarHovered, setTopBarHovered] = useState(false);
  const hoverLeaveTimerRef = useRef<number | null>(null);
  const handleTopHoverEnter = () => {
    if (hoverLeaveTimerRef.current !== null) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    setTopBarHovered(true);
  };
  const handleTopHoverLeave = () => {
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      setTopBarHovered(false);
      hoverLeaveTimerRef.current = null;
    }, 200);
  };
  useEffect(() => () => {
    if (hoverLeaveTimerRef.current !== null) window.clearTimeout(hoverLeaveTimerRef.current);
  }, []);
  const lastScrollTopRef = useRef(0);
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
  const restMaxWidth = 1120;
  const minGutter = viewportW < 768 ? 24 : 160;
  const gutterX = Math.max(minGutter, (viewportW - restMaxWidth) / 2) * (1 - modalT);
  const gutterY = 40 * (1 - modalT);
  const modalRadius = 14 * (1 - modalT);
  const modalShadow = `0 ${30 * (1 - modalT)}px ${80 * (1 - modalT)}px rgba(31,30,27,${0.18 * (1 - modalT)})`;
  const backdropAlpha = 0.32 * (1 - modalT);

  // hero: padded "modal" at top → full-bleed as you scroll through the first ~260px

  // scroll tracking — also resets to top when slug changes so clicking
  // "Next" doesn't leave you stranded at the bottom of the new article.
  // If `initialSectionId` is provided, jump to that section instead of the
  // top — the section's id is resolved against the rendered article body
  // (MDX heading anchors), with a small offset to keep the heading off
  // the top edge.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let startTop = 0;
    if (initialSectionId) {
      // querySelector is run after the body renders; on a fresh mount the
      // section element may not be in the DOM yet, so we wait a frame.
      requestAnimationFrame(() => {
        const target = el.querySelector(`#${initialSectionId}`) as HTMLElement | null;
        if (target) {
          el.scrollTop = Math.max(0, target.offsetTop - 24);
          setScrollTop(el.scrollTop);
        }
      });
    } else {
      el.scrollTop = 0;
    }
    setScrollTop(startTop);
    setProgress(0);
    setTopBarHidden(false);
    lastScrollTopRef.current = 0;
    const HIDE_AT = 200;   // don't hide until past hero/title block
    const SHOW_NEAR_TOP = 80;
    const DELTA = 4;       // ignore tiny scroll jitter
    const onScroll = () => {
      const cur = el.scrollTop;
      setScrollTop(cur);
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? cur / max : 0);

      // Bottom-overscroll deflate is sticky: once the user wheels at the
      // bottom, exitPull ramps up and modalT collapses back to rest (full
      // gutters, narrow body). The reset timer in the wheel handler only
      // fires after 1500ms of wheel silence at the bottom — which means if
      // the user scrolls up via native wheel from there, the modal stays
      // in its rest size for the rest of that timer's life, with the
      // article scrolled deep but the modal dressed for "I just opened
      // this." That's the "big margins" stuck state. Snap out the moment
      // the scroll position has actually moved off the bottom edge.
      if (max > 0 && cur < max - 4) {
        // Read latest via setState callback so we don't capture stale values.
        setExitPull((p) => (p > 0 ? 0 : p));
        deflateLatchedRef.current = false;
        if (exitResetTimer.current) {
          window.clearTimeout(exitResetTimer.current);
          exitResetTimer.current = null;
        }
      }

      // Reading line ~30% down — last section above this is "active."
      const line = cur + el.clientHeight * 0.3;
      let active = '';
      for (const section of meta.sections ?? []) {
        const node = el.querySelector<HTMLElement>(`#${section.id}`);
        if (node && node.offsetTop <= line) active = section.id;
      }
      setActiveSection(active);

      const last = lastScrollTopRef.current;
      if (cur > HIDE_AT && cur > last + DELTA) {
        setTopBarHidden(true);
      } else if (cur < last - DELTA || cur < SHOW_NEAR_TOP) {
        setTopBarHidden(false);
      }
      lastScrollTopRef.current = cur;
    };
    el.addEventListener('scroll', onScroll);
    // Compute active section once after the body renders so the TOC rail is
    // highlighted on first paint, before the user scrolls.
    requestAnimationFrame(onScroll);
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

  // Scroll-to-section helper exposed via context so MDX components (e.g.
  // <InlineTOC />) can target the modal's inner scroll container.
  const scrollToSection = useCallback((id: string) => {
    const el = scrollRef.current?.querySelector(`#${id}`) as HTMLElement | null;
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
    }
  }, []);
  const scrollValue = useMemo(
    () => ({ scrollToSection, activeSection, progress, scrollContainerRef: scrollRef }),
    [scrollToSection, activeSection, progress],
  );

  return (
    <DrawerProvider>
    <ArticleProvider value={meta}>
    <ArticleScrollProvider value={scrollValue}>
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
            fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 1.4,
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
            fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: exitPullNorm >= 1 ? meta.tint : 'var(--ink-3)',
            opacity: clamp((exitCloseAmt - 30) / 40, 0, 1),
            pointerEvents: 'none',
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}>
            {exitPullNorm >= 1 ? 'Release to close' : 'Keep pulling'}
          </div>

          {/* Reading progress now lives on the section rail itself (vertical
              fill on the left edge of the TOC) — see sectionRail / floating
              aside below. The horizontal top-of-modal progress bar was removed
              to consolidate progress signals into the TOC. */}

          {/* The floating right-side rail used to live here (faded in on
              scroll, mirroring the inline section-list with active-state
              highlight + progress fill). It's now owned by <InlineTOC />,
              which handles both its own inline placement AND the pinned
              right-rail state — so the morph happens on the same element
              the reader was just looking at, not as a separate widget. */}

          {/* scroll container */}
          <div
            ref={scrollRef}
            style={{
              height: '100%', overflowY: 'auto', overflowX: 'hidden',
              background: 'var(--bg)',
            }}
          >
          {/* Ghost edge — a 3px tinted strip pinned to the top of the modal,
              plus a persistent × peek so the user always has a close
              affordance and a clear "something lives up here" hint while
              the full bar is hidden. Fades out the moment the bar restores
              so the bar's own borderBottom + close button take over. */}
          <div
            style={{
              position: 'sticky', top: 0, zIndex: 8,
              height: 0,
              pointerEvents: 'none',
            }}
          >
            <div aria-hidden style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              height: 3,
              background: meta.tint,
              opacity: (topBarHidden && !topBarHovered) ? 0.7 : 0,
              transition: 'opacity .25s ease',
            }} />
            <button
              onClick={onClose}
              onMouseEnter={(e) => {
                handleTopHoverEnter();
                e.currentTarget.style.background = 'rgba(31,30,27,0.06)';
              }}
              onMouseLeave={(e) => {
                handleTopHoverLeave();
                e.currentTarget.style.background = 'transparent';
              }}
              aria-label="Close"
              style={{
                position: 'absolute', top: 10, left: 24,
                width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 22, lineHeight: 1, color: 'var(--ink-2)',
                padding: 0, borderRadius: 14,
                opacity: (topBarHidden && !topBarHovered) ? 1 : 0,
                pointerEvents: (topBarHidden && !topBarHovered) ? 'auto' : 'none',
                transition: 'opacity .25s ease, background .15s',
              }}
            >
              ×
            </button>
          </div>

          {/* Hover trap — invisible strip at the top of the modal that brings
              the bar back when the cursor approaches. Sits underneath the
              bar (lower z-index) so when the bar is visible, clicks land on
              the bar's buttons; when the bar is hidden, the trap catches the
              cursor and reveals it. */}
          <div
            onMouseEnter={handleTopHoverEnter}
            onMouseLeave={handleTopHoverLeave}
            style={{
              position: 'sticky', top: 0, zIndex: 9,
              height: 0,
              pointerEvents: 'auto',
            }}
          >
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              height: 60,
            }} />
          </div>
          {/* sticky top bar — hides on scroll-down, restores on scroll-up
              OR on hover at the top of the modal. */}
          <div
            onMouseEnter={handleTopHoverEnter}
            onMouseLeave={handleTopHoverLeave}
            style={{
              position: 'sticky', top: 0, zIndex: 10,
              marginTop: -1,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 24px',
              background: 'rgba(250,248,243,0.85)',
              backdropFilter: 'blur(10px)',
              borderBottom: `1px solid rgba(233,227,214,${clamp(scrollTop / 40, 0, 1) * 0.8})`,
              transform: (topBarHidden && !topBarHovered) ? 'translateY(-100%)' : 'translateY(0)',
              opacity: (topBarHidden && !topBarHovered) ? 0 : 1,
              pointerEvents: (topBarHidden && !topBarHovered) ? 'none' : 'auto',
              transition: 'transform .25s ease, opacity .25s ease, border-color .2s',
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
                <div style={{ fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 0.8, color: 'var(--ink-3)' }}>
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
                fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 0.8, color: 'var(--ink-2)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(31,30,27,0.06)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }}>↑</span>
              <span>Share</span>
            </button>
          </div>

          {/* hero image placeholder removed — add back when media is ready */}

          {(() => {
            const useSplit = meta.layout === 'split' && viewportW >= SPLIT_MIN_WIDTH;

            const titleBlock = (
              <>
                <div style={{
                  fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 1.4,
                  textTransform: 'uppercase', color: meta.tint, marginBottom: 16,
                }}>
                  {meta.quality}
                </div>
                <h1
                  className="article-title"
                  style={{
                    fontFamily: 'var(--font-primary)', fontWeight: 500,
                    fontSize: useSplit
                      ? 'clamp(36px, 3.6vw, 52px)'
                      : 'clamp(44px, 6vw, 68px)',
                    lineHeight: 1.04, letterSpacing: -0.8,
                    margin: 0,
                  }}
                  aria-label={meta.title}
                  {...(meta.titleHtml
                    ? { dangerouslySetInnerHTML: { __html: meta.titleHtml } }
                    : { children: meta.title })}
                />
                <div style={{
                  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px',
                  marginTop: 32, paddingBottom: 16,
                  borderBottom: '1px solid var(--line)',
                  fontSize: 13, color: 'var(--ink-3)',
                }}>
                  {meta.experiences && meta.experiences.length > 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                      gap: 6, color: 'var(--ink-3)',
                    }}>
                      <span style={{ marginRight: 4 }}>Reflected from</span>
                      {meta.experiences.map((exp, i) => (
                        <ExperienceChip key={i} exp={exp} tint={meta.tint} />
                      ))}
                    </div>
                  )}
                </div>
              </>
            );

            // sectionRail is the navigational chrome — used in split layout's
            // sticky left column and visually echoed in the floating right-side
            // aside on scroll. Has the mono kicker, the vertical progress
            // track, and active-state highlighting.
            //
            // The *inline* TOC (story-flow placement) is no longer rendered
            // here. The writer drops it themselves via <InlineTOC /> in MDX
            // wherever it fits the narrative — see src/components/InlineTOC.tsx.
            const sectionRail = meta.sections && meta.sections.length > 0 && (
              <nav style={{ marginTop: 32 }}>
                <div style={{
                  fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 1.4,
                  textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 16,
                }}>
                  In this piece
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 4, bottom: 4, width: 2,
                    background: 'var(--line)',
                  }} />
                  <div style={{
                    position: 'absolute', left: 0, top: 4, width: 2,
                    height: `calc((100% - 8px) * ${progress})`,
                    background: 'var(--article-tint)',
                    transition: 'height .15s linear',
                  }} />
                  {meta.sections.map((s) => {
                    const isActive = s.id === activeSection;
                    return (
                      <a key={s.id} href={`#${s.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          const el = scrollRef.current?.querySelector(`#${s.id}`) as HTMLElement | null;
                          if (el && scrollRef.current) {
                            scrollRef.current.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
                          }
                        }}
                        style={{
                          fontFamily: 'var(--serif)', fontSize: 15, lineHeight: 1.35,
                          color: isActive ? 'var(--ink)' : 'var(--ink-3)',
                          fontWeight: isActive ? 500 : 400,
                          textDecoration: 'none',
                          paddingLeft: 16,
                          paddingTop: 4, paddingBottom: 4,
                          transition: 'color .25s, font-weight .25s',
                        }}>
                        {s.label}
                      </a>
                    );
                  })}
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
                    <EditMode slug={slug}>
                      <div className="article-body split-layout" style={{ paddingBottom: 60 }}>
                        <Body />
                      </div>
                    </EditMode>
                  </div>
                </div>
              );
            }

            return (
              <>
                <article style={{ maxWidth: 780, margin: '0 auto', padding: '48px 32px 24px' }}>
                  {titleBlock}
                </article>
                <EditMode slug={slug}>
                  <div className="article-body" style={{ paddingBottom: 60 }}>
                    <Body />
                  </div>
                </EditMode>
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
                fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 1.6,
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
                    fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 1.4,
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
                    fontFamily: 'var(--sans)', fontSize: 16, lineHeight: 1,
                    color: 'var(--ink-3)',
                    transition: 'transform .2s cubic-bezier(.2,.7,.2,1)',
                  }}>→</span>
                </div>
              </a>
            </section>
          )}
          </div>
        </div>
      </div>
      <ArticleDrawer />
    </ArticleScrollProvider>
    </ArticleProvider>
    </DrawerProvider>
  );
}
