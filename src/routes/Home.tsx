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
// ——— Phase boundaries ———
// Scroll journey:
//   Unfill   (0 → BOX_UNFILL_END):   box fill fades; dots appear outside border
//   Morph    (BOX_UNFILL_END → BOX_MORPH_END):  4 borders collapse to crosshair
//   Overview (BOX_MORPH_END → OVERVIEW_END):    crosshair + quadrant labels visible
//   Cluster  (OVERVIEW_END → CLUSTER_END):      dots fly to 4-dot nav icon at center
//   Header   (CLUSTER_END → HEADER_END):        nav icon travels to header strip
//   Sections (HEADER_END → SECTIONS_END):       four section pages
const BOX_UNFILL_END = 0.10;
const MORPH_START    = 0.20;  // dwell in converged state: BOX_UNFILL_END → MORPH_START
const BOX_MORPH_END  = 0.32;
const OVERVIEW_END   = 0.32;  // crosshair overview beat ends
const CLUSTER_END    = 0.38;  // 4-dot nav icon formed at viewport center
const HEADER_END     = 0.43;  // nav icon arrived at header
const SECTIONS_END   = 0.83;

// How far each dot sits outside its border midpoint before the morph begins.
const DOT_GAP = 38; // px
// Header strip height — the nav icon lives here during sections.
const HEADER_H = 72; // px

// ——— Sections ———
type SectionId = 'reflect' | 'experiment' | 'hear' | 'collaborate';

// ——— Single source of truth for all activity descriptions ———
// Used in: section headers, quadrant overview labels, and box dot-hover text.
const SECTION_ACTIVITIES: Record<SectionId, string> = {
  reflect:     'thinking who I am…',
  experiment:  'making things happen…',
  hear:        'learning from what others say…',
  collaborate: 'creating with others…',
};

const SECTIONS: {
  id: SectionId;
  title: string;
  axisPair: [string, string];
  persona: string;
  activity: string;
  activeDots: string[];
  cell: 'TL' | 'TR' | 'BL' | 'BR';
  tint: string;
}[] = [
  { id: 'reflect',     title: 'to reflect',     axisPair: ['Qiyu',   'Creating'], persona: 'Qiyu', activity: SECTION_ACTIVITIES.reflect,     activeDots: ['qiyu', 'think'],  cell: 'TL', tint: 'var(--tint-tl)' },
  { id: 'experiment',  title: 'to experiment',  axisPair: ['Qiyu',   'Thinking'], persona: 'Qiyu', activity: SECTION_ACTIVITIES.experiment,  activeDots: ['qiyu', 'create'], cell: 'TR', tint: 'var(--tint-tr)' },
  { id: 'hear',        title: 'to hear',        axisPair: ['Others', 'Thinking'], persona: 'Qiyu', activity: SECTION_ACTIVITIES.hear,        activeDots: ['other', 'think'], cell: 'BL', tint: 'var(--tint-bl)' },
  { id: 'collaborate', title: 'to collaborate', axisPair: ['Others', 'Creating'], persona: 'Qiyu', activity: SECTION_ACTIVITIES.collaborate, activeDots: ['other', 'create'], cell: 'BR', tint: 'var(--tint-br)' },
];

const SECTION_BY_ID: Record<SectionId, typeof SECTIONS[number]> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s]),
) as Record<SectionId, typeof SECTIONS[number]>;

// Section ranges within the 0–1 scroll progress space.
const SECTION_RANGES: Record<SectionId, [number, number]> = {
  reflect:     [HEADER_END, 0.55],
  experiment:  [0.55, 0.65],
  hear:        [0.65, 0.74],
  collaborate: [0.74, SECTIONS_END],
};

function activeSectionFromProgress(p: number): SectionId {
  if (p >= SECTION_RANGES.collaborate[0]) return 'collaborate';
  if (p >= SECTION_RANGES.hear[0])        return 'hear';
  if (p >= SECTION_RANGES.experiment[0])  return 'experiment';
  return 'reflect';
}

// ——— Design tokens ———

const TYPE = {
  display:   { size: 'clamp(40px, 7vw, 96px)',   weight: 400, tracking: '-0.025em', lineHeight: 1.0 },
  hubTitle:  { size: 'clamp(32px, 4vw, 56px)',   weight: 400, tracking: '-0.02em',  lineHeight: 1.05 },
  cellLabel: { size: 'clamp(24px, 2.6vw, 40px)', weight: 400, tracking: '-0.01em',  lineHeight: 1.1 },
  sectionH1: { size: 'clamp(22px, 1.9vw, 30px)', weight: 400, tracking: '-0.01em',  lineHeight: 1.2 },
  bodyLg:    { size: '18px', weight: 400, tracking: '0',         lineHeight: 1.55 },
  body:      { size: '14px', weight: 400, tracking: '0',         lineHeight: 1.55 },
  kicker:    { size: '11px', weight: 500, tracking: '0.14em',    lineHeight: 1.2 },
  meta:      { size: '11px', weight: 500, tracking: '0.14em',    lineHeight: 1.2 },
} as const;
const SPACE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 } as const;


// Quadrant label text shown briefly in each quadrant after crosshair forms.
const QUAD_LABELS: { cell: 'TL' | 'TR' | 'BL' | 'BR'; text: string; sub: string; tint: string }[] = [
  { cell: 'TL', text: SECTION_ACTIVITIES.reflect,     sub: 'to reflect',     tint: 'var(--tint-tl)' },
  { cell: 'TR', text: SECTION_ACTIVITIES.experiment,  sub: 'to experiment',  tint: 'var(--tint-tr)' },
  { cell: 'BL', text: SECTION_ACTIVITIES.hear,        sub: 'to hear',        tint: 'var(--tint-bl)' },
  { cell: 'BR', text: SECTION_ACTIVITIES.collaborate, sub: 'to collaborate', tint: 'var(--tint-br)' },
];

// Which dots connect to which when hovered (crosshair axis pairs).
const DOT_CONNECTIONS: Record<number, number[]> = {
  0: [1, 3], // Qiyu → Creating, Thinking
  1: [0, 2], // Creating → Qiyu, Others
  2: [1, 3], // Others → Creating, Thinking
  3: [0, 2], // Thinking → Qiyu, Others
};

const STATUS_PHRASES = [
  'Thinking…',
  'Vibe coding…',
  'Reading at 2am…',
  'Sketching in pencil…',
  'Talking to Claude…',
  'Counting strangers…',
  'Asking "what if?"…',
  'Looking for the box…',
  'Refactoring at lunch…',
];

// Activity shown inside the box when each dot is hovered (and next to Qiyu label).
// Indexed by dot: 0=Qiyu, 1=Creating, 2=Others, 3=Thinking.
// All reference SECTION_ACTIVITIES so one edit updates everywhere.
const DOT_ACTIVITIES = [
  SECTION_ACTIVITIES.reflect,     // 0 Qiyu
  SECTION_ACTIVITIES.experiment,  // 1 Creating
  SECTION_ACTIVITIES.hear,        // 2 Others
  SECTION_ACTIVITIES.reflect,     // 3 Thinking (reflective axis, same as reflect)
];

// Extra line pairs to draw in addition to DOT_CONNECTIONS when a dot is hovered.
const EXTRA_CONNECTIONS: Record<number, [number, number][]> = {
  2: [[0, 1], [0, 3]], // hovering Others also shows Qiyu→Creating and Qiyu→Thinking
};

type LabelDir = 'up' | 'right' | 'down' | 'left';
function AxisDot({
  x, y, label, dir, tint = 'var(--ink-3)', dotVis, labelVis,
  dotSize = 7, dotColor = 'var(--ink)',
  hovered = false, suffix,
  onMouseEnter: onEnter, onMouseLeave: onLeave,
}: {
  x: number; y: number; label: string; dir: LabelDir; tint?: string;
  dotVis: number; labelVis: number; dotSize?: number; dotColor?: string;
  hovered?: boolean; suffix?: string;
  onMouseEnter?: () => void; onMouseLeave?: () => void;
}) {
  // Debounce leave so moving cursor through the gap between dot and label
  // doesn't briefly unhover.
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleEnter = () => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    onEnter?.();
  };
  const handleLeave = () => {
    leaveTimer.current = setTimeout(() => { leaveTimer.current = null; onLeave?.(); }, 120);
  };

  const gap = 14;
  const interactive = !!onEnter;
  const labelStyle: React.CSSProperties = {
    position: 'absolute',
    fontFamily: 'var(--sans)',
    fontSize: 11,
    letterSpacing: '0.02em',
    color: tint,
    whiteSpace: 'nowrap',
    opacity: labelVis,
    pointerEvents: interactive ? 'auto' : 'none',
    cursor: interactive ? 'default' : undefined,
  };
  let offset: React.CSSProperties = {};
  if (dir === 'up')    offset = { bottom: '100%', left: '50%', transform: 'translateX(-50%)', paddingBottom: gap };
  if (dir === 'down')  offset = { top: '100%',    left: '50%', transform: 'translateX(-50%)', paddingTop: gap };
  if (dir === 'left')  offset = { right: '100%',  top: '50%',  transform: 'translateY(-50%)', paddingRight: gap, textAlign: 'right' };
  if (dir === 'right') offset = { left: '100%',   top: '50%',  transform: 'translateY(-50%)', paddingLeft: gap };

  // Transparent hit overlay extending toward the label so the full dot+text
  // area triggers hover, not just the small dot circle.
  const hitStyle: React.CSSProperties = interactive ? {
    position: 'absolute',
    top:    dir === 'up'    ? -80  : -20,
    bottom: dir === 'down'  ? -60  : -20,
    left:   dir === 'left'  ? -200 : -20,
    right:  dir === 'right' ? -200 : -20,
    pointerEvents: 'auto',
    cursor: 'default',
  } : {};

  return (
    <div
      style={{
        position: 'absolute',
        left: x, top: y,
        transform: 'translate(-50%, -50%)',
        zIndex: 6,
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      onMouseEnter={interactive ? handleEnter : undefined}
      onMouseLeave={interactive ? handleLeave : undefined}
    >
      {/* Large transparent hit zone covering dot + label */}
      {interactive && <div style={hitStyle} />}
      <div style={{
        width: dotSize, height: dotSize, borderRadius: '50%',
        background: hovered ? tint : dotColor,
        opacity: dotVis,
        transform: hovered ? 'scale(2)' : 'scale(1)',
        transition: 'transform .25s cubic-bezier(.2,.7,.2,1), background .2s ease',
        position: 'relative', zIndex: 1,
      }} />
      <div style={{ ...labelStyle, ...offset }}
        onMouseEnter={interactive ? handleEnter : undefined}
        onMouseLeave={interactive ? handleLeave : undefined}
      >
        {label}
      </div>
      {suffix && (
        <div style={{
          position: 'absolute',
          left: dotSize + gap,
          top: '50%',
          transform: 'translateY(-50%)',
          fontFamily: 'var(--sans)',
          fontSize: 11,
          letterSpacing: '0.02em',
          color: tint,
          whiteSpace: 'nowrap',
          opacity: labelVis,
          pointerEvents: 'none',
        }}>
          {suffix}
        </div>
      )}
    </div>
  );
}

// ——— Home ———
export function Home({ onNav }: Props) {
  const [viewportW, setViewportW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );
  const [smoothScrollY, setSmoothScrollY] = useState(0);
  const [hoveredDot, setHoveredDot] = useState<number | null>(null);
  const [statusIdx, setStatusIdx] = useState(0);
  const [isBoxHovered, setIsBoxHovered] = useState(false);
  const isBoxHoveredRef = useRef(false);
  const [floatTime, setFloatTime] = useState(0);
  const floatTimeRef = useRef(0);
  const [convergeT, setConvergeT] = useState(0);
  const convergeRef = useRef(0);
  const rawScrollRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSettlingRef = useRef(false);
  const hoveredFloatTimeRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setStatusIdx(i => (i + 1) % STATUS_PHRASES.length), 3200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setViewportW(window.innerWidth);
      setViewportH(window.innerHeight);
    };

    const EASE_RANGE = 0.018;
    const SETTLE_ANCHORS = [
      0,
      BOX_UNFILL_END,
      MORPH_START,
      BOX_MORPH_END,
      OVERVIEW_END,
      CLUSTER_END,
      HEADER_END,
      ...Object.values(SECTION_RANGES).flatMap(([lo, hi]) => [
        (lo + hi) / 2,
        hi - EASE_RANGE,
      ]),
      SECTIONS_END,
      1.0,
    ];

    const settle = () => {
      const tourPx = window.innerHeight * 6;
      const p = clamp(window.scrollY / tourPx, 0, 1);
      let nearest = SETTLE_ANCHORS[0];
      let minDist = Math.abs(p - nearest);
      for (const a of SETTLE_ANCHORS) {
        const d = Math.abs(p - a);
        if (d < minDist) { minDist = d; nearest = a; }
      }
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

    let raf = 0;
    const tick = () => {
      setSmoothScrollY((prev) => {
        const delta = rawScrollRef.current - prev;
        if (Math.abs(delta) < 0.3) return rawScrollRef.current;
        return prev + delta * 0.18;
      });
      floatTimeRef.current += 0.016;
      setFloatTime(floatTimeRef.current);
      const convTarget = (isBoxHoveredRef.current || rawScrollRef.current > 0) ? 1 : 0;
      // Snap immediately to 1 on scroll so dots land on border before morph starts.
      // Ease back to 0 (hover released, back at top) stays smooth.
      if (convTarget === 1 && convergeRef.current < 1) {
        convergeRef.current = 1;
      } else {
        convergeRef.current += (convTarget - convergeRef.current) * 0.18;
      }
      setConvergeT(convergeRef.current);
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

  useEffect(() => { isBoxHoveredRef.current = isBoxHovered; }, [isBoxHovered]);

  const vw = viewportW, vh = viewportH;
  const tourScrollPx = vh * 6;
  const driverHeight = tourScrollPx * SECTIONS_END + vh;
  const progress = clamp(smoothScrollY / tourScrollPx, 0, 1);
  const headerTop = Math.round(vh * 0.10);

  // Box geometry — centered, 56% of the shorter viewport dimension.
  // Larger box = crosshair arms are long enough that inner-quadrant labels
  // have breathing room between the intersection and the endpoint dot.
  const cx = vw / 2, cy = vh / 2;
  const boxSize = Math.min(vw, vh) * 0.32;
  const half = boxSize / 2;
  const boxX = cx - half, boxY = cy - half;
  // Crosshair arms extend further than the box — during morph the span
  // lerps from half (box edge) up to crosshairHalf* (full axis length).
  // H/V are separate so the horizontal axis can be longer than the vertical.
  const crosshairHalfH = vw * 0.40;
  const crosshairHalfV = vh * 0.38;

  // Phase progress (smootherstepped — zero first+second derivative at endpoints
  // means no acceleration spikes when the user scrolls through a phase boundary).
  const boxFillT = smootherstep(clamp(progress / BOX_UNFILL_END, 0, 1));
  const morphT   = smootherstep(clamp(
    (progress - MORPH_START) / (BOX_MORPH_END - MORPH_START), 0, 1,
  ));
  // Cluster: dots fly from crosshair endpoints → 4-dot nav icon at center.
  const clusterT = smootherstep(clamp(
    (progress - OVERVIEW_END) / (CLUSTER_END - OVERVIEW_END), 0, 1,
  ));
  // Header: nav icon travels from center → header strip.
  const headerT  = smootherstep(clamp(
    (progress - CLUSTER_END) / (HEADER_END - CLUSTER_END), 0, 1,
  ));
  // Crosshair (lines + axis labels) fades as dots cluster.
  const crosshairLineVis = 1 - clusterT;

  // ── Border-collapse geometry ───────────────────────────────────────────────
  // Box borders collapse to crosshair driven by scroll only (morphT).
  // Hover keeps the box as a square outline; scroll morphs it into a crosshair.
  const topY    = lerp(cy - half, cy, morphT);
  const bottomY = lerp(cy + half, cy, morphT);
  const leftX   = lerp(cx - half, cx, morphT);
  const rightX  = lerp(cx + half, cx, morphT);
  // Arm half-span: box edge → crosshairHalf* as morph completes (separate H/V).
  const armHalfH = lerp(half, crosshairHalfH, morphT);
  const armHalfV = lerp(half, crosshairHalfV, morphT);

  // ── Dot positions ─────────────────────────────────────────────────────────
  // Phase 1 (morph): outside box → crosshair endpoints.
  const morphDots = [
    { x: cx,              y: lerp(cy - half - DOT_GAP, cy - crosshairHalfV, morphT) }, // top  (Qiyu)
    { x: lerp(cx + half + DOT_GAP, cx + crosshairHalfH, morphT), y: cy              }, // right (Making)
    { x: cx,              y: lerp(cy + half + DOT_GAP, cy + crosshairHalfV, morphT) }, // bottom (Others)
    { x: lerp(cx - half - DOT_GAP, cx - crosshairHalfH, morphT), y: cy              }, // left (Noticing)
  ];

  // Phase 2 (cluster): fly to cross nav icon at viewport center.
  // Phase 3 (header): nav icon slides to header strip as a rigid unit —
  // no size or shape change, just translation. NAV_SP = C_ARM in
  // InlineMapIcon so the handoff at HEADER_END is seamless.
  const NAV_SP  = 10; // matches InlineMapIcon C_ARM
  const navY    = lerp(cy, headerTop + HEADER_H / 2, headerT);
  // Cross layout: top / right / bottom / left — same geometry as InlineMapIcon.
  const navDots = [
    { x: cx,          y: navY - NAV_SP }, // top    (Qiyu)
    { x: cx + NAV_SP, y: navY          }, // right  (Making)
    { x: cx,          y: navY + NAV_SP }, // bottom (Others)
    { x: cx - NAV_SP, y: navY          }, // left   (Noticing)
  ];

  // ── Pre-scroll floating + hover convergence ──────────────────────────────
  // Each dot floats gently around a base position. On hover, they spring to
  // the box midpoints (matching the image reference). As scroll begins, the
  // pre-morph positions blend into the scroll-driven morph animation.
  const FLOAT_PARAMS = [
    { ampX: 55, ampY: 45, freqX: 0.52, freqY: 0.41, phaseX: 0.0, phaseY: 1.3 },
    { ampX: 45, ampY: 55, freqX: 0.40, freqY: 0.65, phaseX: 2.2, phaseY: 0.5 },
    { ampX: 50, ampY: 40, freqX: 0.58, freqY: 0.50, phaseX: 1.1, phaseY: 2.7 },
    { ampX: 40, ampY: 50, freqX: 0.46, freqY: 0.55, phaseX: 3.4, phaseY: 1.9 },
  ] as const;
  const floatBases = [
    { x: cx,               y: cy - half * 1.9  }, // Qiyu — centered, well above box
    { x: cx + half * 1.9,  y: cy - half * 0.4  }, // Making — far right
    { x: cx + half * 0.4,  y: cy + half * 1.9  }, // Others — well below box
    { x: cx - half * 2.0,  y: cy + half * 0.25 }, // Noticing — far left
  ];
  const floatingDots = floatBases.map((base, i) => {
    if (i === 0) return { x: base.x, y: base.y };
    const p = FLOAT_PARAMS[i];
    const t = hoveredDot === i ? hoveredFloatTimeRef.current : floatTime;
    return {
      x: base.x + Math.sin(t * p.freqX + p.phaseX) * p.ampX,
      y: base.y + Math.sin(t * p.freqY + p.phaseY) * p.ampY,
    };
  });

  // Hover target: box border midpoints. Dots converge here on hover,
  // revealing the outlined box + "through connecting the dots" text.
  const boxMidpoints = [
    { x: cx,        y: cy - half }, // top
    { x: cx + half, y: cy        }, // right
    { x: cx,        y: cy + half }, // bottom
    { x: cx - half, y: cy        }, // left
  ];

  // morphBlendT: scroll-driven, starts at MORPH_START so dots dwell at box
  // border during the unfill beat before the collapse animation begins.
  const morphBlendT = smootherstep(clamp(
    (progress - MORPH_START) / (BOX_MORPH_END - MORPH_START), 0, 1,
  ));

  // preMorphDots: float freely, spring to box border on hover (convergeT).
  const preMorphDots = floatingDots.map((fp, i) => ({
    x: lerp(fp.x, boxMidpoints[i].x, convergeT),
    y: lerp(fp.y, boxMidpoints[i].y, convergeT),
  }));

  const dotPositions = preMorphDots.map((pre, i) => {
    const scrollDriven = {
      x: lerp(morphDots[i].x, navDots[i].x, clusterT),
      y: lerp(morphDots[i].y, navDots[i].y, clusterT),
    };
    return {
      x: lerp(pre.x, scrollDriven.x, morphBlendT),
      y: lerp(pre.y, scrollDriven.y, morphBlendT),
    };
  });

  // Dot size: 7px at crosshair → 10px when cluster forms. Holds at 10px
  // through the header slide (rigid translation, no size change).
  const dotSize  = lerp(10, 10, clusterT);
  // Dot color: Anthropic-red terracotta at pre-scroll → warm grey at cluster.
  const dotColor = `rgb(${Math.round(lerp(204, 128, clusterT))},${
    Math.round(lerp(110, 122, clusterT))},${
    Math.round(lerp(86, 110, clusterT))})`;

  // Active section + its quadrant data.
  const activeSection    = activeSectionFromProgress(progress);
  const activeSectionIdx = SECTIONS.findIndex((s) => s.id === activeSection);
  const activeQ          = quadrants[activeSectionIdx] ?? quadrants[0];

  // Section visibility: fades in once nav icon reaches header.
  const inSections   = progress >= HEADER_END;
  const sectionBodyT = smootherstep(clamp((progress - HEADER_END) / 0.04, 0, 1));
  const returnT      = smootherstep(clamp((progress - SECTIONS_END) / 0.06, 0, 1));
  const sectionVis   = inSections ? sectionBodyT * (1 - returnT) : 0;

  // Header bar visibility — fades in as nav icon arrives, fades at end.
  const headerBarVis = headerT * (1 - returnT);

  // Quadrant labels + connecting text: appear when crosshair fully forms,
  // fade out as the cluster phase begins (crosshairLineVis = 1 - clusterT).
  // Quad labels appear when crosshair fully forms via scroll; fade on cluster.
  const quadLabelVis = smootherstep(clamp((morphT - 0.7) / 0.3, 0, 1)) * crosshairLineVis;


  // Scroll hint — visible only at the very start.


  // Jump helpers — scroll to mid-point of a section's range.
  const jumpToSection = (id: SectionId) => {
    const [lo, hi] = SECTION_RANGES[id];
    window.scrollTo({ top: ((lo + hi) / 2) * tourScrollPx, behavior: 'smooth' });
  };

  return (
    <div style={{ position: 'relative' }}>

      {/* ── Fixed canvas ─────────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: 'var(--bg)' }}>

        {/* "Think outside the box" text — centered in the box area,
            fades out before the fill finishes so the outline is seen alone. */}
        <div style={{
          position: 'absolute',
          left: boxX, top: boxY,
          width: boxSize, height: boxSize,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 6,
        }}>
          <p style={{
            color: 'var(--bg)',
            fontFamily: 'var(--serif)', fontWeight: hoveredDot !== null && morphT < 0.01 ? 400 : 600,
            fontSize: 'clamp(18px, 2.2vw, 32px)',
            letterSpacing: '-0.02em', lineHeight: 1.2,
            textAlign: 'center', margin: 0,
            padding: `0 ${SPACE.xl}px`,
            opacity: (isBoxHovered || convergeT > 0.5) ? 0 : Math.max(0, 1 - boxFillT * 2.5),
            transition: 'opacity 0.3s ease',
          }}>
            {hoveredDot !== null && morphT < 0.01
              ? DOT_ACTIVITIES[hoveredDot]
              : 'Think outside the box'}
          </p>
        </div>

        {/* SVG — 4 border sides that collapse to form the crosshair.
            Lines fade out as the dots begin clustering (crosshairLineVis). */}
        <svg style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 4, overflow: 'visible',
          opacity: crosshairLineVis,
        }}>
          {/* Box fill — fades as boxFillT → 1, or immediately on hover */}
          <rect x={boxX} y={boxY} width={boxSize} height={boxSize}
            fill="var(--ink)"
            style={{ opacity: (isBoxHovered || convergeT > 0.5) ? 0 : 1 - boxFillT, transition: 'opacity 0.35s ease' }} />
          {/* Border lines — simple box border, no extension on hover */}
          <>
            <line x1={cx - armHalfH} y1={topY} x2={cx + armHalfH} y2={topY}
              stroke="#c0c0bc" strokeWidth={1} />
            <line x1={cx - armHalfH} y1={bottomY} x2={cx + armHalfH} y2={bottomY}
              stroke="#c0c0bc" strokeWidth={1} />
            <line x1={leftX} y1={cy - armHalfV} x2={leftX} y2={cy + armHalfV}
              stroke="#c0c0bc" strokeWidth={1} />
            <line x1={rightX} y1={cy - armHalfV} x2={rightX} y2={cy + armHalfV}
              stroke="#c0c0bc" strokeWidth={1} />
          </>
        </svg>

        {/* Hover detection zone — transparent div over the box, only active before scroll begins */}
        {morphT < 0.01 && (
          <div
            style={{
              position: 'absolute', left: boxX, top: boxY,
              width: boxSize, height: boxSize,
              zIndex: 5, cursor: isBoxHovered ? 'pointer' : 'default',
            }}
            onMouseEnter={() => setIsBoxHovered(true)}
            onMouseLeave={() => setIsBoxHovered(false)}
            onClick={() => window.scrollTo({ top: ((BOX_MORPH_END + OVERVIEW_END) / 2) * tourScrollPx, behavior: 'smooth' })}
          />
        )}

        {/* Axis dots — present from the start, outside the border by DOT_GAP.
            Converge inward to border midpoints as the sides collapse (morphT).
            Labels visible immediately; they're part of the "outside the box"
            state that gives the viewer the conceptual key before the morph. */}
        {/* Connection lines — dashed, drawn between hovered dot and its axis partners */}
        {morphT < 0.01 && hoveredDot !== null && (() => {
          const pairs: [number, number][] = [
            ...DOT_CONNECTIONS[hoveredDot].map(t => [hoveredDot, t] as [number, number]),
            ...(EXTRA_CONNECTIONS[hoveredDot] ?? []),
          ];
          return (
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
              {pairs.map(([a, b], i) => (
                <line key={i}
                  x1={dotPositions[a].x} y1={dotPositions[a].y}
                  x2={dotPositions[b].x} y2={dotPositions[b].y}
                  stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 6"
                  style={{ opacity: 0.6 }}
                />
              ))}
            </svg>
          );
        })()}

        {([
          { label: 'Qiyu',     dir: (convergeT > 0.05 || morphT > 0 ? 'up' : 'left') as LabelDir, tint: 'var(--ink-3)' },
          { label: 'Creating', dir: 'right' as LabelDir, tint: 'var(--ink-3)' },
          { label: 'Others',   dir: 'down'  as LabelDir, tint: 'var(--ink-3)' },
          { label: 'Thinking', dir: 'left'  as LabelDir, tint: 'var(--ink-3)' },
        ] as const).map((cfg, i) => (
          <AxisDot key={cfg.label}
            x={dotPositions[i].x} y={dotPositions[i].y}
            label={cfg.label} dir={cfg.dir} tint={cfg.tint}
            dotVis={1 - sectionBodyT} labelVis={crosshairLineVis * (1 - sectionBodyT)}
            dotSize={dotSize} dotColor={dotColor}
            hovered={hoveredDot === i}
            suffix={i === 0 && morphT < 0.01 && convergeT < 0.1 ? (hoveredDot !== null && hoveredDot !== 0 ? DOT_ACTIVITIES[hoveredDot] : STATUS_PHRASES[statusIdx]) : undefined}
            onMouseEnter={morphT < 0.01 ? () => { hoveredFloatTimeRef.current = floatTimeRef.current; setHoveredDot(i); } : undefined}
            onMouseLeave={morphT < 0.01 ? () => setHoveredDot(null) : undefined}
          />
        ))}

        {/* "through connecting the dots" — centered in the box on hover */}
        {convergeT > 0.05 && morphT < 0.4 && (
          <div
            style={{
              position: 'absolute',
              left: cx, top: cy,
              transform: 'translate(-50%, -50%)',
              opacity: convergeT * (1 - morphT * 2.5),
              fontFamily: 'var(--serif)', fontWeight: 600,
              fontSize: 'clamp(18px, 2.2vw, 32px)',
              letterSpacing: '-0.02em', lineHeight: 1.2,
              color: 'var(--ink)',
              width: boxSize * 0.75, textAlign: 'center',
              pointerEvents: 'none', zIndex: 7,
            }}
          >
            through<br />connecting the dots
          </div>
        )}

        {/* Quadrant labels — left-aligned in left quadrants, right-aligned in right quadrants. */}
        {quadLabelVis > 0 && QUAD_LABELS.map((ql) => {
          const col = ql.cell[1] === 'L' ? 0 : 1;
          const row = ql.cell[0] === 'T' ? 0 : 1;
          const isLeft = col === 0;

          const midX = isLeft ? cx - crosshairHalfH / 2 : cx + crosshairHalfH / 2;
          const midY = row === 0 ? cy - crosshairHalfV / 2 : cy + crosshairHalfV / 2;
          const labelWidth = Math.min(crosshairHalfH * 0.85, 480);

          return (
            <div key={ql.cell} style={{
              position: 'absolute',
              left: midX - labelWidth / 2,
              top: midY,
              transform: 'translateY(-50%)',
              opacity: quadLabelVis,
              pointerEvents: 'none', zIndex: 7,
              textAlign: isLeft ? 'left' : 'right',
              width: labelWidth,
            }}>
              <div style={{
                fontFamily: 'var(--serif)', fontWeight: 400,
                fontSize: 'clamp(18px, 1.6vw, 26px)',
                letterSpacing: '-0.02em', lineHeight: 1.1,
                color: 'var(--ink)',
              }}>
                {ql.text}
              </div>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6,
                textTransform: 'uppercase', color: ql.tint,
                marginTop: 10,
              }}>
                {ql.sub}
              </div>
            </div>
          );
        })}


        {/* ── Inset container — single source of truth for all page margins.
            Both header and content live here so they share the same 160px
            inset on all four sides automatically. Content gets flex:1 so it
            fills exactly to the bottom edge (no hardcoded bottom padding). */}
        {(sectionVis > 0 || headerBarVis > 0) && (() => {
          const sec = SECTION_BY_ID[activeSection];
          const activeCells: Record<SectionId, ['top'|'right'|'bottom'|'left', 'top'|'right'|'bottom'|'left']> = {
            reflect:     ['top', 'left'],
            experiment:  ['top', 'right'],
            hear:        ['bottom', 'left'],
            collaborate: ['bottom', 'right'],
          };
          const active = activeCells[activeSection];
          const isActive = (c: 'top'|'right'|'bottom'|'left') => active.includes(c);
          const navIdxFor = (c: 'top'|'right'|'bottom'|'left') => {
            const match = (Object.keys(activeCells) as SectionId[]).find(id =>
              activeCells[id].includes(c),
            );
            return match;
          };
          const NAV_R = 5; const NAV_ARM = 10;
          const DOT_POS = {
            top:    { x: 0,        y: -NAV_ARM },
            right:  { x: NAV_ARM,  y: 0 },
            bottom: { x: 0,        y: NAV_ARM },
            left:   { x: -NAV_ARM, y: 0 },
          } as const;
          const cardinals = ['top', 'right', 'bottom', 'left'] as const;
          const navOpacity = sectionBodyT * (1 - returnT);

          return (
            <div style={{
              position: 'absolute',
              top: headerTop, bottom: Math.round(vw * 0.12),
              left: headerTop, right: headerTop,
              zIndex: 10,
              display: 'flex', flexDirection: 'column',
              pointerEvents: 'none',
            }}>
              {/* Header row — 3-column grid so the nav icon is always pinned
                  to the exact horizontal center regardless of label widths. */}
              <div style={{
                height: HEADER_H, flexShrink: 0,
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                alignItems: 'center',
                opacity: headerBarVis,
                pointerEvents: 'none',
              }}>
                <div style={{
                  opacity: navOpacity,
                  fontFamily: 'var(--sans)', fontWeight: 500,
                  fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: sec.tint,
                  textAlign: 'right', paddingRight: 20,
                }}>
                  {sec.axisPair[0]} × {sec.axisPair[1]}
                </div>

                <div style={{
                  position: 'relative', flexShrink: 0,
                  opacity: navOpacity,
                  pointerEvents: 'auto',
                  width: (NAV_ARM + NAV_R) * 2,
                  height: (NAV_ARM + NAV_R) * 2,
                }}>
                  {cardinals.map((c) => {
                    const dp = DOT_POS[c];
                    const isAct = isActive(c);
                    const dcx = NAV_ARM + NAV_R + dp.x;
                    const dcy = NAV_ARM + NAV_R + dp.y;
                    const targetId = navIdxFor(c);
                    return (
                      <div key={c}
                        onClick={() => targetId && jumpToSection(targetId)}
                        style={{
                          position: 'absolute',
                          left: dcx - NAV_R, top: dcy - NAV_R,
                          width: NAV_R * 2, height: NAV_R * 2,
                          borderRadius: '50%',
                          background: isAct ? 'var(--ink)' : 'rgba(31,30,27,0.35)',
                          cursor: 'pointer',
                        }}
                      />
                    );
                  })}
                </div>

                <div style={{
                  opacity: navOpacity,
                  fontFamily: 'var(--serif)', fontStyle: 'italic',
                  fontSize: 13, color: 'var(--ink-3)',
                  paddingLeft: 20,
                }}>
                  {sec.activity}
                </div>
              </div>

              {/* Content — fills remaining height. position:relative anchors
                  every child's position:absolute,inset:0 layout. */}
              <div style={{
                flex: 1, position: 'relative', overflow: 'visible',
                paddingTop: viewportW >= 768 ? 40 : 16,
                opacity: sectionVis,
                pointerEvents: sectionVis > 0.05 ? 'auto' : 'none',
              }}>
                <SectionView
                  section={SECTION_BY_ID[activeSection]}
                  q={activeQ}
                  onNav={onNav}
                  onSectionJump={jumpToSection}
                />
              </div>
            </div>
          );
        })()}

        {/* Scroll hint — visible only at the very start */}

      </div>

      {/* ── Scroll driver ───────────────────────────────────────────────── */}
      <div style={{ height: `${driverHeight}px` }} />

      {/* ── Footer ──────────────────────────────────────────────────────── */}
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

          <section style={{ maxWidth: 720 }}>
            <FooterKicker>Why this site is shaped this way</FooterKicker>
            <p style={{
              fontFamily: 'var(--serif)', fontWeight: 400,
              fontSize: 'clamp(20px, 1.6vw, 24px)',
              lineHeight: 1.4, letterSpacing: -0.2,
              color: 'var(--ink)',
              margin: `${SPACE.md}px 0 0`, textWrap: 'balance',
            } as React.CSSProperties}>
              Most of us are more than our portfolio. I&rsquo;d rather you hire me — and work with me — as a person, not a skills list.
            </p>
            <p style={{
              fontFamily: 'var(--serif)', fontStyle: 'italic',
              fontSize: 16, lineHeight: 1.45,
              color: 'var(--ink-2)',
              margin: `${SPACE.sm}px 0 0`, textWrap: 'pretty',
            } as React.CSSProperties}>
              So here&rsquo;s the messier half — what I&rsquo;m good at, and what I&rsquo;m still working on.
            </p>
          </section>

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
  const handleClick = (href: string) => (e: React.MouseEvent) => {
    if (href.startsWith('#section:')) {
      e.preventDefault();
      onSectionJump(href.slice(9) as SectionId);
      return;
    }
    clickHandler(href, onNav)(e);
  };

  const inset = { top: 0, right: 80, bottom: 80, left: 80 };

  return (
    <div style={{
      position: 'absolute',
      top: inset.top, right: inset.right, bottom: inset.bottom, left: inset.left,
    }}>

      {/* How might I × Experiments table */}
      <div style={{
        position: 'absolute',
        top: '50%', left: 0, right: 0,
        transform: 'translateY(-50%)',
        zIndex: 1,
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          columnGap: SPACE.xxxl,
          paddingBottom: SPACE.md,
          borderBottom: '1px solid var(--line)',
          marginBottom: 0,
        }}>
          {(['How might I', 'Experiments'] as const).map((h) => (
            <div key={h} style={{
              fontFamily: 'var(--sans)',
              fontSize: TYPE.kicker.size,
              fontWeight: TYPE.kicker.weight,
              letterSpacing: TYPE.kicker.tracking,
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {q.items.filter(it => it.dek && it.title).map((it, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            columnGap: SPACE.xxxl,
            padding: `${SPACE.lg}px 0`,
            borderBottom: '1px solid var(--line)',
            alignItems: 'center',
          }}>
            <div style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontSize: 'clamp(15px, 1.3vw, 19px)',
              lineHeight: 1.4,
              color: 'var(--ink-2)',
            }}>
              {it.dek}
            </div>
            <a
              href={it.href ?? '#'}
              onClick={handleClick(it.href ?? '#')}
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 'clamp(14px, 1.1vw, 16px)',
                fontWeight: 500,
                color: 'var(--ink)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: SPACE.sm,
                transition: 'color .15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--tint-tr)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink)')}
            >
              {it.title}
              <span style={{ opacity: 0.45, fontSize: '0.85em' }}>↗</span>
            </a>
          </div>
        ))}
      </div>
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
  { id: 'passion', label: 'Passion',  pos: { x: 0.28, y: 0.48 } },
  { id: 'mindset', label: 'Mindset',  pos: { x: 0.68, y: 0.48 } },
];
const LEARN_VALUE_LINKS: [string, string][] = [
  ['passion', 'mindset'],
];
const LEARN_QUOTES: LearnQuote[] = [
  { quote: "This is a job I would do even if I weren't getting paid.",
    who: 'Samar K.',   value: 'passion', pos: { x: 0.10, y: 0.20 },
    articleSlug: 'making-ai-feel-human', sectionId: 'relationship' },
  { quote: 'Make work fun.',
    who: 'Mia H.',     value: 'passion', pos: { x: 0.08, y: 0.55 },
    articleSlug: 'design-the-collaboration', sectionId: 'cross' },
  { quote: 'It feels good to be inspired and to inspire others.',
    who: 'Sharif S.',  value: 'passion', pos: { x: 0.14, y: 0.82 },
    articleSlug: 'thinking-outside-the-box', sectionId: 'see' },
  { quote: 'Research is a mindset. Everything can be research.',
    who: 'Yiwen L.',   value: 'mindset', pos: { x: 0.80, y: 0.22 },
    articleSlug: 'making-ai-feel-human', sectionId: 'cant' },
  { quote: "Don't try too hard to find the rules too soon. Be comfortable keeping things messy.",
    who: 'Jessica H.', value: 'mindset', pos: { x: 0.82, y: 0.72 },
    articleSlug: 'how-i-use-ai-to-create', sectionId: 'pitfalls' },
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
  const t = floatTick * 0.016;
  const driftFor = (id: string, idx: number) => {
    if (draggedId === id) return { dx: 0, dy: 0 };
    return {
      dx: Math.sin(t + idx * 1.3) * 0.018,
      dy: Math.cos(t * 0.85 + idx * 1.7) * 0.014,
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
    tag: '0 → 1 Product Launch',
    impact: 'App launch 0-> 1 with six business partners',
    meta: 'Meetfood · Founding UX · 1.5y',
    image: '/projects/meetfood-before.png',
    hoverImage: '/projects/meetfood-after.png',
    logo: '/logos/meetfood.png',
    href: 'https://www.key-you-who.com/projects/app-launch',
  },
  {
    tag: 'Conversational AI',
    impact: 'Research-to-prototype in 4 months (SUS 86.3)',
    meta: 'Google Cloud · UX · 4mo',
    image: '/projects/google-cloud-product.png',
    hoverImage: '/projects/google-cloud-after.png',
    logo: '/logos/google-cloud.png',
    href: 'https://www.key-you-who.com/projects/google-cloud',
  },
  {
    tag: 'Audio AI',
    impact: 'A working call agent built in a week of prompt engineering.',
    meta: 'The Mentoring Partnership · Solo AI · 1wk',
    image: '/projects/mentoring-product.png',
    hoverImage: '/projects/mentoring-after.png',
    logo: '/logos/mentoring.png',
    href: 'https://www.key-you-who.com/projects/prototyping-with-ai',
  },
  {
    tag: 'Service design',
    impact: 'Hi-fi prototypes drove real-world adoption (SUS 90.3)',
    meta: 'Automotus · Pittsburgh Parking · 4mo',
    image: '/projects/automotus-before.png',
    hoverImage: '/projects/automotus-after.png',
    logo: '/logos/automotus.png',
    href: 'https://www.key-you-who.com/projects/design-as-a-research-tool',
  },
  {
    tag: 'Physical AI',
    impact: 'Embedding diagnostic AI into a clinical workflow',
    meta: 'Archetype AI × Roche · 1mo',
    image: '/projects/roche-before.png',
    hoverImage: '/projects/roche-after.png',
    logo: '/logos/archetype-roche.png',
    href: 'https://www.linkedin.com/posts/tantara_its-a-wrap-for-the-inaugural-strange-design-ugcPost-7229713649941028865-kYh4/',
  },
  {
    tag: 'HCI Research',
    impact: 'Two papers on language, affiliation, and AI care',
    meta: 'CMU AI-CARING / Cornell · 1.5y',
    image: '/projects/ai-caring-product.png',
    hoverImage: null,
    logo: '/logos/ai-caring.png',
    href: null,
  },
];

function WorkGrid({ q: _q }: { q: Quadrant; onNav: NavFn }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      overflow: 'visible',
      boxSizing: 'border-box',
      paddingTop: 40,
      paddingBottom: 40,
      pointerEvents: 'auto',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        columnGap: SPACE.xxl,
        rowGap: SPACE.xxl,
        maxWidth: 960,
        margin: '0 auto',
        pointerEvents: 'auto',
        alignItems: 'start',
      }}>
        {GALLERY_ITEMS.map((item, i) => {
          return (
            <div
              key={i}
              onClick={() => item.href && window.open(item.href, '_blank', 'noopener,noreferrer')}
              style={{
                cursor: item.href ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column',
                minHeight: 0,
              }}
              onMouseEnter={(e) => {
                const imgs = e.currentTarget.querySelectorAll('img');
                const product = imgs[0] as HTMLImageElement | undefined;
                const logo = imgs[1] as HTMLImageElement | undefined;
                if (product && item.href) product.style.transform = 'scale(1.04)';
                if (logo) { logo.style.opacity = '1'; logo.style.width = '35%'; }
              }}
              onMouseLeave={(e) => {
                const imgs = e.currentTarget.querySelectorAll('img');
                const product = imgs[0] as HTMLImageElement | undefined;
                const logo = imgs[1] as HTMLImageElement | undefined;
                if (product) product.style.transform = 'scale(1)';
                if (logo) { logo.style.opacity = '0'; logo.style.width = '30%'; }
              }}
            >
              {/* Image + logo overlay (logo hidden until hover) */}
              <div style={{ aspectRatio: '4/3', overflow: 'hidden', borderRadius: 4, position: 'relative' }}>
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
                <img
                  src={item.logo}
                  alt=""
                  style={{
                    position: 'absolute', bottom: 8, left: 8,
                    width: '30%', height: 'auto',
                    objectFit: 'contain',
                    opacity: 0,
                    transition: 'opacity .25s ease, width .3s cubic-bezier(.2,.7,.2,1)',
                  }}
                />
              </div>
              {/* Tag only — no description */}
              <div style={{ paddingTop: 8, flexShrink: 0 }}>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 9,
                  letterSpacing: 1.1, textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                }}>
                  {item.tag}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
