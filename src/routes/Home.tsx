import { useEffect, useRef, useState } from 'react';
import type { NavFn } from '@/App';
import { quadrants, bySlug, type Quadrant } from '@/content';
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
  reflect:     [CORNER_SETTLE_END, 0.39],
  experiment:  [0.39, 0.52],
  hear:        [0.52, 0.65],
  collaborate: [0.65, SECTIONS_END],
};
function activeSectionFromProgress(p: number): SectionId {
  if (p >= SECTION_RANGES.collaborate[0]) return 'collaborate';
  if (p >= SECTION_RANGES.hear[0])        return 'hear';
  if (p >= SECTION_RANGES.experiment[0])  return 'experiment';
  return 'reflect';
}

// ——— Dots ———
// Four dots persist across the entire timeline, morphing through five resting
// states. `id` matches the cardinal node in the centered ring: qiyu=top,
// make=right, other=bottom, notice=left.
const DOT_IDS = ['qiyu', 'create', 'other', 'think'] as const;
type DotId = typeof DOT_IDS[number];

const DOT_ANGLE: Record<DotId, number> = {
  qiyu: -90, create: 0, other: 90, think: 180,
};

// Hero scatter: viewport-relative (0–1) start positions for landing-page floaters.
// Qiyu sits stationary just below the top pill text and pulses like an
// "AI loading" indicator; the other three drift around the middle.
const HERO_SCATTER: Record<DotId, { x: number; y: number }> = {
  qiyu:   { x: 0.50, y: 0.13 },
  think:  { x: 0.24, y: 0.46 },
  create: { x: 0.80, y: 0.54 },
  other:  { x: 0.55, y: 0.42 },
};

// CSS float animations (defined in tokens.css) — only applied during pure hero
// phase so dots wiggle gently before the morph begins.
const DOT_FLOAT: Record<DotId, { anim: string; dur: string; delay: string }> = {
  qiyu:   { anim: 'float-a', dur: '7.2s', delay: '0.4s' },
  think:  { anim: 'float-b', dur: '7.8s', delay: '1.2s' },
  create: { anim: 'float-c', dur: '5.6s', delay: '2.5s' },
  other:  { anim: 'float-a', dur: '6.4s', delay: '0s' },
};

// Hover status — the rotating QIYU-pill text swaps to one of these when the
// user hovers a floater. Names "Qiyu's relationship" with that node.
const DOT_STATUS: Record<DotId, string> = {
  qiyu:   'Thinking…',
  think:  'Noticing patterns…',
  create: 'Making things…',
  other:  'Listening to others…',
};

// ——— Sections ———
// The four arcs in the centered ring → four section views. Each section
// activates two cardinal dots in the corner nav (the two ends of its arc),
// and fills one cell of the final 2×2 reveal.
type SectionId = 'reflect' | 'experiment' | 'hear' | 'collaborate';

// Each section pairs two cardinal nodes — that pairing IS the section's
// identity (e.g., Reflection sits where Qiyu meets Noticing). The tag is
// shown beneath the section title so the user can place each page back on
// the 2×2 map at a glance.
const SECTIONS: {
  id: SectionId;
  title: string;
  axisPair: [string, string];
  /** Persona doing the activity (renders left of the kicker dot). */
  persona: string;
  /** Gerund phrase that names the *posture* of the section — what the
   *  persona is actually doing on this page. Renders right of the dot in the
   *  section's tint. Trailing ellipsis is part of the voice (in-progress). */
  activity: string;
  activeDots: DotId[];
  cell: 'TL' | 'TR' | 'BL' | 'BR';
  /** Pigment for the section. Used as a quiet accent on the active corner
   *  dots, the kicker dot, and any per-section motif — so each page picks
   *  up its own color without re-skinning the whole UI. */
  tint: string;
}[] = [
  { id: 'reflect',    title: 'to reflect',     axisPair: ['Qiyu',   'Thinking'], persona: 'Qiyu',   activity: 'thinking who I am…',     activeDots: ['qiyu', 'think'],  cell: 'TL', tint: 'var(--tint-tl)' },
  { id: 'experiment',  title: 'to experiment',  axisPair: ['Qiyu',   'Creating'],   persona: 'Qiyu',   activity: 'making things happen…',                       activeDots: ['qiyu', 'create'],    cell: 'TR', tint: 'var(--tint-tr)' },
  { id: 'hear', title: 'to hear',        axisPair: ['Others', 'Thinking'], persona: 'Qiyu',   activity: 'hearing what others say…',       activeDots: ['other', 'think'], cell: 'BL', tint: 'var(--tint-bl)' },
  { id: 'collaborate',      title: 'to collaborate', axisPair: ['Others', 'Creating'],   persona: 'Qiyu',   activity: 'creating with others…',                              activeDots: ['other', 'create'],   cell: 'BR', tint: 'var(--tint-br)' },
];

const SECTION_BY_ID: Record<SectionId, typeof SECTIONS[number]> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s]),
) as Record<SectionId, typeof SECTIONS[number]>;

// Each section maps to one quarter-arc on the centered ring — the arc
// connecting its two cardinal nodes via the SHORT path (the one inside
// that section's quadrant of the 2×2). `startId → endId` is given in
// SVG-clockwise order so the path command can be written verbatim.
const SECTION_ARC: Record<SectionId, { startId: DotId; endId: DotId }> = {
  reflect:     { startId: 'think',  endId: 'qiyu'   }, // top-left arc
  experiment:  { startId: 'qiyu',   endId: 'create' }, // top-right arc
  hear:        { startId: 'other',  endId: 'think'  }, // bottom-left arc
  collaborate: { startId: 'create', endId: 'other'  }, // bottom-right arc
};

// For each dot, the two other dots it's connected to via a section arc.
// Derived from SECTION_ARC so it stays in sync automatically.
const DOT_CONNECTIONS: Record<DotId, DotId[]> = (() => {
  const map: Partial<Record<DotId, Set<DotId>>> = {};
  for (const { startId, endId } of Object.values(SECTION_ARC)) {
    (map[startId] ??= new Set()).add(endId);
    (map[endId]   ??= new Set()).add(startId);
  }
  return Object.fromEntries(
    DOT_IDS.map((id) => [id, [...(map[id] ?? [])]])
  ) as Record<DotId, DotId[]>;
})();

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
  qiyu: 0, other: 1, think: 2, create: 3,
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
const CORNER_R = 130;
// Per-section rotation that lands the active node pair at top + right.
// CW circle order: qiyu(top) → make(right) → other(bottom) → notice(left).
// Practice (qiyu+make) is already top+right, so 0°. The other sections
// rotate the WHOLE cluster (all 4 dots, even invisible ones) so their
// active pair ends up in the same physical position.
const SECTION_CLUSTER_ROTATION: Record<SectionId, number> = {
  experiment:   0,    // qiyu top, create right (natural)
  collaborate: -90,   // create→top, other→right
  hear:        180,   // other→top, think→right
  reflect:      90,   // think→top, qiyu→right
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
// Bloom radius — much smaller than CORNER_R so when the cluster blooms,
// it COMPRESSES into a tight 2×2-style cluster matching the end-reveal
// dot density. Reading: "you're looking at a concentrated map of the
// whole journey, not the same arc just relocated."
const BLOOM_R = 50;
// Bloom dot size — corner dots shrink alongside the cluster so dot density
// matches end-reveal. CORNER_SIZE (18) reads as oversized in a 50-radius
// cluster; 12 matches the end-hold cluster size.
const BLOOM_DOT_SIZE = 12;
// Expansion offset applied to the corner cluster when the user hovers it
// (navMapT > 0). The cluster's center slides inward from the corner so the
// full conceptual circle fits on screen, AND the radius shrinks from
// CORNER_R → BLOOM_R so the four cardinal dots tuck close together — the
// arc-as-peek transforms into a tight compass.
function expandedCorner(corner: RingState, navMapT: number, vh: number): RingState {
  if (navMapT <= 0) return corner;
  const targetR  = BLOOM_R;
  const targetCx = targetR + 110;
  const targetCy = vh - targetR - 110;
  return {
    cx: lerp(corner.cx, targetCx, navMapT),
    cy: lerp(corner.cy, targetCy, navMapT),
    r:  lerp(corner.r,  targetR,  navMapT),
  };
}
function ringStateAt(p: number, vw: number, vh: number, navMapT: number = 0): RingState {
  const HUB = ringHub(vw, vh);
  const CORNER = ringCorner(vw, vh);
  const END = ringEndHub(vw, vh);
  if (p <= HUB_HOLD_END) return HUB;
  if (p <= CORNER_SETTLE_END) {
    const t = smootherstep((p - HUB_HOLD_END) / (CORNER_SETTLE_END - HUB_HOLD_END));
    const target = expandedCorner(CORNER, navMapT, vh);
    return {
      cx: lerp(HUB.cx, target.cx, t),
      cy: lerp(HUB.cy, target.cy, t),
      r:  lerp(HUB.r,  target.r,  t),
    };
  }
  if (p <= SECTIONS_END) return expandedCorner(CORNER, navMapT, vh);
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
const SECTIONS_IN_ORDER: SectionId[] = ['reflect', 'experiment', 'hear', 'collaborate'];
const ROTATION_TRANSITION_BAND = 0.025; // ±half-width of cross-fade around each boundary
function clusterRotationAt(p: number, hoveredArc: SectionId | null, navMapT: number = 0): number {
  // When the corner nav map is open (navMapT > 0), lerp the rotation to 0 so
  // all four dots sit at their canonical cardinal positions on the expanded
  // ring — letting the user see the FULL compass with each section's quadrant
  // in its true place. At navMapT = 1, rotation is fully canonical regardless
  // of activeSection or hoveredArc.
  const baseRot = clusterRotationAtBase(p, hoveredArc);
  if (navMapT <= 0) return baseRot;
  // Shortest-arc interpolation toward 0.
  let delta = -baseRot;
  if (delta > 180)  delta -= 360;
  if (delta < -180) delta += 360;
  return baseRot + delta * navMapT;
}
function clusterRotationAtBase(p: number, hoveredArc: SectionId | null): number {
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
  if (p < SECTION_RANGES.reflect[0]) {
    const fromRot = hoveredArc ? SECTION_CLUSTER_ROTATION[hoveredArc] : 0;
    const toRot = SECTION_CLUSTER_ROTATION.reflect;
    let delta = toRot - fromRot;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const t = (p - HUB_HOLD_END) / (SECTION_RANGES.reflect[0] - HUB_HOLD_END);
    return fromRot + delta * smootherstep(clamp(t, 0, 1));
  }
  if (p >= SECTIONS_END) {
    // End-convergence: rotate from work's −90° back to canonical 0° so the
    // dots arrive at the tight center cluster in their canonical positions
    // (qiyu top, make right, other bottom, notice left). This lines them up
    // with their fan-out targets, so the hold→fan boundary has no jump.
    if (p >= END_CONVERGE_END) return 0;
    const t = (p - SECTIONS_END) / (END_CONVERGE_END - SECTIONS_END);
    return SECTION_CLUSTER_ROTATION.collaborate * (1 - smootherstep(clamp(t, 0, 1)));
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
  return SECTION_CLUSTER_ROTATION.reflect;
}

function fanPos(id: DotId, vw: number, vh: number): Pos {
  // Final resting state: dots at viewport-edge insets so the dashed cross
  // they anchor reaches across the entire screen.
  const insetX = vw * 0.05;
  const insetY = vh * 0.06;
  switch (id) {
    case 'qiyu':   return { x: vw / 2,         y: insetY };
    case 'create': return { x: vw - insetX,    y: vh / 2 };
    case 'other':  return { x: vw / 2,         y: vh - insetY };
    case 'think':  return { x: insetX,         y: vh / 2 };
  }
}

// Per-section axis extraction. For sections whose layout speaks in axes
// (currently just Create), the active dots fly OUT of the corner cluster to
// frame the page as an axis chart — qiyu pulls up to the top-left, make
// pulls right to the bottom-right, forming an L-shape with the cluster
// sitting at the bend. Returns null when this dot stays put for that section.
const AXIS_INSET = 80;
function sectionAxisPos(sectionId: SectionId, id: DotId, vw: number, vh: number): Pos | null {
  if (sectionId === 'experiment') {
    if (id === 'qiyu')   return { x: CORNER_CX, y: AXIS_INSET };
    if (id === 'create') return { x: vw - AXIS_INSET, y: vh - CORNER_CX };
  }
  return null;
}

// Smoothly extracts a dot from its corner home to its axis position when
// the user enters a section's range, then retracts as they exit. Returns
// 0 (fully in cluster) → 1 (fully extracted to axis).
//
// The practice section's resting state IS the extracted state — the page's
// editorial conceit is "Qiyu × Making becomes the axis you read by." So
// the dots should be at their axis ends for the *entire* time the user
// holds in the section, not just the middle ~50%. We keep tight ease ramps
// at both boundaries so the morph reads as motion rather than a snap, but
// the plateau in between covers nearly the full range.
function sectionExtractT(p: number, sectionId: SectionId): number {
  const [lo, hi] = SECTION_RANGES[sectionId];
  const easeRange = 0.018;
  const enterT = clamp((p - lo) / easeRange, 0, 1);
  const exitT  = clamp((hi - p) / easeRange, 0, 1);
  return smootherstep(Math.min(enterT, exitT));
}

// Corner-cluster size: all four dots are uniform — active vs inactive is
// communicated by opacity alone.
const CORNER_SIZE = 18;

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
  navMapT: number = 0,
) {
  const hero = id === 'qiyu' && qiyuHeroOverride
    ? qiyuHeroOverride
    : heroPos(id, vw, vh);
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
    const hubRotated = ringDotPos(id, ringStateAt(p, vw, vh, navMapT), clusterRotationDeg);
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
      pos: ringDotPos(id, ringStateAt(p, vw, vh, navMapT), clusterRotationDeg),
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
      pos: ringDotPos(id, ringStateAt(p, vw, vh, navMapT), clusterRotationDeg),
      size: lerp(HUB_DOT_SIZE, CORNER_SIZE, t),
    };
  }
  if (p <= SECTIONS_END) {
    // Within a section, an "active" dot may be extracted from the cluster
    // to its axis-end position (e.g. qiyu pulls up to the top-left for the
    // Create section). Fully-blended interpolation between the two. The
    // resting position is the live ring's dot position (so when the user
    // hovers the corner nav and the cluster blooms outward, all dots ride
    // the expanding ring). Dot size also shrinks with navMapT so the
    // bloomed cluster reads as a tighter, smaller compass instead of a
    // big ring of fat dots.
    const ringPos = ringDotPos(id, ringStateAt(p, vw, vh, navMapT), clusterRotationDeg);
    const liveSize = lerp(CORNER_SIZE, BLOOM_DOT_SIZE, navMapT);
    const axis = sectionAxisPos(activeSection, id, vw, vh);
    if (!axis) return { pos: ringPos, size: liveSize };
    const t = sectionExtractT(p, activeSection);
    return {
      pos: { x: lerp(ringPos.x, axis.x, t), y: lerp(ringPos.y, axis.y, t) },
      size: liveSize,
    };
  }
  if (p <= END_CONVERGE_END) {
    // Phase 6 (converge): dots travel from the corner cluster inward to the
    // tight center cluster. They follow the ring as it scales + moves.
    const t = smootherstep((p - SECTIONS_END) / (END_CONVERGE_END - SECTIONS_END));
    return {
      pos: ringDotPos(id, ringStateAt(p, vw, vh, navMapT), clusterRotationDeg),
      size: lerp(CORNER_SIZE, 12, t),
    };
  }
  if (p <= END_HOLD_END) {
    // Phase 7 (hold): dots sit at the tight cluster — anticipation beat.
    return {
      pos: ringDotPos(id, ringStateAt(p, vw, vh, navMapT), clusterRotationDeg),
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
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSettlingRef = useRef(false);
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
  // navMapT — rAF tween 0 ↔ 1 driven by cornerNavHover. When > 0, the
  // corner cluster blooms outward (center slides inward, rotation lerps to
  // canonical 0°), exposing the FULL conceptual circle as a navigable
  // compass with all four cardinal dots and four section-arc hit-targets.
  // Threaded through ringStateAt + clusterRotationAt + dotState so the
  // entire visual system reacts coherently to the hover state.
  const [navMapT, setNavMapT] = useState(0);
  const navMapTRef = useRef(0);
  useEffect(() => { navMapTRef.current = navMapT; }, [navMapT]);
  useEffect(() => {
    const target = cornerNavHover ? 1 : 0;
    const startVal = navMapTRef.current;
    let raf = 0;
    let startTime = 0;
    const tick = (now: number) => {
      if (startTime === 0) startTime = now;
      const elapsed = now - startTime;
      // Open slower (320ms easeOutCubic — feels like an unfolding); close
      // quicker (200ms — gets out of the way).
      const duration = target === 1 ? 320 : 200;
      const t = Math.min(elapsed / duration, 1);
      const eased = target === 1 ? 1 - Math.pow(1 - t, 3) : 1 - Math.pow(1 - t, 2);
      setNavMapT(startVal + (target - startVal) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cornerNavHover]);

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
  const [hoverLinePos, setHoverLinePos] = useState<{ x1: number; y1: number; x2: number; y2: number }[] | null>(null);

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
    if (!hoveredDot) { setHoverLinePos(null); return; }
    const id = hoveredDot;
    const neighbors = [...new Set(['qiyu' as DotId, ...DOT_CONNECTIONS[id]])];
    let raf = 0;
    const tick = () => {
      const origin = dotRefs.current[id];
      if (!origin) { raf = requestAnimationFrame(tick); return; }
      const or = origin.getBoundingClientRect();
      const ox = or.left + or.width / 2;
      const oy = or.top + or.height / 2;
      const lines = neighbors.flatMap((nid) => {
        const n = dotRefs.current[nid];
        if (!n) return [];
        const nr = n.getBoundingClientRect();
        return [{ x1: ox, y1: oy, x2: nr.left + nr.width / 2, y2: nr.top + nr.height / 2 }];
      });
      setHoverLinePos((prev) => {
        if (prev && prev.length === lines.length
          && lines.every((l, i) =>
            Math.abs((prev[i].x1 - l.x1)) < 0.5 && Math.abs((prev[i].y1 - l.y1)) < 0.5
            && Math.abs((prev[i].x2 - l.x2)) < 0.5 && Math.abs((prev[i].y2 - l.y2)) < 0.5
          )) return prev;
        return lines;
      });
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
    // Settled anchor positions — the natural resting plateaus between
    // transition bands. When scroll stops mid-transition (momentum scroll
    // overshooting into a ramp), we snap to the nearest anchor so dots always
    // land in a fully-resolved state rather than freezing half-extracted.
    const EASE_RANGE = 0.018;
    const SETTLE_ANCHORS = [
      0,
      HERO_END,
      DOTS_AT_HUB,
      HUB_FADE_END,
      HUB_HOLD_END,
      CORNER_SETTLE_END,
      ...Object.values(SECTION_RANGES).flatMap(([lo, hi]) => [
        lo + EASE_RANGE,        // dots fully extracted (section entered)
        (lo + hi) / 2,          // mid-plateau — comfortable reading position
        hi - EASE_RANGE,        // still in section, about to exit
      ]),
      SECTIONS_END,
      END_CONVERGE_END,
      END_HOLD_END,
      1.0,
    ];

    const settle = () => {
      const vh = window.innerHeight;
      const tourPx = vh * 8;
      const p = clamp(window.scrollY / tourPx, 0, 1);
      let nearest = SETTLE_ANCHORS[0];
      let minDist = Math.abs(p - nearest);
      for (const a of SETTLE_ANCHORS) {
        const d = Math.abs(p - a);
        if (d < minDist) { minDist = d; nearest = a; }
      }
      // Only snap if we're meaningfully inside a ramp (not already settled)
      if (minDist > 0.002) {
        isSettlingRef.current = true;
        window.scrollTo({ top: nearest * tourPx, behavior: 'smooth' });
        setTimeout(() => { isSettlingRef.current = false; }, 700);
      }
    };

    const onScroll = () => {
      rawScrollRef.current = window.scrollY;
      if (isSettlingRef.current) return;
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(settle, 180);
    };
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
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
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

  // Footer entrance — the diagram shrinks as the user scrolls past the
  // tour and into the post-tour buffer. By the time the footer top reaches
  // the top of viewport (smoothScrollY = driverHeight), footerProgress is
  // already 1, so the diagram has settled into its small "header" size
  // above the footer. Smootherstep keeps the shrink itself feeling
  // continuous + decelerated, not a sudden snap.
  const footerProgressRaw = clamp(
    (smoothScrollY - tourScrollPx) / (viewportH * 1.5),
    0,
    1,
  );
  const footerProgress = smootherstep(footerProgressRaw);
  // Final size ≈ 35% of full; shrinks toward upper-center (origin Y at 22%
  // of viewport) so the small diagram lands in the top strip that the
  // rising footer doesn't cover.
  const diagramScale = lerp(1, 0.35, footerProgress);

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

  // Visibilities for non-dot scenery. Corner-settle is split into beats so
  // each motion gets a clean canvas:
  //   cornerT 0.00 → 0.35  hub elements fade OUT (hubFadeOutT)
  //   cornerT 0.35 → 0.65  dots travel alone (no text)
  //   cornerT 0.65 → 0.80  section header fades IN (kicker + italic title)
  //   cornerT 0.80 → 0.85  HOLD — header readable, body not yet there
  //   cornerT 0.85 → 1.00  section body fades IN (statement / scatter / etc.)
  // The 5% hold is what makes the reveal feel deliberate: eye registers the
  // page's *name* before the body asks for attention.
  const heroVis        = clamp(1 - heroT * 1.4, 0, 1);
  const hubFadeOutT    = smootherstep(clamp(cornerT / 0.35, 0, 1));
  const ringVis      = hubFadeT * (1 - hubFadeOutT);
  const hubLabelVis  = hubFadeT * (1 - hubFadeOutT);
  const hubTitleVis  = hubLabelVis; // alias kept for any callers expecting the staggered name
  // Section header is just the kicker line (persona · activity). The italic
  // page-name title was removed — the activity phrase already names what
  // this page is about, so a second title was redundant.
  const sectionKickerVis = smootherstep(clamp((cornerT - 0.65) / 0.09, 0, 1)) * (1 - returnT);
  const sectionHeaderVis = sectionKickerVis;
  const sectionBodyVis   = smootherstep(clamp((cornerT - 0.85) / 0.15, 0, 1)) * (1 - returnT);
  // sectionVis stays as a derived "either child is visible" gate, so existing
  // `sectionVis > 0` checks still work without rewiring every call site.
  const sectionVis   = Math.max(sectionHeaderVis, sectionBodyVis);
  // Corner nav surfaces with the kicker (earliest piece of header) — once
  // the user knows what page they're on, the nav is meaningful. This drives
  // the dotted backing ring + the corner labels.
  const cornerNavVis = sectionKickerVis;
  // The colored arc itself appears EARLIER than the rest of the corner nav:
  // it lights up between qiyu↔noticing on the still-canonical hub circle in
  // the last beat of hub-hold (anticipation), then rides the dots through
  // the morph + rotation into the corner. By the time the kicker arrives,
  // the colored arc is already there waiting for it.
  const ARC_PREVIEW_LENGTH = 0.02; // last ~50% of hub-hold reserved for preview
  const arcPreviewVis = clamp((progress - (HUB_HOLD_END - ARC_PREVIEW_LENGTH)) / ARC_PREVIEW_LENGTH, 0, 1);
  // Held at 1 from preview onward; drops only during end-return when the
  // ring travels back to center for the 2×2 fan-out.
  const arcLayerVis = arcPreviewVis * (1 - returnT);
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
  const visibleSectionId: SectionId = hoveredArc ?? 'reflect';

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
  const clusterRotationDeg = clusterRotationAt(progress, hoveredArc, navMapT);

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
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '100vh',
        zIndex: 10, overflow: 'hidden',
        // The whole canvas (dots + axis + labels + cluster) shrinks as the
        // footer comes up, leaving room for the footer body below while
        // keeping the diagram visible as a small "header" above it.
        // transform-origin sits at 50% 22% so the diagram shrinks toward the
        // upper-center, staying clear of the rising footer.
        transform: `scale(${diagramScale})`,
        transformOrigin: '50% 22%',
        willChange: 'transform',
      }}>
        {/* ——— Dark-mode scrim ——— Fades in when the corner nav blooms,
            painting the whole viewport black so the cluster reads as the
            ONLY thing on the page. Sits at z-32: above the hero h1 (z-30)
            and any other page content, but below the visual SVG (z-33),
            cardinal labels (z-34), dots (z-35), and the corner-nav
            interactive layer (z-40) — so the cluster sits cleanly on top.
            Driven by navMapT (the rAF tween of cornerNavHover) so the fade
            in/out matches the bloom timing exactly. */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            background: '#0e0d0b',
            opacity: 0,
            pointerEvents: 'none',
            zIndex: 32,
          }}
        />
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
          Design is about<br />
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
            connecting the dots.
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
                id === 'think'  ? 'Thinking':
                                  'Creating';
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

        {/* ——— Hover lines ——— Dashed lines from the hovered dot to each of
            its two arc-neighbors. Endpoints measured from the DOM each frame
            so they track float wiggle. */}
        {hoverLinePos && hoverLinePos.length > 0 && heroT < 1 && (
          <svg style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 31,
          }}>
            {hoverLinePos.map((seg, i) => (
              <line key={i} x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 5"
                style={{ opacity: clamp(1 - heroT * 1.6, 0, 1) }} />
            ))}
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
          const ring = ringStateAt(progress, viewportW, viewportH, navMapT);
          const cStart = ringDotPos('qiyu', ring, 0);
          const cEnd   = ringDotPos('create', ring, 0);
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
                opacity: 0,
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
                    stroke="transparent" strokeWidth={14} fill="none"
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
          const ring = ringStateAt(progress, viewportW, viewportH, navMapT);
          const labels: { id: DotId; text: string }[] = [
            { id: 'qiyu',   text: 'Qiyu' },
            { id: 'create', text: 'Creating' },
            { id: 'other',  text: 'Others' },
            { id: 'think',  text: 'Thinking' },
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
          const SECTION_TO_QUADRANT: Record<string, string> = {
            reflect: 'mirror', experiment: 'practice', hear: 'attention', collaborate: 'work',
          };
          const targetQ = quadrants.find((q) => q.id === (SECTION_TO_QUADRANT[activeSection] ?? activeSection));
          if (!targetQ) return null;
          return (
            <div style={{
              position: 'absolute', inset: 0,
              // Wrapper stays at full opacity so the staggered children's
              // opacities aren't compounded. Pointer-events tracks the body
              // appearance — the page is interactive once the body is in.
              pointerEvents: sectionBodyVis > 0.5 ? 'auto' : 'none',
              zIndex: 36,
            }}>
              {/* Subheading block: just the kicker (persona · activity).
                  The italic page-name title used to live here; it was
                  removed because the activity phrase already names the
                  page's posture (e.g. "making things with others…"). */}
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
                  display: 'inline-flex', alignItems: 'center', gap: SPACE.md,
                  opacity: sectionKickerVis,
                }}>
                  <span>{section.persona}</span>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: section.tint,
                    display: 'inline-block',
                  }} aria-hidden />
                  <span style={{ color: section.tint }}>{section.activity}</span>
                </div>
              </div>
              {/* Body wrapper — fades in AFTER the header. The 5% gap
                  between sectionHeaderVis maxing out and sectionBodyVis
                  starting is what makes "header, then content" land as
                  two separate beats instead of one cross-fade. */}
              <div style={{ position: 'absolute', inset: 0, opacity: sectionBodyVis }}>
                <SectionView section={section} q={targetQ} onNav={onNav} onSectionJump={scrollToSection} />
              </div>
            </div>
          );
        })()}

        {/* ——— Practice-section axis ——— ONE colored polyline that IS the
            corner arc unfolding into a true orthogonal L (so the legs
            become real x/y chart axes for the scatter, with the existing
            hover-crosshair projection lines landing on them).

            Why a polyline and not a single arc-or-fillet path: a corner arc
            (centered at cl, radius r) and a fillet arc (centered at cl+(r,-r),
            radius r) are TWO DIFFERENT 90° arcs through the same endpoints.
            The corner arc bulges through cl + 0.707r upper-right; the fillet
            bulges through only cl + 0.29r — much flatter. Cross-fading them
            ghosts visibly. To guarantee shape continuity at t=0, every sample
            point on this polyline sits ON the corner arc at t=0 and ON the L
            at t=1, with a per-point lerp in between. The path overlays the
            corner arc exactly during the cross-fade window — no ghosting.

            At t=0 → 48-segment polyline approximates the corner arc.
            At t=1 → first 24 segments along Y-leg (qLive→cl), next 24 along
                     X-leg (cl→mLive). Sharp 90° corner at u=0.5 (which lands
                     at cl). */}
        {sectionVis > 0 && activeSection === 'experiment' && (() => {
          const t = sectionExtractT(progress, 'experiment');
          if (t <= 0) return null;
          const cl = { x: CORNER_CX, y: viewportH - CORNER_CX };
          const qLive = dotState('qiyu', progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor, navMapT).pos;
          const mLive = dotState('create', progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor, navMapT).pos;
          const ring = ringStateAt(progress, viewportW, viewportH, navMapT);
          const morph = smootherstep(t);
          const STEPS = 48;
          const seg: string[] = [];
          for (let i = 0; i <= STEPS; i++) {
            const u = i / STEPS;
            // Arc position: u-th point on the 90° corner arc from qiyu's
            // canonical angle (-90°) to make's (0°), plus live cluster rotation.
            const angle = ((-90 + u * 90 + clusterRotationDeg) * Math.PI) / 180;
            const arcX = ring.cx + ring.r * Math.cos(angle);
            const arcY = ring.cy + ring.r * Math.sin(angle);
            // L position: first half along Y-leg (qLive → cl), second half
            // along X-leg (cl → mLive). The two halves meet at u=0.5 which
            // lands at cl, creating the sharp corner.
            let lX: number, lY: number;
            if (u <= 0.5) {
              const s = u * 2;
              lX = lerp(qLive.x, cl.x, s);
              lY = lerp(qLive.y, cl.y, s);
            } else {
              const s = (u - 0.5) * 2;
              lX = lerp(cl.x, mLive.x, s);
              lY = lerp(cl.y, mLive.y, s);
            }
            const x = lerp(arcX, lX, morph);
            const y = lerp(arcY, lY, morph);
            seg.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`);
          }
          const axisD = seg.join(' ');
          const tint = SECTION_BY_ID.experiment.tint;
          // Opacity ramps up as the corner arc's arcFade ramps down (same
          // smootherstep(extractT * 2) curve, mirrored). Now that the polyline
          // matches the corner arc geometrically at t=0, the cross-fade is
          // truly invisible.
          const handoff = smootherstep(clamp(t * 2, 0, 1));
          return (
            <svg style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none', zIndex: 33,
              opacity: handoff * sectionVis,
            }}>
              <path
                d={axisD}
                fill="none"
                stroke={tint}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
          const { pos: qpos } = dotState('qiyu',   progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor, navMapT);
          const { pos: opos } = dotState('other',  progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor, navMapT);
          const { pos: npos } = dotState('think',  progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor, navMapT);
          const { pos: mpos } = dotState('create', progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor, navMapT);
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
            into its cell. On hover, a small dot in the cell's tint appears
            before the label and the label flips to that tint — the standard
            "live now" treatment, mirroring the QIYU pill. Click → that section. */}
        {cellLabelVis > 0 && SECTIONS.map((s) => {
          const cellPos = (() => {
            switch (s.cell) {
              case 'TL': return { left: '25%', top: '32%' };
              case 'TR': return { left: '75%', top: '32%' };
              case 'BL': return { left: '25%', top: '68%' };
              case 'BR': return { left: '75%', top: '68%' };
            }
          })();
          const tint = (
            s.cell === 'TL' ? 'var(--tint-tl)' :
            s.cell === 'TR' ? 'var(--tint-tr)' :
            s.cell === 'BL' ? 'var(--tint-bl)' :
            'var(--tint-br)'
          );
          const isHovered = hoveredCell === s.id;
          return (
            <button key={s.id}
              onClick={() => scrollToSection(s.id)}
              onMouseEnter={() => setHoveredCell(s.id)}
              onMouseLeave={() => setHoveredCell((c) => (c === s.id ? null : c))}
              style={{
                position: 'absolute',
                left: cellPos.left, top: cellPos.top,
                transform: 'translate(-50%, -50%)',
                background: 'transparent', border: 'none',
                padding: `${SPACE.sm}px ${SPACE.lg}px`,
                fontFamily: 'var(--serif)',
                fontSize: TYPE.cellLabel.size,
                fontWeight: TYPE.cellLabel.weight,
                letterSpacing: TYPE.cellLabel.tracking,
                lineHeight: TYPE.cellLabel.lineHeight,
                color: isHovered ? tint : 'var(--ink)',
                opacity: cellLabelVis,
                cursor: cellLabelVis > 0.5 ? 'pointer' : 'default',
                pointerEvents: cellLabelVis > 0.5 ? 'auto' : 'none',
                zIndex: 38,
                display: 'inline-flex', alignItems: 'center',
                gap: SPACE.md,
                transition: 'color .2s ease',
              }}>
              <span aria-hidden="true" style={{
                width: 10, height: 10, borderRadius: '50%',
                background: tint,
                opacity: isHovered ? 1 : 0,
                transform: isHovered ? 'scale(1)' : 'scale(0.5)',
                transition: 'opacity .25s ease, transform .25s ease',
                animation: isHovered ? 'livePulse 2s ease-in-out infinite' : 'none',
                flexShrink: 0,
              }} />
              {s.title}
            </button>
          );
        })}

        {/* ——— Fan-out node labels ——— Tiny labels next to each edge dot
            during the 2×2 reveal (matching image #4). */}
        {cellLabelVis > 0 && (() => {
          const labels: { id: DotId; text: string; dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }[] = [
            { id: 'qiyu',   text: 'Qiyu',     dx: 0,    dy: -14, anchor: 'middle' },
            { id: 'create', text: 'Creating',  dx: 16,   dy: 4,   anchor: 'start' },
            { id: 'other',  text: 'Others',   dx: 0,    dy: 22,  anchor: 'middle' },
            { id: 'think',  text: 'Thinking', dx: -16,  dy: 4,   anchor: 'end' },
          ];
          return (
            <div style={{
              position: 'absolute', inset: 0,
              pointerEvents: 'none', zIndex: 34,
              opacity: cellLabelVis,
            }}>
              {labels.map((l) => {
                const { pos } = dotState(l.id, progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor, navMapT);
                return (
                  <div key={l.id} style={{
                    position: 'absolute',
                    left: pos.x + l.dx, top: pos.y + l.dy,
                    transform:
                      l.anchor === 'middle' ? 'translateX(-50%)' :
                      l.anchor === 'end' ? 'translateX(-100%)' : 'none',
                    fontFamily: 'var(--sans)',
                    // Bump the cardinal label up from 14 → 17px as the corner
                    // nav blooms (navMapT 0 → 1) so the labels read as nav
                    // affordances, not faint captions, in dark mode.
                    fontSize: lerp(13, 15, navMapT),
                    fontWeight: 400,
                    color: 'var(--ink-3)',
                    whiteSpace: 'nowrap',
                    transition: 'color .25s ease, font-size .25s ease, font-weight .25s ease',
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
          const baseState = dotState(id, progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor, navMapT);
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
          // When the nav map is open (navMapT > 0), inactive dots brighten
          // back to full opacity — all four become equally navigable cardinal
          // markers in the bloom view.
          const dotOpacity = lerp(1, isActive ? 1 : 0.32, cornerPhase * (1 - navMapT));
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
              {/* Intermediate wrapper carries the float/pulse animation so
                  the dot circle and its label move as one unit. */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                animation: (previewActive || isClickAnim)
                  ? 'none'
                  : inHero
                    ? id === 'qiyu'
                      ? 'livePulse 1.6s ease-in-out infinite'
                      : `${DOT_FLOAT[id].anim} ${DOT_FLOAT[id].dur} ease-in-out ${DOT_FLOAT[id].delay} infinite`
                    : 'none',
                animationPlayState: isHovered ? 'paused' : 'running',
              }}>
                <div
                  ref={(el) => { dotRefs.current[id] = el; }}
                  style={{
                    width: isHovered ? effectiveSize + 4 : effectiveSize,
                    height: isHovered ? effectiveSize + 4 : effectiveSize,
                    flexShrink: 0,
                    borderRadius: '50%',
                    background: isActive && cornerPhase > 0
                      ? `color-mix(in srgb, ${SECTION_BY_ID[activeSection].tint} ${cornerPhase * 100}%, var(--ink))`
                      : 'var(--ink)',
                    transition: 'width .35s cubic-bezier(.2,.7,.2,1), height .35s cubic-bezier(.2,.7,.2,1), box-shadow .2s, background .35s ease',
                    boxShadow: isHovered ? '0 0 0 6px rgba(20,19,15,.08)' : 'none',
                  }} />
                {id !== 'qiyu' && inHero && !previewActive && (
                  <span style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    letterSpacing: 1.4,
                    textTransform: 'uppercase',
                    color: 'var(--ink-3)',
                    whiteSpace: 'nowrap',
                    opacity: clamp(1 - heroT * 1.6, 0, 1),
                    pointerEvents: 'none',
                  }}>
                    {id === 'other' ? 'Others' : id === 'think' ? 'Thinking' : 'Creating'}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* ——— Corner-nav arc ——— A 90° segment fixed in the upper-right
            quadrant of the cluster. The conceptual full circle rotates as
            the user scrolls between sections (see SECTION_CLUSTER_ROTATION),
            so the active node pair always lands at top + right of the
            cluster — the visible arc never moves on screen, only the labels
            and identities do. Image #23. */}
        {(arcLayerVis > 0 || sectionVis > 0) && (() => {
          // Read the unified ring's current (cx, cy, r). During hub-hold +
          // preview this equals HUB; during the corner-settle / end-return
          // phases the value is interpolated, so this SVG draws at the SAME
          // position as the hub render above — making the cross-fade
          // between the two invisible to the eye.
          const ring = ringStateAt(progress, viewportW, viewportH, navMapT);
          const cx = ring.cx, cy = ring.cy, r = ring.r;
          // SVG canvas spans the whole viewport now (since the ring can be at
          // hub OR corner OR end-hub positions, we can't size it to one).
          // Arc endpoints are derived from the LIVE positions of the active
          // pair — the colored band rides the dots around the conceptual
          // circle as clusterRotationDeg interpolates. At rest in any section
          // the active pair sits at top+right of the cluster, so the arc
          // resolves to the same upper-right quadrant as before. Mid-rotation,
          // arc + dots travel together (connected motion).
          // When navMap is open AND a section arc is hovered, the colored
          // arc previews the hovered section's pair instead of the current
          // active one. Lets the user "feel" what each section looks like
          // before clicking. Falls back to activeSection when nothing is
          // hovered (so the current section still reads as "you are here").
          const arcSection = (navMapT > 0.3 && hoveredArc) ? hoveredArc : activeSection;
          const [aId, bId] = SECTION_BY_ID[arcSection].activeDots;
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
          const tint = SECTION_BY_ID[arcSection].tint;
          const DOT_LABEL = { qiyu: 'Qiyu', create: 'Making', other: 'Others', think: 'Noticing' } as const;
          // Live dot positions — for sections that EXTRACT dots (currently
          // just practice), these diverge from aPt/bPt as extractT grows.
          // Labels read these so they ride the dots out of the cluster
          // instead of being orphaned at the resting anchors.
          // In navMap mode, lerp toward the canonical ring positions so a
          // hover-preview of a different section shows that section's pair
          // at its TRUE position on the (expanded) ring, not at the active
          // section's extracted positions.
          const aDS = dotState(aId, progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor, navMapT).pos;
          const bDS = dotState(bId, progress, viewportW, viewportH, activeSection, clusterRotationDeg, pillAnchor, navMapT).pos;
          const aLive = { x: lerp(aDS.x, aPt.x, smootherstep(navMapT)), y: lerp(aDS.y, aPt.y, smootherstep(navMapT)) };
          const bLive = { x: lerp(bDS.x, bPt.x, smootherstep(navMapT)), y: lerp(bDS.y, bPt.y, smootherstep(navMapT)) };
          // Arc-fade for sections with extraction: the arc connects the
          // RESTING positions, so once the dots leave it's an orphan visual.
          // Fade it as extract begins — gone by extractT≈0.5 (~50% of dot
          // travel). For sections without extraction this is always 1.
          const extractT = sectionExtractT(progress, activeSection);
          const arcFade = sectionAxisPos(activeSection, aId, viewportW, viewportH)
            ? 1 - smootherstep(clamp(extractT * 2, 0, 1))
            : 1;
          // Label sits outboard of the LIVE dot along the dot's resting
          // angle direction. Same offset whether the dot is at cluster or
          // extracted — the dot's identity follows it. textAnchor adapts
          // to which screen quadrant the angle is in.
          const labelOf = (deg: number, anchor: Pos, off = 18) => {
            const c = Math.cos((deg * Math.PI) / 180);
            const s = Math.sin((deg * Math.PI) / 180);
            return {
              x: anchor.x + off * c,
              y: anchor.y + off * s + 4, // small optical drop for baseline
              anchor: (c >  0.3 ? 'start' : c < -0.3 ? 'end' : 'middle') as 'start' | 'middle' | 'end',
            };
          };
          void labelOf(aAngle, aLive);
          void labelOf(bAngle, bLive);
          return (
            <svg
              width="100%"
              height="100%"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                // Below the dots (zIndex 35) so the dots sit ON the arc
                // endpoints visually — arc terminates at dot edges. Hover
                // detection + hit-targets live in a separate layer below
                // (the corner-nav interactive div), so this SVG is purely
                // visual and never intercepts events.
                zIndex: 33,
                overflow: 'visible',
              }}
            >
              {/* Faint backing ring — the rest of the conceptual circle.
                  Dotted, very low opacity so it doesn't compete. Only
                  appears once the corner-nav is meaningful (with the kicker)
                  — during the arc-preview anticipation beat the hub's solid
                  faint ring is still on screen, so this would just stack. */}
              <circle
                cx={cx} cy={cy} r={r}
                fill="none"
                // Light-up the backing ring on dark mode so it stays visible
                // when the black scrim is over the page; otherwise it'd
                // disappear into the background.
                stroke={navMapT > 0.5 ? 'var(--ink-3)' : 'var(--ink-4)'}
                // Brighten + thicken the backing ring as the nav map opens —
                // it stops being a faint hint and becomes the visible compass
                // outline. strokeDasharray switches from dotted (1 5) to a
                // continuous solid feel as navMapT grows.
                strokeWidth={1 + navMapT * 0.5}
                strokeLinecap="round"
                strokeDasharray={`${1 + navMapT * 4} ${5 - navMapT * 3}`}
                opacity={lerp(0.4 * cornerNavVis, 0.9, navMapT)}
                style={{ transition: 'stroke .25s ease' }}
              />
              {/* Active 90° arc — endpoints follow the live active-pair
                  positions on the ring, so the colored band rides the dots
                  through rotation. Visible from the preview beat onward so
                  the user sees "this pair is the protagonist" before motion
                  begins, then watches the band travel as rotation happens.
                  Fades out for sections that EXTRACT dots (practice) so the
                  arc doesn't sit orphaned at the cluster after the dots
                  leave for their axis ends. */}
              <path
                d={arcD}
                fill="none"
                stroke={tint}
                strokeWidth={cornerNavHover ? 4.5 : 3}
                strokeLinecap="round"
                opacity={arcLayerVis * arcFade}
                style={{ transition: 'stroke .35s ease, stroke-width .25s ease' }}
              />
              {/* Labels for all four cardinals. The active pair sits at the
                  live extracted positions (so labels ride the dots if the
                  section extracts them); inactive cardinals sit at their
                  canonical resting positions on the ring. Inactive labels
                  read at lower opacity so the active pair still pops as
                  the section's protagonists. textAnchor flips with the
                  screen quadrant so labels never crash their dots. */}
              {(['qiyu', 'create', 'other', 'think'] as const).map((id) => {
                const isActive = id === aId || id === bId;
                const angle = DOT_ANGLE[id] + clusterRotationDeg;
                const anchor = isActive
                  ? (id === aId ? aLive : bLive)
                  : ptOf(angle);
                const lab = labelOf(angle, anchor);
                return (
                  <text
                    key={`label-${id}`}
                    x={lab.x} y={lab.y}
                    textAnchor={lab.anchor}
                    dominantBaseline="middle"
                    fill={isActive ? 'var(--ink)' : 'var(--ink-3)'}
                    opacity={Math.max(cornerNavVis, sectionVis)}
                    style={{
                      fontFamily: 'var(--sans)',
                      fontSize: isActive ? lerp(14, 18, navMapT) : lerp(12, 13, navMapT),
                      fontWeight: isActive ? 600 : 400,
                      animation: 'statusFade .35s ease',
                      transition: 'fill .25s ease, font-size .25s ease, font-weight .25s ease',
                    }}
                  >
                    {DOT_LABEL[id]}
                  </text>
                );
              })}

              {/* ——— navMap mode ——— When the user hovers the corner area,
                  navMapT grows and the cluster blooms outward. All four
                  cardinal labels are already rendered above (with active
                  pair full-opacity, inactive pair softer); this block now
                  only handles the hovered-section title chip. */}
              {navMapT > 0.01 && (() => {
                return (
                  <>
                    {/* Hit-targets live in the corner-nav interactive div
                        below (separate layer at z-40 so they receive clicks
                        without z-index gymnastics). */}
                    {/* Hovered-section title chip — italic serif, sits at
                        the midpoint of the hovered arc, slightly outside
                        the ring (so the arc + dot pair still read clearly).
                        Tells the user what they're about to navigate to. */}
                    {hoveredArc && (() => {
                      const [sa, sb] = SECTION_BY_ID[hoveredArc].activeDots;
                      const midDeg = (DOT_ANGLE[sa] + DOT_ANGLE[sb]) / 2 + clusterRotationDeg;
                      // Handle the wrap (notice 180 + qiyu -90 → midpoint should
                      // be on the SHORT arc side, i.e. -135 not +45).
                      let normalizedMid = midDeg;
                      const dAng = DOT_ANGLE[sb] - DOT_ANGLE[sa];
                      if (Math.abs(dAng) > 180) normalizedMid += 180;
                      const midRad = (normalizedMid * Math.PI) / 180;
                      const titlePt = {
                        x: cx + (r + 36) * Math.cos(midRad),
                        y: cy + (r + 36) * Math.sin(midRad),
                      };
                      const c = Math.cos(midRad);
                      const ta = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
                      return (
                        <text
                          x={titlePt.x} y={titlePt.y}
                          textAnchor={ta}
                          dominantBaseline="middle"
                          fill="var(--ink)"
                          style={{
                            fontFamily: 'var(--serif)',
                            fontStyle: 'italic',
                            fontSize: 18,
                            animation: 'statusFade .25s ease',
                          }}
                        >
                          {SECTION_BY_ID[hoveredArc].title}
                        </text>
                      );
                    })()}
                  </>
                );
              })()}
            </svg>
          );
        })()}

        {/* ——— Corner-nav interactive layer ——— A dedicated div at z-40
            (above dots z-35, above visual SVG z-33) that handles ALL of:
              1. Hover detection — onMouseEnter/Leave on the wrapper div
                 sets cornerNavHover, which drives the navMapT bloom tween.
              2. Per-section hit-targets — an inner SVG with four 36px-stroke
                 arc paths (one per section), enabled only when the bloom is
                 open (navMapT > 0.5). Each catches mouseenter for hoveredArc
                 (preview the section's tint) and click for navigation.
            Putting hit-targets INSIDE the wrapper div means cursor moves
            between the wrapper background and a hit-target without firing
            the wrapper's mouseLeave — cornerNavHover stays true. */}
        {cornerNavVis > 0 && (() => {
          // Hit area covers the EXPANDED bloom radius + label margin. At
          // rest, the bloom isn't open so most of this area is empty space
          // around the cluster — hovering anywhere triggers the bloom open.
          const HIT = (CORNER_R + 50) * 2 + 40;
          // Inner SVG covers the entire viewport (so we can use absolute
          // viewport coords for the hit-target arcs without re-mapping).
          // The SVG itself has pointer-events:none so empty areas pass
          // hover through to the wrapper div; only the hit-target paths
          // catch events (via pointer-events:stroke).
          const ring = ringStateAt(progress, viewportW, viewportH, navMapT);
          return (
            <div
              onMouseEnter={() => setCornerNavHover(true)}
              onMouseLeave={() => { setCornerNavHover(false); setHoveredArc(null); }}
              style={{
                position: 'absolute',
                left: 0,
                top: viewportH - HIT,
                width: HIT,
                height: HIT,
                pointerEvents: cornerNavVis > 0.5 ? 'auto' : 'none',
                zIndex: 40,
              }}
            >
              {/* Hit-target arcs — only enabled once the bloom is mostly open
                  (navMapT > 0.5) so accidental clicks during the open animation
                  don't fire navigation. */}
              {navMapT > 0.5 && (
                <svg
                  style={{
                    position: 'fixed',
                    inset: 0,
                    width: '100vw', height: '100vh',
                    pointerEvents: 'none',
                    overflow: 'visible',
                  }}
                >
                  {SECTIONS.map((s) => {
                    const [sa, sb] = s.activeDots;
                    const saAng = DOT_ANGLE[sa] + clusterRotationDeg;
                    const sbAng = DOT_ANGLE[sb] + clusterRotationDeg;
                    const sap = {
                      x: ring.cx + ring.r * Math.cos((saAng * Math.PI) / 180),
                      y: ring.cy + ring.r * Math.sin((saAng * Math.PI) / 180),
                    };
                    const sbp = {
                      x: ring.cx + ring.r * Math.cos((sbAng * Math.PI) / 180),
                      y: ring.cy + ring.r * Math.sin((sbAng * Math.PI) / 180),
                    };
                    let d = sbAng - saAng;
                    while (d > 180) d -= 360;
                    while (d < -180) d += 360;
                    const sw = d > 0 ? 1 : 0;
                    const hitD = `M ${sap.x},${sap.y} A ${ring.r},${ring.r} 0 0 ${sw} ${sbp.x},${sbp.y}`;
                    return (
                      <path
                        key={`hit-${s.id}`}
                        d={hitD}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={14}
                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredArc(s.id)}
                        onMouseLeave={() => setHoveredArc(null)}
                        onClick={() => scrollToSection(s.id)}
                      />
                    );
                  })}
                </svg>
              )}
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
          <span>but how might we</span>
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
              'Prototyping crazy "what-if" concepts',
              'Talking to the actual users',
              'Exploring new Human-AI interaction concepts',
              'Making the work fun',
            ]} />
            <FooterList kicker="Still working on" items={[
              'Staying at my Desk',
              'Pixel-perfect detail craft',
              'Pulling myself out of overthinking',
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
    case 'reflect':     return <ReflectionView q={q} onNav={onNav} />;
    case 'experiment':  return <CreateScatter q={q} onNav={onNav} onSectionJump={onSectionJump} />;
    case 'hear':        return <LearnQuotes onNav={onNav} />;
    case 'collaborate': return <WorkGrid q={q} onNav={onNav} />;
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

  // Crosshair draw-in animation. drawProgress 0 → 1 over ~280ms when hover
  // begins; back to 0 over ~180ms when hover ends. Lines lerp their far
  // endpoint from the dot toward the axis based on this value, so the
  // crosshair *projects* outward from the dot rather than just appearing.
  // Labels at each axis end fade in during the last 30% of the draw, so
  // the user reads "value lands HERE on this axis" as a sequence:
  // line projects → label arrives.
  const [drawProgress, setDrawProgress] = useState(0);
  const drawRef = useRef(0);
  useEffect(() => { drawRef.current = drawProgress; }, [drawProgress]);
  useEffect(() => {
    const target = hoverIdx !== null ? 1 : 0;
    const startVal = drawRef.current;
    let raf = 0;
    let startTime = 0;
    const tick = (now: number) => {
      if (startTime === 0) startTime = now;
      const elapsed = now - startTime;
      const duration = target === 1 ? 280 : 180;
      const t = Math.min(elapsed / duration, 1);
      const eased = target === 1 ? 1 - Math.pow(1 - t, 3) : t;
      setDrawProgress(startVal + (target - startVal) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hoverIdx]);

  // Container size — needed to convert dot fractional positions (0..1) into
  // pixel coords for the SVG, so we can lerp endpoints toward off-container
  // axis positions cleanly. ResizeObserver keeps it in sync on viewport changes.
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{
      position: 'absolute',
      top: inset.top, right: inset.right, bottom: inset.bottom, left: inset.left,
    }}>
      {/* Hover crosshair — dashed projection lines that PROJECT outward from
          the hovered dot toward the two axes, animated over ~280ms with an
          easeOutCubic curve. Once the lines reach the axes, two labels fade
          in: the spectrum endpoint (e.g. "comfort zone" / "stretch") that
          the dot's value sits closer to on each axis. Reads as: "this dot's
          x value is on the [stretch] side of the axis; its y value is on the
          [within myself] side." */}
      {hoverIdx !== null && drawProgress > 0 && dims.w > 0 && (() => {
        const it = plotItems[hoverIdx];
        // Dot position in container-local pixel coords.
        const dotX = dims.w * it.x!;
        const dotY = dims.h * it.y!;
        // Axis line positions in container-local coords. Y-axis (vertical
        // qiyu axis) sits at viewport x = CORNER_CX, which is to the LEFT
        // of the container by (inset.left - CORNER_CX). X-axis (horizontal
        // make axis) sits at viewport y = vh - CORNER_CX, which is BELOW
        // the container by (inset.bottom - CORNER_CX).
        const yAxisX = -(inset.left - CORNER_CX);
        const xAxisY = dims.h + (inset.bottom - CORNER_CX);
        // Lerp the FAR endpoint of each line from the dot toward the axis.
        const horizFarX = lerp(dotX, yAxisX, drawProgress);
        const vertFarY  = lerp(dotY, xAxisY, drawProgress);
        // Labels fade in during the last 30% of the draw. Use smootherstep
        // so the fade itself eases (no sudden pop after the line arrives).
        const labelOpacity = smootherstep(clamp((drawProgress - 0.7) / 0.3, 0, 1));
        // Pick the spectrum endpoint label closer to the dot's value.
        // Without axes data, fall back to no labels.
        const xLabel = q.axes ? (it.x! < 0.5 ? q.axes.x[0] : q.axes.x[1]) : '';
        const yLabel = q.axes ? (it.y! < 0.5 ? q.axes.y[0] : q.axes.y[1]) : '';
        const tint = q.tint;
        return (
          <svg style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none', overflow: 'visible',
          }}>
            {/* Horizontal projection line: from dot leftward toward Y-axis */}
            <line
              x1={dotX} y1={dotY}
              x2={horizFarX} y2={dotY}
              stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 6" />
            {/* Vertical projection line: from dot downward toward X-axis */}
            <line
              x1={dotX} y1={dotY}
              x2={dotX} y2={vertFarY}
              stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 6" />
            {/* Tick markers at the projection points (where the lines meet
                the axes). Small filled circles in the section's tint, so
                the user sees exactly WHERE the value lands. */}
            <circle cx={yAxisX} cy={dotY} r={3.5}
              fill={tint} opacity={labelOpacity} />
            <circle cx={dotX} cy={xAxisY} r={3.5}
              fill={tint} opacity={labelOpacity} />
            {/* Y-axis label — at the Y-axis projection point. Sits INSIDE
                the chart (right of the axis line) instead of in the left
                gutter, because the gutter is ~72px wide and labels like
                "GATHERS A ROOM" need ~180px. dy lifts it just above the
                horizontal crosshair line so the label doesn't sit on top
                of the line. */}
            {yLabel && (
              <text
                x={yAxisX} y={dotY}
                textAnchor="start"
                dominantBaseline="alphabetic"
                dx={10} dy={-6}
                fill="var(--ink-2)"
                opacity={labelOpacity}
                style={{
                  fontFamily: 'var(--mono)', fontSize: 10,
                  letterSpacing: 1.4, textTransform: 'uppercase',
                }}
              >
                {yLabel}
              </text>
            )}
            {/* X-axis label — at the X-axis projection point. Sits BELOW
                the tick (textAnchor=middle, dy=18), centered on the vertical
                projection line. */}
            {xLabel && (
              <text
                x={dotX} y={xAxisY}
                textAnchor="middle"
                dominantBaseline="hanging"
                dy={10}
                fill="var(--ink-2)"
                opacity={labelOpacity}
                style={{
                  fontFamily: 'var(--mono)', fontSize: 10,
                  letterSpacing: 1.4, textTransform: 'uppercase',
                }}
              >
                {xLabel}
              </text>
            )}
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

// Learn — knowledge-graph layout. Multiple "value" hubs each anchor a small
// cluster of quotes that taught me that value. Thin lines connect every
// quote to ITS hub, so the page reads as: "here are the values I've learned,
// and the inputs each one came from."
//
// To re-group: change a quote's `value` to a different LEARN_VALUES.id, and
// (optionally) move its `pos` so it sits near the new hub.
//
// Optional `articleSlug` + `sectionId` link a quote to the article (and
// specific section) it came from. When present, the whole quote-node
// becomes a button — clicking opens the article scrolled to that section.
type LearnValue = {
  id: string;
  label: string;
  pos: { x: number; y: number };
};
type LearnQuote = {
  quote: string;
  who: string;
  /** id of the LEARN_VALUES entry this quote clusters with. */
  value: string;
  pos: { x: number; y: number };
  articleSlug?: string;
  sectionId?: string;
};
const LEARN_VALUES: LearnValue[] = [
  { id: 'listen',     label: 'Listening',  pos: { x: 0.42, y: 0.50 } },
  { id: 'underneath', label: 'Underneath', pos: { x: 0.58, y: 0.50 } },
];
// Value ↔ value links — each tuple draws a line between the two value
// hubs. Without this the values feel like isolated planets; with it the
// whole graph reads as one knowledge web.
const LEARN_VALUE_LINKS: [string, string][] = [
  ['listen', 'underneath'],
];
const LEARN_QUOTES: LearnQuote[] = [
  { quote: 'Most of what I learn comes from watching how people describe the work in their own voice.',
    who: 'a designer at IDEO',          value: 'listen',     pos: { x: 0.30, y: 0.20 },
    articleSlug: 'making-ai-feel-human', sectionId: 'relationship' },
  { quote: `When a teammate gets quiet, that's usually the most important thing said all meeting.`,
    who: 'a research lead',             value: 'listen',     pos: { x: 0.27, y: 0.50 },
    articleSlug: 'design-the-collaboration', sectionId: 'cross' },
  { quote: 'Research is just listening with slightly better manners.',
    who: 'a UX lead, Jan 2024',         value: 'listen',     pos: { x: 0.30, y: 0.80 },
    articleSlug: 'making-ai-feel-human', sectionId: 'cant' },
  { quote: 'The questions someone asks reveal more than the answers they give.',
    who: 'a senior PM, on hiring',      value: 'underneath', pos: { x: 0.70, y: 0.20 },
    articleSlug: 'thinking-outside-the-box', sectionId: 'see' },
  { quote: "Sometimes we keep using a solution not because it is the best one, but because we've used it for a long time.",
    who: 'a draft from March',          value: 'underneath', pos: { x: 0.73, y: 0.50 },
    articleSlug: 'how-i-use-ai-to-create', sectionId: 'pitfalls' },
  { quote: "Flexibility is what you leave room for on purpose, not what you failed to decide.",
    who: 'a draft from March',          value: 'underneath', pos: { x: 0.70, y: 0.80 },
    articleSlug: 'thinking-outside-the-box', sectionId: 'see' },
];
function LearnQuotes({ onNav }: { onNav: NavFn }) {
  // Mutable position state — keyed by node id (`q:${i}` or `v:${id}`).
  // Initialized from LEARN_*.pos; drag updates these in place.
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    const out: Record<string, { x: number; y: number }> = {};
    LEARN_QUOTES.forEach((q, i) => { out[`q:${i}`] = { ...q.pos }; });
    LEARN_VALUES.forEach((v) => { out[`v:${v.id}`] = { ...v.pos }; });
    return out;
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // Distinguishes a click (small movement) from a drag (large movement) so
  // tapping a linked quote still navigates while a real drag repositions.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  // Live container width — used to clamp quote text width to the actual
  // space available between each dot and the container edge, so text can't
  // overflow regardless of viewport size or where the dot is dragged to.
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    setContainerW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Floating motion — gentle sine drift on every node, suspended for the one
  // currently being dragged so the cursor stays planted on the dot.
  const [floatTick, setFloatTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setFloatTick((t) => t + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Drag lifecycle — pointer events at the window level so the drag survives
  // the cursor leaving the small dot hit-target. Position is clamped to the
  // container so a node can't be flung off-screen.
  useEffect(() => {
    if (!draggedId) return;
    const onMove = (e: PointerEvent) => {
      const start = dragStartRef.current;
      if (start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (dx * dx + dy * dy > 25) dragMovedRef.current = true;
      }
      if (!dragMovedRef.current) return;
      const c = containerRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setPositions((prev) => ({
        ...prev,
        [draggedId]: {
          x: Math.max(0.05, Math.min(0.95, x)),
          y: Math.max(0.06, Math.min(0.94, y)),
        },
      }));
    };
    const onUp = () => {
      // Pointer barely moved → treat as click; fire navigation for linked
      // quotes. Otherwise the new dragged position sticks.
      if (!dragMovedRef.current && draggedId.startsWith('q:')) {
        const idx = parseInt(draggedId.slice(2), 10);
        const q = LEARN_QUOTES[idx];
        if (q?.articleSlug) {
          onNav(`article:${q.articleSlug}${q.sectionId ? `:${q.sectionId}` : ''}`);
        }
      }
      setDraggedId(null);
      dragStartRef.current = null;
      dragMovedRef.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [draggedId, onNav]);

  const startDrag = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragMovedRef.current = false;
    setDraggedId(id);
  };

  // Display position = state position + a tiny sine drift. Drift is
  // suppressed for the dragged node (cursor stays planted) and for the
  // hub-of-the-dragged-quote case (so connected lines don't visibly jitter
  // around the cursor anchor).
  const t = floatTick * 0.012;
  const driftFor = (id: string, idx: number) => {
    if (draggedId === id) return { dx: 0, dy: 0 };
    return {
      dx: Math.sin(t + idx * 1.3) * 0.005,
      dy: Math.cos(t * 0.85 + idx * 1.7) * 0.004,
    };
  };
  const displayPos = (id: string, idx: number) => {
    const base = positions[id] ?? { x: 0.5, y: 0.5 };
    const { dx, dy } = driftFor(id, idx);
    return { x: base.x + dx, y: base.y + dy };
  };

  // Hover spotlight (one-degree). Hovering a hub also lights the values it
  // links to via LEARN_VALUE_LINKS so the whole web is readable.
  const isQuoteLit = (i: number, q: LearnQuote) => {
    if (!hoveredId) return null;
    if (hoveredId === `q:${i}`) return true;
    if (hoveredId === `v:${q.value}`) return true;
    return false;
  };
  const isHubLit = (v: LearnValue) => {
    if (!hoveredId) return null;
    if (hoveredId === `v:${v.id}`) return true;
    if (hoveredId.startsWith('q:')) {
      const idx = parseInt(hoveredId.slice(2), 10);
      if (LEARN_QUOTES[idx]?.value === v.id) return true;
    }
    if (hoveredId.startsWith('v:')) {
      const otherId = hoveredId.slice(2);
      if (LEARN_VALUE_LINKS.some(([a, b]) =>
        (a === otherId && b === v.id) || (b === otherId && a === v.id))) return true;
    }
    return false;
  };
  const isQuoteLineLit = (i: number, q: LearnQuote) => {
    if (!hoveredId) return null;
    if (hoveredId === `q:${i}`) return true;
    if (hoveredId === `v:${q.value}`) return true;
    return false;
  };
  const isValueLineLit = ([a, b]: [string, string]) => {
    if (!hoveredId) return null;
    if (hoveredId === `v:${a}` || hoveredId === `v:${b}`) return true;
    if (hoveredId.startsWith('q:')) {
      const idx = parseInt(hoveredId.slice(2), 10);
      const qv = LEARN_QUOTES[idx]?.value;
      if (qv === a || qv === b) return true;
    }
    return false;
  };

  const opacityFor = (lit: boolean | null, idle: number) =>
    lit === null ? idle : lit ? 1 : 0.12;

  const HUB_DOT = 14;
  const QUOTE_DOT = 8;
  const HIT_PAD = 14;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      padding: `${SPACE.xxxl + SPACE.lg}px ${SPACE.xxxl}px ${SPACE.xxl}px`,
      // Clip so a dragged node can't visually escape the viewport even
      // mid-gesture; the inner clamp also enforces this in coords.
      overflow: 'hidden',
    }}>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%', height: '100%',
          maxWidth: 1280, margin: '0 auto',
          touchAction: 'none', // pointer events drive drag, not native scroll
        }}
      >
        {/* Connection lines — quote↔value AND value↔value. Computed from
            displayPos each frame so they track drift + drag exactly. */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 0,
          }}
        >
          {LEARN_QUOTES.map((q, i) => {
            const v = LEARN_VALUES.find((lv) => lv.id === q.value);
            if (!v) return null;
            const a = displayPos(`q:${i}`, i);
            const b = displayPos(`v:${v.id}`, LEARN_QUOTES.length + LEARN_VALUES.indexOf(v));
            const lit = isQuoteLineLit(i, q);
            return (
              <line key={`q-line-${i}`}
                x1={a.x * 100} y1={a.y * 100}
                x2={b.x * 100} y2={b.y * 100}
                stroke={lit === true ? 'var(--ink-2)' : 'var(--ink-4)'}
                strokeWidth={lit === true ? 1 : 0.5}
                vectorEffect="non-scaling-stroke"
                style={{
                  opacity: opacityFor(lit, 0.4),
                  transition: 'opacity .25s ease, stroke-width .25s ease',
                }} />
            );
          })}
          {LEARN_VALUE_LINKS.map(([aId, bId], i) => {
            const aIdx = LEARN_QUOTES.length + LEARN_VALUES.findIndex((v) => v.id === aId);
            const bIdx = LEARN_QUOTES.length + LEARN_VALUES.findIndex((v) => v.id === bId);
            const a = displayPos(`v:${aId}`, aIdx);
            const b = displayPos(`v:${bId}`, bIdx);
            const lit = isValueLineLit([aId, bId]);
            return (
              <line key={`v-line-${i}`}
                x1={a.x * 100} y1={a.y * 100}
                x2={b.x * 100} y2={b.y * 100}
                stroke={lit === true ? 'var(--ink-2)' : 'var(--ink-4)'}
                strokeWidth={lit === true ? 1 : 0.5}
                vectorEffect="non-scaling-stroke"
                style={{
                  opacity: opacityFor(lit, 0.4),
                  transition: 'opacity .25s ease, stroke-width .25s ease',
                }} />
            );
          })}
        </svg>

        {/* Value hubs — labeled, draggable. The dot sits exactly at
            (p.x, p.y) so converging lines hit its center; the label is a
            separate sibling positioned below the dot. Hovering a hub
            lights its cluster + linked hubs (one degree of the web). */}
        {LEARN_VALUES.map((v, vi) => {
          const id = `v:${v.id}`;
          const lit = isHubLit(v);
          const p = displayPos(id, LEARN_QUOTES.length + vi);
          return (
            <div
              key={v.id}
              style={{
                position: 'absolute',
                left: `${p.x * 100}%`, top: `${p.y * 100}%`,
                zIndex: 2,
                opacity: opacityFor(lit, 1),
                transition: 'opacity .25s ease',
                userSelect: 'none',
              }}
            >
              {/* Dot + hit target — anchored exactly at (p.x, p.y). */}
              <span
                onPointerDown={startDrag(id)}
                onMouseEnter={() => setHoveredId(id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  position: 'absolute', left: 0, top: 0,
                  transform: 'translate(-50%, -50%)',
                  padding: HIT_PAD,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: draggedId === id ? 'grabbing' : 'grab',
                }}
              >
                <span style={{
                  width: HUB_DOT, height: HUB_DOT, borderRadius: '50%',
                  background: 'var(--ink)',
                  display: 'block',
                }} />
              </span>
              {/* Label — sits below the dot, centered horizontally on the anchor. */}
              <span style={{
                position: 'absolute',
                left: 0, top: HUB_DOT / 2 + 14,
                transform: 'translateX(-50%)',
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 'clamp(20px, 1.6vw, 26px)',
                color: 'var(--ink)', whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>
                {v.label}
              </span>
            </div>
          );
        })}

        {/* Quote nodes — draggable; tap-without-drag navigates to the source
            article. Quote text appears only when its cluster is lit. */}
        {LEARN_QUOTES.map((q, i) => {
          const id = `q:${i}`;
          const linked = !!q.articleSlug;
          const lit = isQuoteLit(i, q);
          const dotOpacity = opacityFor(lit, 0.7);
          const showText = lit === true;
          // Article card only surfaces when hovering this specific quote dot —
          // not when a linked value hub lights it from a distance.
          const showArticleCard = hoveredId === id;
          const p = displayPos(id, i);
          const isLeft = (positions[id]?.x ?? q.pos.x) < 0.5;
          return (
            <div
              key={i}
              onPointerDown={startDrag(id)}
              onMouseEnter={() => setHoveredId(id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                position: 'absolute',
                left: `${p.x * 100}%`, top: `${p.y * 100}%`,
                cursor: draggedId === id
                  ? 'grabbing'
                  : linked ? 'grab' : 'default',
                zIndex: draggedId === id ? 3 : 1,
                userSelect: 'none',
              }}
            >
              <span style={{
                position: 'absolute', left: 0, top: 0,
                transform: 'translate(-50%, -50%)',
                padding: HIT_PAD,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{
                  width: QUOTE_DOT, height: QUOTE_DOT, borderRadius: '50%',
                  background: 'var(--ink)',
                  opacity: dotOpacity,
                  transform: lit === true ? 'scale(1.4)' : 'scale(1)',
                  transition: 'opacity .25s ease, transform .25s cubic-bezier(.2,.7,.2,1)',
                }} />
              </span>
              {(() => {
                // Available horizontal room from this dot to the container
                // edge it floats toward, minus the 18px gap. Clamped to a
                // readable range so very narrow viewports don't squeeze the
                // text into a single-column wall.
                const dotX = p.x * containerW;
                const avail = isLeft ? dotX - 18 : containerW - dotX - 18;
                const textWidth = containerW > 0
                  ? Math.max(160, Math.min(280, avail - 8))
                  : 240;
                return (
              <div style={{
                position: 'absolute', top: 0,
                transform: 'translateY(-50%)',
                ...(isLeft
                  ? { right: 18, textAlign: 'right' }
                  : { left: 18, textAlign: 'left' }),
                width: textWidth,
                opacity: showText ? 1 : 0,
                transition: 'opacity .25s ease',
                pointerEvents: showText ? 'auto' : 'none',
              }}>
                <p style={{
                  margin: 0,
                  fontFamily: 'var(--reading)', fontWeight: 400,
                  fontSize: 'clamp(15px, 1.15vw, 18px)',
                  lineHeight: 1.4,
                  color: 'var(--ink)',
                  textWrap: 'pretty',
                }}>
                  &ldquo;{q.quote}&rdquo;
                </p>
                <cite style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: 8,
                  marginTop: SPACE.sm,
                  flexDirection: isLeft ? 'row-reverse' : 'row',
                  fontFamily: 'var(--sans)',
                  fontSize: TYPE.kicker.size, fontWeight: TYPE.kicker.weight,
                  letterSpacing: TYPE.kicker.tracking,
                  textTransform: 'uppercase', fontStyle: 'normal',
                  color: 'var(--ink-3)',
                }}>
                  <span>{q.who}</span>
                </cite>
                {/* Article preview card — visible when the cluster is lit.
                    Tinted with the article's own surface + tint colors so
                    it reads as a physical thing you can pick up, not a link. */}
                {linked && (() => {
                  const article = q.articleSlug ? bySlug[q.articleSlug] : undefined;
                  if (!article) return null;
                  return (
                    <div
                      onClick={(e) => { e.stopPropagation(); onNav(`article:${article.meta.slug}${q.sectionId ? `:${q.sectionId}` : ''}`); }}
                      style={{
                        marginTop: SPACE.sm,
                        padding: '8px 12px 10px',
                        background: article.meta.surface,
                        borderRadius: 6,
                        borderLeft: isLeft ? 'none' : `3px solid ${article.meta.tint}`,
                        borderRight: isLeft ? `3px solid ${article.meta.tint}` : 'none',
                        cursor: 'pointer',
                        textAlign: isLeft ? 'right' : 'left',
                        opacity: showArticleCard ? 1 : 0,
                        transform: showArticleCard ? 'translateY(0)' : 'translateY(4px)',
                        transition: 'opacity .2s ease, transform .2s ease',
                        pointerEvents: showArticleCard ? 'auto' : 'none',
                      }}
                    >
                      <div style={{
                        fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.4,
                        textTransform: 'uppercase', color: article.meta.tint,
                        marginBottom: 4,
                      }}>
                        {article.meta.quality} · {article.meta.readtime} min read
                      </div>
                      <div style={{
                        fontFamily: 'var(--serif)', fontWeight: 400,
                        fontSize: 14, lineHeight: 1.2, letterSpacing: -0.2,
                        color: 'var(--ink)',
                        display: 'flex', alignItems: 'baseline', gap: 5,
                        flexDirection: isLeft ? 'row-reverse' : 'row',
                      }}>
                        <span style={{ color: article.meta.tint }}>{isLeft ? '←' : '→'}</span>
                        {article.meta.title}
                      </div>
                      <div style={{
                        fontFamily: 'var(--serif)', fontStyle: 'italic',
                        fontSize: 12, lineHeight: 1.4, color: 'var(--ink-3)',
                        marginTop: 2, textWrap: 'pretty',
                      }}>
                        {article.meta.dek}
                      </div>
                    </div>
                  );
                })()}
              </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Work — year × month activity matrix as the entire view. Every role from
// background.json maps to a circular node; cell intensity is the weighted sum
// of roles active that month. The featured projects (Meetfood, Apple, etc.)
// are not separate cards anymore — they live as the brightest cells in the
// grid. Click "what I made" out of the picture; let the arc speak.
const GALLERY_ITEMS = [
  {
    tag: '0 → 1',
    impact: 'App launch 0-> 1 with six business partners',
    meta: 'Meetfood · Founding UX · 1.5y',
    image: '/projects/meetfood-product.png',
    logo: '/logos/meetfood.png',
    href: 'https://www.key-you-who.com/projects/app-launch',
  },
  {
    tag: 'GenAI',
    impact: 'Research-to-prototype in 4 months (SUS 86.3)',
    meta: 'Google Cloud · UX · 4mo',
    image: '/projects/google-cloud-product.png',
    logo: '/logos/google-cloud.png',
    href: 'https://www.key-you-who.com/projects/google-cloud',
  },
  {
    tag: 'Conversational AI',
    impact: 'A working call agent built in a week of prompt engineering.',
    meta: 'The Mentoring Partnership · Solo AI · 1wk',
    image: '/projects/mentoring-product.png',
    logo: '/logos/mentoring.png',
    href: 'https://www.key-you-who.com/projects/prototyping-with-ai',
  },
  {
    tag: 'Service design',
    impact: 'Hi-fi prototypes drove real-world adoption (SUS 90.3)',
    meta: 'Automotus · Pittsburgh Parking · 4mo',
    image: '/projects/automotus-product.png',
    logo: '/logos/automotus.png',
    href: 'https://www.key-you-who.com/projects/design-as-a-research-tool',
  },
  {
    tag: 'Physical AI',
    impact: 'Embedding diagnostic AI into a clinical workflow',
    meta: 'Archetype AI × Roche · 1mo',
    image: '/projects/roche-product.png',
    logo: '/logos/archetype-roche.png',
    href: 'https://www.linkedin.com/posts/tantara_its-a-wrap-for-the-inaugural-strange-design-ugcPost-7229713649941028865-kYh4/',
  },
  {
    tag: 'Research',
    impact: 'Two papers on language, affiliation, and AI care',
    meta: 'CMU AI-CARING / Cornell · 1.5y',
    image: '/projects/ai-caring-product.png',
    logo: '/logos/ai-caring.png',
    href: null,
  },
];

function WorkGrid({ q: _q }: { q: Quadrant; onNav: NavFn }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      
      // right padding keeps content clear of the BR nav arc
      padding: `${SPACE.xl}px`,
      boxSizing: 'border-box',
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        columnGap: SPACE.xl,
        rowGap: SPACE.xxl,
        maxWidth: 900,
        margin: '0 auto',
        pointerEvents: 'auto',
        // Right column starts lower for a staggered feel
        gridTemplateRows: 'repeat(2, 1fr)',
        height: '100%',
      }}>
        {GALLERY_ITEMS.map((item, i) => {
          const col = i % 3;
          return (
            <div
              key={i}
              onClick={() => item.href && window.open(item.href, '_blank', 'noopener,noreferrer')}
              style={{
                cursor: item.href ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column',
                // Subtle stagger: center col slightly lower, right col more so
                paddingTop: col === 1 ? 10 : col === 2 ? 20 : 0,
                minHeight: 0,
              }}
              onMouseEnter={(e) => {
                const imgs = e.currentTarget.querySelectorAll('img');
                const product = imgs[0] as HTMLImageElement | undefined;
                const logo = imgs[1] as HTMLImageElement | undefined;
                if (product && item.href) product.style.transform = 'scale(1.04)';
                if (logo) { logo.style.filter = 'grayscale(0)'; logo.style.opacity = '1'; logo.style.transform = 'scale(1.2)'; }
              }}
              onMouseLeave={(e) => {
                const imgs = e.currentTarget.querySelectorAll('img');
                const product = imgs[0] as HTMLImageElement | undefined;
                const logo = imgs[1] as HTMLImageElement | undefined;
                if (product) product.style.transform = 'scale(1)';
                if (logo) { logo.style.filter = 'grayscale(1)'; logo.style.opacity = '0.4'; logo.style.transform = 'scale(1)'; }
              }}
            >
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <img
                  src={item.image}
                  alt={item.meta}
                  style={{
                    display: 'block', width: '100%', height: '100%',
                    objectFit: 'contain',
                    objectPosition: 'center bottom',
                    transition: 'transform .4s cubic-bezier(.2,.7,.2,1)',
                  }}
                />
              </div>
              <div style={{ paddingTop: 10, flexShrink: 0 }}>
                <img
                  src={item.logo}
                  alt=""
                  style={{
                    display: 'block',
                    height: 14, width: 'auto', maxWidth: 110,
                    objectFit: 'contain',
                    filter: 'grayscale(1)',
                    opacity: 0.4,
                    marginBottom: 4,
                    transition: 'filter .25s ease, opacity .25s ease, transform .25s cubic-bezier(.2,.7,.2,1)',
                    transformOrigin: 'left center',
                  }}
                />
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 9,
                  letterSpacing: 1.1, textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                }}>
                  {item.tag}
                </div>
                <div style={{
                  marginTop: 4,
                  fontFamily: 'var(--serif)', fontSize: 13, lineHeight: 1.45,
                  color: 'var(--ink-2)',
                }}>
                  {item.impact}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Year × month activity matrix ────────────────────────────────────────────
//
// Rows: years (oldest at top). Cols: Jan→Dec. Each cell is colored by the
