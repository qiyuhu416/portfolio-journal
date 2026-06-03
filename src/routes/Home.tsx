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
// ——— Phase boundaries ———
// Scroll journey:
//   Unfill   (0 → BOX_UNFILL_END):   box fill fades; dots appear outside border
//   Morph    (BOX_UNFILL_END → BOX_MORPH_END):  4 borders collapse to crosshair
//   Overview (BOX_MORPH_END → OVERVIEW_END):    crosshair + quadrant labels visible
//   Cluster  (OVERVIEW_END → CLUSTER_END):      dots fly to 4-dot nav icon at center
//   Header   (CLUSTER_END → HEADER_END):        nav icon travels to header strip
//   Sections (HEADER_END → SECTIONS_END):       four section pages
const BOX_UNFILL_END = 0.10;
const BOX_MORPH_END  = 0.26;
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
  { id: 'reflect',     title: 'to reflect',     axisPair: ['Qiyu',   'Thinking'], persona: 'Qiyu', activity: 'thinking who I am…',        activeDots: ['qiyu', 'think'],  cell: 'TL', tint: 'var(--tint-tl)' },
  { id: 'experiment',  title: 'to experiment',  axisPair: ['Qiyu',   'Creating'], persona: 'Qiyu', activity: 'making things happen…',      activeDots: ['qiyu', 'create'], cell: 'TR', tint: 'var(--tint-tr)' },
  { id: 'hear',        title: 'to hear',        axisPair: ['Others', 'Thinking'], persona: 'Qiyu', activity: 'hearing what others say…',   activeDots: ['other', 'think'], cell: 'BL', tint: 'var(--tint-bl)' },
  { id: 'collaborate', title: 'to collaborate', axisPair: ['Others', 'Creating'], persona: 'Qiyu', activity: 'creating with others…',      activeDots: ['other', 'create'], cell: 'BR', tint: 'var(--tint-br)' },
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
// CORNER_CX=50 preserved for CreateScatter's axis projection math.
const CORNER_CX = 50;

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
const QUAD_LABELS: { cell: 'TL' | 'TR' | 'BL' | 'BR'; text: string }[] = [
  { cell: 'TL', text: 'The mirror.' },
  { cell: 'TR', text: 'The practice.' },
  { cell: 'BL', text: 'Paying attention.' },
  { cell: 'BR', text: 'The work.' },
];

// ——— AxisDot ———
// One of the 4 dots sitting at a box midpoint, which become the crosshair
// axis labels. The dot is visible as soon as the box fill fades; the label
// fades in as the crosshair forms.
type LabelDir = 'up' | 'right' | 'down' | 'left';
function AxisDot({
  x, y, label, dir, tint = 'var(--ink-3)', dotVis, labelVis,
  dotSize = 7, dotColor = 'var(--ink)',
}: {
  x: number; y: number; label: string; dir: LabelDir; tint?: string;
  dotVis: number; labelVis: number; dotSize?: number; dotColor?: string;
}) {
  const gap = 14;
  const labelStyle: React.CSSProperties = {
    position: 'absolute',
    fontFamily: 'var(--sans)',
    fontSize: 11,
    letterSpacing: '0.02em',
    color: tint,
    whiteSpace: 'nowrap',
    opacity: labelVis,
    pointerEvents: 'none',
  };
  let offset: React.CSSProperties = {};
  if (dir === 'up')    offset = { bottom: '100%', left: '50%', transform: 'translateX(-50%)', paddingBottom: gap };
  if (dir === 'down')  offset = { top: '100%',    left: '50%', transform: 'translateX(-50%)', paddingTop: gap };
  if (dir === 'left')  offset = { right: '100%',  top: '50%',  transform: 'translateY(-50%)', paddingRight: gap, textAlign: 'right' };
  if (dir === 'right') offset = { left: '100%',   top: '50%',  transform: 'translateY(-50%)', paddingLeft: gap };

  return (
    <div style={{
      position: 'absolute',
      left: x, top: y,
      transform: 'translate(-50%, -50%)',
      zIndex: 6,
      pointerEvents: 'none',
    }}>
      <div style={{
        width: dotSize, height: dotSize, borderRadius: '50%',
        background: dotColor,
        opacity: dotVis,
        transition: 'none',
      }} />
      <div style={{ ...labelStyle, ...offset }}>
        {label}
      </div>
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
  const rawScrollRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSettlingRef = useRef(false);

  useEffect(() => {
    const onResize = () => {
      setViewportW(window.innerWidth);
      setViewportH(window.innerHeight);
    };

    const EASE_RANGE = 0.018;
    const SETTLE_ANCHORS = [
      0,
      BOX_UNFILL_END,
      BOX_MORPH_END,
      OVERVIEW_END,
      CLUSTER_END,
      HEADER_END,
      ...Object.values(SECTION_RANGES).flatMap(([lo, hi]) => [
        lo + EASE_RANGE,
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

  const vw = viewportW, vh = viewportH;
  const tourScrollPx = vh * 6;
  const driverHeight = tourScrollPx + vh * 1.5;
  const progress = clamp(smoothScrollY / tourScrollPx, 0, 1);

  // Box geometry — centered, 36% of the shorter viewport dimension.
  const cx = vw / 2, cy = vh / 2;
  const boxSize = Math.min(vw, vh) * 0.36;
  const half = boxSize / 2;
  const boxX = cx - half, boxY = cy - half;

  // Phase progress (smootherstepped — zero first+second derivative at endpoints
  // means no acceleration spikes when the user scrolls through a phase boundary).
  const boxFillT = smootherstep(clamp(progress / BOX_UNFILL_END, 0, 1));
  const morphT   = smootherstep(clamp(
    (progress - BOX_UNFILL_END) / (BOX_MORPH_END - BOX_UNFILL_END), 0, 1,
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
  // Each of the 4 box sides is a separate line that slides toward center.
  // Top + bottom: horizontal lines moving vertically to y=cy → merge into
  //   the horizontal axis, which connects Noticing ↔ Making.
  // Left + right: vertical lines moving horizontally to x=cx → merge into
  //   the vertical axis, which connects Qiyu ↔ Others.
  const topY    = lerp(cy - half, cy, morphT);
  const bottomY = lerp(cy + half, cy, morphT);
  const leftX   = lerp(cx - half, cx, morphT);
  const rightX  = lerp(cx + half, cx, morphT);

  // ── Dot positions ─────────────────────────────────────────────────────────
  // Phase 1 (morph): outside box → crosshair endpoints.
  const morphDots = [
    { x: cx,              y: lerp(cy - half - DOT_GAP, cy - half, morphT) }, // top  (Qiyu)
    { x: lerp(cx + half + DOT_GAP, cx + half, morphT), y: cy              }, // right (Making)
    { x: cx,              y: lerp(cy + half + DOT_GAP, cy + half, morphT) }, // bottom (Others)
    { x: lerp(cx - half - DOT_GAP, cx - half, morphT), y: cy              }, // left (Noticing)
  ];

  // Phase 2 (cluster): fly to cross nav icon at viewport center.
  // Phase 3 (header): nav icon slides to header strip as a rigid unit —
  // no size or shape change, just translation. NAV_SP = C_ARM in
  // InlineMapIcon so the handoff at HEADER_END is seamless.
  const NAV_SP  = 18; // matches InlineMapIcon C_ARM
  const navY    = lerp(cy, HEADER_H / 2, headerT);
  // Cross layout: top / right / bottom / left — same geometry as InlineMapIcon.
  const navDots = [
    { x: cx,          y: navY - NAV_SP }, // top    (Qiyu)
    { x: cx + NAV_SP, y: navY          }, // right  (Making)
    { x: cx,          y: navY + NAV_SP }, // bottom (Others)
    { x: cx - NAV_SP, y: navY          }, // left   (Noticing)
  ];

  // Composite: morph phase → cluster/header phases.
  const dotPositions = morphDots.map((mp, i) => ({
    x: lerp(mp.x, navDots[i].x, clusterT),
    y: lerp(mp.y, navDots[i].y, clusterT),
  }));

  // Dot size: 7px at crosshair → 10px when cluster forms. Holds at 10px
  // through the header slide (rigid translation, no size change).
  const dotSize  = lerp(7, 10, clusterT);
  // Dot color: ink → ink-3 as cluster forms. Stays grey in header.
  const dotColor = `rgb(${Math.round(lerp(26, 128, clusterT))},${
    Math.round(lerp(24, 122, clusterT))},${
    Math.round(lerp(20, 110, clusterT))})`;

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
  const quadLabelVis      = smootherstep(clamp((morphT - 0.7) / 0.3, 0, 1)) * crosshairLineVis;
  const connectingTextVis = smootherstep(clamp((morphT - 0.8) / 0.2, 0, 1)) * crosshairLineVis;

  // Scroll hint — visible only at the very start.
  const scrollHintVis = clamp(1 - progress / 0.04, 0, 1);

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
            fontFamily: 'var(--serif)', fontWeight: 600,
            fontSize: 'clamp(18px, 2.2vw, 32px)',
            letterSpacing: '-0.02em', lineHeight: 1.2,
            textAlign: 'center', margin: 0,
            padding: `0 ${SPACE.xl}px`,
            opacity: Math.max(0, 1 - boxFillT * 2.5),
          }}>
            Think outside the box
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
          {/* Box fill — fades as boxFillT → 1 */}
          <rect x={boxX} y={boxY} width={boxSize} height={boxSize}
            fill="var(--ink)" opacity={1 - boxFillT} />
          {/* Top border — slides down from cy-half to cy */}
          <line x1={cx - half} y1={topY} x2={cx + half} y2={topY}
            stroke="var(--ink)" strokeWidth={1.5} />
          {/* Bottom border — slides up from cy+half to cy */}
          <line x1={cx - half} y1={bottomY} x2={cx + half} y2={bottomY}
            stroke="var(--ink)" strokeWidth={1.5} />
          {/* Left border — slides right from cx-half to cx */}
          <line x1={leftX} y1={cy - half} x2={leftX} y2={cy + half}
            stroke="var(--ink)" strokeWidth={1.5} />
          {/* Right border — slides left from cx+half to cx */}
          <line x1={rightX} y1={cy - half} x2={rightX} y2={cy + half}
            stroke="var(--ink)" strokeWidth={1.5} />
        </svg>

        {/* Axis dots — present from the start, outside the border by DOT_GAP.
            Converge inward to border midpoints as the sides collapse (morphT).
            Labels visible immediately; they're part of the "outside the box"
            state that gives the viewer the conceptual key before the morph. */}
        {([
          { label: 'Qiyu',     dir: 'up'    as LabelDir, tint: 'var(--tint-tl)' },
          { label: 'Making',   dir: 'right' as LabelDir, tint: 'var(--tint-tr)' },
          { label: 'Others',   dir: 'down'  as LabelDir, tint: 'var(--tint-bl)' },
          { label: 'Noticing', dir: 'left'  as LabelDir, tint: 'var(--tint-tl)' },
        ] as const).map((cfg, i) => (
          <AxisDot key={cfg.label}
            x={dotPositions[i].x} y={dotPositions[i].y}
            label={cfg.label} dir={cfg.dir} tint={cfg.tint}
            dotVis={1} labelVis={crosshairLineVis}
            dotSize={dotSize} dotColor={dotColor}
          />
        ))}

        {/* Quadrant labels — centered within the outer space of each quadrant.
            Each quadrant's outer space is the region between the axis endpoint
            and the viewport edge. Centering there keeps labels clearly "in"
            their quadrant without crowding the axis lines. */}
        {quadLabelVis > 0 && QUAD_LABELS.map((ql) => {
          const col = ql.cell[1] === 'L' ? 0 : 1;
          const row = ql.cell[0] === 'T' ? 0 : 1;
          const sec  = SECTIONS.find((s) => s.cell === ql.cell);
          const tint = sec?.tint ?? 'var(--ink-3)';

          // Center of each outer quadrant space.
          // Col 0 (left): outer x-range is [0, cx−half]  → center at (cx−half)/2
          // Col 1 (right): outer x-range is [cx+half, vw] → center at cx+half+(vw−cx−half)/2
          // Row 0 (top):  outer y-range is [0, cy−half]
          // Row 1 (bottom): outer y-range is [cy+half, vh]
          const midX = col === 0
            ? (cx - half) / 2
            : cx + half + (vw - cx - half) / 2;
          const midY = row === 0
            ? (cy - half) / 2
            : cy + half + (vh - cy - half) / 2;

          return (
            <div key={ql.cell} style={{
              position: 'absolute',
              left: midX, top: midY,
              transform: 'translate(-50%, -50%)',
              opacity: quadLabelVis,
              pointerEvents: 'none', zIndex: 7,
              textAlign: 'center',
              width: Math.min(cx - half - SPACE.lg * 2, 220),
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
                fontFamily: 'var(--mono)',
                fontSize: 9, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: tint,
                marginTop: SPACE.sm,
                lineHeight: 1.6,
              }}>
                {sec?.axisPair[0]}<br />
                <span style={{ opacity: 0.7 }}>×</span> {sec?.axisPair[1]}
              </div>
            </div>
          );
        })}

        {/* "through connecting the dots…" — between horizontal axis and
            bottom dot; well clear of the BL/BR quadrant labels. */}
        {connectingTextVis > 0 && (
          <div style={{
            position: 'absolute',
            top: cy + half * 0.45,
            left: '50%', transform: 'translateX(-50%)',
            opacity: connectingTextVis,
            fontFamily: 'var(--serif)', fontStyle: 'italic',
            fontSize: 'clamp(13px, 1.1vw, 16px)',
            color: 'var(--ink-4)', whiteSpace: 'nowrap',
            pointerEvents: 'none', zIndex: 7,
          }}>
            through connecting the dots…
          </div>
        )}

        {/* Section panels — sit below the header bar */}
        {sectionVis > 0 && (
          <div style={{
            position: 'absolute', top: HEADER_H, left: 0, right: 0, bottom: 0,
            opacity: sectionVis, zIndex: 10,
          }}>
            <SectionView
              section={SECTION_BY_ID[activeSection]}
              q={activeQ}
              onNav={onNav}
              onSectionJump={jumpToSection}
            />
          </div>
        )}

        {/* Header bar — the 4 dots animate into place at the center here.
            The dots are rendered by AxisDot (at their dotPositions), so the
            bar just provides the background strip and section label. */}
        {headerBarVis > 0 && (() => {
          const sec = SECTION_BY_ID[activeSection];
          // Which two cardinal positions are active for the current section.
          const activeCells: Record<SectionId, ['top'|'right'|'bottom'|'left', 'top'|'right'|'bottom'|'left']> = {
            reflect:     ['top', 'left'],
            experiment:  ['top', 'right'],
            hear:        ['bottom', 'left'],
            collaborate: ['bottom', 'right'],
          };
          const active = activeCells[activeSection];
          const isActive = (c: 'top'|'right'|'bottom'|'left') => active.includes(c);
          const navIdxFor = (c: 'top'|'right'|'bottom'|'left') => {
            const map = { top: 'reflect', right: 'experiment', bottom: 'hear', left: 'collaborate' } as const;
            // Jump to the section that activates this cardinal AND is adjacent to current.
            const all = (['top','right','bottom','left'] as const)
              .flatMap(c2 => activeCells[map[c]])
              .includes(c as never);
            // Simple: jump to the section whose activeCells include this cardinal.
            const match = (Object.keys(activeCells) as SectionId[]).find(id =>
              activeCells[id].includes(c),
            );
            return match;
          };
          // Cross geometry constants (must match nav dot positions).
          const NAV_R = 5; const NAV_ARM = 18;
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
              position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_H,
              opacity: headerBarVis, zIndex: 15,
              borderBottom: sectionVis > 0.05 ? '1px solid var(--line)' : 'none',
              pointerEvents: 'none',
            }}>
              {/* Axis pair — left, 160px from edge */}
              <div style={{
                position: 'absolute', left: 160,
                top: '50%', transform: 'translateY(-50%)',
                opacity: navOpacity,
                fontFamily: 'var(--sans)', fontWeight: 500,
                fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: sec.tint,
              }}>
                {sec.axisPair[0]} × {sec.axisPair[1]}
              </div>

              {/* Center nav cross — active dots dark, inactive grey */}
              <div style={{
                position: 'absolute', left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                opacity: navOpacity,
                pointerEvents: 'auto',
                width: (NAV_ARM + NAV_R) * 2,
                height: (NAV_ARM + NAV_R) * 2,
              }}>
                {cardinals.map((c) => {
                  const dp = DOT_POS[c];
                  const active = isActive(c);
                  const cx = NAV_ARM + NAV_R + dp.x;
                  const cy = NAV_ARM + NAV_R + dp.y;
                  const targetId = navIdxFor(c);
                  return (
                    <div
                      key={c}
                      onClick={() => targetId && jumpToSection(targetId)}
                      style={{
                        position: 'absolute',
                        left: cx - NAV_R, top: cy - NAV_R,
                        width: NAV_R * 2, height: NAV_R * 2,
                        borderRadius: '50%',
                        background: active ? 'var(--ink)' : 'rgba(31,30,27,0.35)',
                        cursor: 'pointer',
                      }}
                    />
                  );
                })}
              </div>

              {/* Activity description — right, 160px from edge */}
              <div style={{
                position: 'absolute', right: 160,
                top: '50%', transform: 'translateY(-50%)',
                opacity: navOpacity,
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 13, color: 'var(--ink-3)',
              }}>
                {sec.activity}
              </div>
            </div>
          );
        })()}

        {/* Scroll hint — visible only at the very start */}
        {scrollHintVis > 0 && (
          <div style={{
            position: 'absolute', bottom: SPACE.xl, left: '50%',
            transform: 'translateX(-50%)',
            opacity: scrollHintVis,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE.sm,
            fontFamily: 'var(--sans)',
            fontSize: TYPE.kicker.size, fontWeight: TYPE.kicker.weight,
            letterSpacing: TYPE.kicker.tracking, textTransform: 'uppercase',
            color: 'var(--ink-3)', pointerEvents: 'none', zIndex: 40,
          }}>
            <span>scroll to explore</span>
            <span style={{
              width: 1, height: 20, background: 'var(--ink-4)',
              animation: 'scrollHint 1.8s ease-in-out infinite',
            }} />
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
  const inset = { top: 88, right: 160, bottom: 160, left: 160 };

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
      padding: `88px 160px 160px`,
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
    image: '/projects/meetfood-before.png',
    hoverImage: '/projects/meetfood-after.png',
    logo: '/logos/meetfood.png',
    href: 'https://www.key-you-who.com/projects/app-launch',
  },
  {
    tag: 'GenAI',
    impact: 'Research-to-prototype in 4 months (SUS 86.3)',
    meta: 'Google Cloud · UX · 4mo',
    image: '/projects/google-cloud-product.png',
    hoverImage: '/projects/google-cloud-after.png',
    logo: '/logos/google-cloud.png',
    href: 'https://www.key-you-who.com/projects/google-cloud',
  },
  {
    tag: 'Conversational AI',
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
    tag: 'Research',
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
      padding: `88px 160px 160px`,
      boxSizing: 'border-box',
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        columnGap: SPACE.xl,
        rowGap: 0,
        maxWidth: 900,
        margin: '0 auto',
        pointerEvents: 'auto',
        alignItems: 'start',
      }}>
        {GALLERY_ITEMS.map((item, i) => {
          // Per-item vertical scatter — each card gets its own offset so the
          // grid feels like objects dropped on a surface rather than a table.
          const itemOffsets = [0, 60, 30, 80, 20, 50];
          return (
            <div
              key={i}
              onClick={() => item.href && window.open(item.href, '_blank', 'noopener,noreferrer')}
              style={{
                cursor: item.href ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column',
                paddingTop: itemOffsets[i] ?? 0,
                minHeight: 0,
              }}
              onMouseEnter={(e) => {
                const imgs = e.currentTarget.querySelectorAll('img');
                const product = imgs[0] as HTMLImageElement | undefined;
                const logo = imgs[1] as HTMLImageElement | undefined;
                if (product) {
                  if (item.hoverImage) product.src = item.hoverImage;
                  if (item.href) product.style.transform = 'scale(1.04)';
                }
                if (logo) { logo.style.filter = 'grayscale(0)'; logo.style.opacity = '1'; logo.style.transform = 'scale(1.2)'; }
              }}
              onMouseLeave={(e) => {
                const imgs = e.currentTarget.querySelectorAll('img');
                const product = imgs[0] as HTMLImageElement | undefined;
                const logo = imgs[1] as HTMLImageElement | undefined;
                if (product) {
                  if (item.hoverImage) product.src = item.image;
                  product.style.transform = 'scale(1)';
                }
                if (logo) { logo.style.filter = 'grayscale(1)'; logo.style.opacity = '0.4'; logo.style.transform = 'scale(1)'; }
              }}
            >
              <div style={{ height: 220, overflow: 'hidden', borderRadius: 4 }}>
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
