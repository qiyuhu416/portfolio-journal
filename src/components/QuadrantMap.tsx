import { useState } from 'react';
import type { NavFn } from '@/App';
import { quadrants, signals, type Quadrant, type StatementSegment } from '@/content';

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

type TeaserProps = {
  q: Quadrant;
  viewportW: number;
  viewportH: number;
  mapOpacity: number;
  onClick: () => void;
};

export function QuadrantTeaser({ q, viewportW, viewportH, mapOpacity, onClick }: TeaserProps) {
  const cornerPad = 64;
  const style: React.CSSProperties = {
    position: 'absolute',
    maxWidth: Math.min(340, viewportW * 0.3),
    opacity: mapOpacity,
  };
  if (q.pos === 'TL') Object.assign(style, { top: viewportH * 0.2, left: cornerPad });
  if (q.pos === 'TR') Object.assign(style, { top: viewportH * 0.2, right: cornerPad, textAlign: 'right' });
  if (q.pos === 'BL') Object.assign(style, { bottom: viewportH * 0.18, left: cornerPad });
  if (q.pos === 'BR') Object.assign(style, { bottom: viewportH * 0.18, right: cornerPad, textAlign: 'right' });

  return (
    <button onClick={onClick}
      style={{ ...style, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', color: 'inherit' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', color: q.tint, marginBottom: 10, visibility: 'hidden' }}>{q.axis}</div>
      <div style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, letterSpacing: -0.8, color: 'var(--ink)', lineHeight: 1.1 }}>{q.label}</div>
      <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-3)', marginTop: 4 }}>{q.sub}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.6, color: 'var(--ink-4)', marginTop: 14, textTransform: 'uppercase' }}>{q.items.length} items</div>
    </button>
  );
}

type PanelProps = {
  q: Quadrant;
  opacity: number;
  fade: number;
  onNav: NavFn;
};

function dispatchItemClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  href: string,
  onNav: NavFn,
) {
  if (href.startsWith('#article:')) { e.preventDefault(); onNav('article:' + href.slice(9)); }
  else if (href === '#signals' || href === '#loops') { e.preventDefault(); onNav(href.slice(1)); }
  else if (href === '#') { e.preventDefault(); }
}

export function QuadrantPanel({ q, opacity, fade, onNav }: PanelProps) {
  const itemsOpacity = clamp((fade - 0.05) * 2, 0, 1);
  const layout = q.layout ?? 'gallery';

  // Scatter skips the centered reading column and plots directly on the home page's
  // crosshair, so it gets its own top-level layout path.
  if (layout === 'scatter') {
    return (
      <div style={{
        position: 'absolute',
        top: 0, bottom: 0, left: 0, right: 0,
        opacity,
        pointerEvents: opacity > 0.5 ? 'auto' : 'none',
      }}>
        <ScatterLayout q={q} onNav={onNav} itemsOpacity={itemsOpacity} />
      </div>
    );
  }

  // Statement layout is a single hero sentence — no axis tag, no header, no
  // separate item list. The phrases in the sentence are the navigation.
  if (layout === 'statement') {
    return (
      <div style={{
        position: 'absolute',
        top: 0, bottom: 0, left: 0, right: 0,
        opacity,
        pointerEvents: opacity > 0.5 ? 'auto' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '60px 64px',
      }}>
        <StatementLayout q={q} onNav={onNav} itemsOpacity={itemsOpacity} />
      </div>
    );
  }

  // Narrower column for list (reading width); wider for gallery (image grid).
  const maxW = layout === 'list' ? 720 : 920;

  return (
    <div style={{
      position: 'absolute',
      top: 0, bottom: 0, left: 0, right: 0,
      padding: '20px 48px',
      opacity,
      overflowY: 'auto',
      pointerEvents: opacity > 0.5 ? 'auto' : 'none',
    }}>
      <div style={{
        maxWidth: maxW,
        margin: '0 auto',
        paddingTop: 64,
        textAlign: 'center',
      }}>
        {/* The axis-pair tag (e.g. "OTHERS · NOTICING") used to render here as
            a small mono caps line above the title, but it now lives as the
            top-of-viewport breadcrumb pill in Home — that pill plays the same
            role for every quadrant, so duplicating it inside the panel just
            put a redundant label in the path of the dashed cross line. */}
        <h2 style={{
          fontFamily: 'var(--serif)', fontWeight: 400,
          fontSize: 'clamp(32px, 3.6vw, 44px)', lineHeight: 1.02, letterSpacing: -1.2,
          margin: 0, color: 'var(--ink)', textWrap: 'balance',
        }}>
          {q.label}.
        </h2>
        <p style={{
          fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 15, lineHeight: 1.4,
          color: 'var(--ink-2)', margin: '8px auto 18px',
          maxWidth: 520,
        }}>
          {q.sub}.
        </p>

        <div style={{ textAlign: 'left' }}>
          {layout === 'list' ? (
            <ListLayout q={q} onNav={onNav} itemsOpacity={itemsOpacity} />
          ) : layout === 'quotes' ? (
            <QuotesLayout itemsOpacity={itemsOpacity} />
          ) : (
            <GalleryLayout q={q} onNav={onNav} itemsOpacity={itemsOpacity} />
          )}
        </div>
      </div>
    </div>
  );
}

type LayoutProps = { q: Quadrant; onNav: NavFn; itemsOpacity: number };

/**
 * Statement — a single hero sentence where article titles appear as colored,
 * hoverable phrases inside the prose. Mouse over a phrase to bring its color
 * forward; click opens the article modal via the standard #article:slug nav.
 *
 * Use when the quadrant's pieces share a tight thematic spine that reads better
 * as one breath than as a list — a manifesto rather than a TOC.
 */
function StatementLayout({ q, onNav, itemsOpacity }: LayoutProps) {
  if (!q.statement) return null;
  return (
    <div style={{
      opacity: itemsOpacity, transition: 'opacity .3s',
      // Responsive max-width: at wide viewports the cap is 1100px (same as
      // before); at narrow viewports the column tightens so visible gutter
      // remains on each side and the block reads as *centered* rather than
      // flush-against-the-edge. clamp's 75vw track keeps the column 75% of
      // the viewport (~12.5% gutter on each side) until 1100px takes over.
      maxWidth: 'min(1100px, 75vw)',
      // margin: 0 auto is redundant under flex-center but harmless; explicit
      // here so the block also self-centers if rendered outside a flex parent.
      margin: '0 auto',
    }}>
      {/* The italic "The mirror." label that used to render here was
          duplicating the section subheading shown at the top of the viewport
          by Home (kicker + section title). Removed to prevent the same
          label appearing twice on the same page. */}
      <p style={{
        fontFamily: 'var(--sans)', fontWeight: 500,
        fontSize: 'clamp(24px, 3.2vw, 56px)',
        lineHeight: 1.25, letterSpacing: '-0.015em',
        margin: 0,
        color: 'var(--ink)', textAlign: 'center',
        textWrap: 'balance',
      }}>
        {q.statement.map((seg, i) =>
          seg.type === 'text'
            ? <span key={i}>{seg.text}</span>
            : <PhraseButton key={i} seg={seg} onNav={onNav} />,
        )}
      </p>
    </div>
  );
}

/**
 * A clickable phrase inside a Statement. Resting state is a soft tint wash so
 * the phrase reads as part of the sentence; hover saturates to the full color
 * with reversed-out text, signalling "this is a doorway." `box-decoration-break:
 * clone` keeps the highlight rectangle clean when the phrase wraps a line.
 */
function PhraseButton({ seg, onNav }: { seg: Extract<StatementSegment, { type: 'phrase' }>; onNav: NavFn }) {
  const [hover, setHover] = useState(false);
  // Resting wash: 38% gives enough chroma that the highlight reads as a
  // colored block on parchment, not a grey redaction — calm because it's
  // still translucent, playful because the hue is unmistakable.
  const restingBg = `color-mix(in srgb, ${seg.tint} 38%, transparent)`;
  return (
    <a
      href={seg.href}
      onClick={(e) => dispatchItemClick(e, seg.href, onNav)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? seg.tint : restingBg,
        color: hover ? 'var(--bg)' : 'var(--ink)',
        textDecoration: 'none',
        cursor: 'pointer',
        // Vertical padding gives the highlight breathing room above/below the
        // text; horizontal padding stays at 0 so the highlight ends exactly
        // where the text ends — otherwise the trailing comma in the next
        // segment looks like it's floating away from the phrase.
        padding: '0.08em 0',
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
        transition: 'background .18s, color .18s',
      }}
    >
      {seg.text}
    </a>
  );
}

/**
 * Editorial list — for quadrants whose items reward a slow read rather than a quick scan.
 * Large italic serif numerals pace the rows; no images; hairline dividers.
 * Think: a literary journal's table of contents.
 */
function ListLayout({ q, onNav, itemsOpacity }: LayoutProps) {
  return (
    <div style={{
      opacity: itemsOpacity, transition: 'opacity .3s',
      borderTop: '1px solid var(--line)',
    }}>
      {q.items.map((it, i) => (
        <a key={i} href={it.href}
           onClick={(e) => dispatchItemClick(e, it.href, onNav)}
           style={{
             display: 'grid',
             gridTemplateColumns: '64px 1fr auto',
             gap: 28,
             alignItems: 'baseline',
             padding: '14px 0 12px',
             borderBottom: '1px solid var(--line)',
             textDecoration: 'none', color: 'var(--ink)', cursor: 'pointer',
             transition: 'background .2s',
           }}
           onMouseEnter={(e) => {
             e.currentTarget.style.background = 'rgba(31,30,27,0.015)';
             const arrow = e.currentTarget.querySelector('[data-list-arrow]') as HTMLElement | null;
             if (arrow) arrow.style.transform = 'translateX(4px)';
           }}
           onMouseLeave={(e) => {
             e.currentTarget.style.background = 'transparent';
             const arrow = e.currentTarget.querySelector('[data-list-arrow]') as HTMLElement | null;
             if (arrow) arrow.style.transform = 'translateX(0)';
           }}>
          <div style={{
            fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400,
            fontSize: 34, lineHeight: 0.9, letterSpacing: -1,
            color: q.tint,
          }}>
            {String(i + 1).padStart(2, '0')}
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4,
              textTransform: 'uppercase', color: q.tint, marginBottom: 6,
            }}>
              {it.tag}
            </div>
            <div style={{
              fontFamily: 'var(--serif)', fontWeight: 400,
              fontSize: 'clamp(22px, 1.9vw, 28px)', lineHeight: 1.1,
              letterSpacing: -0.6, color: 'var(--ink)', textWrap: 'balance',
            }}>
              {it.title}
            </div>
            <div style={{
              fontFamily: 'var(--serif)', fontStyle: 'italic',
              fontSize: 14, lineHeight: 1.4, color: 'var(--ink-3)',
              maxWidth: 480, marginTop: 4, textWrap: 'pretty',
            }}>
              {it.dek}
            </div>
            {it.companies && it.companies.length > 0 && (
              <div style={{
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 12, lineHeight: 1.5, color: 'var(--ink-4)',
                marginTop: 6, display: 'flex', flexWrap: 'wrap',
                alignItems: 'center', gap: 8,
              }}>
                <span>Reflecting on time at</span>
                {it.companies.map((c, ci) => (
                  <span key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {c.logo ? (
                      <img src={c.logo} alt={c.name}
                        style={{ height: 14, display: 'block', opacity: 0.7 }} />
                    ) : (
                      <span style={{
                        fontStyle: 'normal', color: 'var(--ink-3)',
                        fontFamily: 'var(--sans)', fontSize: 12,
                        letterSpacing: 0.2, fontWeight: 500,
                      }}>
                        {c.name}
                      </span>
                    )}
                    {ci < it.companies!.length - 1 && (
                      <span style={{ color: 'var(--ink-4)', opacity: 0.6 }}>·</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 12,
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.6,
            color: 'var(--ink-4)', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            <span>{it.meta}</span>
            <span data-list-arrow style={{
              color: 'var(--ink-3)', fontSize: 14, transition: 'transform .2s',
            }}>→</span>
          </div>
        </a>
      ))}
    </div>
  );
}

/**
 * Knowledge-graph cluster — each item is a circular node. Image-clipped when
 * available, soft-textured placeholder when not. Hairline connectors between
 * adjacent nodes in the same row hint at the graph; hover lifts a node and
 * reveals its dek.
 *
 * Visual logic: rows of 4 (max), with a small per-item y-jitter so nodes don't
 * sit on a strict grid line. Title/meta read below the circle, tag floats top
 * of the circle as a small mono caps ribbon.
 */
function GalleryLayout({ q, onNav, itemsOpacity }: LayoutProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const n = q.items.length;
  const cols = Math.min(4, n);
  // Deterministic vertical jitter so the row doesn't read as a strict grid.
  const yOffsets = [0, 18, -8, 12, -4, 22, 6, -14];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        columnGap: 28,
        rowGap: 56,
        opacity: itemsOpacity,
        transition: 'opacity .3s',
        position: 'relative',
        paddingTop: 12,
      }}
    >
      {q.items.map((it, i) => {
        const hovered = hoverIdx === i;
        const dimmed = hoverIdx !== null && !hovered;
        const yShift = yOffsets[i % yOffsets.length];

        return (
          <a
            key={i}
            href={it.href}
            onClick={(e) => dispatchItemClick(e, it.href, onNav)}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              textDecoration: 'none',
              color: 'var(--ink)',
              cursor: 'pointer',
              transform: `translateY(${yShift + (hovered ? -6 : 0)}px)`,
              opacity: dimmed ? 0.55 : 1,
              transition:
                'transform .25s cubic-bezier(.2,.7,.2,1), opacity .2s',
            }}
          >
            {/* Circular node */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: 180,
                aspectRatio: '1 / 1',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '1px solid var(--line)',
                background: 'var(--surface)',
                boxShadow: hovered
                  ? `0 0 0 6px color-mix(in srgb, ${q.tint} 14%, transparent), 0 14px 36px rgba(31,30,27,0.10)`
                  : '0 6px 18px rgba(31,30,27,0.06)',
                transition: 'box-shadow .25s cubic-bezier(.2,.7,.2,1)',
              }}
            >
              <div
                data-card-media
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: it.image
                    ? `url(${it.image}) center/cover no-repeat`
                    : `linear-gradient(135deg, color-mix(in srgb, ${q.tint} 26%, transparent), color-mix(in srgb, ${q.tint} 6%, transparent))`,
                  transition: 'transform .4s cubic-bezier(.2,.7,.2,1)',
                  transform: hovered ? 'scale(1.05)' : 'scale(1)',
                }}
              />
              {!it.image && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'repeating-linear-gradient(45deg, transparent 0 14px, rgba(255,255,255,0.18) 14px 15px)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>

            {/* Title block */}
            <div style={{ textAlign: 'center', maxWidth: 220 }}>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: q.tint,
                  marginBottom: 6,
                }}
              >
                {it.tag}
              </div>
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 16,
                  lineHeight: 1.2,
                  letterSpacing: -0.2,
                  color: 'var(--ink)',
                  textWrap: 'balance',
                }}
              >
                {it.title}
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  letterSpacing: 0.4,
                  color: 'var(--ink-4)',
                  marginTop: 6,
                  textTransform: 'uppercase',
                }}
              >
                {it.meta}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

/**
 * Scatter — plot the practices directly on the home page's crosshair.
 *
 * Doesn't draw its own axes or frame: the global QIYU / OTHERS / THINK / DO lines and labels
 * (rendered in Home.tsx) *are* the axes. This layout aligns its plot area to where those
 * lines sit for the active quadrant's pos, so a dot at local (x, y) lands on the real plane.
 *
 * The home crosshair sits 80px from the viewport edges that bound the active quadrant
 * (see padX/padY in Home.tsx). The parent panel starts 80px below viewport top, so we
 * match those edges in panel-relative coords below.
 */
function ScatterLayout({ q, onNav, itemsOpacity }: LayoutProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const plotItems = q.items.filter(
    (it) => typeof it.x === 'number' && typeof it.y === 'number',
  );

  // Panel-relative bounds of the plot area. The side touching the home crosshair
  // gets 80px of inset to meet the dashed line exactly; the opposite side is flush.
  // `headerReserve` keeps the quadrant's heading out of the plot region.
  const headerReserve = 140;
  const plotEdges: React.CSSProperties = (() => {
    switch (q.pos) {
      case 'TR': return { left: 80, right: 0, top: headerReserve, bottom: 80 };
      case 'TL': return { left: 0, right: 80, top: headerReserve, bottom: 80 };
      case 'BR': return { left: 80, right: 0, top: 80, bottom: headerReserve };
      case 'BL': return { left: 0, right: 80, top: 80, bottom: headerReserve };
    }
  })();

  return (
    <>
      {/* Heading block (axis tag / title / sub) is suppressed for now — the
          home page's morphing title overlay covers the quadrant title, and we
          want this layout to read as plot-only while we iterate. */}

      <div style={{
        position: 'absolute',
        ...plotEdges,
        opacity: itemsOpacity, transition: 'opacity .3s',
      }}>
        {/* Local micro-axis labels (↑ within myself / ↓ gathers a room /
            ← comfort zone / risky →) are also suppressed for now. The plot
            stands on its own without them; we can reintroduce when the rest
            of the layout settles. */}

        {hoverIdx !== null && (() => {
          const it = plotItems[hoverIdx];
          const xPct = it.x! * 100;
          const yPct = it.y! * 100;
          return (
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
              <line x1="0" y1={`${yPct}%`} x2={`${xPct}%`} y2={`${yPct}%`}
                    stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 6" />
              <line x1={`${xPct}%`} y1={`${yPct}%`} x2={`${xPct}%`} y2="100%"
                    stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 6" />
            </svg>
          );
        })()}

        {plotItems.map((it, i) => {
          const hovered = hoverIdx === i;
          const dimmed = hoverIdx !== null && !hovered;
          const isCta = it.kind === 'cta';
          const external = it.external === true;
          // Article dots grow more on hover so the longer "question" dek
          // (revealed by the swipe) has room to breathe at a smaller font
          // without overflowing the circle. CTA dots keep the modest grow
          // since their content doesn't change.
          const baseSize = 140;
          const size = hovered ? baseSize + (isCta ? 12 : 40) : baseSize;

          return (
            <a key={i} href={it.href}
               target={external ? '_blank' : undefined}
               rel={external ? 'noreferrer' : undefined}
               onClick={(e) => { if (!external) dispatchItemClick(e, it.href, onNav); }}
               onMouseEnter={() => setHoverIdx(i)}
               onMouseLeave={() => setHoverIdx(null)}
               style={{
                 position: 'absolute',
                 left: `${it.x! * 100}%`, top: `${it.y! * 100}%`,
                 width: size, height: size,
                 marginLeft: -size / 2, marginTop: -size / 2,
                 textDecoration: 'none',
                 cursor: 'pointer',
                 opacity: dimmed ? 0.55 : 1,
                 transition: 'opacity .2s, width .25s cubic-bezier(.2,.7,.2,1), height .25s cubic-bezier(.2,.7,.2,1), margin .25s cubic-bezier(.2,.7,.2,1)',
                 zIndex: hovered ? 2 : 1,
                 // The dot itself: a filled circle for articles, an outlined
                 // ring for CTA. Title text sits inside the circle, centered.
                 borderRadius: '50%',
                 background: isCta ? 'transparent' : 'var(--ink)',
                 border: isCta ? `2px solid ${q.tint as string}` : 'none',
                 boxShadow: hovered
                   ? `0 0 0 8px color-mix(in srgb, ${q.tint} 14%, transparent)`
                   : 'none',
                 display: 'flex', alignItems: 'center', justifyContent: 'center',
                 padding: 18, boxSizing: 'border-box',
                 // Clip the swiping title/dek so the upward exit + downward
                 // entrance never bleed past the circle edge.
                 overflow: 'hidden',
               }}>
              {/* Title (rest state) — swipes UP on hover. */}
              <span style={{
                position: 'absolute',
                left: 0, right: 0,
                padding: '0 18px',
                fontFamily: 'var(--sans)',
                fontWeight: 400,
                fontSize: 14, lineHeight: 1.25,
                color: isCta ? (q.tint as string) : '#fff',
                textAlign: 'center',
                textWrap: 'balance',
                pointerEvents: 'none',
                opacity: hovered && !isCta ? 0 : 1,
                transform: hovered && !isCta ? 'translateY(-14px)' : 'translateY(0)',
                transition: 'opacity .2s ease, transform .28s cubic-bezier(.2,.7,.2,1)',
              }}>
                {it.title}
                {isCta && external && (
                  <span style={{ marginLeft: 4, fontFamily: 'var(--mono)' }}>↗</span>
                )}
              </span>
              {/* Dek (the question) — swipes UP into view on hover. Italic
                  serif so the question reads as a thought, not a label. */}
              {it.dek && !isCta && (
                <span style={{
                  position: 'absolute',
                  left: 0, right: 0,
                  padding: '0 16px',
                  fontFamily: 'var(--reading)',
                  fontStyle: 'italic',
                  fontWeight: 400,
                  fontSize: 13, lineHeight: 1.32,
                  color: '#fff',
                  textAlign: 'center',
                  textWrap: 'balance',
                  pointerEvents: 'none',
                  opacity: hovered ? 1 : 0,
                  transform: hovered ? 'translateY(0)' : 'translateY(14px)',
                  transition: 'opacity .22s ease .04s, transform .3s cubic-bezier(.2,.7,.2,1) .04s',
                }}>
                  {it.dek}
                </span>
              )}
              {it.previews && it.previews.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%', left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: 18,
                  display: 'flex', gap: 8, flexWrap: 'wrap',
                  justifyContent: 'center',
                  width: 280,
                  opacity: hovered ? 1 : 0,
                  transition: 'opacity .22s',
                  pointerEvents: 'none',
                }}>
                  {it.previews.map((p, pi) => (
                    <div key={pi} style={{ width: 60, textAlign: 'center' }}>
                      <div style={{
                        width: 60, height: 44, borderRadius: 4,
                        background: p.src
                          ? `url(${p.src}) center/cover no-repeat`
                          : `linear-gradient(135deg, color-mix(in srgb, ${q.tint} 28%, transparent), color-mix(in srgb, ${q.tint} 8%, transparent))`,
                        border: '1px solid var(--line)',
                        position: 'relative', overflow: 'hidden',
                      }}>
                        {!p.src && (
                          <div style={{
                            position: 'absolute', inset: 0,
                            background: 'repeating-linear-gradient(45deg, transparent 0 6px, rgba(255,255,255,0.18) 6px 7px)',
                          }} />
                        )}
                      </div>
                      {p.label && (
                        <div style={{
                          fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.6,
                          color: 'var(--ink-4)', marginTop: 5,
                          textTransform: 'uppercase', lineHeight: 1.2,
                        }}>
                          {p.label}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </a>
          );
        })}
      </div>
    </>
  );
}

/**
 * Quotes — quotes others have said, and what they changed in me.
 * Editorial: large italic numeral, blockquote, small attribution, impact paragraph.
 * Pulled from signals.json so there's one source of truth for "what others changed."
 */
function QuotesLayout({ itemsOpacity }: { itemsOpacity: number }) {
  return (
    <div style={{
      opacity: itemsOpacity, transition: 'opacity .3s',
      borderTop: '1px solid var(--line)',
    }}>
      {signals.map((s) => (
        <div key={s.n} style={{
          display: 'grid',
          gridTemplateColumns: '64px 1fr',
          gap: 28,
          padding: '18px 0 16px',
          borderBottom: '1px solid var(--line)',
          alignItems: 'baseline',
        }}>
          <div style={{
            fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400,
            fontSize: 32, lineHeight: 0.9, letterSpacing: -0.8,
            color: s.tint,
          }}>
            {String(s.n).padStart(2, '0')}
          </div>
          <div>
            <blockquote style={{
              fontFamily: 'var(--serif)', fontWeight: 400,
              fontSize: 'clamp(18px, 1.6vw, 22px)', lineHeight: 1.22,
              letterSpacing: -0.3, margin: 0, color: 'var(--ink)',
              textWrap: 'balance',
            }}>
              &ldquo;{s.text}&rdquo;
            </blockquote>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4,
              textTransform: 'uppercase', color: 'var(--ink-4)', marginTop: 8,
            }}>
              {s.who} · {s.when}
            </div>
            <p style={{
              fontFamily: 'var(--serif)', fontStyle: 'italic',
              fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)',
              margin: '10px 0 0', maxWidth: 540, textWrap: 'pretty',
            }}>
              {s.changed}
            </p>
          </div>
        </div>
      ))}
      <div style={{
        padding: '28px 0 0',
        fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 15,
        lineHeight: 1.5, color: 'var(--ink-4)', textWrap: 'pretty',
      }}>
        More quotes forthcoming — the ones I haven&apos;t written down yet.
      </div>
    </div>
  );
}

type IconProps = { activeIdx: number; onJump: (i: number) => void };

export function InlineMapIcon({ activeIdx, onJump }: IconProps) {
  const [hover, setHover] = useState(false);
  const size = hover ? 160 : 28;
  const pad = hover ? 14 : 4;
  const cellW = (size - pad * 2) / 2;
  const cellH = (size - pad * 2) / 2;

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', width: size, height: size,
        background: hover ? 'rgba(250,248,243,0.98)' : 'transparent',
        border: hover ? '1px solid var(--line)' : 'none',
        borderRadius: 6,
        padding: pad,
        transition: 'width .25s cubic-bezier(.2,.7,.2,1), height .25s cubic-bezier(.2,.7,.2,1), padding .25s, background .2s, border .2s',
        boxShadow: hover ? '0 10px 30px rgba(31,30,27,0.08)' : 'none',
        cursor: hover ? 'default' : 'pointer',
        zIndex: hover ? 60 : 1,
        flexShrink: 0,
      }}>
      <div style={{ position: 'absolute', left: pad, right: pad, top: '50%', height: 1, background: 'var(--ink-3)' }} />
      <div style={{ position: 'absolute', top: pad, bottom: pad, left: '50%', width: 1, background: 'var(--ink-3)' }} />
      {quadrants.map((q, i) => {
        const col = (q.pos === 'TL' || q.pos === 'BL') ? 0 : 1;
        const row = (q.pos === 'TL' || q.pos === 'TR') ? 0 : 1;
        const isActive = i === activeIdx;
        return (
          <button key={q.id} onClick={(e) => { e.stopPropagation(); onJump(i); }}
            style={{
              position: 'absolute',
              left: pad + col * cellW, top: pad + row * cellH,
              width: cellW, height: cellH,
              background: 'transparent', border: 'none', padding: 0,
              cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
            }}>
            {isActive && (
              <div style={{
                position: 'absolute',
                width: hover ? 8 : 6, height: hover ? 8 : 6, borderRadius: '50%',
                background: q.tint,
                left: col === 0 ? (hover ? 6 : '50%') : 'auto',
                right: col === 1 ? (hover ? 6 : '50%') : 'auto',
                top: row === 0 ? (hover ? 6 : '50%') : 'auto',
                bottom: row === 1 ? (hover ? 6 : '50%') : 'auto',
                transform: hover ? 'none' : `translate(${col === 0 ? '-50%' : '50%'}, ${row === 0 ? '-50%' : '50%'})`,
                transition: 'all .25s',
              }} />
            )}
            {hover && (
              <div style={{
                position: 'absolute',
                left: col === 0 ? 6 : 'auto', right: col === 1 ? 6 : 'auto',
                top: row === 0 ? 20 : 'auto', bottom: row === 1 ? 8 : 'auto',
                maxWidth: cellW - 14,
                textAlign: col === 0 ? 'left' : 'right',
              }}>
                <div style={{
                  fontFamily: 'var(--serif)', fontSize: 11, lineHeight: 1.1, letterSpacing: -0.1,
                  color: isActive ? q.tint : 'var(--ink-2)',
                  fontWeight: isActive ? 500 : 400,
                }}>{q.label}</div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
