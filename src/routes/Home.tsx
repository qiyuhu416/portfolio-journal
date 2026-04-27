import { useEffect, useRef, useState } from 'react';
import type { NavFn } from '@/App';
import { quadrants } from '@/content';
import { QuadrantPanel } from '@/components/QuadrantMap';

type Props = { onNav: NavFn };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function smootherstep(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }

// ——— Camera: zoom paradigm ———
// The "world" is a 2×2 grid of quadrant panels. Scroll drives a camera
// (scale + origin) that pans over the world with a unified gesture between
// reading stops. AXIS_GAP is how close the axis sits to the screen edge at
// full zoom (% of viewport) — smaller = more landing-page, larger = more frame.
const AXIS_GAP = 4;
const OVERVIEW = { scale: 1, ox: 50,            oy: 50 };
const TL_CAM   = { scale: 2, ox: AXIS_GAP,      oy: AXIS_GAP };
const TR_CAM   = { scale: 2, ox: 100 - AXIS_GAP, oy: AXIS_GAP };
const BL_CAM   = { scale: 2, ox: AXIS_GAP,      oy: 100 - AXIS_GAP };
const BR_CAM   = { scale: 2, ox: 100 - AXIS_GAP, oy: 100 - AXIS_GAP };

type Cam = typeof OVERVIEW;
type HoldSeg = { p0: number; p1: number; type: 'hold'; at: Cam; active: string | null };
type MoveSeg = { p0: number; p1: number; type: 'move'; from: Cam; to: Cam; outgoing?: string; incoming?: string };
type Seg = HoldSeg | MoveSeg;

// First slice (0 - LANDING_END) is reserved for the hero "Thinking, out loud."
// reveal — camera holds at OVERVIEW the whole time so the rest of the timeline
// stays clean.
const LANDING_END = 0.06;
const SCHEDULE: Seg[] = [
  { p0: 0.00, p1: 0.10, type: 'hold', at: OVERVIEW, active: null },
  { p0: 0.10, p1: 0.18, type: 'move', from: OVERVIEW, to: TL_CAM, incoming: 'tl' },
  { p0: 0.18, p1: 0.30, type: 'hold', at: TL_CAM,   active: 'tl' },
  { p0: 0.30, p1: 0.38, type: 'move', from: TL_CAM,  to: TR_CAM, outgoing: 'tl', incoming: 'tr' },
  { p0: 0.38, p1: 0.50, type: 'hold', at: TR_CAM,   active: 'tr' },
  { p0: 0.50, p1: 0.58, type: 'move', from: TR_CAM,  to: BL_CAM, outgoing: 'tr', incoming: 'bl' },
  { p0: 0.58, p1: 0.70, type: 'hold', at: BL_CAM,   active: 'bl' },
  { p0: 0.70, p1: 0.78, type: 'move', from: BL_CAM,  to: BR_CAM, outgoing: 'bl', incoming: 'br' },
  { p0: 0.78, p1: 0.90, type: 'hold', at: BR_CAM,   active: 'br' },
  { p0: 0.90, p1: 0.98, type: 'move', from: BR_CAM,  to: OVERVIEW, outgoing: 'br' },
  { p0: 0.98, p1: 1.00, type: 'hold', at: OVERVIEW, active: null },
];

// Unified camera gesture: sinusoidal scale dip + delayed origin pan so the
// camera reads as one "pull, pan, push" beat rather than three simultaneous ones.
function cameraBetween(from: Cam, to: Cam, t: number): Cam {
  const tScale  = smootherstep(t);
  const tOrigin = smootherstep(clamp((t - 0.2) / 0.6, 0, 1));
  const dipAmount = Math.min(from.scale, to.scale) - 1;
  const peekDip = dipAmount * 0.55 * Math.sin(Math.PI * t);
  return {
    scale: lerp(from.scale, to.scale, tScale) - peekDip,
    ox:    lerp(from.ox,    to.ox,    tOrigin),
    oy:    lerp(from.oy,    to.oy,    tOrigin),
  };
}

function segmentAt(p: number): Seg {
  for (const s of SCHEDULE) if (p >= s.p0 && p <= s.p1) return s;
  return SCHEDULE[SCHEDULE.length - 1];
}

function contentOpacity(q: string, p: number, seg: Seg): number {
  if (seg.type === 'hold' && seg.active === q) return 1;
  if (seg.type === 'move') {
    const t = (p - seg.p0) / (seg.p1 - seg.p0);
    if (seg.outgoing === q) return clamp(1 - t / 0.55, 0, 1);
    if (seg.incoming === q) return clamp((t - 0.30) / 0.70, 0, 1);
  }
  return 0;
}

const POS_TO_ID: Record<string, string> = { TL: 'tl', TR: 'tr', BL: 'bl', BR: 'br' };
const ID_TO_POS: Record<string, string> = { tl: 'TL', tr: 'TR', bl: 'BL', br: 'BR' };
const AXIS_PAIR: Record<string, { y: string; x: string }> = {
  tl: { y: 'Qiyu',   x: 'Think' },
  tr: { y: 'Qiyu',   x: 'Do' },
  bl: { y: 'Others', x: 'Think' },
  br: { y: 'Others', x: 'Do' },
};

export function Home({ onNav }: Props) {
  const [viewportW, setViewportW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );
  const [smoothScrollY, setSmoothScrollY] = useState(0);
  const rawScrollRef = useRef(0);

  useEffect(() => {
    const onResize = () => {
      setViewportW(window.innerWidth);
      setViewportH(window.innerHeight);
    };
    const onScroll = () => { rawScrollRef.current = window.scrollY; };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    rawScrollRef.current = window.scrollY;

    // rAF loop: low-pass filter raw scroll so camera motion is smooth on wheel.
    let raf = 0;
    const tick = () => {
      setSmoothScrollY((prev) => {
        const delta = rawScrollRef.current - prev;
        if (Math.abs(delta) < 0.3) return rawScrollRef.current;
        return prev + delta * 0.18;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Scroll range for the full tour (plus a little tail for the footer scroll).
  const tourScrollPx = viewportH * 9;
  const progress = clamp(smoothScrollY / tourScrollPx, 0, 1);

  const seg = segmentAt(progress);
  const camState: Cam = seg.type === 'hold'
    ? seg.at
    : cameraBetween(seg.from, seg.to, (progress - seg.p0) / (seg.p1 - seg.p0));

  // Landing → tour: 0 = pure hero, 1 = full quadrant overview revealed.
  const landingT = clamp(progress / LANDING_END, 0, 1);

  // Project the world's true center back into viewport coords so the crosshair
  // sits on the actual quadrant boundary as the camera moves.
  const crossXPct = camState.ox * (1 - camState.scale) + 50 * camState.scale;
  const crossYPct = camState.oy * (1 - camState.scale) + 50 * camState.scale;
  const crossX = (crossXPct / 100) * viewportW;
  const crossY = (crossYPct / 100) * viewportH;

  // Overview elements visible only at true overview.
  const overviewVis = clamp((1.25 - camState.scale) / 0.25, 0, 1);
  const zoomAmt = clamp((camState.scale - 1) / 1, 0, 1);

  // Active-pair label strengths: Qiyu = top, Others = bottom, Think = left, Do = right.
  const qStr = clamp((50 - camState.oy) / 25, 0, 1);
  const oStr = clamp((camState.oy - 50) / 25, 0, 1);
  const tStr = clamp((50 - camState.ox) / 25, 0, 1);
  const dStr = clamp((camState.ox - 50) / 25, 0, 1);

  const activeId: string = (camState.oy < 50 ? (camState.ox < 50 ? 'tl' : 'tr')
                                             : (camState.ox < 50 ? 'bl' : 'br'));
  const activeQ = quadrants.find((q) => q.pos === ID_TO_POS[activeId]);
  const activeTint = activeQ?.tint ?? 'var(--ink)';

  const jumpToQ = (q: string) => {
    const hold = SCHEDULE.find((s) => s.type === 'hold' && 'active' in s && s.active === q) as HoldSeg | undefined;
    if (!hold) return;
    const midP = (hold.p0 + hold.p1) / 2;
    window.scrollTo({ top: midP * tourScrollPx, behavior: 'smooth' });
  };

  const jumpToAxis = (label: 'Qiyu' | 'Others' | 'Think' | 'Do') => {
    const isRight  = activeId === 'tr' || activeId === 'br';
    const isBottom = activeId === 'bl' || activeId === 'br';
    const target =
      label === 'Qiyu'   ? (isRight  ? 'tr' : 'tl') :
      label === 'Others' ? (isRight  ? 'br' : 'bl') :
      label === 'Think'  ? (isBottom ? 'bl' : 'tl') :
                           (isBottom ? 'br' : 'tr');
    jumpToQ(target);
  };

  function axisLabelStyle(strength: number): React.CSSProperties {
    const active = strength > 0.5 && zoomAmt > 0.3;
    return {
      opacity: lerp(0.7, 0.25 + 0.75 * strength, zoomAmt) * landingT,
      color: active ? (activeTint as string) : 'var(--ink-4)',
      fontWeight: active ? 600 : 500,
      transition: 'color .2s, font-weight .2s',
      pointerEvents: landingT > 0.6 ? 'auto' : 'none',
    };
  }

  const quadrantRect = (pos: string): React.CSSProperties => {
    switch (pos) {
      case 'TL': return { top: 0,     left: 0,     width: '50%', height: '50%' };
      case 'TR': return { top: 0,     left: '50%', width: '50%', height: '50%' };
      case 'BL': return { top: '50%', left: 0,     width: '50%', height: '50%' };
      default:   return { top: '50%', left: '50%', width: '50%', height: '50%' };
    }
  };

  const labelBase: React.CSSProperties = {
    position: 'absolute',
    fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6,
    textTransform: 'uppercase',
    background: 'var(--bg)', padding: '2px 6px',
    border: 'none', cursor: 'pointer',
    zIndex: 21,
  };

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '100vh', zIndex: 10, overflow: 'hidden' }}>
        {/* Landing hero — fades and shrinks slightly as the tour begins */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 1 - landingT,
          transform: `scale(${1 - landingT * 0.06})`,
          pointerEvents: landingT < 0.5 ? 'auto' : 'none',
          zIndex: 35,
        }}>
          <h1 style={{
            fontFamily: 'var(--serif)', fontWeight: 400,
            fontSize: 'clamp(64px, 13vw, 220px)',
            letterSpacing: '-0.04em', lineHeight: 0.95,
            color: 'var(--ink)', margin: 0, textAlign: 'center',
            textWrap: 'balance',
          }}>
            Thinking, <span style={{ fontStyle: 'italic', color: 'var(--warm)' }}>out loud</span>.
          </h1>
        </div>

        {/* Crosshair — lines slide with the camera's projected world-center */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: crossY,
          borderTop: '1px dashed var(--ink-4)',
          opacity: (0.3 + overviewVis * 0.55) * landingT,
          pointerEvents: 'none', zIndex: 20,
        }} />
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: crossX,
          borderLeft: '1px dashed var(--ink-4)',
          opacity: (0.3 + overviewVis * 0.55) * landingT,
          pointerEvents: 'none', zIndex: 20,
        }} />

        {/* Axis labels — clickable, slide with crosshair, emphasize active pair */}
        {/* Qiyu axis — during landing it carries the full wordmark
            (Qiyu Hu · designer · researcher · starter), and the suffix
            collapses into just "Qiyu" as the camera tour begins. */}
        <button onClick={() => jumpToAxis('Qiyu')}
          style={{
            ...labelBase, left: crossX, top: 22, transform: 'translateX(-50%)',
            opacity: lerp(1, lerp(0.7, 0.25 + 0.75 * qStr, zoomAmt), landingT),
            color: (qStr > 0.5 && zoomAmt > 0.3 && landingT > 0.8)
              ? (activeTint as string) : 'var(--ink-3)',
            fontWeight: 500,
            pointerEvents: landingT > 0.6 ? 'auto' : 'none',
            transition: 'color .2s, font-weight .2s',
            display: 'inline-flex', alignItems: 'baseline',
            whiteSpace: 'nowrap',
            zIndex: 36,
          }}>
          <span style={{ color: 'var(--ink)', fontWeight: 500, letterSpacing: 0.4 }}>Qiyu</span>
          <span style={{
            display: 'inline-block',
            maxWidth: lerp(480, 0, landingT),
            overflow: 'hidden',
            opacity: 1 - landingT,
            transition: 'max-width .35s cubic-bezier(.2,.7,.2,1), opacity .25s',
            whiteSpace: 'nowrap',
          }}>
            <span style={{ color: 'var(--ink)', fontWeight: 500, letterSpacing: 0.4 }}>&nbsp;Hu</span>
            {' · designer · researcher · starter'}
          </span>
        </button>
        <button onClick={() => jumpToAxis('Others')}
          style={{ ...labelBase, left: crossX, bottom: 22, transform: 'translateX(-50%)', ...axisLabelStyle(oStr) }}>
          Others
        </button>
        <button onClick={() => jumpToAxis('Think')}
          style={{ ...labelBase, left: 22, top: crossY, transform: 'translateY(-50%)', ...axisLabelStyle(tStr) }}>
          Think
        </button>
        <button onClick={() => jumpToAxis('Do')}
          style={{ ...labelBase, right: 22, top: crossY, transform: 'translateY(-50%)', ...axisLabelStyle(dStr) }}>
          Do
        </button>

        {/* "You are here" breadcrumb — shows the active axis pair once zoomed in */}
        <div style={{
          position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)',
          fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase',
          color: 'var(--ink)', background: 'rgba(251,249,244,0.92)', backdropFilter: 'blur(8px)',
          border: '1px solid var(--line)', borderRadius: 40, padding: '7px 14px',
          opacity: clamp((camState.scale - 1.2) / 0.5, 0, 1) * landingT,
          zIndex: 30, pointerEvents: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 10,
          whiteSpace: 'nowrap',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: activeTint as string }} />
          <span>{AXIS_PAIR[activeId].y}</span>
          <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>·</span>
          <span>{AXIS_PAIR[activeId].x}</span>
        </div>

        {/* World — 2×2 grid of quadrants; transforms drive the camera */}
        <div style={{
          position: 'absolute', inset: 0,
          transform: `scale(${camState.scale})`,
          transformOrigin: `${camState.ox}% ${camState.oy}%`,
          willChange: 'transform',
        }}>
          {quadrants.map((q) => {
            const id = POS_TO_ID[q.pos];
            const vis = contentOpacity(id, progress, seg);
            return (
              <div key={q.id} style={{ position: 'absolute', overflow: 'hidden', ...quadrantRect(q.pos) }}>
                {/* subtle tint wash per quadrant — only visible at overview */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: `color-mix(in srgb, ${q.tint} 5%, transparent)`,
                  opacity: overviewVis * landingT,
                  pointerEvents: 'none',
                }} />

                {/* overview-label: section title in 2×2 preview */}
                <div style={{
                  position: 'absolute', left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)', textAlign: 'center',
                  opacity: overviewVis * landingT, pointerEvents: 'none',
                  maxWidth: 260,
                }}>
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.8,
                    textTransform: 'uppercase', color: q.tint, marginBottom: 8,
                  }}>{q.axis}</div>
                  <h2 style={{
                    fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 38,
                    letterSpacing: -1, color: 'var(--ink)', margin: 0, lineHeight: 1.05,
                  }}>{q.label}.</h2>
                  <div style={{
                    fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14,
                    color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.4,
                  }}>{q.sub}</div>
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.4,
                    textTransform: 'uppercase', color: 'var(--ink-4)', marginTop: 12,
                  }}>{q.items.length || '—'} {q.items.length === 1 ? 'piece' : 'pieces'}</div>
                </div>

                {/* panel-wrap: 200%×200% + scale(0.5) so the panel reads at full
                    viewport size when the world is scaled 2×. Existing QuadrantPanel
                    layouts (list / gallery / quotes / scatter) render unchanged inside. */}
                <div style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '200%', height: '200%',
                  transform: 'scale(0.5)', transformOrigin: '0 0',
                  opacity: vis,
                  pointerEvents: vis > 0.5 ? 'auto' : 'none',
                  transition: 'opacity .25s',
                }}>
                  <QuadrantPanel q={q} opacity={1} fade={1} onNav={onNav} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Scroll hint — visible only at very start */}
        <div style={{
          position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
          opacity: clamp((0.04 - progress) / 0.04, 0, 1),
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6,
          textTransform: 'uppercase', color: 'var(--ink-3)',
          pointerEvents: 'none', zIndex: 40,
        }}>
          <span>scroll to explore</span>
          <span style={{ width: 1, height: 20, background: 'var(--ink-4)', animation: 'scrollHint 1.8s ease-in-out infinite' }} />
        </div>
      </div>

      {/* Scroll driver — provides the scroll range the camera reads */}
      <div style={{ height: `${tourScrollPx}px` }} />

      <footer style={{
        position: 'relative', zIndex: 50,
        background: 'var(--surface)',
        borderTop: '1px solid var(--line)',
        padding: '72px 48px 32px',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 48 }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6,
              textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 18,
            }}>
              Why this site is shaped this way
            </div>
            <p style={{
              fontFamily: 'var(--serif)', fontWeight: 400,
              fontSize: 'clamp(22px, 2vw, 28px)', lineHeight: 1.35, letterSpacing: -0.3,
              color: 'var(--ink)', margin: 0, textWrap: 'balance',
            }}>
              Most portfolios show what I&rsquo;ve done. This one shows the shape of the thinking behind it — what I read, who I listen to, what I start without permission.
            </p>
            <p style={{
              fontFamily: 'var(--serif)', fontStyle: 'italic',
              fontSize: 18, lineHeight: 1.45, color: 'var(--ink-2)',
              margin: '14px 0 0', textWrap: 'pretty',
            }}>
              If you hire me for the skills list, you hire half of me.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 420 }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6,
                textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10,
              }}>
                Colophon
              </div>
              <div style={{
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 18, lineHeight: 1.35, color: 'var(--ink-3)',
              }}>
                Still being drawn. Most of it still in pencil.
              </div>
            </div>
            <nav style={{ display: 'flex', gap: 28, fontSize: 13, color: 'var(--ink-2)', flexWrap: 'wrap' }}>
              <a href="#">As a Designer</a>
              <a href="#">As a Collaborator</a>
              <a href="#">Resume<span style={{ color: 'var(--ink-4)' }}> ↗</span></a>
              <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer">LinkedIn<span style={{ color: 'var(--ink-4)' }}> ↗</span></a>
            </nav>
          </div>

          <div style={{
            fontFamily: 'var(--serif)', fontWeight: 400,
            fontSize: 'clamp(72px, 14vw, 180px)',
            letterSpacing: '-0.04em', lineHeight: 0.92,
            color: 'var(--ink)',
            whiteSpace: 'nowrap',
          }}>
            Qiyu <span style={{ fontStyle: 'italic', color: 'var(--warm)' }}>Hu</span>.
          </div>

          <div style={{ borderTop: '1px solid var(--line)' }} />

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            gap: 24, flexWrap: 'wrap',
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.4,
            textTransform: 'uppercase', color: 'var(--ink-3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: 'var(--warm)',
                animation: 'livePulse 2.4s ease-in-out infinite',
              }} />
              Open to work
            </div>
            <div style={{ textAlign: 'right', lineHeight: 1.6 }}>
              <div>Anywhere · U.S.</div>
              <div>Any industry</div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
