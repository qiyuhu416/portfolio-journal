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
const CORNER_SETTLE_END  = 0.22;  // dots fly out to bottom-left corner cluster
const SECTIONS_END       = 0.78;
// End-of-journey choreography — three beats, not two:
//   Converge (0.78 → 0.86): dots magnet inward to a TIGHT cluster at center.
//   Hold     (0.86 → 0.89): brief beat of stillness — anticipation before bang.
//   Fan      (0.89 → 1.00): dots explode outward to viewport edges; axis arms
//                           draw from center after dots have committed (fanT > 0.3),
//                           so the axis is *created by* the expansion, not alongside it.
const END_CONVERGE_END   = 0.86;
const END_HOLD_END       = 0.89;

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

// Corner cluster — the conceptual full circle is now centered close to the
// bottom-left corner so the two INACTIVE nodes fall OFF-SCREEN (left + bottom
// quadrants of the conceptual circle exit the viewport). Only the active
// upper-right quadrant — its 90° arc + 2 endpoint dots + 2 labels — is
// visible. Larger radius gives the visible arc presence on the page.
// Matches image #25.
const CORNER_CX = 50;
const CORNER_R = 180;
function cornerPos(id: DotId, _vw: number, vh: number, rotationDeg: number): Pos {
  const cx = CORNER_CX, cy = vh - CORNER_CX;
  // The cluster rotates as a whole by `rotationDeg` around its center —
  // animated continuously by the JS rAF loop in the Home component, so dots
  // travel along the circle (not in a straight chord between section
  // positions). Each section's "settled" rotation lands the active node
  // pair at top + right (see SECTION_CLUSTER_ROTATION).
  const baseAngle = DOT_ANGLE[id] + rotationDeg;
  const a = (baseAngle * Math.PI) / 180;
  return { x: cx + CORNER_R * Math.cos(a), y: cy + CORNER_R * Math.sin(a) };
}

// Per-section rotation that lands the active node pair at top + right.
// CW circle order: qiyu(top) → make(right) → other(bottom) → notice(left).
// Practice (qiyu+make) is already top+right, so 0°. The other sections
// rotate the WHOLE cluster (all 4 dots, even invisible ones) so their
// active pair ends up in the same physical position.
const SECTION_CLUSTER_ROTATION: Record<SectionId, number> = {
  practice:    0,    // qiyu top, make right (natural)
  work:      -90,    // make→top, other→right
  attention: 180,    // other→top, notice→right
  mirror:     90,    // notice→top, qiyu→right
};

function endHubPos(id: DotId, vw: number, vh: number): Pos {
  const cx = vw / 2, cy = vh / 2;
  // Tight convergence cluster — the dots magnet *toward* a single point so
  // the wrap-up reads as "they came together," not "they reformed a ring."
  // Radius is small enough that the four dots look huddled but still distinct.
  const r = Math.min(vw, vh) * 0.03;
  const a = (DOT_ANGLE[id] * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

// ——— Unified ring (image + motion brief) ———
// The conceptual circle exists as ONE object that moves through three
// resting positions: hub-center → corner → end-hub-center. Phase 4
// (corner-settle) and Phase 6 (end-return) interpolate (cx, cy, r) between
// adjacent rest states, so the ring TRAVELS — never cross-fades to a new
// position. This is the "one object, three positions" principle that ties
// the journey together.
type RingState = { cx: number; cy: number; r: number };
function ringHub(vw: number, vh: number): RingState {
  return { cx: vw / 2, cy: vh * HUB_CY_RATIO, r: Math.min(vw, vh) * HUB_R_RATIO };
}
function ringCorner(_vw: number, vh: number): RingState {
  return { cx: CORNER_CX, cy: vh - CORNER_CX, r: CORNER_R };
}
function ringEndHub(vw: number, vh: number): RingState {
  // Tight convergence cluster (matches endHubPos r). The "ring" is conceptual
  // here — the four dots cluster nearly at a point.
  return { cx: vw / 2, cy: vh / 2, r: Math.min(vw, vh) * 0.03 };
}
function ringStateAt(p: number, vw: number, vh: number): RingState {
  const HUB = ringHub(vw, vh);
  const CORNER = ringCorner(vw, vh);
  const END = ringEndHub(vw, vh);
  if (p <= HUB_HOLD_END) return HUB;
  if (p <= CORNER_SETTLE_END) {
    const t = smootherstep((p - HUB_HOLD_END) / (CORNER_SETTLE_END - HUB_HOLD_END));
    return {
      cx: lerp(HUB.cx, CORNER.cx, t),
      cy: lerp(HUB.cy, CORNER.cy, t),
      r:  lerp(HUB.r,  CORNER.r,  t),
    };
  }
  if (p <= SECTIONS_END) return CORNER;
  if (p <= END_CONVERGE_END) {
    const t = smootherstep((p - SECTIONS_END) / (END_CONVERGE_END - SECTIONS_END));
    return {
      cx: lerp(CORNER.cx, END.cx, t),
      cy: lerp(CORNER.cy, END.cy, t),
      r:  lerp(CORNER.r,  END.r,  t),
    };
  }
  // Hold + fan: ring stays at the tight-cluster center. During fan, dots
  // leave the ring and fly to viewport edges, so the ring's r value isn't
  // visually rendered — only the cx/cy matters as the convergence point.
  return END;
}
// A dot's position on a given ring state, accounting for cluster rotation.
function ringDotPos(id: DotId, ring: RingState, rotationDeg: number): Pos {
  const a = ((DOT_ANGLE[id] + rotationDeg) * Math.PI) / 180;
  return { x: ring.cx + ring.r * Math.cos(a), y: ring.cy + ring.r * Math.sin(a) };
}

// ——— Continuous cluster rotation ———
// Computes the cluster rotation directly from scroll progress instead of
// snapping to activeSection and tweening. Within a section's range, sits
// at that section's rotation; near each section boundary, smoothly
// interpolates to the next section's rotation along the SHORTEST arc.
// The user feels the rotation as scroll-driven motion rather than a delayed
// reaction to crossing a boundary.
const SECTIONS_IN_ORDER: SectionId[] = ['mirror', 'practice', 'attention', 'work'];
const ROTATION_TRANSITION_BAND = 0.025; // ±half-width of cross-fade around each boundary
function clusterRotationAt(p: number, hoveredArc: SectionId | null): number {
  // Hub & earlier: hovered arc rotates the WHOLE hub (dots + labels) so the
  // hovered pair sits at top + right — the same orientation it'll occupy in
  // the corner cluster. This way "hover an arc" already shows the user the
  // entry orientation; corner-settle is then pure translation, not rotation.
  if (p <= HUB_HOLD_END) {
    if (hoveredArc) return SECTION_CLUSTER_ROTATION[hoveredArc];
    return 0;
  }
  // Phase 4 (corner-settle): cluster rotates from whatever the hub ended at
  // (0 if no hover, hovered section's rotation otherwise) → mirror's target.
  // Shortest-arc interpolation so a -90°→+90° transition picks the shorter
  // sweep direction instead of going the long way around.
  if (p < SECTION_RANGES.mirror[0]) {
    const fromRot = hoveredArc ? SECTION_CLUSTER_ROTATION[hoveredArc] : 0;
    const toRot = SECTION_CLUSTER_ROTATION.mirror;
    let delta = toRot - fromRot;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const t = (p - HUB_HOLD_END) / (SECTION_RANGES.mirror[0] - HUB_HOLD_END);
    return fromRot + delta * smootherstep(clamp(t, 0, 1));
  }
  if (p >= SECTIONS_END) {
    // End-convergence: rotate from work's −90° back to canonical 0° so the
    // dots arrive at the tight center cluster in their canonical positions
    // (qiyu top, make right, other bottom, notice left). This lines them up
    // with their fan-out targets, so the hold→fan boundary has no jump.
    if (p >= END_CONVERGE_END) return 0;
    const t = (p - SECTIONS_END) / (END_CONVERGE_END - SECTIONS_END);
    return SECTION_CLUSTER_ROTATION.work * (1 - smootherstep(clamp(t, 0, 1)));
  }
  for (let i = 0; i < SECTIONS_IN_ORDER.length; i++) {
    const id = SECTIONS_IN_ORDER[i];
    const [lo, hi] = SECTION_RANGES[id];
    if (p < lo || p >= hi) continue;
    // Inside this section. If near the upper boundary, start tweening to next.
    if (p > hi - ROTATION_TRANSITION_BAND && i < SECTIONS_IN_ORDER.length - 1) {
      const nextId = SECTIONS_IN_ORDER[i + 1];
      const t = (p - (hi - ROTATION_TRANSITION_BAND)) / ROTATION_TRANSITION_BAND;
      const fromR = SECTION_CLUSTER_ROTATION[id];
      const toR   = SECTION_CLUSTER_ROTATION[nextId];
      // Shortest-arc interpolation
      let delta = toR - fromR;
      if (delta > 180)  delta -= 360;
      if (delta < -180) delta += 360;
      return fromR + delta * smootherstep(clamp(t, 0, 1));
    }
    return SECTION_CLUSTER_ROTATION[id];
  }
  return SECTION_CLUSTER_ROTATION.mirror;
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
//
// Practice gets a "stay" beat (0.015 progress) before extract begins: the
// active dots sit at the cluster — already amber-tinted — long enough for
// the user to register "these two are the actors" before they start moving
// to the axis ends. Without it, the dots leave the cluster the moment the
// section activates and the eye misses who's about to become the axis.
function sectionExtractT(p: number, sectionId: SectionId): number {
  const [lo, hi] = SECTION_RANGES[sectionId];
  const stayBeat = sectionId === 'practice' ? 0.015 : 0;
  const easeRange = 0.04;
  const enterT = clamp((p - (lo + stayBeat)) / easeRange, 0, 1);
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
  clusterRotationDeg: number,
  qiyuHeroOverride?: Pos | null,
) {
  const hero = id === 'qiyu' && qiyuHeroOverride
    ? qiyuHeroOverride
    : heroPos(id, vw, vh);
  const corner = cornerPos(id, vw, vh, clusterRotationDeg);
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
    // Lerp toward the rotated hub position so an in-progress hover (rare
    // but possible: cursor on an arc as scroll begins) doesn't snap when
    // the dots arrive.
    const hubRotated = ringDotPos(id, ringStateAt(p, vw, vh), clusterRotationDeg);
    return {
      pos: { x: lerp(hero.x, hubRotated.x, t), y: lerp(hero.y, hubRotated.y, t) },
      size: lerp(10, HUB_DOT_SIZE, t),
    };
  }
  // Hub hold: dots park ON the ring at positions derived from the cluster
  // rotation. When no arc is hovered, rotation = 0 → canonical positions.
  // When an arc is hovered, the hub rotates so that pair lands at top+right
  // (matching the corner-cluster orientation it'll occupy after settle).
  if (p <= HUB_HOLD_END) {
    return {
      pos: ringDotPos(id, ringStateAt(p, vw, vh), clusterRotationDeg),
      size: HUB_DOT_SIZE,
    };
  }
  if (p <= CORNER_SETTLE_END) {
    // Dots stay ON the ring — the ring TRAVELS via ringStateAt, and each
    // dot's position is recomputed from the live ring + cluster rotation.
    // Result: dots ride the ring from hub to corner along an arc-style path,
    // not a straight chord. (Size still lerps independently for visual.)
    const t = easeOutBack(clamp((p - HUB_HOLD_END) / (CORNER_SETTLE_END - HUB_HOLD_END), 0, 1));
    return {
      pos: ringDotPos(id, ringStateAt(p, vw, vh), clusterRotationDeg),
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
  if (p <= END_CONVERGE_END) {
    // Phase 6 (converge): dots travel from the corner cluster inward to the
    // tight center cluster. They follow the ring as it scales + moves.
    const t = smootherstep((p - SECTIONS_END) / (END_CONVERGE_END - SECTIONS_END));
    return {
      pos: ringDotPos(id, ringStateAt(p, vw, vh), clusterRotationDeg),
      size: lerp(CORNER_SIZE, 12, t),
    };
  }
  if (p <= END_HOLD_END) {
    // Phase 7 (hold): dots sit at the tight cluster — anticipation beat.
    return {
      pos: ringDotPos(id, ringStateAt(p, vw, vh), clusterRotationDeg),
      size: 12,
    };
  }
  // Phase 8 (fan): dots explode outward to viewport edges.
  const t = smootherstep((p - END_HOLD_END) / (1 - END_HOLD_END));
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
  // (Cluster rotation is now computed directly from scroll progress via
  // clusterRotationAt() — no rAF tween needed. See computation below.)
  // hoveredArc state still drives `visibleSectionId` for the hub label
  // crossfade (see below); the setter went away when we removed the
  // hub-ring hover affordance, so it stays read-only for now.
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
  // Convergence T: 0 at SECTIONS_END, 1 at END_CONVERGE_END. Drives the
  // "dots travel inward to tight cluster" motion + the centered-text fade-in.
  const returnT   = clamp((progress - SECTIONS_END) / (END_CONVERGE_END - SECTIONS_END), 0, 1);
  // Fan T: 0 at END_HOLD_END (after the hold beat), 1 at 1.0. Drives the
  // outward explosion. The hold beat is the gap between returnT hitting 1
  // (at END_CONVERGE_END = 0.86) and fanT starting (at END_HOLD_END = 0.89).
  const fanT      = clamp((progress - END_HOLD_END) / (1 - END_HOLD_END), 0, 1);
  // Axis draw-on: the cross arms only start drawing AFTER the dots have
  // committed to expanding (fanT > 0.30). Each arm grows from center to
  // its dot, racing alongside the fan motion. By the time fanT reaches
  // 0.85, the arms have caught up to the dots; from there the dots keep
  // moving outward and the arm endpoints follow them to the edges.
  const axisDrawT = smootherstep(clamp((fanT - 0.30) / 0.55, 0, 1));

  // Visibilities for non-dot scenery. Corner-settle is split into three
  // sub-beats so each motion gets a clean canvas:
  //   cornerT 0.00 → 0.35  hub elements fade OUT (hubFadeOutT)
  //   cornerT 0.35 → 0.65  dots travel alone (no text)
  //   cornerT 0.65 → 1.00  section content fades IN (sectionFadeInT)
  // Without this, hub labels + dots-in-flight + section content all
  // cross-fade together inside the same 4% scroll window.
  const heroVis        = clamp(1 - heroT * 1.4, 0, 1);
  const hubFadeOutT    = smootherstep(clamp(cornerT / 0.35, 0, 1));
  const sectionFadeInT = smootherstep(clamp((cornerT - 0.65) / 0.35, 0, 1));
  const ringVis      = hubFadeT * (1 - hubFadeOutT);
  const hubLabelVis  = hubFadeT * (1 - hubFadeOutT);
  const hubTitleVis  = hubLabelVis; // alias kept for any callers expecting the staggered name
  const sectionVis   = sectionFadeInT * (1 - returnT);
  const cornerNavVis = sectionVis;
  const endHubVis    = returnT * (1 - fanT);
  // Cross-axis visibility uses axisDrawT (delayed reveal) instead of fanT,
  // so the axis is invisible during the first 30% of the fan expansion —
  // dots leave first, axis follows.
  const fanCrossVis  = axisDrawT > 0 ? 1 : 0;
  const cellLabelVis = fanT;
  // Hub-hold view: dots, arc and labels stay COMPLETELY STILL once they've
  // come together. Default labels show the Reflection (mirror) pair —
  // Noticing + Qiyu — as a calm starter state. Only hover overrides this;
  // there's no scroll-driven cycling, which previously felt "clinchy"
  // because all four section names flicked past in ~280px of scroll.
  const visibleSectionId: SectionId = hoveredArc ?? 'mirror';

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

  // Cluster rotation is a pure function of scroll progress + hover state.
  // Re-derived every render — no state, no rAF. As the user scrolls across
  // a section boundary, rotation interpolates along the shortest arc within
  // a small transition band; everywhere else it's pinned at the current
  // section's target. Result: dots' angular positions track scroll directly.
  const clusterRotationDeg = clusterRotationAt(progress, hoveredArc);

  // Hub centered title — pairs the two cardinal nodes joined by the
  // currently visible arc (hover overrides; otherwise mirror by default).
  const hubArcSection = SECTION_BY_ID[visibleSectionId];
  const hubTitle = `${hubArcSection.axisPair[0]} × ${hubArcSection.axisPair[1]}`;

  // Bold arc stays anchored at the canonical top-right quadrant. The CLUSTER
  // ROTATION (applied to the dots + labels) puts the visible section's pair
  // at top + right, so the canonical-position arc always overlays them — no
  // arc rotation needed. This is the geometry trick that makes the new
  // hub-rotates-per-hover system work cleanly.
  const arcRotateDeg = 0;

  // Hub neutral state — purely hover-driven. While the user hasn't
  // hovered an arc, the headline reads "Look closer →" as a serif
  // invitation (no kicker, no section name) and the bold arc is hidden.
  // Scrolling does NOT cycle through the four sections — that previously
  // felt "clinchy" with names flicking past in ~280px of scroll. Only
  // hover swings the arc and swaps the title.
  const isHubNeutral = !hoveredArc;
  const NEUTRAL_AXIS = 'Look closer';

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

        {/* ——— Hub ring ——— Full circle with all four cardinal dots (rendered
            by the global dot layer below) sitting on its perimeter, plus a
            rotating bold arc that highlights the visible section's quadrant.
            In neutral state the bold arc fades to opacity 0 so the ring
            reads as the calm "all four" view. Each quarter is a transparent
            thick-stroke hit target that swaps the visible section on hover. */}
        {ringVis > 0 && (() => {
          // Ring + dots position lerps between hub-center and corner via
          // ringStateAt(progress) — so the SAME ring object appears to TRAVEL
          // from hub to corner during Phase 4, instead of cross-fading. The
          // corner SVG below also reads ringStateAt(progress), so during the
          // overlap window both renders draw at the identical (cx, cy, r)
          // and the cross-fade is invisible to the eye.
          const ring = ringStateAt(progress, viewportW, viewportH);
          const cStart = ringDotPos('qiyu', ring, 0);
          const cEnd   = ringDotPos('make', ring, 0);
          const canonicalD = `M ${cStart.x},${cStart.y} A ${ring.r},${ring.r} 0 0 1 ${cEnd.x},${cEnd.y}`;
          const hitActive = hubLabelVis > 0.6;
          return (
            <svg style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: 33,
              opacity: ringVis,
            }}>
              <circle cx={ring.cx} cy={ring.cy} r={ring.r}
                stroke="var(--line)" strokeWidth={1} fill="none" />
              <g style={{
                transformOrigin: `${ring.cx}px ${ring.cy}px`,
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
                  through. */}
              {SECTIONS.map((s) => {
                const arc = SECTION_ARC[s.id];
                const start = ringDotPos(arc.startId, ring, 0);
                const end   = ringDotPos(arc.endId,   ring, 0);
                const d = `M ${start.x},${start.y} A ${ring.r},${ring.r} 0 0 1 ${end.x},${end.y}`;
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

        {/* ——— End-hub label ——— On the return phase the four dots converge
            to a tight cluster at the viewport center; the label sits BELOW
            the cluster (offset by the cluster's radius + a small gap) so
            the text and the dots never overlap. */}
        {endHubVis > 0 && (() => {
          const endR = Math.min(viewportW, viewportH) * 0.03;
          return (
            <div style={{
              position: 'absolute',
              top: `calc(50% + ${endR + SPACE.xxl}px)`,
              left: 0, right: 0,
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
          );
        })()}

        {/* ——— Endpoint labels ——— Two labels pinned to the cropped quarter's
            two dots. The visual position is fixed; only the text changes as
            scroll iterates the four sections (mirror → practice → work →
            attention). The active section's startId becomes the top label;
            its endId becomes the right label. Each label keys off
            visibleSectionId so React remounts and the statusFade animation
            crossfades the text on every section change. */}
        {/* ——— Hub node labels ——— Cardinal text labels around the centered
            ring during converge. Each label sits OUTSIDE the dot along the
            radial direction, so when the cluster rotates (per hovered arc),
            labels rotate with their dots — no mismatch between dot identity
            and label. Anchor is derived from the dot's current angle on the
            ring (snapped to the nearest cardinal: top/right/bottom/left). */}
        {hubLabelVis > 0 && (() => {
          const ring = ringStateAt(progress, viewportW, viewportH);
          const labels: { id: DotId; text: string }[] = [
            { id: 'qiyu',   text: 'Qiyu' },
            { id: 'make',   text: 'Making' },
            { id: 'other',  text: 'Others' },
            { id: 'notice', text: 'Noticing' },
          ];
          // Label gap past the dot edge — small enough to read as a caption,
          // large enough not to crowd the dot.
          const LABEL_GAP = HUB_DOT_SIZE / 2 + SPACE.md;
          return (
            <div style={{
              position: 'absolute', inset: 0,
              pointerEvents: 'none', zIndex: 34,
              opacity: hubLabelVis,
            }}>
              {labels.map((l) => {
                const angleDeg = DOT_ANGLE[l.id] + clusterRotationDeg;
                const angleRad = (angleDeg * Math.PI) / 180;
                const dotX = ring.cx + ring.r * Math.cos(angleRad);
                const dotY = ring.cy + ring.r * Math.sin(angleRad);
                const labelX = dotX + Math.cos(angleRad) * LABEL_GAP;
                const labelY = dotY + Math.sin(angleRad) * LABEL_GAP;
                // Snap to nearest cardinal (0=right, 1=bottom, 2=left, 3=top)
                // to determine text alignment relative to its dot.
                const norm = ((angleDeg % 360) + 360) % 360;
                const cardinal = Math.round(norm / 90) % 4;
                const transform =
                  cardinal === 0 ? 'translateY(-50%)' :                  // right of dot
                  cardinal === 1 ? 'translate(-50%, 0)' :                // below dot
                  cardinal === 2 ? 'translate(-100%, -50%)' :            // left of dot
                                   'translate(-50%, -100%)';             // above dot (cardinal === 3)
                return (
                  <div key={l.id} style={{
                    position: 'absolute',
                    left: labelX, top: labelY,
                    transform,
                    fontFamily: 'var(--sans)',
                    fontSize: 12, fontWeight: 400,
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
            {/* This single line plays two roles:
                  • Neutral state: "Look closer →" reads as a content-sized
                    invitation in serif sentence case (cellLabel size). It
                    *replaces* the kicker+title pair entirely.
                  • Active state: small mono caps kicker (the visible
                    section's axis pair) above the section name below it. */}
            <div style={{
              fontFamily: isHubNeutral ? 'var(--serif)' : 'var(--mono)',
              fontSize: isHubNeutral ? TYPE.cellLabel.size : TYPE.meta.size,
              fontWeight: isHubNeutral ? TYPE.cellLabel.weight : TYPE.meta.weight,
              letterSpacing: isHubNeutral ? TYPE.cellLabel.tracking : TYPE.meta.tracking,
              lineHeight: isHubNeutral ? TYPE.cellLabel.lineHeight : TYPE.meta.lineHeight,
              textTransform: isHubNeutral ? 'none' : 'uppercase',
              color: isHubNeutral ? 'var(--ink)' : 'var(--ink-3)',
              marginBottom: SPACE.md,
            }}>
              <span key={`pair-${isHubNeutral ? 'neutral' : visibleSectionId}`}
                style={{ animation: 'statusFade .35s ease', display: 'inline-block' }}>
                {isHubNeutral ? NEUTRAL_AXIS : hubTitle}
              </span>
            </div>
            {!isHubNeutral && (
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
                  <span style={{ color: 'var(--ink-4)' }}>×</span>
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

        {/* ——— Practice-section axis ——— Two-part motion in amber:
              1. Arc (visible during expand): a quadratic curve hangs between
                 the two dots and stretches with them as they pull apart.
                 Reads as "these two are connected, and the connection is
                 the thing that's becoming the axis."
              2. Axis L (snaps in at the END of expand): two perpendicular
                 amber segments meeting at the corner bend (CORNER_CX, vh-…).
                 Arc fades in the last 25% of expand while the axis fades in
                 — same color, same endpoints, so the eye reads the swap as
                 the arc *snapping* into the axis, not a cut.
            Both stroke `--tint-tr` (the practice section's amber/honey),
            so the page picks up its hue alongside the dots. */}
        {sectionVis > 0 && activeSection === 'practice' && (() => {
          const t = sectionExtractT(progress, 'practice');
          if (t <= 0) return null;
          const cl = { x: CORNER_CX, y: viewportH - CORNER_CX };
          // Live dot positions — match exactly what dotState renders, so the
          // arc/axis endpoints stay glued to the dots through the lerp.
          const qStart = cornerPos('qiyu', viewportW, viewportH, clusterRotationDeg);
          const mStart = cornerPos('make', viewportW, viewportH, clusterRotationDeg);
          const qEnd = sectionAxisPos('practice', 'qiyu', viewportW, viewportH)!;
          const mEnd = sectionAxisPos('practice', 'make', viewportW, viewportH)!;
          const qpos = { x: lerp(qStart.x, qEnd.x, t), y: lerp(qStart.y, qEnd.y, t) };
          const mpos = { x: lerp(mStart.x, mEnd.x, t), y: lerp(mStart.y, mEnd.y, t) };
          // Crossfade window — last 25% of expand. Arc fades out as axis
          // fades in over the same band, anchored to the dot endpoints
          // so the visual continuity is "the arc snaps inward to the bend."
          const swapT = smootherstep(clamp((t - 0.75) / 0.25, 0, 1));
          const arcOpacity  = 1 - swapT;
          const axisOpacity = swapT;
          // Arc control point — bowed OUTWARD (away from the corner bend),
          // so the swap reads as "the curve relaxes toward the corner."
          // Push factor 0.25 of the chord — gentle bow, not a balloon.
          const mx = (qpos.x + mpos.x) / 2;
          const my = (qpos.y + mpos.y) / 2;
          const dx = mx - cl.x, dy = my - cl.y;
          const ctrl = { x: mx + dx * 0.25, y: my + dy * 0.25 };
          return (
            <>
              <svg style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                pointerEvents: 'none', zIndex: 33,
              }}>
                <path d={`M ${qpos.x},${qpos.y} Q ${ctrl.x},${ctrl.y} ${mpos.x},${mpos.y}`}
                  stroke="var(--tint-tr)" strokeWidth="1.5" fill="none"
                  strokeLinecap="round"
                  opacity={arcOpacity * sectionVis} />
                <g opacity={axisOpacity * sectionVis}>
                  <line x1={qpos.x} y1={qpos.y} x2={cl.x} y2={cl.y}
                    stroke="var(--tint-tr)" strokeWidth="1" />
                  <line x1={cl.x} y1={cl.y} x2={mpos.x} y2={mpos.y}
                    stroke="var(--tint-tr)" strokeWidth="1" />
                </g>
              </svg>
              {/* Axis-end labels — appear with the axis (last 25% of expand),
                  not with the arc. Until the L settles, the labels would be
                  attached to a curve that doesn't read as an axis yet. */}
              <div style={{
                position: 'absolute',
                left: qpos.x, top: qpos.y - SPACE.md,
                transform: 'translate(-50%, -100%)',
                fontFamily: 'var(--sans)', fontSize: TYPE.body.size,
                color: 'var(--ink-2)', whiteSpace: 'nowrap',
                opacity: axisOpacity * sectionVis, pointerEvents: 'none',
                zIndex: 34,
              }}>Qiyu</div>
              <div style={{
                position: 'absolute',
                left: mpos.x + SPACE.md, top: mpos.y,
                transform: 'translateY(-50%)',
                fontFamily: 'var(--sans)', fontSize: TYPE.body.size,
                color: 'var(--ink-2)', whiteSpace: 'nowrap',
                opacity: axisOpacity * sectionVis, pointerEvents: 'none',
                zIndex: 34,
              }}>Creating</div>
            </>
          );
        })()}

        {/* ——— Dashed cross ——— Four arms drawing from the center outward
            during the fan phase. Each arm's far endpoint is lerp(center, dot,
            axisDrawT), so the arms LITERALLY GROW from the convergence point
            toward each dot — the axis is *created by* the expansion, not
            faded in alongside it. After axisDrawT hits 1, the endpoint stays
            anchored to the dot, so the arms naturally extend with the dots
            as they continue their flight to the viewport edges. */}
        {fanCrossVis > 0 && (() => {
          const cx = viewportW / 2, cy = viewportH / 2;
          const { pos: qpos } = dotState('qiyu',   progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor);
          const { pos: opos } = dotState('other',  progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor);
          const { pos: npos } = dotState('notice', progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor);
          const { pos: mpos } = dotState('make',   progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor);
          const arms: { x: number; y: number }[] = [
            { x: lerp(cx, qpos.x, axisDrawT), y: lerp(cy, qpos.y, axisDrawT) },
            { x: lerp(cx, mpos.x, axisDrawT), y: lerp(cy, mpos.y, axisDrawT) },
            { x: lerp(cx, opos.x, axisDrawT), y: lerp(cy, opos.y, axisDrawT) },
            { x: lerp(cx, npos.x, axisDrawT), y: lerp(cy, npos.y, axisDrawT) },
          ];
          return (
            <svg style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: 33,
            }}>
              {arms.map((end, i) => (
                <line key={i}
                  x1={cx} y1={cy} x2={end.x} y2={end.y}
                  stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 5" />
              ))}
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
                const { pos } = dotState(l.id, progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor);
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
          const baseState = dotState(id, progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor);
          let pos = baseState.pos;
          let size = baseState.size;
          const inHero = progress < HERO_END * 0.95;
          const isActive = activeDotSet.has(id);
          // During corner phase: inactive dots dim to grey-ish so the active
          // pair reads as the current section. Smoothly fades on entry/exit.
          const cornerPhase = cornerT * (1 - returnT);
          // During corner phase, only the two active dots remain visible —
          // they sit at the endpoints of the visible arc (the "lens onto
          // the bigger circle"). Inactive dots fade out entirely so the
          // arc reads as a discrete segment, not a + cluster.
          // Also hide the four main dots during hub-fade and hub-hold so
          // the cropped-quarter view (with its own 2 dedicated endpoint
          // dots) is the only thing visible at the hub. They fade back in
          // during corner-settle as ringOutT releases hubLabelVis.
          // During corner phase: inactive dots dim to grey-ish so the active
          // pair reads as the current section. In hub-hold all four dots
          // stay full opacity — the ring + four cardinal nodes is the whole
          // composition we want to read.
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
                // In stable corner phase (dots settled in cluster, no
                // hub→corner motion in flight), enable a left/top transition
                // so the dots smoothly ROTATE around the cluster center
                // when activeSection changes. Outside corner phase, scroll
                // updates left/top per frame so a transition would lag.
                // No CSS transition on left/top: the cluster-rotation rAF
                // tween updates dot positions every frame along the circular
                // path, so a CSS lerp would smear the per-frame motion.
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

        {/* ——— Corner-nav arc ——— A 90° segment fixed in the upper-right
            quadrant of the cluster. The conceptual full circle rotates as
            the user scrolls between sections (see SECTION_CLUSTER_ROTATION),
            so the active node pair always lands at top + right of the
            cluster — the visible arc never moves on screen, only the labels
            and identities do. Image #23. */}
        {cornerNavVis > 0 && (() => {
          // Read the unified ring's current (cx, cy, r). During section view
          // this equals CORNER; during the corner-settle / end-return phases
          // the value is interpolated, so this SVG draws at the SAME position
          // as the hub render above — making the cross-fade between the two
          // invisible to the eye.
          const ring = ringStateAt(progress, viewportW, viewportH);
          const cx = ring.cx, cy = ring.cy, r = ring.r;
          // SVG canvas spans the whole viewport now (since the ring can be at
          // hub OR corner OR end-hub positions, we can't size it to one).
          // Arc endpoints are derived from the LIVE positions of the active
          // pair — the colored band rides the dots around the conceptual
          // circle as clusterRotationDeg interpolates. At rest in any section
          // the active pair sits at top+right of the cluster, so the arc
          // resolves to the same upper-right quadrant as before. Mid-rotation,
          // arc + dots travel together (connected motion).
          const [aId, bId] = SECTION_BY_ID[activeSection].activeDots;
          const aAngle = DOT_ANGLE[aId] + clusterRotationDeg;
          const bAngle = DOT_ANGLE[bId] + clusterRotationDeg;
          const ptOf = (deg: number) => ({
            x: cx + r * Math.cos((deg * Math.PI) / 180),
            y: cy + r * Math.sin((deg * Math.PI) / 180),
          });
          const aPt = ptOf(aAngle);
          const bPt = ptOf(bAngle);
          // Always the SHORT 90° arc between adjacent cardinals. Normalize
          // delta to (-180, 180] then pick SVG sweep flag from its sign.
          let delta = bAngle - aAngle;
          while (delta > 180)  delta -= 360;
          while (delta < -180) delta += 360;
          const sweep = delta > 0 ? 1 : 0;
          const arcD = `M ${aPt.x},${aPt.y} A ${r},${r} 0 0 ${sweep} ${bPt.x},${bPt.y}`;
          const tint = SECTION_BY_ID[activeSection].tint;
          const DOT_LABEL = { qiyu: 'Qiyu', make: 'Making', other: 'Others', notice: 'Noticing' } as const;
          // Label sits outboard of each active dot along the same angle.
          // textAnchor adapts to which screen quadrant the angle is in so
          // labels never crash into the dot they describe.
          const labelOf = (deg: number, off = 18) => {
            const c = Math.cos((deg * Math.PI) / 180);
            const s = Math.sin((deg * Math.PI) / 180);
            return {
              x: cx + (r + off) * c,
              y: cy + (r + off) * s + 4, // small optical drop for baseline
              anchor: (c >  0.3 ? 'start' : c < -0.3 ? 'end' : 'middle') as 'start' | 'middle' | 'end',
            };
          };
          const aLab = labelOf(aAngle);
          const bLab = labelOf(bAngle);
          return (
            <svg
              width="100%"
              height="100%"
              style={{
                position: 'absolute',
                inset: 0,
                opacity: cornerNavVis,
                pointerEvents: 'none',
                // Below the dots (zIndex 35) so the dots sit ON the arc
                // endpoints visually — arc terminates at dot edges.
                zIndex: 33,
                overflow: 'visible',
              }}
            >
              {/* Faint backing ring — the rest of the conceptual circle.
                  Dotted, very low opacity so it doesn't compete. */}
              <circle
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke="var(--ink-4)"
                strokeWidth={1}
                strokeLinecap="round"
                strokeDasharray="1 5"
                opacity={0.4}
              />
              {/* Active 90° arc — endpoints follow the live active-pair
                  positions on the ring, so the colored band rides the dots
                  through rotation. At rest the active pair sits at top+right,
                  so this resolves to the same upper-right quadrant as before. */}
              <path
                d={arcD}
                fill="none"
                stroke={tint}
                strokeWidth={3}
                strokeLinecap="round"
                style={{ transition: 'stroke .35s ease' }}
              />
              {/* Labels follow the active dots through rotation — each sits
                  outboard of its dot along the same angle, so the pairing
                  between dot and name never breaks. textAnchor flips with
                  the screen quadrant so the label never crashes the dot. */}
              <text
                key={`a-${aId}`}
                x={aLab.x} y={aLab.y}
                textAnchor={aLab.anchor}
                dominantBaseline="middle"
                fill="var(--ink-2)"
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 14, fontWeight: 500,
                  animation: 'statusFade .35s ease',
                }}
              >
                {DOT_LABEL[aId]}
              </text>
              <text
                key={`b-${bId}`}
                x={bLab.x} y={bLab.y}
                textAnchor={bLab.anchor}
                dominantBaseline="middle"
                fill="var(--ink-2)"
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 14, fontWeight: 500,
                  animation: 'statusFade .35s ease',
                }}
              >
                {DOT_LABEL[bId]}
              </text>
            </svg>
          );
        })()}

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
    case 'attention': return <LearnQuotes onNav={onNav} />;
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
//
// Optional `articleSlug` + `sectionId` link a quote to the article (and
// specific section) it came from. When present, the whole blockquote becomes
// a button — clicking opens the article scrolled to that section.
type LearnQuote = {
  quote: string;
  who: string;
  articleSlug?: string;
  sectionId?: string;
};
const LEARN_QUOTES: LearnQuote[] = [
  { quote: 'Most of what I learn comes from watching how people describe the work in their own voice.', who: 'a designer at IDEO' },
  { quote: 'The questions someone asks reveal more than the answers they give.',                       who: 'a senior PM, on hiring' },
  { quote: 'When a teammate gets quiet, that’s usually the most important thing said all meeting.',     who: 'a research lead' },
  { quote: 'The best research is just listening with slightly better manners.',                         who: 'a UX lead at dinner' },
  { quote: 'You’re describing a feedback loop but you’re acting like it’s a process.',                  who: 'a PM over zoom' },
  { quote: 'You keep saying “I think” — but that’s the whole point, isn’t it?',                          who: 'a designer at a coffee shop' },
];
function LearnQuotes({ onNav }: { onNav: NavFn }) {
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
        {LEARN_QUOTES.map((q, i) => {
          const linked = !!q.articleSlug;
          const onClick = linked
            ? () => onNav(`article:${q.articleSlug}${q.sectionId ? `:${q.sectionId}` : ''}`)
            : undefined;
          return (
            <blockquote
              key={i}
              onClick={onClick}
              style={{
                margin: 0,
                display: 'flex', flexDirection: 'column', gap: SPACE.sm,
                cursor: linked ? 'pointer' : 'default',
                transition: 'transform .25s cubic-bezier(.2,.7,.2,1)',
              }}
              onMouseEnter={(e) => {
                if (!linked) return;
                const arrow = e.currentTarget.querySelector('[data-quote-arrow]') as HTMLElement | null;
                if (arrow) arrow.style.transform = 'translateX(4px)';
                const cite = e.currentTarget.querySelector('[data-quote-cite]') as HTMLElement | null;
                if (cite) cite.style.color = 'var(--ink-2)';
              }}
              onMouseLeave={(e) => {
                if (!linked) return;
                const arrow = e.currentTarget.querySelector('[data-quote-arrow]') as HTMLElement | null;
                if (arrow) arrow.style.transform = 'translateX(0)';
                const cite = e.currentTarget.querySelector('[data-quote-cite]') as HTMLElement | null;
                if (cite) cite.style.color = 'var(--ink-3)';
              }}
            >
              <p style={{
                margin: 0,
                fontFamily: 'var(--reading)', fontWeight: 400,
                fontSize: 'clamp(18px, 1.4vw, 22px)',
                lineHeight: 1.45,
                color: 'var(--ink)',
                textWrap: 'pretty',
              }}>
                &ldquo;{q.quote}&rdquo;
              </p>
              <cite data-quote-cite style={{
                fontFamily: 'var(--sans)',
                fontSize: TYPE.kicker.size, fontWeight: TYPE.kicker.weight,
                letterSpacing: TYPE.kicker.tracking,
                textTransform: 'uppercase', fontStyle: 'normal',
                color: 'var(--ink-3)',
                transition: 'color .2s ease',
                display: 'inline-flex', alignItems: 'baseline', gap: 8,
              }}>
                {q.who}
                {linked && (
                  <span data-quote-arrow style={{
                    color: 'var(--ink-3)',
                    transition: 'transform .2s ease',
                    display: 'inline-block',
                  }}>→</span>
                )}
              </cite>
            </blockquote>
          );
        })}
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
