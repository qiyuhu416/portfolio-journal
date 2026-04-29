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
    // Cross-fade timing: when both outgoing and incoming exist (quadrant →
    // quadrant), keep them tight (out by 0.55, in starts at 0.30) so they
    // hand off cleanly. When only one side exists (the OVERVIEW ↔ quadrant
    // moves), extend the fade so panel content overlaps with the overview
    // labels — eliminates the brief gap of empty screen mid-zoom.
    if (seg.outgoing === q) {
      const endT = seg.incoming ? 0.55 : 0.85;
      return clamp(1 - t / endT, 0, 1);
    }
    if (seg.incoming === q) {
      const startT = seg.outgoing ? 0.30 : 0.10;
      return clamp((t - startT) / (1 - startT), 0, 1);
    }
  }
  return 0;
}

const POS_TO_ID: Record<string, string> = { TL: 'tl', TR: 'tr', BL: 'bl', BR: 'br' };
const ID_TO_POS: Record<string, string> = { tl: 'TL', tr: 'TR', bl: 'BL', br: 'BR' };

// Quadrant-relative target position for the title at full zoom-in. Calculated
// so each quadrant's title lands at viewport (50%, ~10%) — i.e. the same spot
// the panel header sits — when the camera is parked on that quadrant. The x
// values are slightly off-center (0.54 / 0.46) because the camera origin is at
// 4% / 96% rather than 0% / 100%, leaving a 4% gap for the cross axis.
const TITLE_ZOOM_POS: Record<string, { x: number; y: number }> = {
  tl: { x: 0.54, y: 0.14 },
  tr: { x: 0.46, y: 0.14 },
  bl: { x: 0.54, y: 0.06 },
  br: { x: 0.46, y: 0.06 },
};

// Title visibility per quadrant — different from panel content. Title for the
// focused quadrant (active during a hold, incoming during a move) stays at 1
// throughout the zoom so the same words follow you in. Outgoing fades quickly,
// non-involved quadrants track overviewVis (so they fade as the camera leaves
// overview).
function titleOpacityFor(q: string, p: number, seg: Seg, overviewVis: number): number {
  if (seg.type === 'hold') {
    if (seg.active === null) return overviewVis;
    return seg.active === q ? 1 : 0;
  }
  const t = (p - seg.p0) / (seg.p1 - seg.p0);
  if (seg.incoming === q) return 1;
  if (seg.outgoing === q) return clamp(1 - t * 1.5, 0, 1);
  return overviewVis;
}
const AXIS_PAIR: Record<string, { y: string; x: string }> = {
  tl: { y: 'Qiyu',   x: 'Noticing' },
  tr: { y: 'Qiyu',   x: 'Making' },
  bl: { y: 'Others', x: 'Noticing' },
  br: { y: 'Others', x: 'Making' },
};

// ——— Landing dots ———
// Three dots scattered in the middle area. As scroll advances landingT 0 → 1,
// each dot interpolates to its axis position (Others → bottom, Noticing → left,
// Making → right). QIYU lives in the top-center pill throughout.
// Hover a dot → it stops drifting and a dashed line connects it to QIYU; the
// status text in the pill updates to name Qiyu's relationship with that dot.
type LandingDot = {
  id: string;
  scatter: { x: number; y: number };  // % of viewport at landingT=0
  axis:    { x: number; y: number };  // % of viewport at landingT=1
  status:  string;
  label?:  string;
  floatAnim: 'float-a' | 'float-b' | 'float-c';
  floatDur:  string;
  floatDelay: string;
};
const LANDING_DOTS: LandingDot[] = [
  { id: 'other',  scatter: { x: 0.55, y: 0.42 }, axis: { x: 0.50, y: 0.94 },
    status: 'Listening to Others…', label: 'Others',
    floatAnim: 'float-a', floatDur: '6.4s', floatDelay: '0s' },
  // notice/make axis-x are pulled inboard from the screen edge just enough to
  // clear the NOTICING / MAKING label (which sits at left/right: 22px) without
  // leaving a long stretch of dashed line between the label and its dot.
  { id: 'notice', scatter: { x: 0.24, y: 0.46 }, axis: { x: 0.07, y: 0.50 },
    status: 'Noticing patterns…', label: 'Noticing',
    floatAnim: 'float-b', floatDur: '7.8s', floatDelay: '1.2s' },
  { id: 'make',   scatter: { x: 0.80, y: 0.54 }, axis: { x: 0.93, y: 0.50 },
    status: 'Making things…', label: 'Making',
    floatAnim: 'float-c', floatDur: '5.6s', floatDelay: '2.5s' },
];
const STATUS_BLUE = '#1A6BFF';

// ——— Closing statement ———
// At the very end of the scroll the camera returns to overview and a single
// self-audit sentence fades in over the centered crosshair. Each highlighted
// phrase is a doorway back into one of the quadrant articles — the page closes
// by pointing the reader back into the work it just toured them through.
type ClosingSegment =
  | { type: 'text'; text: string }
  | { type: 'phrase'; text: string; slug: string; tint: string };
const CLOSING_STATEMENT: ClosingSegment[] = [
  { type: 'text',   text: 'What I’m good at: ' },
  { type: 'phrase', text: 'thinking outside the box',  slug: 'thinking-outside-the-box', tint: 'var(--tint-tl)' },
  { type: 'text',   text: ', ' },
  { type: 'phrase', text: 'designing AI products',     slug: 'designing-ai-products',    tint: 'var(--tint-bl)' },
  { type: 'text',   text: ', and ' },
  { type: 'phrase', text: 'prototyping with AI',       slug: 'how-i-use-ai-to-create',   tint: 'var(--tint-tr)' },
  { type: 'text',   text: '. Who I want to work with: people who share ' },
  { type: 'phrase', text: 'the values I design by',    slug: 'values-i-design-by',       tint: 'var(--ink)' },
  { type: 'text',   text: '.' },
];

// Default status phrases — cycle through these when no dot is hovered.
// Should read like a live now-doing feed for an AI-prototyper: specific,
// playful, present-continuous. Hover-driven status (Listening / Noticing /
// Making) overrides whatever's showing here.
const STATUS_PHRASES = [
  'Thinking…',
  'Vibe coding…',
  'Reading at 2am…',
  'Sketching in pencil…',
  'Talking to Claude…',
  'Counting strangers…',
  'Pushing to staging…',
  'Asking "what if?"…',
  'Hosting a meetup…',
  'Roleplaying an LLM…',
  'Looking for the box…',
  'Refactoring at lunch…',
];
const STATUS_INTERVAL_MS = 3200;

export function Home({ onNav }: Props) {
  const [viewportW, setViewportW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );
  const [smoothScrollY, setSmoothScrollY] = useState(0);
  const rawScrollRef = useRef(0);
  const [hoveredDot, setHoveredDot] = useState<string | null>(null);
  const [hoveredQuadrant, setHoveredQuadrant] = useState<string | null>(null);
  const [statusIdx, setStatusIdx] = useState(0);

  // Cycle the default status phrase. Keeps running while a dot is hovered so
  // the rotation just continues underneath the override; un-hovering reveals
  // whatever the cycle is currently on.
  useEffect(() => {
    const id = window.setInterval(
      () => setStatusIdx((i) => (i + 1) % STATUS_PHRASES.length),
      STATUS_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  // Refs to measure the actual rendered positions of QIYU dot + scatter dots,
  // so the dashed connection line lands precisely node-to-node regardless of
  // the pill's variable-width status text or the scatter dot's drift offset.
  const qiyuDotRef = useRef<HTMLSpanElement | null>(null);
  const dotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [linePos, setLinePos] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  useEffect(() => {
    if (!hoveredDot) { setLinePos(null); return; }
    const id = hoveredDot;
    let raf = 0;
    const tick = () => {
      const q = qiyuDotRef.current;
      const d = dotRefs.current[id];
      if (q && d) {
        const qr = q.getBoundingClientRect();
        const dr = d.getBoundingClientRect();
        const x1 = qr.left + qr.width / 2;
        const y1 = qr.top + qr.height / 2;
        const x2 = dr.left + dr.width / 2;
        const y2 = dr.top + dr.height / 2;
        setLinePos((prev) => {
          if (prev
            && Math.abs(prev.x1 - x1) < 0.5 && Math.abs(prev.y1 - y1) < 0.5
            && Math.abs(prev.x2 - x2) < 0.5 && Math.abs(prev.y2 - y2) < 0.5) return prev;
          return { x1, y1, x2, y2 };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hoveredDot]);

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

  // Closing statement fade: starts appearing once the camera is most of the way
  // back to overview at the end of the scroll, fully visible at progress=1.
  const closingT = clamp((progress - 0.93) / 0.07, 0, 1);

  // Active-pair label strengths: Qiyu = top, Others = bottom, Noticing = left,
  // Making = right. Each dot's visibility at zoom is gated by the matching
  // strength so the inactive axes' dots fade rather than piling up on the cross.
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

  const jumpToAxis = (label: 'Qiyu' | 'Others' | 'Noticing' | 'Making') => {
    const isRight  = activeId === 'tr' || activeId === 'br';
    const isBottom = activeId === 'bl' || activeId === 'br';
    const target =
      label === 'Qiyu'     ? (isRight  ? 'tr' : 'tl') :
      label === 'Others'   ? (isRight  ? 'br' : 'bl') :
      label === 'Noticing' ? (isBottom ? 'bl' : 'tl') :
                             (isBottom ? 'br' : 'tr');
    jumpToQ(target);
  };

  function axisLabelStyle(strength: number): React.CSSProperties {
    const active = strength > 0.5 && zoomAmt > 0.3;
    // Hide irrelevant axis labels whenever the camera is zoomed (anything past
    // overview). An "irrelevant" label is one whose strength is low for the
    // current/destination quadrant — at TR (Qiyu·Making) for example, the
    // Others and Noticing labels are irrelevant. Hiding them during move
    // segments, not just at settled hold, keeps the transition clean: only
    // the two labels that name where the camera is heading remain visible.
    const irrelevantAtZoom = zoomAmt > 0.4 && strength < 0.5;
    const baseOpacity = lerp(0.7, 0.25 + 0.75 * strength, zoomAmt) * landingT;
    return {
      opacity: irrelevantAtZoom ? 0 : baseOpacity,
      color: active ? (activeTint as string) : 'var(--ink-4)',
      fontWeight: active ? 600 : 500,
      transition: 'opacity .25s ease, color .2s, font-weight .2s',
      pointerEvents: landingT > 0.6 && !irrelevantAtZoom ? 'auto' : 'none',
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
        {/* Crosshair — lines slide with the camera's projected world-center.
            At overview, the lines terminate at the four axis-node dots
            (7% from left/right for NOTICING/MAKING, 6% from top/bottom for
            QIYU/OTHERS) so no dashes extend beyond the dots. As the camera
            zooms in, dots fade and the lines expand back to the full
            viewport so the cross still anchors to a screen corner. */}
        {/* Reach = how far the line extends from the cross center in each
            direction. At overview the cross sits at the center and reach is
            half the dot-to-dot span; at zoom the cross sits at a corner and
            reach goes to 0 on the corner side (no line past the dot) and to
            the opposite screen edge on the away side. */}
        {(() => {
          const overviewHReach = 50 - 7;  // notice/make at 7% / 93%
          const overviewVReach = 50 - 6;  // qiyu/other at 6% / 94%
          const zoomLeftReach   = crossXPct > 50 ? crossXPct        : 0;
          const zoomRightReach  = crossXPct < 50 ? (100 - crossXPct) : 0;
          const zoomTopReach    = crossYPct > 50 ? crossYPct        : 0;
          const zoomBottomReach = crossYPct < 50 ? (100 - crossYPct) : 0;
          const hLeftReach   = lerp(zoomLeftReach,   overviewHReach, overviewVis);
          const hRightReach  = lerp(zoomRightReach,  overviewHReach, overviewVis);
          const vTopReach    = lerp(zoomTopReach,    overviewVReach, overviewVis);
          const vBottomReach = lerp(zoomBottomReach, overviewVReach, overviewVis);
          const lineOpacity = (0.3 + overviewVis * 0.55) * landingT;
          return (
            <>
              <div style={{
                position: 'absolute',
                left:  `${crossXPct - hLeftReach}%`,
                right: `${100 - (crossXPct + hRightReach)}%`,
                top: crossY,
                borderTop: '1px dashed var(--ink-4)',
                opacity: lineOpacity,
                pointerEvents: 'none', zIndex: 20,
              }} />
              <div style={{
                position: 'absolute',
                top:    `${crossYPct - vTopReach}%`,
                bottom: `${100 - (crossYPct + vBottomReach)}%`,
                left: crossX,
                borderLeft: '1px dashed var(--ink-4)',
                opacity: lineOpacity,
                pointerEvents: 'none', zIndex: 20,
              }} />
              {/* Intersection dot — only renders once the camera has settled
                  on a quadrant (hold segment with an active quadrant). During
                  the actual scroll/zoom motion it stays hidden, so the cross
                  reads as two lines moving rather than a dot dragging across
                  the screen. CSS transition gives it a soft fade-in once the
                  page comes to rest. */}
              <div style={{
                position: 'absolute',
                left: crossX, top: crossY,
                transform: 'translate(-50%, -50%)',
                width: 10, height: 10,
                borderRadius: '50%',
                background: 'var(--ink-3)',
                opacity: (seg.type === 'hold' && seg.active !== null)
                  ? zoomAmt * landingT
                  : 0,
                transition: 'opacity .35s ease',
                pointerEvents: 'none', zIndex: 32,
              }} />
            </>
          );
        })()}

        {/* QIYU axis pill — three absolutely-positioned elements anchored at
            crossX (the QIYU axis node). The dot IS the axis node, with QIYU
            text to its left and the rotating status to its right. Same font
            (mono caps) and same dot size in both "landing" and "axis" states —
            the only thing that changes between them is the status text sliding
            out and fading. The dot follows the camera (via crossX), so the
            pill IS the axis label throughout — no separate "axis dot" needed. */}
        {(() => {
          const hovered = LANDING_DOTS.find((d) => d.id === hoveredDot);
          const status = hovered ? hovered.status : STATUS_PHRASES[statusIdx];
          const statusVis = clamp(1 - landingT * 1.6, 0, 1);
          const statusSlide = landingT * 32;
          // Pill sits in a single horizontal row near the top of the viewport.
          // QIYU sits to the left of the dot, status to the right — same
          // arrangement as the original landing pill. Scroll lifts the whole
          // row up so the dot lands at the QIYU axis node position.
          const pillLandingY = viewportH * 0.10;
          const pillAxisY    = viewportH * 0.05;
          const pillY = lerp(pillLandingY, pillAxisY, smootherstep(landingT));
          // Active-tint behavior on the camera tour — QIYU dims when zoomed
          // away from a Qiyu-row quadrant, brightens when zoomed into one.
          const isQiyuActive = qStr > 0.5 && zoomAmt > 0.3;
          const tourColor = isQiyuActive ? (activeTint as string) : 'var(--ink-3)';
          const colorMix = `color-mix(in srgb, ${tourColor} ${zoomAmt * 100}%, ${STATUS_BLUE})`;
          const pillOpacity = lerp(1, lerp(0.7, 0.25 + 0.75 * qStr, zoomAmt), landingT);
          return (
            <>
              {/* QIYU text — animates from "left of dot" (horizontal pill at
                  landing) to "above dot" (vertical axis label after scroll).
                  Both endpoints anchor at (crossX, pillY); the translate values
                  rotate the label around the dot. */}
              {(() => {
                const t = smootherstep(landingT);
                // X: right-edge anchor (translate-100%) → center-anchor (-50%)
                const txPct = lerp(-100, -50, t);
                // Extra px offset to push QIYU 14px left of dot when horizontal
                const txPx = lerp(-14, 0, t);
                // Y: vertically-centered (-50%) → bottom-edge above dot (-150%)
                const tyPct = lerp(-50, -150, t);
                return (
                  <span style={{
                    position: 'absolute',
                    top: pillY, left: crossX,
                    transform: `translate(${txPct}%, ${tyPct}%) translateX(${txPx}px)`,
                    fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.6,
                    textTransform: 'uppercase', fontWeight: 500,
                    color: colorMix, whiteSpace: 'nowrap',
                    opacity: pillOpacity,
                    pointerEvents: 'none',
                    zIndex: 36,
                  }}>QIYU</span>
                );
              })()}

              {/* Dot — clickable axis node, sits at crossX so it follows the
                  camera into each quadrant during the tour. */}
              <button
                onClick={() => jumpToAxis('Qiyu')}
                aria-label="Qiyu"
                style={{
                  position: 'absolute', top: pillY, left: crossX,
                  transform: 'translate(-50%, -50%)',
                  background: 'transparent', border: 'none', padding: 6, margin: 0,
                  cursor: 'pointer',
                  pointerEvents: landingT > 0.5 ? 'auto' : 'none',
                  opacity: pillOpacity,
                  zIndex: 36,
                }}>
                <span ref={qiyuDotRef} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: colorMix,
                  // Pulse only at landing/overview (live "now-doing" signal).
                  // Once the camera zooms in, the dot is just an axis marker
                  // like the other three, so the pulse stops.
                  animation: zoomAmt < 0.3
                    ? 'livePulse 2.4s ease-in-out infinite'
                    : 'none',
                  display: 'block',
                }} />
              </button>

              {/* Status text — left-aligned just right of the dot. Slides
                  right + fades out as the tour begins, leaving only QIYU + dot. */}
              <span style={{
                position: 'absolute',
                top: pillY,
                left: `${crossX + 14}px`,
                transform: `translateY(-50%) translateX(${statusSlide}px)`,
                fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.6,
                textTransform: 'uppercase', fontWeight: 500,
                color: STATUS_BLUE, whiteSpace: 'nowrap',
                opacity: statusVis,
                pointerEvents: 'none',
                zIndex: 36,
              }}>
                <span key={status} style={{
                  animation: 'statusFade .25s ease',
                  display: 'inline-block',
                }}>{status}</span>
              </span>
            </>
          );
        })()}

        {/* Axis labels — clickable, slide with crosshair, emphasize active pair.
            The Qiyu axis label is suppressed entirely now — the pill above
            already lives at the same position with the same font/style, so
            the pill *is* the Qiyu axis label after status fades out. */}
        <button onClick={() => jumpToAxis('Others')}
          style={{ ...labelBase, left: crossX, bottom: 22, transform: 'translateX(-50%)', ...axisLabelStyle(oStr) }}>
          Others
        </button>
        <button onClick={() => jumpToAxis('Noticing')}
          style={{ ...labelBase, left: 22, top: crossY, transform: 'translateY(-50%)', ...axisLabelStyle(tStr) }}>
          Noticing
        </button>
        <button onClick={() => jumpToAxis('Making')}
          style={{ ...labelBase, right: 22, top: crossY, transform: 'translateY(-50%)', ...axisLabelStyle(dStr) }}>
          Making
        </button>

        {/* Landing tagline — bottom, centered, fades as landingT → 1 */}
        <h1 style={{
          position: 'absolute', left: 0, right: 0, bottom: 72,
          textAlign: 'center',
          fontFamily: 'var(--sans)', fontWeight: 700,
          fontSize: 'clamp(40px, 7.5vw, 110px)',
          lineHeight: 1.05, letterSpacing: -2,
          margin: 0, padding: '0 6%',
          color: 'var(--ink)',
          textWrap: 'balance',
          opacity: clamp(1 - landingT * 1.4, 0, 1),
          pointerEvents: 'none',
          zIndex: 30,
        }}>
          Yo, how might we connect the dots?
        </h1>

        {/* Hover line — node-to-node dashed line from QIYU dot in the pill to
            the hovered scatter dot. Endpoints are measured each frame from the
            actual rendered DOM so they match exactly, accounting for variable
            status-text width and the dot's drift offset. */}
        {linePos && landingT < 0.6 && (
          <svg style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 31,
          }}>
            <line x1={linePos.x1} y1={linePos.y1} x2={linePos.x2} y2={linePos.y2}
              stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 5"
              style={{ opacity: clamp(1 - landingT * 1.6, 0, 1) }} />
          </svg>
        )}

        {/* Three landing dots — drift around at landingT=0, animate to their
            axis positions as user scrolls. They stay visible whenever the camera
            is at overview (so the dots sit on the OTHERS/NOTICING/MAKING node
            labels), and only fade as the camera zooms into a quadrant. Hover
            stops drift (animation is only applied when landingT < 0.6 and not
            hovered). */}
        {LANDING_DOTS.map((d) => {
          const t = smootherstep(landingT);
          // The horizontal axis (notice/make) is fixed to the screen's left/right
          // edges and slides vertically with the cross at zoom. The vertical axis
          // (other) is fixed to the bottom and slides horizontally with the cross.
          // This keeps each dot pinned next to its axis label rather than floating
          // in the content area when the camera is zoomed into a quadrant.
          const isHorizontalAxis = d.id === 'notice' || d.id === 'make';
          const axisX = isHorizontalAxis ? d.axis.x : (crossXPct / 100);
          const axisY = isHorizontalAxis ? (crossYPct / 100) : d.axis.y;
          const x = lerp(d.scatter.x, axisX, t) * viewportW;
          const y = lerp(d.scatter.y, axisY, t) * viewportH;
          const isHovered = hoveredDot === d.id;
          // Per-dot strength gates visibility at zoom: the active axes (e.g. Qiyu
          // + Noticing for TL) keep their dots, the other two fade out so they
          // don't pile up on the cross corner. At overview every strength is 0
          // but zoomAmt is 0 too, so lerp(1, …, 0) → 1 keeps all three visible.
          // (No multiplier on landingT — the dots are the *protagonists* of the
          // landing scatter, not something that fades in with the page.)
          const strength = d.id === 'notice' ? tStr : d.id === 'make' ? dStr : oStr;
          const dotVis = lerp(1, strength, zoomAmt);
          const inDriftRange = landingT < 0.55;
          return (
            <div key={d.id}
              onMouseEnter={() => setHoveredDot(d.id)}
              onMouseLeave={() => setHoveredDot(null)}
              style={{
                position: 'absolute', left: x, top: y,
                transform: 'translate(-50%, -50%)',
                opacity: dotVis,
                zIndex: 32,
                padding: 14,
                cursor: 'default',
                pointerEvents: dotVis > 0.5 ? 'auto' : 'none',
              }}>
              <div
                ref={(el) => { dotRefs.current[d.id] = el; }}
                style={{
                  width: isHovered ? 14 : 10, height: isHovered ? 14 : 10,
                  borderRadius: '50%',
                  background: 'var(--ink-3)',
                  transition: 'width .2s, height .2s, box-shadow .2s',
                  boxShadow: isHovered ? '0 0 0 6px rgba(20,19,15,.08)' : 'none',
                  animation: inDriftRange
                    ? `${d.floatAnim} ${d.floatDur} ease-in-out ${d.floatDelay} infinite`
                    : 'none',
                  animationPlayState: isHovered ? 'paused' : 'running',
                }} />
              {/* Label appears only on hover, fades out as the camera tour begins */}
              {d.label && (
                <div style={{
                  position: 'absolute', left: '50%', top: 0,
                  transform: 'translate(-50%, -150%)',
                  fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500,
                  color: 'var(--ink-2)', whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  opacity: isHovered ? clamp(1 - landingT * 2, 0, 1) : 0,
                  transition: 'opacity .18s',
                }}>{d.label}</div>
              )}
            </div>
          );
        })}

        {/* (The QIYU axis dot used to live here as a separate static element —
            it's now part of the QIYU pill above, which renders the dot at
            crossX directly. One dot, one element, follows the camera.) */}

        {/* "You are here" breadcrumb — shows the active axis pair once zoomed
            in. Anchored to the cross intersection corner: the pill's
            edge-toward-corner is pinned at (crossX, crossY) and the body
            extends inward (toward the active quadrant). Dark fill + white
            text reads as a single solid label sitting on the cross node. */}
        {(() => {
          const onRight  = crossXPct > 50;
          const onBottom = crossYPct > 50;
          const tx = onRight  ? '-100%' : '0%';
          const ty = onBottom ? '-100%' : '0%';
          // Margin from the cross corner so the pill doesn't kiss the screen edge.
          const mx = onRight ? -10 : 10;
          const my = onBottom ? -10 : 10;
          return (
            <div style={{
              position: 'absolute',
              left: crossX + mx, top: crossY + my,
              transform: `translate(${tx}, ${ty})`,
              fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase',
              color: 'var(--bg)', background: 'var(--ink)',
              borderRadius: 40, padding: '9px 16px',
              opacity: clamp((camState.scale - 1.2) / 0.5, 0, 1) * landingT,
              zIndex: 30, pointerEvents: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 10,
              whiteSpace: 'nowrap',
            }}>
              <span>{AXIS_PAIR[activeId].y}</span>
              <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>·</span>
              <span>{AXIS_PAIR[activeId].x}</span>
            </div>
          );
        })()}

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
            const isHovered = hoveredQuadrant === id;
            const isAnyHovered = hoveredQuadrant !== null;
            // The spotlight effect is only meaningful at overview — fades out
            // as the camera zooms into a quadrant.
            const hoverActiveAtOverview = overviewVis * landingT * (1 - closingT);
            const circleOpacity = isHovered ? hoverActiveAtOverview : 0;
            // Title color: white over the dark spotlight when this quadrant is
            // hovered, dimmed grey when another quadrant is hovered, default
            // ink otherwise. Sub/count follow the same rule.
            const titleColor = isHovered
              ? 'var(--bg)'
              : isAnyHovered ? 'var(--ink-4)' : 'var(--ink)';
            const subColor = isHovered ? 'var(--bg)' : 'var(--ink-3)';
            const countColor = isHovered ? 'var(--bg)' : 'var(--ink-4)';
            return (
              <div
                key={q.id}
                onMouseEnter={() => setHoveredQuadrant(id)}
                onMouseLeave={() => setHoveredQuadrant((cur) => (cur === id ? null : cur))}
                onClick={() => { if (overviewVis > 0.5) jumpToQ(id); }}
                style={{
                  position: 'absolute', overflow: 'hidden',
                  cursor: isHovered && overviewVis > 0.5 ? 'pointer' : 'default',
                  ...quadrantRect(q.pos),
                }}
              >
                {/* Spotlight circle — dark disc behind the title that appears
                    while this quadrant is hovered. Counter-scaled so the disc
                    stays a constant visual size regardless of camera zoom. */}
                <div style={{
                  position: 'absolute',
                  top: '50%', left: '50%',
                  transform: `translate(-50%, -50%) scale(${1 / camState.scale})`,
                  transformOrigin: 'center center',
                  width: 320, height: 320,
                  borderRadius: '50%',
                  background: 'var(--ink)',
                  opacity: circleOpacity,
                  transition: 'opacity .25s',
                  pointerEvents: 'none',
                  zIndex: 4,
                }} />

                {/* overview-label: morphs from quadrant center (overview) toward
                    the panel header position (zoomed-in) as the camera zooms. The
                    text stays visible the whole way through — same words follow
                    you from the 2×2 page into the individual quadrant — and a
                    counter-scale keeps the visual size constant. */}
                {(() => {
                  const targetPos = TITLE_ZOOM_POS[id];
                  const easedZoom = smootherstep(zoomAmt);
                  const tX = lerp(0.5, targetPos.x, easedZoom);
                  const tY = lerp(0.5, targetPos.y, easedZoom);
                  // After the title has fully landed at the zoomed-in position,
                  // hand off to the panel's own h2 underneath so they don't
                  // double-render. Fade 0.92 → 1.0 of zoomAmt.
                  const handoffFade = clamp((zoomAmt - 0.92) / 0.08, 0, 1);
                  const opacity = titleOpacityFor(id, progress, seg, overviewVis)
                    * landingT
                    * (1 - handoffFade)
                    * (1 - closingT);
                  return (
                    <div style={{
                      position: 'absolute',
                      left: `${tX * 100}%`, top: `${tY * 100}%`,
                      transform: `translate(-50%, -50%) scale(${1 / camState.scale})`,
                      transformOrigin: 'center center',
                      textAlign: 'center',
                      opacity, pointerEvents: 'none',
                      maxWidth: 260,
                      zIndex: 5,
                    }}>
                  {/* Axis-pair pill — appears above the title only inside the
                      hovered quadrant's spotlight circle. Clicking the
                      surrounding quadrant region navigates to that quadrant
                      via onClick on the parent div. */}
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.8,
                    textTransform: 'uppercase',
                    color: 'var(--ink)',
                    background: 'rgba(251,249,244,0.92)', backdropFilter: 'blur(8px)',
                    border: '1px solid var(--line)', borderRadius: 40,
                    padding: '7px 14px',
                    marginBottom: 18,
                    opacity: circleOpacity,
                    transition: 'opacity .25s',
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: q.tint }} />
                    <span>{AXIS_PAIR[id].y}</span>
                    <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>·</span>
                    <span>{AXIS_PAIR[id].x}</span>
                  </div>
                  <h2 style={{
                    fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 38,
                    letterSpacing: -1, color: titleColor, margin: 0, lineHeight: 1.05,
                    transition: 'color .25s',
                  }}>{q.label}.</h2>
                  <div style={{
                    fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14,
                    color: subColor, marginTop: 6, lineHeight: 1.4,
                    transition: 'color .25s',
                  }}>{q.sub}</div>
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.4,
                    textTransform: 'uppercase', color: countColor, marginTop: 12,
                    transition: 'color .25s',
                  }}>{q.items.length || '—'} {q.items.length === 1 ? 'piece' : 'pieces'}</div>
                    </div>
                  );
                })()}

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

        {/* Closing statement — fades in at the end of the scroll over the
            centered crosshair, with the four corner overview-labels fading out
            so the eye lands on this self-audit sentence. Each colored phrase
            opens the corresponding article modal, tying the close of the tour
            back to the work it surveyed. */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(1100px, 78%)',
          opacity: closingT * landingT,
          pointerEvents: closingT > 0.5 ? 'auto' : 'none',
          zIndex: 35,
        }}>
          <p style={{
            fontFamily: 'var(--sans)', fontWeight: 500,
            fontSize: 'clamp(22px, 2.4vw, 38px)',
            lineHeight: 1.32, letterSpacing: '-0.01em',
            margin: 0,
            color: 'var(--ink)', textAlign: 'center',
            textWrap: 'balance',
          }}>
            {CLOSING_STATEMENT.map((seg, i) =>
              seg.type === 'text'
                ? <span key={i}>{seg.text}</span>
                : <ClosingPhrase key={i} seg={seg} onNav={onNav} />,
            )}
          </p>
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

/**
 * A clickable phrase inside the closing statement. Mirrors the QuadrantMap
 * StatementLayout's PhraseButton — soft tint wash at rest, full color reverse
 * on hover — but lives here because the closing statement is owned by Home.
 */
function ClosingPhrase({
  seg,
  onNav,
}: {
  seg: { text: string; slug: string; tint: string };
  onNav: NavFn;
}) {
  const [hover, setHover] = useState(false);
  const restingBg = `color-mix(in srgb, ${seg.tint} 22%, transparent)`;
  return (
    <a
      href={`#article:${seg.slug}`}
      onClick={(e) => { e.preventDefault(); onNav(`article:${seg.slug}`); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? seg.tint : restingBg,
        color: hover ? 'var(--bg)' : 'var(--ink)',
        textDecoration: 'none',
        cursor: 'pointer',
        padding: '0.04em 0.18em',
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
        transition: 'background .18s, color .18s',
      }}
    >
      {seg.text}
    </a>
  );
}
