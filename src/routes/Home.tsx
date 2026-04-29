import { useEffect, useRef, useState } from 'react';
import type { NavFn } from '@/App';
import { quadrants, type Quadrant } from '@/content';
import { QuadrantPanel } from '@/components/QuadrantMap';

type Props = { onNav: NavFn };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function smootherstep(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
// Slight overshoot at t≈0.7 then settles at 1. Used for dot arrivals so each
// resting state feels like an object with weight (rather than snapping). The
// magnitude (c1) is tuned low so the overshoot reads as "settle" not "bounce".
function easeOutBack(t: number) {
  const c1 = 1.10;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ——— Phase boundaries ———
// One scroll-driven journey: hero → dot-converge → hub fade-in → hub hold →
// corner settle → section view → end-return → end-fan. Measured in normalized
// scroll progress 0–1; the page provides ~7× viewport of scroll.
//
// Converge is split into three sub-phases so the "circle page" reads as a
// discrete state: dots arrive first, then the ring + labels + title fade in
// over still dots, then the whole composition holds before the dots fly off
// to the corner.
const HERO_END           = 0.04;
const DOTS_AT_HUB        = 0.10;  // dots have arrived at the ring positions
const HUB_FADE_END       = 0.14;  // ring + labels + title fully faded in
const HUB_HOLD_END       = 0.18;  // brief register, then yields to corner. Arcs
                                  // are no longer scroll-cycled — visitors see
                                  // all four at once and hover to highlight.
// Corner-settle stretched from 4% → 8% so the multi-element exit can stagger
// (hub title fades first → ring/labels fade → dots fly → section fades in)
// instead of all happening in the same lockstep frame. Sub-stops below
// describe the choreography:
//   HUB_HOLD_END   → HUB_TITLE_OUT_END : hub title alone fades down
//   HUB_HOLD_END   → CORNER_SETTLE_END : dots fly to corner (full duration)
//   HUB_TITLE_OUT_END → RING_OUT_END   : ring + node labels fade
//   RING_OUT_END   → CORNER_SETTLE_END : section content fades in
const HUB_TITLE_OUT_END  = 0.21;
const RING_OUT_END       = 0.24;
const CORNER_SETTLE_END  = 0.26;  // dots have settled in bottom-left cluster
const SECTIONS_END       = 0.78;
const END_RETURN_END     = 0.88;
// 0.88 → 1.00 = end fan (dots out to edges, 2×2 reveal)

// The four sections share the (CORNER_SETTLE_END → SECTIONS_END) slice — each
// gets a quarter of it. Scrolling naturally walks through them; the corner-nav
// click jumps to the midpoint of a section's range.
const SECTION_RANGES: Record<SectionId, [number, number]> = {
  mirror:    [CORNER_SETTLE_END, 0.39],
  practice:  [0.39, 0.52],
  attention: [0.52, 0.65],
  work:      [0.65, SECTIONS_END],
};
function activeSectionFromProgress(p: number): SectionId {
  if (p >= SECTION_RANGES.work[0])      return 'work';
  if (p >= SECTION_RANGES.attention[0]) return 'attention';
  if (p >= SECTION_RANGES.practice[0])  return 'practice';
  return 'mirror';
}

// ——— Dots ———
// Four dots persist across the entire timeline, morphing through five resting
// states. `id` matches the cardinal node in the centered ring: qiyu=top,
// make=right, other=bottom, notice=left.
const DOT_IDS = ['qiyu', 'make', 'other', 'notice'] as const;
type DotId = typeof DOT_IDS[number];

const DOT_ANGLE: Record<DotId, number> = {
  qiyu: -90, make: 0, other: 90, notice: 180,
};

// Hero scatter: viewport-relative (0–1) start positions for landing-page floaters.
// Qiyu sits stationary just below the top pill text and pulses like an
// "AI loading" indicator; the other three drift around the middle.
const HERO_SCATTER: Record<DotId, { x: number; y: number }> = {
  qiyu:   { x: 0.50, y: 0.13 },
  notice: { x: 0.24, y: 0.46 },
  make:   { x: 0.80, y: 0.54 },
  other:  { x: 0.55, y: 0.42 },
};

// CSS float animations (defined in tokens.css) — only applied during pure hero
// phase so dots wiggle gently before the morph begins.
const DOT_FLOAT: Record<DotId, { anim: string; dur: string; delay: string }> = {
  qiyu:   { anim: 'float-a', dur: '7.2s', delay: '0.4s' },
  notice: { anim: 'float-b', dur: '7.8s', delay: '1.2s' },
  make:   { anim: 'float-c', dur: '5.6s', delay: '2.5s' },
  other:  { anim: 'float-a', dur: '6.4s', delay: '0s' },
};

// Hover status — the rotating QIYU-pill text swaps to one of these when the
// user hovers a floater. Names "Qiyu's relationship" with that node.
const DOT_STATUS: Record<DotId, string> = {
  qiyu:   'Thinking…',
  notice: 'Noticing patterns…',
  make:   'Making things…',
  other:  'Listening to others…',
};

// ——— Sections ———
// The four arcs in the centered ring → four section views. Each section
// activates two cardinal dots in the corner nav (the two ends of its arc),
// and fills one cell of the final 2×2 reveal.
type SectionId = 'mirror' | 'practice' | 'attention' | 'work';

// Each section pairs two cardinal nodes — that pairing IS the section's
// identity (e.g., Reflection sits where Qiyu meets Noticing). The tag is
// shown beneath the section title so the user can place each page back on
// the 2×2 map at a glance.
const SECTIONS: {
  id: SectionId;
  title: string;
  axisPair: [string, string];
  activeDots: DotId[];
  cell: 'TL' | 'TR' | 'BL' | 'BR';
  /** Pigment for the section. Used as a quiet accent on the active corner
   *  dots, the kicker dot, and any per-section motif — so each page picks
   *  up its own color without re-skinning the whole UI. */
  tint: string;
}[] = [
  { id: 'mirror',    title: 'to reflect',     axisPair: ['Qiyu',   'Noticing'], activeDots: ['qiyu', 'notice'], cell: 'TL', tint: 'var(--tint-tl)' },
  { id: 'practice',  title: 'to experiment',  axisPair: ['Qiyu',   'Making'],   activeDots: ['qiyu', 'make'],   cell: 'TR', tint: 'var(--tint-tr)' },
  { id: 'attention', title: 'to hear',        axisPair: ['Others', 'Noticing'], activeDots: ['other', 'notice'], cell: 'BL', tint: 'var(--tint-bl)' },
  { id: 'work',      title: 'to collaborate', axisPair: ['Others', 'Making'],   activeDots: ['other', 'make'],  cell: 'BR', tint: 'var(--tint-br)' },
];

const SECTION_BY_ID: Record<SectionId, typeof SECTIONS[number]> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s]),
) as Record<SectionId, typeof SECTIONS[number]>;

// Each section maps to one quarter-arc on the centered ring — the arc
// connecting its two cardinal nodes via the SHORT path (the one inside
// that section's quadrant of the 2×2). `startId → endId` is given in
// SVG-clockwise order so the path command can be written verbatim.
const SECTION_ARC: Record<SectionId, { startId: DotId; endId: DotId }> = {
  mirror:    { startId: 'notice', endId: 'qiyu' },   // top-left arc
  practice:  { startId: 'qiyu',   endId: 'make' },   // top-right arc
  attention: { startId: 'other',  endId: 'notice' }, // bottom-left arc
  work:      { startId: 'make',   endId: 'other' },  // bottom-right arc
};

// CSS-rotation degrees for each section, measured from the canonical arc
// (top-right = practice = qiyu→make = 0°). Walked clockwise: 0 → 90 → 180
// → 270 maps to practice → work → attention → mirror, so auto-cycle is
// just "+90°" each tick and the visual is a clean rotation around center.
const ROT_BY_ID: Record<SectionId, number> = {
  practice: 0, work: 90, attention: 180, mirror: 270,
};

// Default status phrases — cycle through these when no dot is hovered.
// Should read like a live now-doing feed: specific, playful, present-continuous.
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
// Live-state accent: QIYU pill text + hover-line stroke. Used sparingly so the
// rest of the page reads as ink-only. Bound to --signal in tokens.css so a
// future palette swap touches one place.
const STATUS_BLUE = 'var(--signal)';

// ——— Design tokens ———
// One typographic scale, one spacing scale. Used wherever sizes/spacing live
// inside this page so the visual rhythm holds together.
const TYPE = {
  // Serif headings (Fraunces) live at 400–500 — editorial weight without
  // shouting. Bumping past 600 makes Fraunces feel chunky/dated.
  display:   { size: 'clamp(40px, 7vw, 96px)',   weight: 400, tracking: '-0.025em', lineHeight: 1.0 },
  hubTitle:  { size: 'clamp(32px, 4vw, 56px)',   weight: 400, tracking: '-0.02em',  lineHeight: 1.05 },
  cellLabel: { size: 'clamp(24px, 2.6vw, 40px)', weight: 400, tracking: '-0.01em',  lineHeight: 1.1 },
  sectionH1: { size: 'clamp(22px, 1.9vw, 30px)', weight: 400, tracking: '-0.01em',  lineHeight: 1.2 },
  // Sans body (Inter): generous tracking on small caps, normal on body.
  bodyLg:    { size: '18px', weight: 400, tracking: '0',         lineHeight: 1.55 },
  body:      { size: '14px', weight: 400, tracking: '0',         lineHeight: 1.55 },
  kicker:    { size: '11px', weight: 500, tracking: '0.14em',    lineHeight: 1.2 }, // sans uppercase
  meta:      { size: '11px', weight: 500, tracking: '0.14em',    lineHeight: 1.2 }, // mono uppercase (state)
} as const;
const SPACE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 } as const;

type Pos = { x: number; y: number };

// ——— Resting positions for each dot at each phase ———
// All return absolute pixel coordinates given current viewport size.
function heroPos(id: DotId, vw: number, vh: number): Pos {
  const s = HERO_SCATTER[id];
  return { x: s.x * vw, y: s.y * vh };
}

// Hub composition is delicate by intent — illustration-book feel, not a
// poster. Smaller radius, smaller dots, the ring sitting in the upper third
// with the title hanging below it in its own breathing room.
const HUB_CY_RATIO = 0.40;
const HUB_R_RATIO  = 0.11;
const HUB_DOT_SIZE = 12;

function hubPos(id: DotId, vw: number, vh: number): Pos {
  const cx = vw / 2, cy = vh * HUB_CY_RATIO;
  const r = Math.min(vw, vh) * HUB_R_RATIO;
  const a = (DOT_ANGLE[id] * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

// Hover-preview line: dots arrange in a horizontal row in the upper third
// when the user hovers the "connect the dots" phrase in the hero. Order is
// qiyu → other → notice → make (left-to-right) — matches how the four nodes
// read aloud.
const LINE_ORDER: Record<DotId, number> = {
  qiyu: 0, other: 1, notice: 2, make: 3,
};
const PREVIEW_LINE_Y_RATIO = 0.30;
function previewLinePos(id: DotId, vw: number, vh: number): Pos {
  const idx = LINE_ORDER[id];
  const margin = 0.20;
  const span = 1 - margin * 2;
  const x = (margin + (idx / 3) * span) * vw;
  const y = vh * PREVIEW_LINE_Y_RATIO;
  return { x, y };
}

// Corner-cluster geometry. Dots are larger and the cluster sits a bit further
// inset so the bigger dots have room to breathe (matches image #12 sizing).
const CORNER_CX = 72;
const CORNER_R = 22;
function cornerPos(id: DotId, _vw: number, vh: number): Pos {
  const cx = CORNER_CX, cy = vh - CORNER_CX;
  const a = (DOT_ANGLE[id] * Math.PI) / 180;
  return { x: cx + CORNER_R * Math.cos(a), y: cy + CORNER_R * Math.sin(a) };
}

function endHubPos(id: DotId, vw: number, vh: number): Pos {
  const cx = vw / 2, cy = vh / 2;
  // Slightly larger ring than the converge hub — gives the grey disc room
  // to breathe inside while the dots line its perimeter.
  const r = Math.min(vw, vh) * 0.24;
  const a = (DOT_ANGLE[id] * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function fanPos(id: DotId, vw: number, vh: number): Pos {
  // Final resting state: dots at viewport-edge insets so the dashed cross
  // they anchor reaches across the entire screen.
  const insetX = vw * 0.05;
  const insetY = vh * 0.06;
  switch (id) {
    case 'qiyu':   return { x: vw / 2,         y: insetY };
    case 'make':   return { x: vw - insetX,    y: vh / 2 };
    case 'other':  return { x: vw / 2,         y: vh - insetY };
    case 'notice': return { x: insetX,         y: vh / 2 };
  }
}

// Per-section axis extraction. For sections whose layout speaks in axes
// (currently just Create), the active dots fly OUT of the corner cluster to
// frame the page as an axis chart — qiyu pulls up to the top-left, make
// pulls right to the bottom-right, forming an L-shape with the cluster
// sitting at the bend. Returns null when this dot stays put for that section.
const AXIS_INSET = 80;
function sectionAxisPos(sectionId: SectionId, id: DotId, vw: number, vh: number): Pos | null {
  if (sectionId === 'practice') {
    if (id === 'qiyu') return { x: CORNER_CX, y: AXIS_INSET };
    if (id === 'make') return { x: vw - AXIS_INSET, y: vh - CORNER_CX };
  }
  return null;
}

// Smoothly extracts a dot from its corner home to its axis position when
// the user enters a section's range, then retracts as they exit. Returns
// 0 (fully in cluster) → 1 (fully extracted to axis).
function sectionExtractT(p: number, sectionId: SectionId): number {
  const [lo, hi] = SECTION_RANGES[sectionId];
  const easeRange = 0.04;
  const enterT = clamp((p - lo) / easeRange, 0, 1);
  const exitT  = clamp((hi - p) / easeRange, 0, 1);
  return smootherstep(Math.min(enterT, exitT));
}

// Corner-cluster size: all four dots are uniform — active vs inactive is
// communicated by opacity alone.
const CORNER_SIZE = 14;

// Resolve a dot's current position + size given progress p. The active
// section can override the corner-cluster resting state with an axis-end
// position (see sectionAxisPos).
function dotState(
  id: DotId,
  p: number,
  vw: number,
  vh: number,
  activeSection: SectionId,
  qiyuHeroOverride?: Pos | null,
) {
  const hero = id === 'qiyu' && qiyuHeroOverride
    ? qiyuHeroOverride
    : heroPos(id, vw, vh);
  const hub = hubPos(id, vw, vh);
  const corner = cornerPos(id, vw, vh);
  const endHub = endHubPos(id, vw, vh);
  const fan = fanPos(id, vw, vh);

  if (p <= HERO_END) {
    return { pos: hero, size: 10 };
  }
  // Hero → ring. The lineup-on-scroll phase used to live here, but it now
  // only appears as a hover-preview from the "connect the dots" phrase, so
  // scrolling goes straight from scattered hero into the ring.
  if (p <= DOTS_AT_HUB) {
    // easeOutBack overshoots slightly at the end so dots arrive at the
    // ring with a tiny "settle" — feels like an object with weight, not a
    // tween that snaps to its mark.
    const t = easeOutBack(clamp((p - HERO_END) / (DOTS_AT_HUB - HERO_END), 0, 1));
    return {
      pos: { x: lerp(hero.x, hub.x, t), y: lerp(hero.y, hub.y, t) },
      size: lerp(10, HUB_DOT_SIZE, t),
    };
  }
  // Hub hold: dots stay parked at ring positions while the ring + labels +
  // title fade in over them, then continue holding so the page feels like a
  // discrete frame before the corner exit begins.
  if (p <= HUB_HOLD_END) {
    return { pos: hub, size: HUB_DOT_SIZE };
  }
  if (p <= CORNER_SETTLE_END) {
    // Same easeOutBack settle when arriving at the corner cluster — the
    // overshoot helps draw the eye to the new resting position so users
    // notice the nav is now down there.
    const t = easeOutBack(clamp((p - HUB_HOLD_END) / (CORNER_SETTLE_END - HUB_HOLD_END), 0, 1));
    return {
      pos: { x: lerp(hub.x, corner.x, t), y: lerp(hub.y, corner.y, t) },
      size: lerp(HUB_DOT_SIZE, CORNER_SIZE, t),
    };
  }
  if (p <= SECTIONS_END) {
    // Within a section, an "active" dot may be extracted from the cluster
    // to its axis-end position (e.g. qiyu pulls up to the top-left for the
    // Create section). Fully-blended interpolation between the two.
    const axis = sectionAxisPos(activeSection, id, vw, vh);
    if (!axis) return { pos: corner, size: CORNER_SIZE };
    const t = sectionExtractT(p, activeSection);
    return {
      pos: { x: lerp(corner.x, axis.x, t), y: lerp(corner.y, axis.y, t) },
      size: CORNER_SIZE,
    };
  }
  if (p <= END_RETURN_END) {
    const t = smootherstep((p - SECTIONS_END) / (END_RETURN_END - SECTIONS_END));
    return {
      pos: { x: lerp(corner.x, endHub.x, t), y: lerp(corner.y, endHub.y, t) },
      size: lerp(CORNER_SIZE, 12, t),
    };
  }
  const t = smootherstep((p - END_RETURN_END) / (1 - END_RETURN_END));
  return {
    pos: { x: lerp(endHub.x, fan.x, t), y: lerp(endHub.y, fan.y, t) },
    size: 12,
  };
}

export function Home({ onNav }: Props) {
  const [viewportW, setViewportW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );
  const [smoothScrollY, setSmoothScrollY] = useState(0);
  const rawScrollRef = useRef(0);
  const [hoveredDot, setHoveredDot] = useState<DotId | null>(null);
  const [statusIdx, setStatusIdx] = useState(0);
  const [hoveredArc, setHoveredArc] = useState<SectionId | null>(null);
  const [hoveredCell, setHoveredCell] = useState<SectionId | null>(null);
  const [phraseHovered, setPhraseHovered] = useState(false);
  // When the user clicks "connect the dots?", we override the dot positions
  // with a slow rAF-driven lerp from previewLinePos → hubPos. This decouples
  // the dot motion from scroll progress, so the move feels like one calm
  // gesture instead of a scroll-tick + transform-transition combo.
  const [clickAnimT, setClickAnimT] = useState<number | null>(null);
  const triggerClickAnim = () => {
    const start = performance.now();
    const duration = 1500;
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(elapsed / duration, 1);
      setClickAnimT(t);
      if (t < 1) requestAnimationFrame(tick);
      else setTimeout(() => setClickAnimT(null), 80);
    };
    requestAnimationFrame(tick);
  };
  const [cornerNavHover, setCornerNavHover] = useState(false);

  // Cycle the rotating status text in the QIYU pill.
  useEffect(() => {
    const id = window.setInterval(
      () => setStatusIdx((i) => (i + 1) % STATUS_PHRASES.length),
      STATUS_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  // Refs for measuring the dashed hover line between QIYU dot and a floater.
  const dotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [hoverLinePos, setHoverLinePos] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Pill anchor — invisible 10×10 span between the QIYU label and the rotating
  // status text. Measured every frame during hero so the qiyu dot can sit
  // exactly inline with the text rather than drifting below it.
  const pillAnchorRef = useRef<HTMLSpanElement | null>(null);
  const [pillAnchor, setPillAnchor] = useState<Pos | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = pillAnchorRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        setPillAnchor((prev) => {
          if (prev && Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5) return prev;
          return { x, y };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!hoveredDot || hoveredDot === 'qiyu') { setHoverLinePos(null); return; }
    const id = hoveredDot;
    let raf = 0;
    const tick = () => {
      const q = dotRefs.current['qiyu'];
      const d = dotRefs.current[id];
      if (q && d) {
        const qr = q.getBoundingClientRect();
        const dr = d.getBoundingClientRect();
        const x1 = qr.left + qr.width / 2;
        const y1 = qr.top + qr.height / 2;
        const x2 = dr.left + dr.width / 2;
        const y2 = dr.top + dr.height / 2;
        setHoverLinePos((prev) => {
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

    // rAF loop: low-pass filter raw scroll so dot motion is smooth on wheel.
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

  // Total scroll range. tourScrollPx is what `progress` is divided across —
  // each phase gets a slice of it. driverHeight is the actual height of the
  // scroll-driver div: tour + an extra ~1.5 viewports of buffer so the journey
  // hits progress=1.0 (and the 2×2 reveal lands) before the footer starts
  // sliding up into view from below.
  const tourScrollPx = viewportH * 8;
  const driverHeight = tourScrollPx + viewportH * 1.5;
  const progress = clamp(smoothScrollY / tourScrollPx, 0, 1);

  // Phase amounts (each 0→1 over its phase, clamped outside).
  const heroT     = clamp(progress / HERO_END, 0, 1);
  // Ring/labels/title fade in AFTER dots arrive at the hub (DOTS_AT_HUB).
  const hubFadeT  = clamp((progress - DOTS_AT_HUB) / (HUB_FADE_END - DOTS_AT_HUB), 0, 1);
  // Dots leaving the hub for the corner cluster (begins after the hub hold).
  const cornerT   = clamp((progress - HUB_HOLD_END) / (CORNER_SETTLE_END - HUB_HOLD_END), 0, 1);
  // Staggered exit sub-phases — these let the hub disassemble in sequence
  // (title first → ring/labels → section content) instead of every element
  // crossfading at the same instant. Eye can track each layer.
  const hubTitleOutT = clamp((progress - HUB_HOLD_END) / (HUB_TITLE_OUT_END - HUB_HOLD_END), 0, 1);
  const ringOutT     = clamp((progress - HUB_TITLE_OUT_END) / (RING_OUT_END - HUB_TITLE_OUT_END), 0, 1);
  const sectionInT   = clamp((progress - RING_OUT_END) / (CORNER_SETTLE_END - RING_OUT_END), 0, 1);
  const returnT   = clamp((progress - SECTIONS_END) / (END_RETURN_END - SECTIONS_END), 0, 1);
  const fanT      = clamp((progress - END_RETURN_END) / (1 - END_RETURN_END), 0, 1);

  // Visibilities for non-dot scenery. Each element's fade window now keys off
  // its own sub-phase so the corner-settle exit reads as a sequence.
  const heroVis      = clamp(1 - heroT * 1.4, 0, 1);
  const ringVis      = hubFadeT * (1 - ringOutT);
  const hubLabelVis  = hubFadeT * (1 - ringOutT);
  const hubTitleVis  = hubFadeT * (1 - hubTitleOutT); // fades first
  const sectionVis   = sectionInT * (1 - returnT);    // fades in last
  const cornerNavVis = clamp((progress - HUB_TITLE_OUT_END) / (CORNER_SETTLE_END - HUB_TITLE_OUT_END), 0, 1) * (1 - returnT);
  const endHubVis    = returnT * (1 - fanT);
  const fanCrossVis  = fanT;
  const cellLabelVis = fanT;
  // Hub arc highlight is hover-only. The ring + four faint arcs sit visible
  // simultaneously during hub; the user doesn't have to scroll to reveal each
  // pairing. Hover an arc → that quarter highlights bold and the title shows.
  // Continued scroll yields directly to the sections.
  const arcRotateDeg = hoveredArc ? ROT_BY_ID[hoveredArc] : 0;
  const visibleSectionId: SectionId | null = hoveredArc;

  // The active section is purely scroll-driven — each section holds the
  // (CORNER_SETTLE_END → SECTIONS_END) slice for a quarter, so scrolling
  // walks through all four naturally. Corner-nav clicks scroll the page to
  // the midpoint of a section's slice rather than mutating local state, so
  // there's only one source of truth.
  const activeSection = activeSectionFromProgress(progress);
  const activeDotSet = new Set(SECTION_BY_ID[activeSection].activeDots);

  const scrollToSection = (id: SectionId) => {
    const [lo, hi] = SECTION_RANGES[id];
    window.scrollTo({ top: ((lo + hi) / 2) * tourScrollPx, behavior: 'smooth' });
  };

  // Hub centered title — only meaningful when an arc is hovered. The pair
  // and section name fade in for the hovered arc; otherwise the kicker shows
  // the four cardinal labels and no section title is shown.
  const hubArcSection = visibleSectionId ? SECTION_BY_ID[visibleSectionId] : null;
  const hubTitle = hubArcSection
    ? `${hubArcSection.axisPair[0]} × ${hubArcSection.axisPair[1]}`
    : '';
  const isHubNeutral = !hoveredArc;
  const NEUTRAL_AXIS = 'Look closer →';

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '100vh', zIndex: 10, overflow: 'hidden' }}>
        {/* ——— Hero tagline ——— Sits as the ground line of the dot scatter
            during hero, fades out as we converge to the ring. The phrase
            "connect the dots?" is its own button: hover triggers a preview
            (the dots line up at the top with labels), click jumps directly
            to the hub view. */}
        <h1 style={{
          position: 'absolute', left: 0, right: 0, bottom: '18%',
          textAlign: 'center',
          fontFamily: 'var(--serif)',
          fontSize: TYPE.display.size,
          fontWeight: TYPE.display.weight,
          letterSpacing: TYPE.display.tracking,
          lineHeight: TYPE.display.lineHeight,
          margin: 0, padding: `0 ${SPACE.xxxl}px`,
          color: 'var(--ink)',
          opacity: heroVis,
          pointerEvents: 'none',
          zIndex: 30,
        }}>
          Yo, how might we<br />
          <button
            onMouseEnter={() => setPhraseHovered(true)}
            onMouseLeave={() => setPhraseHovered(false)}
            onClick={() => {
              // Land just inside hub-hold (mirror quarter active) so the
              // ring + Reflection title are present and the user can
              // continue scrolling to walk through the rest. Drop hover
              // state immediately and hand the dot motion over to a calm
              // JS lerp so the preview→hub transition reads as one gesture.
              setPhraseHovered(false);
              triggerClickAnim();
              window.scrollTo({ top: (HUB_FADE_END + 0.02) * tourScrollPx, behavior: 'smooth' });
            }}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              font: 'inherit',
              color: 'inherit',
              letterSpacing: 'inherit',
              cursor: 'pointer',
              // Re-enable pointer events on this fragment only — the
              // surrounding h1 has pointerEvents: 'none' so it doesn't
              // catch clicks on the dot layer.
              pointerEvents: 'auto',
              textDecoration: phraseHovered ? 'underline' : 'none',
              textUnderlineOffset: '0.18em',
              textDecorationThickness: '2px',
              textDecorationColor: 'currentColor',
              transition: 'text-decoration-color .2s ease',
            }}>
            connect the dots?
          </button>
        </h1>

        {/* ——— Hover-preview labels ——— Rendered during hero, in the same
            position the dots will reach when "connect the dots?" is hovered.
            Gated by opacity rather than mount/unmount so the fade is smooth;
            transition-delay holds the label invisible until the dots have
            traveled most of the way to the line, so labels arrive after dots. */}
        {progress < HERO_END * 0.95 && (
          <div style={{
            position: 'absolute', inset: 0,
            pointerEvents: 'none',
            zIndex: 34,
          }}>
            {DOT_IDS.map((id) => {
              const p = previewLinePos(id, viewportW, viewportH);
              const text =
                id === 'qiyu'   ? 'Qiyu'    :
                id === 'other'  ? 'Others'  :
                id === 'notice' ? 'Noticing':
                                  'Making';
              return (
                <div key={id} style={{
                  position: 'absolute',
                  left: p.x, top: p.y + HUB_DOT_SIZE / 2 + SPACE.lg,
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--sans)',
                  fontSize: TYPE.body.size,
                  color: 'var(--ink-2)', whiteSpace: 'nowrap',
                  opacity: phraseHovered ? 1 : 0,
                  transition: 'opacity .25s ease',
                  transitionDelay: phraseHovered ? '.18s' : '0s',
                }}>{text}</div>
              );
            })}
          </div>
        )}

        {/* ——— QIYU pill ——— Three independently positioned elements
            anchored around the viewport's horizontal center: the dot anchor
            sits dead-center, the QIYU label is pinned a fixed offset to its
            LEFT (right-aligned to that anchor), and the rotating status is
            pinned a fixed offset to its RIGHT (left-aligned). Result: the
            dot stays put and QIYU stays put no matter how long the status
            text gets — only the right side of the pill grows. */}
        {(() => {
          const hovered = hoveredDot ? DOT_STATUS[hoveredDot] : null;
          const status = hovered ?? STATUS_PHRASES[statusIdx];
          // Pill fades with hero progress, AND fades to 0 immediately when
          // the user hovers "connect the dots" — the dots are about to leave
          // the inline-pill anchor for the preview line, so the floating
          // "QIYU [dot] STATUS" reading would break.
          const pillTextVis = clamp(1 - heroT * 1.6, 0, 1) * (phraseHovered ? 0 : 1);
          const baseStyle: React.CSSProperties = {
            position: 'absolute',
            top: 70,
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.6,
            textTransform: 'uppercase', fontWeight: 500,
            color: STATUS_BLUE,
            opacity: pillTextVis,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 36,
          };
          // 5px = half the dot's width; 16px = visual gap between dot and text.
          const HALF_DOT = 5;
          const GAP = 16;
          return (
            <>
              <span style={{
                ...baseStyle,
                right: `calc(50% + ${HALF_DOT + GAP}px)`,
              }}>QIYU</span>
              <span ref={pillAnchorRef}
                aria-hidden="true"
                style={{
                  ...baseStyle,
                  left: '50%', transform: 'translateX(-50%)',
                  width: 10, height: 10,
                }} />
              <span style={{
                ...baseStyle,
                left: `calc(50% + ${HALF_DOT + GAP}px)`,
              }}>
                <span key={status} style={{ animation: 'statusFade .25s ease', display: 'inline-block' }}>
                  {status}
                </span>
              </span>
            </>
          );
        })()}

        {/* ——— Hover line ——— Dashed line between QIYU dot and the hovered
            floater. Endpoints measured from the rendered DOM each frame so
            it tracks the dots' float wiggle precisely. */}
        {hoverLinePos && heroT < 1 && (
          <svg style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 31,
          }}>
            <line x1={hoverLinePos.x1} y1={hoverLinePos.y1} x2={hoverLinePos.x2} y2={hoverLinePos.y2}
              stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 5"
              style={{ opacity: clamp(1 - heroT * 1.6, 0, 1) }} />
          </svg>
        )}

        {/* ——— Centered ring ——— Drawn only during the converge phase: the
            dots land on its perimeter, then it fades as they leave for the
            corner cluster. The bold quarter-arc is drawn ONCE at the
            canonical top-right position (qiyu→make) and rotated into place
            via CSS transform — that way the highlight glides smoothly
            around the ring instead of jumping. Four invisible thick-stroke
            arcs sit on top as hover hit-targets. */}
        {ringVis > 0 && (() => {
          const cx = viewportW / 2, cy = viewportH * HUB_CY_RATIO;
          const r = Math.min(viewportW, viewportH) * HUB_R_RATIO;
          // Canonical (un-rotated) arc — top-right quarter, qiyu → make.
          const cStart = hubPos('qiyu', viewportW, viewportH);
          const cEnd   = hubPos('make', viewportW, viewportH);
          const canonicalD = `M ${cStart.x},${cStart.y} A ${r},${r} 0 0 1 ${cEnd.x},${cEnd.y}`;
          // Hit-targets need to be active during the full hub hold; gate
          // them on hubLabelVis so they don't catch clicks while the page
          // is fading or while the hub is mid-transition to corner.
          const hitActive = hubLabelVis > 0.6;
          return (
            <svg style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: 33,
              opacity: ringVis,
            }}>
              <circle cx={cx} cy={cy} r={r}
                stroke="var(--line)" strokeWidth={1} fill="none" />
              <g style={{
                transformOrigin: `${cx}px ${cy}px`,
                transform: `rotate(${arcRotateDeg}deg)`,
                opacity: isHubNeutral ? 0 : 1,
                transition: 'transform .65s cubic-bezier(.4,.2,.2,1), opacity .35s ease',
              }}>
                <path d={canonicalD}
                  stroke="var(--ink)" strokeWidth={1.5} fill="none"
                  strokeLinecap="round" />
              </g>
              {/* Hover/click hit-targets — one transparent thick stroke per
                  fixed quarter arc. pointer-events:stroke restricts hits to
                  the stroke band so the ring's interior stays clickable
                  through (e.g. for dot hovers if needed). */}
              {SECTIONS.map((s) => {
                const arc = SECTION_ARC[s.id];
                const start = hubPos(arc.startId, viewportW, viewportH);
                const end   = hubPos(arc.endId, viewportW, viewportH);
                const d = `M ${start.x},${start.y} A ${r},${r} 0 0 1 ${end.x},${end.y}`;
                return (
                  <path key={s.id} d={d}
                    stroke="transparent" strokeWidth={32} fill="none"
                    style={{
                      pointerEvents: hitActive ? 'stroke' : 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setHoveredArc(s.id)}
                    onMouseLeave={() => setHoveredArc(null)}
                    onClick={() => scrollToSection(s.id)} />
                );
              })}
            </svg>
          );
        })()}

        {/* ——— End-hub label ——— On the return phase the four dots reform a
            ring around the viewport center; instead of a grey disc, a single
            line of text sits at the centroid: "Connecting the dots…". */}
        {endHubVis > 0 && (
          <div style={{
            position: 'absolute',
            top: '50%', left: 0, right: 0,
            transform: 'translateY(-50%)',
            textAlign: 'center',
            opacity: endHubVis,
            pointerEvents: 'none',
            zIndex: 34,
          }}>
            <h2 style={{
              fontFamily: 'var(--serif)',
              fontSize: TYPE.sectionH1.size,
              fontWeight: TYPE.sectionH1.weight,
              letterSpacing: TYPE.sectionH1.tracking,
              lineHeight: TYPE.sectionH1.lineHeight,
              margin: 0, color: 'var(--ink)',
            }}>
              Connecting the dots…
            </h2>
          </div>
        )}

        {/* ——— Hub node labels ——— Cardinal text labels around the centered
            ring during converge. Tight offsets + small sans face so the
            labels read like illustration captions, not chart axes. */}
        {hubLabelVis > 0 && (() => {
          const labels: { id: DotId; text: string; dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }[] = [
            { id: 'qiyu',   text: 'Qiyu',     dx: 0,            dy: -SPACE.md, anchor: 'middle' },
            { id: 'make',   text: 'Making',   dx: SPACE.sm,     dy: 4,         anchor: 'start' },
            { id: 'other',  text: 'Others',   dx: 0,            dy: SPACE.md + 4, anchor: 'middle' },
            { id: 'notice', text: 'Noticing', dx: -SPACE.sm,    dy: 4,         anchor: 'end' },
          ];
          return (
            <div style={{
              position: 'absolute', inset: 0,
              pointerEvents: 'none', zIndex: 34,
              opacity: hubLabelVis,
            }}>
              {labels.map((l) => {
                const p = hubPos(l.id, viewportW, viewportH);
                return (
                  <div key={l.id} style={{
                    position: 'absolute',
                    left: p.x + l.dx, top: p.y + l.dy,
                    transform:
                      l.anchor === 'middle' ? 'translateX(-50%)' :
                      l.anchor === 'end' ? 'translateX(-100%)' : 'none',
                    fontFamily: 'var(--sans)',
                    fontSize: 12,
                    fontWeight: 400,
                    color: 'var(--ink-2)', whiteSpace: 'nowrap',
                  }}>{l.text}</div>
                );
              })}
            </div>
          );
        })()}

        {/* ——— Hub title ——— Anchored to `bottom: 18%` so the section name lands
            on the same ground line as the hero slogan ("Yo, how might we…").
            Hierarchy: small mono kicker (the axis-pair coordinate) on top, big
            serif section name (the "for what") below — matches the kicker-above-
            title pattern used inside each section view. */}
        {hubTitleVis > 0 && (
          <div style={{
            position: 'absolute',
            // Anchored just below the ring (rather than at `bottom: 18%`) so
            // the ring + title read as a single stacked composition with
            // shared breathing room — illustration-book style — rather than
            // two distant elements pinned to opposite halves of the page.
            top: `${(HUB_CY_RATIO + HUB_R_RATIO) * 100 + 14}%`,
            left: 0, right: 0,
            textAlign: 'center',
            // Title fades out FIRST during corner-settle (hubTitleVis), so
            // the eye is freed to track the ring/dots disassembly that
            // follows. Stagger choreography.
            opacity: hubTitleVis,
            pointerEvents: 'none',
            zIndex: 34,
          }}>
            <div style={{
              // Neutral state ("Look closer →") reads as a content-sized
              // invitation in serif sentence case, sitting at cellLabel size.
              // Hovered state (axis pair like "Qiyu × Noticing") stays as the
              // small mono caps kicker above the section title below it.
              fontFamily: isHubNeutral ? 'var(--serif)' : 'var(--mono)',
              fontSize: isHubNeutral ? TYPE.cellLabel.size : TYPE.meta.size,
              fontWeight: isHubNeutral ? TYPE.cellLabel.weight : TYPE.meta.weight,
              letterSpacing: isHubNeutral ? TYPE.cellLabel.tracking : TYPE.meta.tracking,
              lineHeight: isHubNeutral ? TYPE.cellLabel.lineHeight : TYPE.meta.lineHeight,
              textTransform: isHubNeutral ? 'none' : 'uppercase',
              color: isHubNeutral ? 'var(--ink)' : 'var(--ink-3)',
              marginBottom: SPACE.md,
            }}>
              <span key={`pair-${visibleSectionId ?? 'neutral'}`}
                style={{ animation: 'statusFade .35s ease', display: 'inline-block' }}>
                {isHubNeutral ? NEUTRAL_AXIS : hubTitle}
              </span>
            </div>
            {hubArcSection && (
              <h2 key={`title-${visibleSectionId}`} style={{
                fontFamily: 'var(--serif)',
                fontSize: TYPE.hubTitle.size,
                fontWeight: TYPE.hubTitle.weight,
                letterSpacing: TYPE.hubTitle.tracking,
                lineHeight: TYPE.hubTitle.lineHeight,
                margin: 0, color: 'var(--ink)',
                animation: 'statusFade .35s ease',
              }}>
                {hubArcSection.title}
              </h2>
            )}
          </div>
        )}

        {/* ——— Section content ——— One bespoke layout per section, each
            centered/full-screen. The section is derived from scroll position
            (see activeSectionFromProgress) so scrolling walks through all
            four; the corner nav scrolls the page rather than mutating
            selection state. */}
        {sectionVis > 0 && (() => {
          const section = SECTION_BY_ID[activeSection];
          const targetQ = quadrants.find((q) => q.id === activeSection);
          if (!targetQ) return null;
          return (
            <div style={{
              position: 'absolute', inset: 0,
              opacity: sectionVis,
              pointerEvents: sectionVis > 0.5 ? 'auto' : 'none',
              zIndex: 36,
            }}>
              {/* Subheading block: kicker (axis pair) above section title.
                  Title is a short infinitive verb phrase — "to reflect" /
                  "to experiment" / "to hear" / "to collaborate" — naming the
                  intent of the page in two words. */}
              {/* Subheading block — keyed by section.id so React remounts it
                  on every section change, triggering the `titleEnter`
                  keyframe (slide-up + fade-in). The active section's tint
                  also colors the kicker dot, so the page picks up its hue
                  the moment you arrive. */}
              <div key={section.id} style={{
                position: 'absolute',
                top: SPACE.xxxl, left: 0, right: 0,
                textAlign: 'center',
                pointerEvents: 'none',
                zIndex: 37,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: SPACE.sm,
                animation: 'titleEnter .35s cubic-bezier(.2,.7,.2,1)',
              }}>
                <div style={{
                  fontFamily: 'var(--sans)',
                  fontSize: TYPE.kicker.size,
                  fontWeight: TYPE.kicker.weight,
                  letterSpacing: TYPE.kicker.tracking,
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                  display: 'inline-flex', alignItems: 'center', gap: SPACE.sm,
                }}>
                  <span>{section.axisPair[0]}</span>
                  <span style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: section.tint,
                    display: 'inline-block',
                  }} />
                  <span>{section.axisPair[1]}</span>
                </div>
                <div style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: TYPE.sectionH1.size,
                  fontWeight: TYPE.sectionH1.weight,
                  letterSpacing: TYPE.sectionH1.tracking,
                  lineHeight: TYPE.sectionH1.lineHeight,
                  color: 'var(--ink)',
                }}>
                  {section.title}
                </div>
              </div>
              <SectionView section={section} q={targetQ} onNav={onNav} onSectionJump={scrollToSection} />
            </div>
          );
        })()}

        {/* ——— Create-section axis ——— Dashed L-line connecting the extracted
            qiyu dot (top-left) → corner cluster (the bend) → extracted make
            dot (bottom-right), plus the "Qiyu" / "Creating" labels next to
            each axis end. Faded in lock-step with the dot extraction so the
            line and the dots draw together. */}
        {sectionVis > 0 && activeSection === 'practice' && (() => {
          const t = sectionExtractT(progress, 'practice');
          if (t <= 0) return null;
          const cl = { x: CORNER_CX, y: viewportH - CORNER_CX };
          const qpos = sectionAxisPos('practice', 'qiyu', viewportW, viewportH)!;
          const mpos = sectionAxisPos('practice', 'make', viewportW, viewportH)!;
          return (
            <>
              <svg style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                pointerEvents: 'none', zIndex: 33,
                opacity: t * sectionVis,
              }}>
                <line x1={qpos.x} y1={qpos.y} x2={cl.x} y2={cl.y}
                  stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 5" />
                <line x1={cl.x} y1={cl.y} x2={mpos.x} y2={mpos.y}
                  stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 5" />
              </svg>
              {/* Axis-end labels — both rendered with the same restrained
                  treatment (small sans, ink-2). Reserving warm/accent color
                  was tempting for "Qiyu" but the page is ink-only elsewhere;
                  one rogue red label would break the palette. */}
              <div style={{
                position: 'absolute',
                left: qpos.x, top: qpos.y - SPACE.md,
                transform: 'translate(-50%, -100%)',
                fontFamily: 'var(--sans)', fontSize: TYPE.body.size,
                color: 'var(--ink-2)', whiteSpace: 'nowrap',
                opacity: t * sectionVis, pointerEvents: 'none',
                zIndex: 34,
              }}>Qiyu</div>
              <div style={{
                position: 'absolute',
                left: mpos.x + SPACE.md, top: mpos.y,
                transform: 'translateY(-50%)',
                fontFamily: 'var(--sans)', fontSize: TYPE.body.size,
                color: 'var(--ink-2)', whiteSpace: 'nowrap',
                opacity: t * sectionVis, pointerEvents: 'none',
                zIndex: 34,
              }}>Creating</div>
            </>
          );
        })()}

        {/* ——— Dashed cross ——— End-fan: the cross axes sweep out of the
            ring center to the four edge dots. Each arm fades in with fanT. */}
        {fanCrossVis > 0 && (() => {
          const { pos: qpos } = dotState('qiyu',   progress, viewportW, viewportH, activeSection, pillAnchor);
          const { pos: opos } = dotState('other',  progress, viewportW, viewportH, activeSection, pillAnchor);
          const { pos: npos } = dotState('notice', progress, viewportW, viewportH, activeSection, pillAnchor);
          const { pos: mpos } = dotState('make',   progress, viewportW, viewportH, activeSection, pillAnchor);
          return (
            <svg style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: 33,
              opacity: fanCrossVis,
            }}>
              {/* Vertical axis: qiyu (top) ↔ other (bottom) through center */}
              <line x1={qpos.x} y1={qpos.y} x2={opos.x} y2={opos.y}
                stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 5" />
              {/* Horizontal axis: notice (left) ↔ make (right) through center */}
              <line x1={npos.x} y1={npos.y} x2={mpos.x} y2={mpos.y}
                stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 5" />
            </svg>
          );
        })()}

        {/* ——— 2×2 cell labels ——— Final reveal: each section's name fades
            into its cell. On hover, the label crossfades into a dark mini
            2×2 card showing the whole axis system, with the section's two
            active cardinal nodes lit and a dot dropped in the matching
            quadrant — so the user sees, at a glance, where this cell sits
            on the larger map. Click → that section. */}
        {cellLabelVis > 0 && SECTIONS.map((s) => {
          const cellPos = (() => {
            switch (s.cell) {
              case 'TL': return { left: '25%', top: '32%' };
              case 'TR': return { left: '75%', top: '32%' };
              case 'BL': return { left: '25%', top: '68%' };
              case 'BR': return { left: '75%', top: '68%' };
            }
          })();
          const isHovered = hoveredCell === s.id;
          const activeSet = new Set<DotId>(s.activeDots);
          // Dot position inside the mini card mirrors the section's
          // quadrant on the larger 2×2.
          const dotInCard = (() => {
            switch (s.cell) {
              case 'TL': return { left: '28%', top: '32%' };
              case 'TR': return { right: '28%', top: '32%' };
              case 'BL': return { left: '28%', bottom: '32%' };
              case 'BR': return { right: '28%', bottom: '32%' };
            }
          })();
          const labelStyle = (active: boolean): React.CSSProperties => ({
            position: 'absolute',
            fontFamily: 'var(--sans)',
            fontSize: 14, fontWeight: 600,
            letterSpacing: -0.1,
            color: active ? 'var(--bg)' : 'var(--ink-3)',
            transition: 'color .2s ease',
          });
          return (
            <button key={s.id}
              onClick={() => scrollToSection(s.id)}
              onMouseEnter={() => setHoveredCell(s.id)}
              onMouseLeave={() => setHoveredCell((c) => (c === s.id ? null : c))}
              style={{
                position: 'absolute',
                left: cellPos.left, top: cellPos.top,
                transform: 'translate(-50%, -50%)',
                background: 'transparent', border: 'none', padding: 0,
                opacity: cellLabelVis,
                cursor: cellLabelVis > 0.5 ? 'pointer' : 'default',
                pointerEvents: cellLabelVis > 0.5 ? 'auto' : 'none',
                zIndex: 38,
              }}>
              {/* Resting label — fades out as the card fades in. */}
              <span style={{
                display: 'block',
                fontFamily: 'var(--serif)',
                fontSize: TYPE.cellLabel.size,
                fontWeight: TYPE.cellLabel.weight,
                letterSpacing: TYPE.cellLabel.tracking,
                lineHeight: TYPE.cellLabel.lineHeight,
                color: 'var(--ink)',
                padding: `${SPACE.sm}px ${SPACE.lg}px`,
                opacity: isHovered ? 0 : 1,
                transition: 'opacity .15s ease',
              }}>{s.title}</span>

              {/* Hover card — mini 2×2 axis. Centered on the same anchor
                  as the resting label, scales up from 88% as it fades in
                  so the appearance reads as "expanding from the label". */}
              <span aria-hidden="true" style={{
                position: 'absolute',
                left: '50%', top: '50%',
                width: 280, height: 200,
                transform: isHovered
                  ? 'translate(-50%, -50%) scale(1)'
                  : 'translate(-50%, -50%) scale(0.88)',
                opacity: isHovered ? 1 : 0,
                transition: 'opacity .22s ease, transform .28s cubic-bezier(.4,.2,.2,1)',
                pointerEvents: 'none',
              }}>
                <span style={{
                  position: 'relative',
                  display: 'block',
                  width: '100%', height: '100%',
                  background: 'var(--ink)',
                  borderRadius: 28,
                }}>
                  {/* Cardinal labels — the section's two active nodes are
                      lit (--bg); the other two read as muted grey. */}
                  <span style={{ ...labelStyle(activeSet.has('qiyu')),
                    top: 22, left: '50%', transform: 'translateX(-50%)' }}>Qiyu</span>
                  <span style={{ ...labelStyle(activeSet.has('notice')),
                    left: 22, top: '50%', transform: 'translateY(-50%)' }}>Notice</span>
                  <span style={{ ...labelStyle(activeSet.has('make')),
                    right: 22, top: '50%', transform: 'translateY(-50%)' }}>Make</span>
                  <span style={{ ...labelStyle(activeSet.has('other')),
                    bottom: 22, left: '50%', transform: 'translateX(-50%)' }}>Others</span>
                  {/* Axis cross — muted, sits at the card's center. */}
                  <svg style={{
                    position: 'absolute',
                    left: '50%', top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 28, height: 28,
                    opacity: 0.5,
                  }}>
                    <line x1="14" y1="2"  x2="14" y2="26" stroke="var(--ink-3)" strokeWidth="1" />
                    <line x1="2"  y1="14" x2="26" y2="14" stroke="var(--ink-3)" strokeWidth="1" />
                  </svg>
                  {/* Quadrant dot — placed in this section's cell so the
                      hover state reads as "you are here". */}
                  <span style={{
                    position: 'absolute',
                    ...dotInCard,
                    width: 12, height: 12,
                    borderRadius: '50%',
                    background: 'var(--bg)',
                    opacity: 0.9,
                  }} />
                </span>
              </span>
            </button>
          );
        })}

        {/* ——— Fan-out node labels ——— Tiny labels next to each edge dot
            during the 2×2 reveal (matching image #4). */}
        {cellLabelVis > 0 && (() => {
          const labels: { id: DotId; text: string; dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }[] = [
            { id: 'qiyu',   text: 'Qiyu',     dx: 0,    dy: -14, anchor: 'middle' },
            { id: 'make',   text: 'Making',   dx: 16,   dy: 4,   anchor: 'start' },
            { id: 'other',  text: 'Others',   dx: 0,    dy: 22,  anchor: 'middle' },
            { id: 'notice', text: 'Noticing', dx: -16,  dy: 4,   anchor: 'end' },
          ];
          return (
            <div style={{
              position: 'absolute', inset: 0,
              pointerEvents: 'none', zIndex: 34,
              opacity: cellLabelVis,
            }}>
              {labels.map((l) => {
                const { pos } = dotState(l.id, progress, viewportW, viewportH, activeSection, pillAnchor);
                return (
                  <div key={l.id} style={{
                    position: 'absolute',
                    left: pos.x + l.dx, top: pos.y + l.dy,
                    transform:
                      l.anchor === 'middle' ? 'translateX(-50%)' :
                      l.anchor === 'end' ? 'translateX(-100%)' : 'none',
                    fontFamily: 'var(--sans)', fontSize: TYPE.body.size,
                    color: 'var(--ink-3)', whiteSpace: 'nowrap',
                  }}>{l.text}</div>
                );
              })}
            </div>
          );
        })()}

        {/* ——— The dots themselves ——— Always 4 of them, always rendered,
            position interpolated by progress. Color/opacity dim when in the
            corner-nav phase and the dot isn't part of the active arc. */}
        {DOT_IDS.map((id) => {
          const baseState = dotState(id, progress, viewportW, viewportH, activeSection, pillAnchor);
          let pos = baseState.pos;
          let size = baseState.size;
          const inHero = progress < HERO_END * 0.95;
          const isActive = activeDotSet.has(id);
          // During corner phase: inactive dots dim to grey-ish so the active
          // pair reads as the current section. Smoothly fades on entry/exit.
          const cornerPhase = cornerT * (1 - returnT);
          const dotOpacity = lerp(1, isActive ? 1 : 0.32, cornerPhase);
          const isHovered = hoveredDot === id;
          // Click animation override: when the user clicked "connect the
          // dots?", drive the dot directly from preview line → hub circle
          // via an eased lerp on `clickAnimT`. This sidesteps the scroll
          // path entirely so the motion is one calm gesture rather than a
          // scattered → ring scroll-interpolation fighting a transform
          // CSS transition.
          const isClickAnim = clickAnimT !== null;
          if (isClickAnim) {
            const easedT = smootherstep(clickAnimT!);
            const preview = previewLinePos(id, viewportW, viewportH);
            const hub = hubPos(id, viewportW, viewportH);
            pos = { x: lerp(preview.x, hub.x, easedT), y: lerp(preview.y, hub.y, easedT) };
            size = HUB_DOT_SIZE;
          }
          // Phrase-hover preview: in hero, the four dots translate to a line
          // in the upper third. The transform offset animates via a CSS
          // transition. Suppressed during the click animation, which drives
          // pos directly via left/top.
          const previewActive = phraseHovered && inHero && !isClickAnim;
          const preview = previewLinePos(id, viewportW, viewportH);
          const offsetX = previewActive ? preview.x - pos.x : 0;
          const offsetY = previewActive ? preview.y - pos.y : 0;
          const effectiveSize = previewActive ? HUB_DOT_SIZE : size;
          return (
            <div key={id}
              onMouseEnter={() => inHero && setHoveredDot(id)}
              onMouseLeave={() => setHoveredDot(null)}
              style={{
                position: 'absolute',
                left: pos.x, top: pos.y,
                transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
                padding: 10,
                opacity: dotOpacity,
                // Only opacity + transform transitions. left/top change every
                // scroll tick (or every rAF frame during a click animation),
                // so a CSS transition there would fight the per-frame motion.
                // Transform animates when phraseHovered toggles. During a
                // click animation, we drive pos directly via left/top, so the
                // transform transition is suppressed to prevent it from
                // smearing the JS lerp.
                transition: isClickAnim
                  ? 'opacity .25s ease'
                  : 'opacity .25s ease, transform .45s cubic-bezier(.2,.7,.2,1)',
                zIndex: 35,
                cursor: 'default',
              }}>
              <div
                ref={(el) => { dotRefs.current[id] = el; }}
                style={{
                  width: isHovered ? effectiveSize + 4 : effectiveSize,
                  height: isHovered ? effectiveSize + 4 : effectiveSize,
                  borderRadius: '50%',
                  // Active dots in the corner cluster pick up the active
                  // section's tint — the page picks up its hue the moment
                  // you arrive in a section. Inactive dots stay ink (just
                  // dimmed via opacity above). Outside the corner phase,
                  // every dot is plain ink.
                  background: isActive && cornerPhase > 0
                    ? `color-mix(in srgb, ${SECTION_BY_ID[activeSection].tint} ${cornerPhase * 100}%, var(--ink))`
                    : 'var(--ink)',
                  transition: 'width .35s cubic-bezier(.2,.7,.2,1), height .35s cubic-bezier(.2,.7,.2,1), box-shadow .2s, background .35s ease',
                  boxShadow: isHovered ? '0 0 0 6px rgba(20,19,15,.08)' : 'none',
                  // During hero, qiyu pulses in place (AI-loading indicator);
                  // the other three drift with their float animations. When
                  // previewActive OR a click animation is running, we suppress
                  // all of these so the dots sit still on whichever path is
                  // being driven (the float keyframes use `transform:
                  // translate(...)`, which would push the dot off-line).
                  animation: (previewActive || isClickAnim)
                    ? 'none'
                    : inHero
                      ? id === 'qiyu'
                        ? 'livePulse 1.6s ease-in-out infinite'
                        : `${DOT_FLOAT[id].anim} ${DOT_FLOAT[id].dur} ease-in-out ${DOT_FLOAT[id].delay} infinite`
                      : 'none',
                  animationPlayState: isHovered ? 'paused' : 'running',
                }} />
            </div>
          );
        })}

        {/* ——— Corner nav ——— Visible during section view. The dot cluster
            stays put in the corner (rendered in the global dot layer);
            hovering the area around it expands a horizontal pill of four
            tabs to the right — one per section, current section highlighted.
            The wrapper widens on hover so the cursor can travel from the
            cluster to a tab without losing hover. */}
        {cornerNavVis > 0 && (() => {
          const cx = CORNER_CX, cy = viewportH - CORNER_CX;
          const collapsedWidth = 80;
          const expandedWidth  = 520;
          const wrapperHeight  = 64;
          const expanded = cornerNavHover;
          return (
            <div
              onMouseEnter={() => setCornerNavHover(true)}
              onMouseLeave={() => setCornerNavHover(false)}
              style={{
                position: 'absolute',
                left: cx - collapsedWidth / 2,
                top: cy - wrapperHeight / 2,
                width: expanded ? expandedWidth : collapsedWidth,
                height: wrapperHeight,
                opacity: cornerNavVis,
                pointerEvents: cornerNavVis > 0.5 ? 'auto' : 'none',
                zIndex: 40,
                transition: 'width .25s ease',
              }}>
              {/* Pill — rounded-rectangle of four tabs, anchored just to the
                  right of the cluster. Slides in from the cluster on hover. */}
              <div style={{
                position: 'absolute',
                left: collapsedWidth, top: '50%',
                transform: expanded
                  ? 'translateY(-50%) translateX(0)'
                  : 'translateY(-50%) translateX(-12px)',
                display: 'flex', alignItems: 'stretch',
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 999,
                overflow: 'hidden',
                boxShadow: '0 4px 16px rgba(20,19,15,0.06)',
                opacity: expanded ? 1 : 0,
                pointerEvents: expanded ? 'auto' : 'none',
                transition: 'opacity .2s ease, transform .25s ease',
              }}>
                {SECTIONS.map((s) => {
                  const isCurrent = s.id === activeSection;
                  return (
                    <button key={s.id}
                      onClick={() => scrollToSection(s.id)}
                      style={{
                        background: isCurrent ? 'var(--ink)' : 'transparent',
                        color: isCurrent ? 'var(--bg)' : 'var(--ink-2)',
                        border: 'none',
                        padding: `${SPACE.sm + 2}px ${SPACE.md}px`,
                        fontFamily: 'var(--serif)',
                        fontStyle: 'italic',
                        fontSize: 14,
                        lineHeight: 1.2,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'background .15s ease, color .15s ease',
                      }}>
                      {s.title}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ——— Scroll hint ——— Visible only at the very start. Sans
            uppercase (kicker style) — mono is reserved for the live status
            pill. */}
        <div style={{
          position: 'absolute', bottom: SPACE.xl, left: '50%', transform: 'translateX(-50%)',
          opacity: clamp((0.04 - progress) / 0.04, 0, 1),
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE.sm,
          fontFamily: 'var(--sans)',
          fontSize: TYPE.kicker.size,
          fontWeight: TYPE.kicker.weight,
          letterSpacing: TYPE.kicker.tracking,
          textTransform: 'uppercase', color: 'var(--ink-3)',
          pointerEvents: 'none', zIndex: 40,
        }}>
          <span>scroll to explore</span>
          <span style={{ width: 1, height: 20, background: 'var(--ink-4)', animation: 'scrollHint 1.8s ease-in-out infinite' }} />
        </div>
      </div>

      {/* Scroll driver — taller than tourScrollPx so the journey completes
          before the footer enters the viewport from below. */}
      <div style={{ height: `${driverHeight}px` }} />

      <footer style={{
        position: 'relative', zIndex: 50,
        background: 'var(--surface)',
        borderTop: '1px solid var(--line)',
        padding: `${SPACE.xxxl + SPACE.md}px ${SPACE.xxxl}px ${SPACE.xl}px`,
      }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto',
          display: 'flex', flexDirection: 'column', gap: SPACE.xxxl,
        }}>

          {/* ——— Manifesto ——— Restrained kicker + two short paragraphs.
              Serif body gives the closing "human voice"; sans elsewhere keeps
              the page coherent. */}
          <section style={{ maxWidth: 720 }}>
            <FooterKicker>Why this site is shaped this way</FooterKicker>
            <p style={{
              fontFamily: 'var(--serif)', fontWeight: 400,
              fontSize: 'clamp(20px, 1.6vw, 24px)',
              lineHeight: 1.4, letterSpacing: -0.2,
              color: 'var(--ink)',
              margin: `${SPACE.md}px 0 0`, textWrap: 'balance',
            }}>
              Most of us are more than our portfolio. I&rsquo;d rather you hire me — and work with me — as a person, not a skills list.
            </p>
            <p style={{
              fontFamily: 'var(--serif)', fontStyle: 'italic',
              fontSize: 16, lineHeight: 1.45,
              color: 'var(--ink-2)',
              margin: `${SPACE.sm}px 0 0`, textWrap: 'pretty',
            }}>
              So here&rsquo;s the messier half — what I&rsquo;m good at, and what I&rsquo;m still working on.
            </p>
          </section>

          {/* ——— Two-column lists ——— Sans body for easy scanning. */}
          <section style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: SPACE.xxl,
          }}>
            <FooterList kicker="Good at" items={[
              'Noticing the box before I’m inside it',
              'Making the first scrappy version',
              'Bridging design and code',
              'Making the work fun',
            ]} />
            <FooterList kicker="Working on" items={[
              'Sitting still in long meetings',
              'Saying “I don’t know” without flinching',
              'Self-promotion (clearly)',
              'Staying inside the spec',
            ]} />
          </section>

          <div style={{ borderTop: '1px solid var(--line)' }} />

          {/* ——— Wordmark + connect ——— Big serif signature on the left
              (italic on "Hu" is the only italic accent here, so it reads as
              a deliberate signature gesture). Status pulse + nav stacked
              right-aligned on the right. */}
          <section style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: SPACE.xxl,
            alignItems: 'end',
          }}>
            <a href="#" aria-label="Qiyu Hu — home" style={{
              fontFamily: 'var(--serif)', fontWeight: 400,
              fontSize: 'clamp(56px, 9vw, 128px)',
              letterSpacing: '-0.04em', lineHeight: 0.9,
              color: 'var(--ink)', textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}>
              Qiyu&nbsp;<span style={{ fontStyle: 'italic' }}>Hu</span>.
            </a>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: SPACE.md,
              alignItems: 'flex-end', textAlign: 'right',
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: SPACE.sm,
                fontFamily: 'var(--mono)',
                fontSize: TYPE.meta.size, fontWeight: TYPE.meta.weight,
                letterSpacing: TYPE.meta.tracking,
                textTransform: 'uppercase', color: 'var(--ink-2)',
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', background: 'var(--warm)',
                  animation: 'livePulse 2.4s ease-in-out infinite',
                }} />
                <span>Open to work · Anywhere, U.S.</span>
              </div>
              <nav style={{
                display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end',
                gap: SPACE.lg,
                fontFamily: 'var(--sans)', fontSize: 14,
                color: 'var(--ink-2)',
              }}>
                <a href="#">As a Designer</a>
                <a href="#">As a Collaborator</a>
                <a href="#">Resume <span style={{ color: 'var(--ink-4)' }}>↗</span></a>
                <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer">LinkedIn <span style={{ color: 'var(--ink-4)' }}>↗</span></a>
              </nav>
            </div>
          </section>

          {/* ——— Colophon line ——— Quiet copyright + colophon. */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.md,
            fontFamily: 'var(--sans)', fontSize: 12,
            color: 'var(--ink-4)',
          }}>
            <span>© 2026 Qiyu Hu</span>
            <span>Drawn in pencil. Mostly.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

// ——— Footer helpers ———

function FooterKicker({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--sans)',
      fontSize: TYPE.kicker.size, fontWeight: TYPE.kicker.weight,
      letterSpacing: TYPE.kicker.tracking,
      textTransform: 'uppercase', color: 'var(--ink-3)',
    }}>
      {children}
    </div>
  );
}

function FooterList({ kicker, items }: { kicker: string; items: string[] }) {
  return (
    <div>
      <FooterKicker>{kicker}</FooterKicker>
      <ul style={{
        margin: `${SPACE.md}px 0 0`,
        padding: 0,
        listStyle: 'none',
        fontFamily: 'var(--sans)', fontSize: 15, lineHeight: 1.7,
        color: 'var(--ink-2)',
      }}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

// ——— Section views ———

function SectionView({
  section, q, onNav, onSectionJump,
}: {
  section: typeof SECTIONS[number];
  q: Quadrant;
  onNav: NavFn;
  onSectionJump: (id: SectionId) => void;
}) {
  switch (section.id) {
    case 'mirror':    return <ReflectionView q={q} onNav={onNav} />;
    case 'practice':  return <CreateScatter q={q} onNav={onNav} onSectionJump={onSectionJump} />;
    case 'attention': return <LearnQuotes />;
    case 'work':      return <WorkGrid q={q} onNav={onNav} />;
  }
}

function clickHandler(href: string, onNav: NavFn) {
  return (e: React.MouseEvent) => {
    if (href.startsWith('#article:')) {
      e.preventDefault();
      onNav('article:' + href.slice(9));
    } else if (href === '#signals' || href === '#loops') {
      e.preventDefault();
      onNav(href.slice(1));
    } else if (href === '#') {
      e.preventDefault();
    }
  };
}

// Reflection — reuses QuadrantPanel's statement layout (the centered-manifesto
// treatment with hoverable colored phrases that open article modals).
function ReflectionView({ q, onNav }: { q: Quadrant; onNav: NavFn }) {
  return <QuadrantPanel q={q} opacity={1} fade={1} onNav={onNav} />;
}

// Create — scatter plot framed by the global axis system. Qiyu/Creating
// labels and the dashed L-line are drawn at the Home level (because the
// dots animating into those positions live in the global dot layer); this
// component is just the plot interior — items, hover crosshair, preview chips.
//
// Plot bounds align with the axis lines: left edge sits on the qiyu vertical
// (x=56), bottom edge sits on the make horizontal (y=vh-56), so item coords
// (x: 0=left/1=right, y: 0=top/1=bottom) read against the axis directly.
function CreateScatter({
  q, onNav, onSectionJump,
}: {
  q: Quadrant;
  onNav: NavFn;
  onSectionJump: (id: SectionId) => void;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const plotItems = q.items.filter(
    (it) => typeof it.x === 'number' && typeof it.y === 'number',
  );

  // CTA items use href "#section:<id>" to scroll-jump to another section
  // (e.g. the stranger-challenge item belongs to Listening, so it jumps to
  // the Learn page instead of opening an article).
  const handleClick = (href: string) => (e: React.MouseEvent) => {
    if (href.startsWith('#section:')) {
      e.preventDefault();
      onSectionJump(href.slice(9) as SectionId);
      return;
    }
    clickHandler(href, onNav)(e);
  };
  // Plot interior insets — far enough from the axis lines that the circles
  // breathe without overlapping the axis dots themselves.
  const inset = { top: 120, right: 120, bottom: 100, left: 100 };
  return (
    <div style={{
      position: 'absolute',
      top: inset.top, right: inset.right, bottom: inset.bottom, left: inset.left,
    }}>
      {/* Hover crosshair — dashed lines from the hovered circle's center
          extending leftward to the qiyu vertical axis (x=56 in viewport
          coords) and downward to the make horizontal axis (y=vh-56). The
          SVG covers from viewport (0, inset.top) to (vw, vh) so we can
          reach the axis lines that live OUTSIDE the scatter interior. */}
      {hoverIdx !== null && (() => {
        const it = plotItems[hoverIdx];
        const yPct = it.y! * 100;
        const xCalc = `calc(${inset.left}px + (100% - ${inset.left + inset.right}px) * ${it.x})`;
        return (
          <svg style={{
            position: 'absolute',
            top: 0, left: -inset.left, bottom: 0,
            // Width must be explicit so the SVG's internal coords match the
            // viewport (otherwise it falls back to the 300×150 default and the
            // lines render invisibly small). Height resolves from top+bottom,
            // so 100% = scatter interior height H, which makes y1=`${yPct}%`
            // line up with the dot center exactly. overflow:visible lets y2
            // extend past the SVG bottom down to the make horizontal axis.
            width: `calc(100% + ${inset.left + inset.right}px)`,
            pointerEvents: 'none', overflow: 'visible',
          }}>
            {/* Horizontal: from qiyu axis (viewport x=CORNER_CX) across to circle. */}
            <line
              x1={CORNER_CX}  y1={`${yPct}%`}
              x2={xCalc}      y2={`${yPct}%`}
              stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 6" />
            {/* Vertical: from circle downward to make axis (viewport y=vh-CORNER_CX). */}
            <line
              x1={xCalc} y1={`${yPct}%`}
              x2={xCalc} y2={`calc(100% + ${inset.bottom - CORNER_CX}px)`}
              stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 6" />
          </svg>
        );
      })()}

      {plotItems.map((it, i) => {
        const hovered = hoverIdx === i;
        const dimmed = hoverIdx !== null && !hovered;
        // Circle size scales gently with viewport — fixed 150px crowds tight
        // layouts. clamp keeps it between 110 and 170.
        const baseSize = 'clamp(110px, 13vw, 170px)';
        const sizeBoost = hovered ? 12 : 0;
        // CTA items jump to another section instead of opening an article.
        // They render in the destination quadrant's tint (indigo for the
        // Listening / Learn page) and carry a routing arrow + a small label
        // naming the destination, so the click intent reads at a glance.
        const isJump = typeof it.href === 'string' && it.href.startsWith('#section:');
        const jumpId = isJump ? (it.href!.slice(9) as SectionId) : null;
        const jumpSection = jumpId ? SECTION_BY_ID[jumpId] : null;
        // Map the BL section to its tint var; fall back to ink for normal items.
        const jumpTint = jumpSection?.cell === 'TL' ? 'var(--tint-tl)'
          : jumpSection?.cell === 'TR' ? 'var(--tint-tr)'
          : jumpSection?.cell === 'BL' ? 'var(--tint-bl)'
          : jumpSection?.cell === 'BR' ? 'var(--tint-br)'
          : null;
        const bg = jumpTint ?? 'var(--ink)';
        // CTA items render as an open ring in the destination tint (cream
        // interior, colored border, colored text). On hover the ring fills
        // with its tint and the text inverts — a clean "doorway" affordance
        // that's distinct from the filled ink article dots and quieter than
        // the previous solid-indigo treatment.
        const ctaRest = {
          background: 'var(--bg)',
          color: bg,
          border: `2px solid ${bg}`,
        };
        const ctaHover = {
          background: bg,
          color: 'var(--bg)',
          border: `2px solid ${bg}`,
        };
        const articleStyle = {
          background: bg,
          color: 'var(--bg)',
          border: 'none' as const,
        };
        const tone = isJump ? (hovered ? ctaHover : ctaRest) : articleStyle;
        return (
          <a
            key={i}
            href={it.href}
            onClick={handleClick(it.href ?? '#')}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{
              position: 'absolute',
              left: `${it.x! * 100}%`, top: `${it.y! * 100}%`,
              // translate(-50%) centers regardless of the responsive size,
              // and the inner transform handles the hover scale, so we don't
              // have to recompute negative margins on every resize.
              width: baseSize, height: baseSize,
              transform: `translate(-50%, -50%) scale(${1 + sizeBoost / 150})`,
              borderRadius: '50%',
              ...tone,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              textAlign: 'center',
              padding: `0 ${SPACE.lg}px`, boxSizing: 'border-box',
              fontFamily: 'var(--sans)',
              fontSize: TYPE.body.size, fontWeight: 500, lineHeight: 1.3,
              textDecoration: 'none',
              cursor: 'pointer',
              opacity: dimmed ? 0.55 : 1,
              boxShadow: hovered
                ? `0 0 0 8px color-mix(in srgb, ${bg} 14%, transparent)`
                : 'none',
              transition: 'opacity .2s, transform .25s cubic-bezier(.2,.7,.2,1), box-shadow .2s, background .25s ease, color .25s ease',
              zIndex: hovered ? 2 : 1,
            }}
          >
            <span style={{ pointerEvents: 'none' }}>{it.title}</span>
            {isJump && jumpSection && (
              <span style={{
                pointerEvents: 'none',
                marginTop: SPACE.sm,
                fontFamily: 'var(--mono)',
                fontSize: TYPE.kicker.size, letterSpacing: TYPE.kicker.tracking,
                textTransform: 'uppercase',
                opacity: 0.7,
              }}>
                → {jumpSection.title}
              </span>
            )}
            {/* Preview chips — small placeholder tiles below the circle that
                hint at the article's content (gallery / event / sketches /
                etc). Fade in on hover. */}
            {it.previews && it.previews.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%', left: '50%',
                transform: 'translateX(-50%)',
                marginTop: SPACE.md,
                display: 'flex', gap: SPACE.sm,
                opacity: hovered ? 1 : 0,
                transition: 'opacity .22s',
                pointerEvents: 'none',
              }}>
                {it.previews.map((p, pi) => (
                  <div key={pi} style={{
                    width: 60, height: 44, borderRadius: SPACE.xs,
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--sans)',
                    fontSize: TYPE.kicker.size, fontWeight: TYPE.kicker.weight,
                    letterSpacing: TYPE.kicker.tracking,
                    textTransform: 'uppercase',
                    color: 'var(--ink-3)',
                  }}>{p.label ?? ''}</div>
                ))}
              </div>
            )}
          </a>
        );
      })}
    </div>
  );
}

// Learn — two-column grid of quotes pulled from a curated list. Each quote
// reads as an editorial pull-quote: serif body, left-aligned (easier on the
// eye than centered for multi-line text), with the attribution underneath
// in a quieter sans treatment. The center-line gap pattern (image #9) reads
// like a manuscript page rather than a card layout.
const LEARN_QUOTES: { quote: string; who: string }[] = [
  { quote: 'Most of what I learn comes from watching how people describe the work in their own voice.', who: 'a designer at IDEO' },
  { quote: 'The questions someone asks reveal more than the answers they give.',                       who: 'a senior PM, on hiring' },
  { quote: 'When a teammate gets quiet, that’s usually the most important thing said all meeting.',     who: 'a research lead' },
  { quote: 'The best research is just listening with slightly better manners.',                         who: 'a UX lead at dinner' },
  { quote: 'You’re describing a feedback loop but you’re acting like it’s a process.',                  who: 'a PM over zoom' },
  { quote: 'You keep saying “I think” — but that’s the whole point, isn’t it?',                          who: 'a designer at a coffee shop' },
];
function LearnQuotes() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      overflowY: 'auto',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: `${SPACE.xxxl + SPACE.lg}px ${SPACE.xxxl}px ${SPACE.xxl}px`,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        columnGap: SPACE.xxl,
        rowGap: SPACE.xxxl,
        maxWidth: 1080,
        width: '100%',
      }}>
        {LEARN_QUOTES.map((q, i) => (
          <blockquote key={i} style={{
            margin: 0,
            display: 'flex', flexDirection: 'column', gap: SPACE.sm,
          }}>
            <p style={{
              margin: 0,
              fontFamily: 'var(--serif)', fontWeight: 400,
              fontSize: 'clamp(18px, 1.4vw, 22px)',
              lineHeight: 1.45,
              color: 'var(--ink)',
              textWrap: 'pretty',
            }}>
              &ldquo;{q.quote}&rdquo;
            </p>
            <cite style={{
              fontFamily: 'var(--sans)',
              fontSize: TYPE.kicker.size, fontWeight: TYPE.kicker.weight,
              letterSpacing: TYPE.kicker.tracking,
              textTransform: 'uppercase', fontStyle: 'normal',
              color: 'var(--ink-3)',
            }}>
              {q.who}
            </cite>
          </blockquote>
        ))}
      </div>
    </div>
  );
}

// Work — 2×3 grid of project tiles. Real items render with title + tag in
// the bottom-left corner; empty slots get a diagonal-hatch placeholder so
// they read as "intentionally blank, more coming" rather than a broken image.
const HATCH_BG = 'repeating-linear-gradient(45deg, transparent 0 8px, rgba(20,19,15,0.05) 8px 9px)';
function WorkGrid({ q, onNav }: { q: Quadrant; onNav: NavFn }) {
  const slots = 6;
  const items = Array.from({ length: slots }, (_, i) => q.items[i] ?? null);
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: SPACE.xxxl + SPACE.md,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: SPACE.xl,
        maxWidth: 960,
        width: '100%',
      }}>
        {items.map((it, i) => {
          if (!it) {
            return (
              <div key={i} style={{
                aspectRatio: '1 / 1',
                background: `${HATCH_BG}, var(--surface)`,
                border: '1px solid var(--line)',
                borderRadius: SPACE.sm,
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', left: SPACE.md, bottom: SPACE.md,
                  fontFamily: 'var(--sans)',
                  fontSize: TYPE.kicker.size, fontWeight: TYPE.kicker.weight,
                  letterSpacing: TYPE.kicker.tracking,
                  textTransform: 'uppercase', color: 'var(--ink-4)',
                }}>
                  Forthcoming
                </div>
              </div>
            );
          }
          return (
            <a key={i}
              href={it.href}
              onClick={clickHandler(it.href, onNav)}
              style={{
                display: 'block',
                aspectRatio: '1 / 1',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: SPACE.sm,
                position: 'relative',
                color: 'var(--ink)',
                textDecoration: 'none',
                overflow: 'hidden',
                transition: 'transform .2s, border-color .2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = 'var(--ink-3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'var(--line)';
              }}
            >
              <div style={{
                position: 'absolute', left: SPACE.md, top: SPACE.md,
                fontFamily: 'var(--sans)',
                fontSize: TYPE.kicker.size, fontWeight: TYPE.kicker.weight,
                letterSpacing: TYPE.kicker.tracking,
                textTransform: 'uppercase', color: 'var(--ink-3)',
              }}>
                {it.tag}
              </div>
              <div style={{
                position: 'absolute', left: SPACE.md, right: SPACE.md, bottom: SPACE.md,
                fontFamily: 'var(--sans)',
                fontSize: TYPE.body.size, fontWeight: 500,
                lineHeight: 1.3,
              }}>
                {it.title}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
