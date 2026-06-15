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
//   Expand   (0 → EXPAND_END):            cluster at center expands to crosshair
//   Overview (EXPAND_END → OVERVIEW_END):  crosshair + quadrant labels visible
//   Cluster  (OVERVIEW_END → CLUSTER_END): dots collapse back to nav icon at center
//   Header   (CLUSTER_END → HEADER_END):   nav icon travels to header strip
//   Sections (HEADER_END → SECTIONS_END):  four section pages
const CONVERGE_END = 0.08;  // floating → cluster (first half of scroll intro)
const EXPAND_END   = 0.20;  // cluster → crosshair
const OVERVIEW_END = 0.22;  // crosshair overview beat ends
const CLUSTER_END  = 0.32;  // dots re-cluster → directly to Reflect
const HEADER_END   = 0.32;  // nav icon in header (same as CLUSTER_END, no separate phase)
const SECTIONS_END = 0.83;

// Header strip height — the nav icon lives here during sections.
const HEADER_H = 72; // px

// ——— Sections ———
type SectionId = 'reflect' | 'experiment' | 'hear' | 'collaborate';

// ——— Single source of truth for all activity descriptions ———
// Used in: section headers, quadrant overview labels, and box dot-hover text.
const SECTION_ACTIVITIES: Record<SectionId, string> = {
  reflect:     'connecting the dots...',
  experiment:  'how might I...',
  hear:        'noticing some unknown-unknowns...',
  collaborate: 'collaborating to innovate...',
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
  { id: 'reflect',     title: 'to reflect',     axisPair: ['Qiyu',   'Creating'], persona: 'Qiyu', activity: SECTION_ACTIVITIES.reflect,  activeDots: ['qiyu', 'think'],  cell: 'TL', tint: 'var(--tint-tl)' },
  { id: 'experiment',  title: 'to experiment',  axisPair: ['Qiyu',   'Thinking'], persona: 'Qiyu', activity: SECTION_ACTIVITIES.experiment,     activeDots: ['qiyu', 'create'], cell: 'TR', tint: 'var(--tint-tr)' },
  { id: 'hear',        title: 'to hear',        axisPair: ['Others', 'Thinking'], persona: 'Qiyu', activity: SECTION_ACTIVITIES.hear,        activeDots: ['other', 'think'], cell: 'BL', tint: 'var(--tint-bl)' },
  { id: 'collaborate', title: 'to collaborate', axisPair: ['Others', 'Creating'], persona: 'Qiyu', activity: SECTION_ACTIVITIES.collaborate, activeDots: ['other', 'create'], cell: 'BR', tint: 'var(--tint-br)' },
];

const SECTION_BY_ID: Record<SectionId, typeof SECTIONS[number]> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s]),
) as Record<SectionId, typeof SECTIONS[number]>;

// Section ranges within the 0–1 scroll progress space.
const SECTION_RANGES: Record<SectionId, [number, number]> = {
  reflect:     [HEADER_END, 0.50],
  experiment:  [0.50, 0.62],
  collaborate: [0.62, 0.73],
  hear:        [0.73, SECTIONS_END],
};

function activeSectionFromProgress(p: number): SectionId {
  if (p >= SECTION_RANGES.hear[0])        return 'hear';
  if (p >= SECTION_RANGES.collaborate[0]) return 'collaborate';
  if (p >= SECTION_RANGES.experiment[0])  return 'experiment';
  return 'reflect';
}

// ——— Design tokens — mapped to Apple HIG ———
/* Using CSS custom properties from tokens.css:
   --text-display, --text-large-heading, --text-medium-heading,
   --text-section-title, --text-body, --text-callout, --text-caption-2 */

const TYPE = {
  display:   { size: 'clamp(40px, 7vw, 96px)',   weight: 400, tracking: '-0.025em', lineHeight: 1.0 },
  hubTitle:  { size: 'clamp(32px, 4vw, 56px)',   weight: 400, tracking: '-0.02em',  lineHeight: 1.05 },
  cellLabel: { size: 'clamp(24px, 2.6vw, 40px)', weight: 400, tracking: '-0.01em',  lineHeight: 1.1 },
  sectionH1: { size: 'clamp(22px, 1.9vw, 30px)', weight: 400, tracking: '-0.01em',  lineHeight: 1.2 },
  bodyLg:    { size: '17px', weight: 400, tracking: '0',         lineHeight: 1.294 }, /* Body HIG */
  body:      { size: '15px', weight: 400, tracking: '0',         lineHeight: 1.333 }, /* Subheadline HIG */
  kicker:    { size: '12px', weight: 400, tracking: '0.10em',    lineHeight: 1.333 }, /* Caption 2 HIG */
  meta:      { size: '12px', weight: 400, tracking: '0.10em',    lineHeight: 1.333 }, /* Caption 2 HIG */
} as const;
const SPACE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 } as const;


// Quadrant label text shown briefly in each quadrant after crosshair forms.
const QUAD_LABELS: { cell: 'TL' | 'TR' | 'BL' | 'BR'; text: string; sub: string; tint: string }[] = [
  { cell: 'TL', text: SECTION_ACTIVITIES.experiment,  sub: 'Qiyu × Thinking',  tint: 'var(--tint-tl)' },
  { cell: 'TR', text: SECTION_ACTIVITIES.reflect,     sub: 'Qiyu × Creating',  tint: 'var(--tint-tr)' },
  { cell: 'BL', text: SECTION_ACTIVITIES.hear,        sub: 'Others × Thinking', tint: 'var(--tint-bl)' },
  { cell: 'BR', text: SECTION_ACTIVITIES.collaborate, sub: 'Others × Creating', tint: 'var(--tint-br)' },
];


const STATUS_PHRASES = [
  'Asking herself is she is overthinking…',
  'Vibe coding…',
  'Reading child books…',
  'Sketching in pencil…',
  'Talking to Claude…',
  'People watching on the street…',
  'Ant watching…',
  'Counting Strangers…',
  'Asking "what if?"…',
  'Looking for the box…',
];

type LabelDir = 'up' | 'right' | 'down' | 'left';
function AxisDot({
  x, y, label, dir, tint = 'var(--ink-3)', dotVis, labelVis,
  dotSize = 7, dotColor = 'var(--ink)', hoverColor,
  hovered = false, suffix,
  onClick,
  hoverLabel,
  labelOverride,
  suffixOverride,
  gap: gapProp = 14,
  onMouseEnter: onEnter, onMouseLeave: onLeave,
}: {
  x: number; y: number; label: string; dir: LabelDir; tint?: string;
  dotVis: number; labelVis: number; dotSize?: number; dotColor?: string; hoverColor?: string;
  hovered?: boolean; suffix?: string;
  onClick?: () => void;
  hoverLabel?: React.ReactNode;
  labelOverride?: React.CSSProperties;
  suffixOverride?: React.CSSProperties;
  gap?: number;
  onMouseEnter?: () => void; onMouseLeave?: () => void;
}) {
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLabelHovered, setIsLabelHovered] = useState(false);

  const handleEnter = () => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    onEnter?.();
  };
  const handleLeave = () => {
    leaveTimer.current = setTimeout(() => { leaveTimer.current = null; onLeave?.(); }, 250);
  };

  const gap = gapProp;
  const interactive = !!onEnter;
  const labelStyle: React.CSSProperties = {
    position: 'absolute',
    fontFamily: 'var(--font-primary)',
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: '0.02em',
    color: tint,
    whiteSpace: 'nowrap',
    opacity: labelVis,
    pointerEvents: interactive ? 'auto' : 'none',
    cursor: interactive ? 'default' : undefined,
    lineHeight: 1.385,
    ...labelOverride,
  };
  let offset: React.CSSProperties = {};
  if (dir === 'up')    offset = { bottom: '100%', left: '50%', transform: 'translateX(-50%)', paddingBottom: gap };
  if (dir === 'down')  offset = { top: '100%',    left: '50%', transform: 'translateX(-50%)', paddingTop: gap };
  if (dir === 'left')  offset = { right: '100%',  top: '50%',  transform: 'translateY(-50%)', paddingRight: gap, textAlign: 'right' as const };
  if (dir === 'right') offset = { left: '100%',   top: '50%',  transform: 'translateY(-50%)', paddingLeft: gap };

  // Hit zone covers the label area (left for dir='left') and the suffix area (right).
  // suffixOverride signals a large title suffix that needs a wide right extension.
  const labelHitW = labelOverride ? 600 : 200;
  const hitStyle: React.CSSProperties = interactive ? {
    position: 'absolute',
    top:    -20,
    bottom: -20,
    left:   dir === 'left'  ? -labelHitW : -20,
    right:  dir === 'right' ? -labelHitW : (suffixOverride ? -520 : -20),
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
      onClick={onClick}
    >
      {interactive && <div style={hitStyle} />}
      <div style={{
        width: dotSize, height: dotSize, borderRadius: '50%',
        background: hovered ? (hoverColor ?? tint) : dotColor,
        opacity: dotVis,
        transform: hovered ? 'scale(1.6)' : 'scale(1)',
        transition: 'transform .25s cubic-bezier(.2,.7,.2,1), background .2s ease',
        position: 'relative', zIndex: 1,
        cursor: onClick ? 'pointer' : undefined,
      }} />

      {/* Label — with optional fade-slide to hoverLabel on label hover */}
      {hoverLabel ? (
        <div
          style={{ ...labelStyle, ...offset }}
          onMouseEnter={() => { handleEnter(); setIsLabelHovered(true); }}
          onMouseLeave={() => { handleLeave(); setIsLabelHovered(false); }}
        >
          <span style={{
            display: 'block',
            transition: 'transform .28s cubic-bezier(.2,.7,.2,1), opacity .18s ease',
            transform: isLabelHovered ? 'translateX(-12px)' : 'translateX(0)',
            opacity: isLabelHovered ? 0 : 1,
          }}>
            {label}
          </span>
          <div style={{
            position: 'absolute', top: 0, right: 0,
            transition: 'transform .28s cubic-bezier(.2,.7,.2,1), opacity .18s ease',
            transform: isLabelHovered ? 'translateX(0)' : 'translateX(12px)',
            opacity: isLabelHovered ? 1 : 0,
            whiteSpace: 'nowrap',
          }}>
            {hoverLabel}
          </div>
        </div>
      ) : (
        <div style={{ ...labelStyle, ...offset }}
          onMouseEnter={interactive ? handleEnter : undefined}
          onMouseLeave={interactive ? handleLeave : undefined}
        >
          {label}
        </div>
      )}

      {suffix && (
        <div style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          fontFamily: 'var(--sans)',
          fontSize: 12,
          letterSpacing: '0.02em',
          color: tint,
          whiteSpace: 'nowrap',
          opacity: labelVis,
          pointerEvents: 'none',
          left: dotSize + gap,
          ...suffixOverride,
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
  const [reflectHover, setReflectHover] = useState<{ slug: string | null; tint: string | null }>({ slug: null, tint: null });
  const [statusIdx, setStatusIdx] = useState(0);
  const [floatTime, setFloatTime] = useState(0);
  const floatTimeRef = useRef(0);
  const [convergeT, setConvergeT] = useState(0);
  const convergeRef = useRef(0);
  const hoveredDotRef = useRef<number | null>(null);
  const hoveredFloatTimeRef = useRef(0);
  const rawScrollRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSettlingRef = useRef(false);

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
      OVERVIEW_END,
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
      const convTarget = 0; // hover no longer triggers convergence
      const springK = convTarget === 0 ? 0.08 : 0.14;
      convergeRef.current += (convTarget - convergeRef.current) * springK;
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

  useEffect(() => { hoveredDotRef.current = hoveredDot; }, [hoveredDot]);

  const vw = viewportW, vh = viewportH;
  const tourScrollPx = vh * 6;
  const driverHeight = tourScrollPx * SECTIONS_END + vh;
  const progress = clamp(smoothScrollY / tourScrollPx, 0, 1);
  const headerTop = Math.round(vh * 0.10);

  const cx = vw / 2, cy = vh / 2;
  const crosshairHalfH = vw * 0.40;
  const crosshairHalfV = vh * 0.38;

  // Phase progress — two-stage scroll intro: converge first, then expand.
  const convergeProgress = smootherstep(clamp(progress / CONVERGE_END, 0, 1));
  const expandProgress   = smootherstep(clamp(
    (progress - CONVERGE_END) / (EXPAND_END - CONVERGE_END), 0, 1,
  ));
  const clusterT = smootherstep(clamp(
    (progress - OVERVIEW_END) / (CLUSTER_END - OVERVIEW_END), 0, 1,
  ));
  const crosshairLineVis = expandProgress * (1 - clusterT);

  // NAV_SP matches InlineMapIcon C_ARM for the header nav icon handoff at HEADER_END.
  const NAV_SP     = 10;
  // CLUSTER_SP controls the re-cluster anchor state — tighter to match header nav.
  const CLUSTER_SP = 12;

  // Cluster positions at viewport center — starting state and re-cluster target.
  const clusterDots = [
    { x: cx,              y: cy - CLUSTER_SP }, // top    (Qiyu)
    { x: cx + CLUSTER_SP, y: cy              }, // right  (Creating)
    { x: cx,              y: cy + CLUSTER_SP }, // bottom (Others)
    { x: cx - CLUSTER_SP, y: cy              }, // left   (Thinking)
  ];
  // Crosshair endpoint positions — the expanded state.
  const crosshairDots = [
    { x: cx,                 y: cy - crosshairHalfV }, // top    (Qiyu)
    { x: cx + crosshairHalfH, y: cy                 }, // right  (Creating)
    { x: cx,                 y: cy + crosshairHalfV }, // bottom (Others)
    { x: cx - crosshairHalfH, y: cy                 }, // left   (Thinking)
  ];
  // Crosshair → header travel (rigid translation, no shape change).
  const navY   = lerp(cy, headerTop + HEADER_H / 2, clusterT);
  const navDots = [
    { x: cx,          y: navY - NAV_SP },
    { x: cx + NAV_SP, y: navY          },
    { x: cx,          y: navY + NAV_SP },
    { x: cx - NAV_SP, y: navY          },
  ];
  // Pre-scroll: dots float freely around the viewport; converge toward center on Qiyu hover.
  const FLOAT_PARAMS = [
    { ampX: 0,  ampY: 0,  freqX: 0.35, freqY: 0.42, phaseX: 0.0, phaseY: 1.3 }, // Qiyu — stationary
    { ampX: 28, ampY: 34, freqX: 0.40, freqY: 0.65, phaseX: 2.2, phaseY: 0.5 },
    { ampX: 32, ampY: 26, freqX: 0.58, freqY: 0.50, phaseX: 1.1, phaseY: 2.7 },
    { ampX: 24, ampY: 30, freqX: 0.46, freqY: 0.55, phaseX: 3.4, phaseY: 1.9 },
  ] as const;
  // Bases use viewport fractions so all dots stay on-screen regardless of window size.
  const floatBases = [
    { x: cx,             y: cy             }, // Qiyu — viewport center
    { x: cx + vw * 0.22, y: cy - vh * 0.20 }, // Creating — upper right
    { x: cx + vw * 0.08, y: cy + vh * 0.22 }, // Others — lower center
    { x: cx - vw * 0.24, y: cy + vh * 0.05 }, // Thinking — left
  ];
  const floatingDots = floatBases.map((base, i) => {
    const p = FLOAT_PARAMS[i];
    const t = hoveredDot === i ? hoveredFloatTimeRef.current : floatTime;
    return {
      x: base.x + Math.sin(t * p.freqX + p.phaseX) * p.ampX,
      y: base.y + Math.sin(t * p.freqY + p.phaseY) * p.ampY,
    };
  });
  // Hover convergence: freeze non-Qiyu hovered dots (they float far from center, freezing
  // prevents the feedback loop). Qiyu (dot 0) has zero float amplitude so it can safely
  // converge to clusterDots[0] (top of the diamond) without the mouse losing contact.
  const preMorphDots = floatingDots.map((fp, i) => {
    if (i === hoveredDot && i !== 0) return { x: fp.x, y: fp.y };
    return {
      x: lerp(fp.x, clusterDots[i].x, convergeT),
      y: lerp(fp.y, clusterDots[i].y, convergeT),
    };
  });

  // Two-phase scroll intro:
  //   Phase A (convergeProgress 0→1): all dots move from pre-scroll positions → cluster
  //   Phase B (expandProgress  0→1): cluster expands to crosshair endpoints
  //   Then re-cluster → header travel.
  const scrollConvergedDots = preMorphDots.map((pre, i) => ({
    x: lerp(pre.x, clusterDots[i].x, convergeProgress),
    y: lerp(pre.y, clusterDots[i].y, convergeProgress),
  }));
  const dotPositions = scrollConvergedDots.map((conv, i) => {
    const expanded = {
      x: lerp(conv.x, crosshairDots[i].x, expandProgress),
      y: lerp(conv.y, crosshairDots[i].y, expandProgress),
    };
    return {
      x: lerp(expanded.x, navDots[i].x, clusterT),
      y: lerp(expanded.y, navDots[i].y, clusterT),
    };
  });

  const dotSize = 10;
  const dotColor = 'rgb(204,110,86)';
  // Labels fade in during second half of expansion, out during re-cluster.
  const labelVis = smootherstep(clamp((expandProgress - 0.5) / 0.5, 0, 1)) * (1 - clusterT);

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
  const headerBarVis = clusterT * (1 - returnT);

  // Quadrant labels + connecting text: appear when crosshair fully forms,
  // fade out as the header nav appears (crosshairLineVis = 1 - clusterT).
  const quadLabelVis = smootherstep(clamp((expandProgress - 0.7) / 0.3, 0, 1)) * (1 - clusterT);
  // Pre-scroll floating labels for the 3 non-Qiyu dots: visible while floating, fade on scroll.
  const floatLabelVis = (1 - convergeProgress) * (1 - sectionBodyT);


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

        {/* SVG — crosshair lines drawn between actual dot positions as they expand */}
        {crosshairLineVis > 0.01 && (
          <svg style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 4, overflow: 'visible',
            opacity: crosshairLineVis,
          }}>
            <line x1={dotPositions[0].x} y1={dotPositions[0].y}
                  x2={dotPositions[2].x} y2={dotPositions[2].y}
              stroke="#c0c0bc" strokeWidth={1} />
            <line x1={dotPositions[3].x} y1={dotPositions[3].y}
                  x2={dotPositions[1].x} y2={dotPositions[1].y}
              stroke="#c0c0bc" strokeWidth={1} />
          </svg>
        )}

        {/* Dashed lines: hover Qiyu → connects to all 3; hover other → connects back to Qiyu */}
        {convergeProgress < 0.05 && hoveredDot !== null && (
          <svg style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 5, overflow: 'visible',
          }}>
            {hoveredDot === 0
              ? [1, 2, 3].map(i => (
                  <line key={i}
                    x1={dotPositions[0].x} y1={dotPositions[0].y}
                    x2={dotPositions[i].x} y2={dotPositions[i].y}
                    stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 7" opacity={0.55}
                  />
                ))
              : (
                  <line
                    x1={dotPositions[hoveredDot].x} y1={dotPositions[hoveredDot].y}
                    x2={dotPositions[0].x}          y2={dotPositions[0].y}
                    stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 7" opacity={0.55}
                  />
                )
            }
          </svg>
        )}

        {/* Pre-scroll Qiyu title — interactive: hovering it triggers convergence */}
        {convergeProgress < 0.99 && (
          <div
            style={{
              position: 'absolute',
              left: dotPositions[0].x, top: dotPositions[0].y,
              transform: 'translate(-50%, -50%)',
              opacity: (1 - convergeProgress) * (1 - sectionBodyT),
              pointerEvents: convergeProgress > 0.5 ? 'none' : 'auto',
              zIndex: 6, cursor: 'default',
            }}
            onMouseEnter={() => { hoveredFloatTimeRef.current = floatTimeRef.current; setHoveredDot(0); }}
            onMouseLeave={() => setHoveredDot(null)}
          >
            <div style={{
              position: 'absolute', right: 'calc(100% + 40px)', top: '50%',
              transform: 'translateY(-50%)',
              fontFamily: 'var(--serif)', fontWeight: 400,
              fontSize: 'clamp(40px, 6vw, 88px)', letterSpacing: '-0.03em', lineHeight: 1,
              color: 'var(--ink)', whiteSpace: 'nowrap', textAlign: 'right',
            }}>
              Qiyu
            </div>
            <div style={{
              position: 'absolute',
              left: 'calc(100% + 40px)',
              top: '50%',
              transform: 'translateY(-50%)',
              fontFamily: 'var(--font-primary)',
              fontStyle: 'italic',
              fontSize: 'clamp(17px, 1.8vw, 26px)',
              fontWeight: 400,
              letterSpacing: '0',
              lineHeight: 1.4,
              color: 'var(--ink)',
              whiteSpace: 'nowrap',
              transition: 'opacity .18s ease',
            }}>
              {hoveredDot === 0 ? 'how might I connect the dots'
               : hoveredDot === 1 ? SECTION_ACTIVITIES.collaborate
               : hoveredDot === 2 ? SECTION_ACTIVITIES.hear
               : hoveredDot === 3 ? SECTION_ACTIVITIES.experiment
               : STATUS_PHRASES[statusIdx]}
            </div>
          </div>
        )}

        {(() => {
          return ([
            { label: 'Qiyu',     dir: 'up'    as LabelDir, tint: 'var(--ink-3)' },
            { label: 'Creating', dir: 'right' as LabelDir, tint: 'var(--ink-3)' },
            { label: 'Others',   dir: 'down'  as LabelDir, tint: 'var(--ink-3)' },
            { label: 'Thinking', dir: 'left'  as LabelDir, tint: 'var(--ink-3)' },
          ] as const).map((cfg, i) => (
            <AxisDot key={cfg.label}
              x={dotPositions[i].x} y={dotPositions[i].y}
              label={cfg.label} dir={cfg.dir} tint={cfg.tint}
              dotVis={1 - sectionBodyT}
              labelVis={i === 0
                ? labelVis * (1 - sectionBodyT)
                : Math.max(floatLabelVis, labelVis * (1 - sectionBodyT))}
              labelOverride={i !== 0 ? { fontSize: 10, letterSpacing: '0.04em' } : undefined}
              dotColor={i === 0 ? dotColor : (hoveredDot === i ? dotColor : 'var(--ink-3)')}
              hoverColor={dotColor}
              hovered={hoveredDot === i}
            dotSize={dotSize}
            onClick={i === 0 && convergeProgress < 0.05
              ? () => window.scrollTo({ top: OVERVIEW_END * tourScrollPx, behavior: 'smooth' })
              : undefined}
            onMouseEnter={() => {
              hoveredFloatTimeRef.current = floatTimeRef.current;
              setHoveredDot(i);
            }}
            onMouseLeave={() => setHoveredDot(null)}
          />
          ));
        })()}


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
                fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 500, letterSpacing: 1.6,
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
              top: headerTop, bottom: Math.round(vh * 0.10),
              left: Math.max(24, headerTop), right: Math.max(24, headerTop),
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
                  fontSize: 12, letterSpacing: '0.10em', textTransform: 'uppercase',
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
                  fontFamily: 'var(--sans)', fontWeight: 400,
                  fontSize: 13, color: 'var(--ink-3)',
                  paddingLeft: 20,
                }}>
                  {sec.activity}
                </div>
              </div>

              {/* Content — fills remaining height. position:relative anchors
                  every child's position:absolute,inset:0 layout. */}
              <div style={{
                flex: 1, position: 'relative', overflow: 'hidden',
                opacity: sectionVis,
                pointerEvents: sectionVis > 0.05 ? 'auto' : 'none',
              }}>
                <SectionView
                  section={SECTION_BY_ID[activeSection]}
                  q={activeQ}
                  onNav={onNav}
                  onSectionJump={jumpToSection}
                  onReflectHover={(slug, tint) => setReflectHover({ slug, tint })}
                />
              </div>
            </div>
          );
        })()}

        {/* Experience timeline — pinned to viewport bottom, visible during reflect section */}
        {inSections && activeSection === 'reflect' && (
          <div style={{
            position: 'absolute', bottom: 40, left: headerTop, right: headerTop,
            opacity: sectionVis,
            transition: 'opacity .3s ease',
            zIndex: 10,
          }}>
            <ExperienceTimeline hoveredSlug={reflectHover.slug} tint={reflectHover.tint} />
          </div>
        )}

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
              'Staying at my desk',
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
                fontFamily: 'var(--sans)',
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
  section, q, onNav, onSectionJump, onReflectHover,
}: {
  section: typeof SECTIONS[number];
  q: Quadrant;
  onNav: NavFn;
  onSectionJump: (id: SectionId) => void;
  onReflectHover: (slug: string | null, tint: string | null) => void;
}) {
  switch (section.id) {
    case 'reflect':     return <ReflectionView q={q} onNav={onNav} onHoverSlug={onReflectHover} />;
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

// ——— Experience timeline ———
const EXPERIENCES = [
  { id: 'cornell',  name: 'Cornell',           role: 'B.S. Info Sci (UX)',         period: '17–21', slugs: ['thinking-outside-the-box'] as string[] },
  { id: 'cmu',      name: 'CMU',               role: 'M.HCI',                 period: '21–23', slugs: ['thinking-outside-the-box', 'designing-ai-products', 'how-i-use-ai-to-create'] },
  { id: 'meetfood', name: 'Meetfood',          role: 'Founding Designer',           period: '22–24', slugs: ['designing-ai-products'] },
  { id: 'ai-caring',name: 'AI Caring Inst.',         role: 'HCI Research Asst.',        period: '22–23', slugs: ['designing-ai-products', 'how-i-use-ai-to-create'] },
  { id: 'google',   name: 'Google Cloud',      role: 'UX Designer',             period: '23',    slugs: ['designing-ai-products'] },
  { id: 'archetype',name: 'Archetype AI', role: 'AI Design Fellow',         period: '24',    slugs: ['designing-ai-products'] as string[] },
  { id: 'apple',    name: 'Apple',             role: 'AI Prototyper',           period: '24–now',slugs: ['thinking-outside-the-box', 'designing-ai-products', 'how-i-use-ai-to-create'] },
];

function ExperienceTimeline({ hoveredSlug, tint }: { hoveredSlug: string | null; tint: string | null }) {
  return (
    <div style={{ paddingBottom: 28, paddingLeft: 8, paddingRight: 8, pointerEvents: 'none' }}>
      {/* Names + role rows */}
      <div style={{ display: 'flex', marginBottom: 8 }}>
        {EXPERIENCES.map((exp) => {
          const lit = hoveredSlug ? exp.slugs.includes(hoveredSlug) : null;
          return (
            <div key={exp.id} style={{
              flex: 1, textAlign: 'center',
              opacity: lit === false ? 0.3 : 1,
              transition: 'opacity .2s',
            }}>
              <div style={{
                fontFamily: 'var(--sans)', fontSize: 12, fontWeight: lit ? 500 : 400,
                letterSpacing: '0.01em',
                color: lit === true ? (tint ?? 'var(--ink)') : 'var(--ink-3)',
                transition: 'color .2s, font-weight .2s',
                whiteSpace: 'nowrap',
              }}>
                {exp.name}
              </div>
              <div style={{
                fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: '0.04em',
                color: 'var(--ink-4)', marginTop: 2,
                whiteSpace: 'nowrap',
                opacity: lit === true ? 1 : 0,
                transition: 'opacity .2s',
              }}>
                {exp.role}
              </div>
            </div>
          );
        })}
      </div>

      {/* Track + dots row */}
      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 1, background: 'var(--line)' }} />
        {EXPERIENCES.map((exp) => {
          const lit = hoveredSlug ? exp.slugs.includes(hoveredSlug) : null;
          return (
            <div key={exp.id} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: lit === true ? 10 : 6, height: lit === true ? 10 : 6,
                borderRadius: '50%',
                background: lit === true ? (tint ?? 'var(--ink)') : 'var(--bg)',
                border: `1.5px solid ${lit === true ? (tint ?? 'var(--ink)') : lit === false ? 'var(--line)' : 'var(--ink-4)'}`,
                opacity: lit === false ? 0.3 : 1,
                transition: 'all .2s ease', zIndex: 1,
              }} />
            </div>
          );
        })}
      </div>

    </div>
  );
}

// Reflection — centered statement; timeline rendered in Home's fixed canvas.
function ReflectionView({ q, onNav, onHoverSlug }: { q: Quadrant; onNav: NavFn; onHoverSlug: (slug: string | null, tint: string | null) => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <QuadrantPanel q={q} opacity={1} fade={1} onNav={onNav} onHoverSlug={onHoverSlug} />
    </div>
  );
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

      {/* Multi-section table: What if… / How might I… */}
      <div style={{
        position: 'absolute',
        top: '50%', left: 0, right: 0,
        transform: 'translateY(-50%)',
        zIndex: 1,
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        {/* Group rows by section — section header doubles as 2-col label row */}
        {(() => {
          const rows = q.items.filter(it => it.dek && it.title);
          const sections: string[] = [];
          rows.forEach(it => {
            const s = it.section ?? '';
            if (!sections.includes(s)) sections.push(s);
          });
          return sections.map((sec, si) => (
            <div key={sec}>
              {/* Section header: col 1 = section name, col 2 = "Prototype" label */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                columnGap: SPACE.xxxl,
                padding: `${si === 0 ? 0 : SPACE.xl}px 0 ${SPACE.sm}px`,
                borderBottom: '2px solid var(--line)',
              }}>
                <div style={{
                  fontFamily: 'var(--sans)', fontSize: TYPE.kicker.size,
                  fontWeight: TYPE.kicker.weight, letterSpacing: TYPE.kicker.tracking,
                  textTransform: 'uppercase', color: 'var(--ink-4)',
                }}>{sec || 'Question'}</div>
                <div style={{
                  fontFamily: 'var(--sans)', fontSize: TYPE.kicker.size,
                  fontWeight: TYPE.kicker.weight, letterSpacing: TYPE.kicker.tracking,
                  textTransform: 'uppercase', color: 'var(--ink-4)',
                }}>Prototype</div>
              </div>
              {rows.filter(it => (it.section ?? '') === sec).map((it, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  columnGap: SPACE.xxxl,
                  padding: `${SPACE.md}px 0`,
                  borderBottom: '1px solid var(--line)',
                  alignItems: 'baseline',
                }}>
                  <div style={{
                    fontFamily: 'var(--serif)', fontStyle: 'italic',
                    fontSize: 'clamp(14px, 1.15vw, 17px)',
                    lineHeight: 1.45, color: 'var(--ink-2)',
                  }}>
                    {it.dek}
                  </div>
                  <a
                    href={it.href ?? '#'}
                    onClick={handleClick(it.href ?? '#')}
                    style={{
                      fontFamily: 'var(--sans)',
                      fontSize: 'clamp(13px, 1vw, 15px)',
                      fontWeight: 500, color: 'var(--ink)',
                      textDecoration: 'none', lineHeight: 1.45,
                      transition: 'color .15s ease',
                      display: 'flex', alignItems: 'baseline',
                      justifyContent: 'space-between', gap: SPACE.sm,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--tint-tr)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink)')}
                  >
                    <span>{it.title}</span>
                    <span style={{ opacity: 0.4, fontSize: '0.85em', flexShrink: 0 }}>↗</span>
                  </a>
                </div>
              ))}
            </div>
          ));
        })()}
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
  href?: string;
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
  { id: 'initiating', label: 'Initiating Events @Apple',       pos: { x: 0.38, y: 0.27 }, href: '#article:vibe-coding-meetup-at-apple-park' },
  { id: 'strangers',  label: 'Meeting Strangers from Anywhere', pos: { x: 0.54, y: 0.52 }, href: 'https://www.linkedin.com/posts/qiyu-hu_title-doesnt-matter-qiyu-activity-7404207024164683776-rEWv' },
  { id: 'passion',    label: 'Passion',                         pos: { x: 0.22, y: 0.44 } },
  { id: 'mindset',    label: 'Mindset',                         pos: { x: 0.82, y: 0.40 } },
];
const LEARN_VALUE_LINKS: [string, string][] = [
  ['initiating', 'passion'],
  ['initiating', 'mindset'],
  ['strangers', 'passion'],
  ['strangers', 'mindset'],
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
function HearDots({ onNav }: { q?: Quadrant; onNav: NavFn }) {
  // Integrate the 2 attention items as clickable nodes in LearnQuotes
  // by adding them to LEARN_VALUES and wiring click handlers via LearnQuotes rendering
  return <LearnQuotes onNav={onNav} />;
}

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
                onClick={v.href ? (e) => clickHandler(v.href!, onNav)(e) : undefined}
                onMouseEnter={() => setHoveredId(id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  position: 'absolute', left: 0, top: 0,
                  transform: 'translate(-50%, -50%)',
                  padding: HIT_PAD,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: draggedId === id ? 'grabbing' : (v.href ? 'pointer' : 'grab'),
                }}
              >
                <span style={{
                  width: HUB_DOT, height: HUB_DOT, borderRadius: '50%',
                  background: ['initiating', 'strangers'].includes(v.id) ? 'var(--tint-bl)' : 'var(--ink)',
                  display: 'block',
                }} />
              </span>
              {/* Label — sits below the dot, centered horizontally on the anchor. */}
              <span style={{
                position: 'absolute',
                left: 0, top: HUB_DOT / 2 + 14,
                transform: 'translateX(-50%)',
                fontFamily: ['passion', 'mindset'].includes(v.id) ? 'var(--sans)' : 'var(--serif)',
                fontWeight: 400,
                fontSize: ['passion', 'mindset'].includes(v.id) ? 'clamp(11px, 1vw, 13px)' : 'clamp(16px, 1.4vw, 20px)',
                letterSpacing: ['passion', 'mindset'].includes(v.id) ? '0.06em' : '0',
                textTransform: ['passion', 'mindset'].includes(v.id) ? 'uppercase' : 'none',
                color: ['passion', 'mindset'].includes(v.id) ? 'var(--ink-3)' : 'var(--ink)',
                whiteSpace: 'nowrap',
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
                  background: 'transparent',
                  border: `1.5px solid var(--ink)`,
                  opacity: dotOpacity,
                  transform: lit === true ? 'scale(1.4)' : 'scale(1)',
                  transition: 'opacity .25s ease, transform .25s cubic-bezier(.2,.7,.2,1)',
                  boxSizing: 'border-box',
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
    tag: '0 → 1 pre PMF',
    impact: 'App launch with six business partners',
    meta: 'Meetfood · Founding Designer',
    image: '/projects/meetfood-before.png',
    hoverImage: '/projects/meetfood-after.png',
    logo: '/logos/meetfood.png',
    href: 'https://www.key-you-who.com/projects/app-launch',
  },
  {
    tag: 'Conversational AI',
    impact: 'Research-to-prototype in 4 months (SUS 86.3)',
    meta: 'Google Cloud · UX Designer',
    image: '/projects/google-cloud-product.png',
    hoverImage: '/projects/google-cloud-after.png',
    logo: '/logos/google-cloud.png',
    href: 'https://www.key-you-who.com/projects/google-cloud',
  },
  {
    tag: 'Audio AI',
    impact: 'A working call agent built in a week of prompt engineering.',
    meta: 'The Mentoring Partnership · Prototyper',
    image: '/projects/mentoring-product.png',
    hoverImage: '/projects/mentoring-after.png',
    logo: '/logos/mentoring.png',
    href: 'https://www.key-you-who.com/projects/prototyping-with-ai',
  },
  {
    tag: 'Service design',
    impact: 'Hi-fi prototypes drove real-world adoption (SUS 90.3)',
    meta: 'Automotus · Service Designer',
    image: '/projects/automotus-before.png',
    hoverImage: '/projects/automotus-after.png',
    logo: '/logos/automotus.png',
    href: 'https://www.key-you-who.com/projects/design-as-a-research-tool',
  },
  {
    tag: 'Physical AI',
    impact: 'Embedding diagnostic AI into a clinical workflow',
    meta: 'Archetype AI × Roche · UX Designer',
    image: '/projects/roche-before.png',
    hoverImage: '/projects/roche-after.png',
    logo: '/logos/archetype-roche.png',
    href: 'https://www.linkedin.com/posts/tantara_its-a-wrap-for-the-inaugural-strange-design-ugcPost-7229713649941028865-kYh4/',
  },
  {
    tag: 'HCI Research',
    impact: 'Research on trust, affiliation, language in human-AI interaction',
    meta: 'CMU & Cornell · Research Asst.',
    image: '/projects/ai-caring-product.png',
    hoverImage: null,
    logo: '/logos/ai-caring.png',
    href: null,
  },
];

function WorkGrid({ q: _q }: { q: Quadrant; onNav: NavFn }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      overflow: 'auto',
      boxSizing: 'border-box',
      paddingTop: 32,
      paddingBottom: 32,
      pointerEvents: 'auto',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        columnGap: SPACE.xxl,
        rowGap: SPACE.xxl,
        maxWidth: 960,
        margin: '0 auto',
        pointerEvents: 'auto',
        alignItems: 'start',
      }}>
        {GALLERY_ITEMS.map((item, i) => {
          const hovered = hoverIdx === i;
          const dimmed = hoverIdx !== null && !hovered;
          return (
            <div
              key={i}
              onClick={() => item.href && window.open(item.href, '_blank', 'noopener,noreferrer')}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{
                cursor: item.href ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column',
                minHeight: 0,
                opacity: dimmed ? 0.5 : 1,
                transition: 'opacity .2s ease',
              }}
            >
              {/* Image + logo overlay */}
              <div style={{ aspectRatio: '4/3', overflow: 'hidden', borderRadius: 4, position: 'relative', background: 'var(--surface)' }}>
                <img
                  src={item.image}
                  alt={item.meta}
                  style={{
                    display: 'block', width: '100%', height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'center top',
                    transform: hovered && item.href ? 'scale(1.04)' : 'scale(1)',
                    transition: 'transform .4s cubic-bezier(.2,.7,.2,1)',
                  }}
                />
                <img
                  src={item.logo}
                  alt=""
                  style={{
                    position: 'absolute', bottom: 8, left: 8,
                    width: hovered ? '35%' : '30%', height: 'auto',
                    objectFit: 'contain',
                    opacity: hovered ? 1 : 0,
                    transition: 'opacity .25s ease, width .3s cubic-bezier(.2,.7,.2,1)',
                  }}
                />
              </div>
              {/* Caption */}
              <div style={{ paddingTop: 10, flexShrink: 0 }}>
                <div style={{
                  fontFamily: 'var(--sans)', fontSize: 12,
                  letterSpacing: 1.1, textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                }}>
                  {item.tag}
                </div>
                <div style={{
                  fontFamily: 'var(--sans)', fontSize: 13, lineHeight: 1.4,
                  color: 'var(--ink-2)', marginTop: 4,
                }}>
                  {item.impact}
                </div>
                <div style={{
                  fontFamily: 'var(--sans)', fontSize: 12,
                  color: 'var(--ink-4)', marginTop: 3,
                }}>
                  {item.meta}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
