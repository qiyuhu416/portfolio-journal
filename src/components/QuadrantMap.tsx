import { useState, useRef, useEffect } from 'react';
import type { NavFn } from '@/App';
import { quadrants, signals, bySlug, type Quadrant, type StatementSegment } from '@/content';

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
      <div style={{ fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: q.tint, marginBottom: 10, visibility: 'hidden' }}>{q.axis}</div>
      <div style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, letterSpacing: -0.8, color: 'var(--ink)', lineHeight: 1.1 }}>{q.label}</div>
      <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-3)', marginTop: 4 }}>{q.sub}</div>
      <div style={{ fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 0.6, color: 'var(--ink-4)', marginTop: 14, textTransform: 'uppercase' }}>{q.items.length} items</div>
    </button>
  );
}

type PanelProps = {
  q: Quadrant;
  opacity: number;
  fade: number;
  onNav: NavFn;
  onHoverSlug?: (slug: string | null, tint: string | null) => void;
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

export function QuadrantPanel({ q, opacity, fade, onNav, onHoverSlug }: PanelProps) {
  const itemsOpacity = clamp((fade - 0.05) * 2, 0, 1);
  const layout = q.layout ?? 'gallery';

  // Scatter skips the centered reading column and plots directly on the home page's
  // crosshair, so it gets its own top-level layout path.
  if (layout === 'scatter') {
    return (
      <div style={{
        position: 'relative', height: '100%',
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
        height: '100%',
        opacity,
        pointerEvents: opacity > 0.5 ? 'auto' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 0',
      }}>
        <StatementLayout q={q} onNav={onNav} itemsOpacity={itemsOpacity} onHoverSlug={onHoverSlug} />
      </div>
    );
  }

  // Narrower column for list (reading width); wider for gallery (image grid).
  const maxW = layout === 'list' ? 720 : 920;

  return (
    <div style={{
      height: '100%',
      opacity,
      overflowY: 'auto',
      pointerEvents: opacity > 0.5 ? 'auto' : 'none',
    }}>
      <div style={{
        maxWidth: maxW,
        margin: '0 auto',
        paddingTop: 40,
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
            <QuotesLayout q={q} onNav={onNav} itemsOpacity={itemsOpacity} />
          ) : (
            <GalleryLayout q={q} onNav={onNav} itemsOpacity={itemsOpacity} />
          )}
        </div>
      </div>
    </div>
  );
}

type LayoutProps = { q: Quadrant; onNav: NavFn; itemsOpacity: number; onHoverSlug?: (slug: string | null, tint: string | null) => void };

/**
 * Statement — a single hero sentence where article titles appear as colored,
 * hoverable phrases inside the prose. Mouse over a phrase to bring its color
 * forward; click opens the article modal via the standard #article:slug nav.
 *
 * Use when the quadrant's pieces share a tight thematic spine that reads better
 * as one breath than as a list — a manifesto rather than a TOC.
 */
function StatementLayout({ q, onNav, itemsOpacity, onHoverSlug }: LayoutProps) {
  if (!q.statement) return null;
  return (
    <div style={{
      opacity: itemsOpacity, transition: 'opacity .3s',
      // Responsive max-width: at wide viewports the cap is 1100px (same as
      // before); at narrow viewports the column tightens so visible gutter
      // remains on each side and the block reads as *centered* rather than
      // flush-against-the-edge. clamp's 75vw track keeps the column 75% of
      // the viewport (~12.5% gutter on each side) until 1100px takes over.
      maxWidth: 'min(1200px, 84vw)',
      // margin: 0 auto is redundant under flex-center but harmless; explicit
      // here so the block also self-centers if rendered outside a flex parent.
      margin: '0 auto',
    }}>
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
            : <PhraseButton key={i} seg={seg} onNav={onNav} onHoverSlug={onHoverSlug} />,
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
function PhraseButton({ seg, onNav, onHoverSlug }: { seg: Extract<StatementSegment, { type: 'phrase' }>; onNav: NavFn; onHoverSlug?: (slug: string | null, tint: string | null) => void }) {
  const [hover, setHover] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const restingBg = `color-mix(in srgb, ${seg.tint} 38%, transparent)`;
  const slug = seg.href.replace('#article:', '').split(':')[0];
  const article = bySlug[slug];
  const sections = article?.meta.sections ?? [];

  useEffect(() => {
    if (hover && anchorRef.current) {
      setRect(anchorRef.current.getBoundingClientRect());
    }
  }, [hover]);

  // Clamp popover so it never overflows the right viewport edge.
  const popWidth = 260;
  const popLeft = rect
    ? Math.min(rect.left, window.innerWidth - popWidth - 16)
    : 0;
  const popTop = rect ? rect.bottom + 10 : 0;

  return (
    <>
      <a
        ref={anchorRef}
        href={seg.href}
        onClick={(e) => dispatchItemClick(e, seg.href, onNav)}
        onMouseEnter={() => { setHover(true); onHoverSlug?.(slug, seg.tint); }}
        onMouseLeave={() => { setHover(false); onHoverSlug?.(null, null); }}
        style={{
          background: hover ? seg.tint : restingBg,
          color: hover ? 'var(--bg)' : 'var(--ink)',
          textDecoration: 'none',
          cursor: 'pointer',
          padding: '0.08em 0',
          whiteSpace: 'nowrap',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
          transition: 'background .18s, color .18s',
        }}
      >
        {seg.text}
        <span aria-hidden="true" style={{ display: 'inline-block', marginLeft: '0.2em', fontSize: '0.8em', verticalAlign: 'super' }}>↗</span>
      </a>
      {/* Note popover — hidden at rest, reveals work title + TOC on hover */}
      {hover && rect && article && (
        <span
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            position: 'fixed',
            top: popTop,
            left: popLeft,
            width: popWidth,
            zIndex: 9999,
            background: 'var(--bg)',
            border: `1px solid ${seg.tint}`,
            borderRadius: 6,
            padding: '12px 16px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
            textAlign: 'left',
          }}
        >
          {/* Work title — hidden at rest, only visible when note is activated */}
          <a
            href={seg.href}
            onClick={(e) => dispatchItemClick(e, seg.href, onNav)}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 6,
              textDecoration: 'none', cursor: 'pointer',
              paddingBottom: sections.length > 0 ? 10 : 0,
              marginBottom: sections.length > 0 ? 8 : 0,
              borderBottom: sections.length > 0 ? '1px solid var(--line)' : 'none',
            }}
          >
            <span style={{
              fontFamily: 'var(--serif)', fontWeight: 400,
              fontSize: 16, lineHeight: 1.15, letterSpacing: -0.3,
              color: 'var(--ink)',
            }}>
              {article.meta.title}
            </span>
            <span style={{ color: seg.tint, fontSize: 14 }}>→</span>
          </a>
          {sections.map((s, i) => (
            <a
              key={s.id}
              href={seg.href}
              onClick={(e) => dispatchItemClick(e, `${seg.href}:${s.id}`, onNav)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '7px 0',
                borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                textDecoration: 'none', cursor: 'pointer',
                color: 'var(--ink)',
                transition: 'color .15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = seg.tint; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)'; }}
            >
              <span style={{
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 13, color: 'var(--ink-4)', flexShrink: 0,
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontFamily: 'var(--sans)', fontSize: 15, lineHeight: 1.3 }}>
                  {s.label}
                </span>
                {s.sub && (
                  <span style={{
                    fontFamily: 'var(--sans)', fontSize: 12,
                    color: 'var(--ink-4)', lineHeight: 1.3,
                    letterSpacing: '0.01em',
                  }}>
                    {s.sub}
                  </span>
                )}
              </span>
            </a>
          ))}
        </span>
      )}
    </>
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
              fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 1.4,
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
            fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 0.6,
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
                  fontFamily: 'var(--sans)',
                  fontSize: 12,
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
                  fontFamily: 'var(--sans)',
                  fontSize: 12,
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
  // Index of the dot whose previews are currently expanded inline. Only items
  // with `expandsInline: true` participate; clicking one toggles open/close
  // instead of routing to the article drawer.
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const plotItems = q.items.filter(
    (it) => typeof it.x === 'number' && typeof it.y === 'number',
  );

  // Panel-relative bounds of the plot area. The side touching the home crosshair
  // gets 80px of inset to meet the dashed line exactly; the opposite side is flush.
  // `headerReserve` keeps the quadrant's heading out of the plot region.
  const headerReserve = 40;
  const plotEdges: React.CSSProperties = (() => {
    switch (q.pos) {
      case 'TR': return { left: 40, right: 0, top: headerReserve, bottom: 40 };
      case 'TL': return { left: 0, right: 40, top: headerReserve, bottom: 40 };
      case 'BR': return { left: 40, right: 0, top: 40, bottom: headerReserve };
      case 'BL': return { left: 0, right: 40, top: 40, bottom: headerReserve };
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

        {/* OG-style card — floats to the left of a hovered CTA dot that has cardPreview */}
        {hoverIdx !== null && (() => {
          const it = plotItems[hoverIdx];
          if (!it.cardPreview) return null;
          const xPct = it.x! * 100;
          const yPct = it.y! * 100;
          const hoverSize = it.kind === 'cta' ? 140 + 12 : 140 + 40;
          return (
            <div style={{
              position: 'absolute',
              right: `calc(${100 - xPct}% + ${hoverSize / 2 + 16}px)`,
              top: `${yPct}%`,
              transform: 'translateY(-50%)',
              width: 240,
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              overflow: 'hidden',
              boxShadow: '0 8px 28px rgba(31,30,27,0.10)',
              pointerEvents: 'none',
              zIndex: 10,
            }}>
              {it.cardPreview.image ? (
                <img
                  src={it.cardPreview.image}
                  alt={it.cardPreview.title}
                  style={{ display: 'block', width: '100%', height: 'auto' }}
                />
              ) : (
                <div style={{ padding: '14px 16px' }}>
                  {it.cardPreview.platform && (
                    <div style={{
                      fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 1.4,
                      textTransform: 'uppercase', color: '#0077B5', marginBottom: 8,
                    }}>
                      {it.cardPreview.platform}
                    </div>
                  )}
                  <div style={{
                    fontFamily: 'var(--serif)', fontWeight: 400,
                    fontSize: 15, lineHeight: 1.2, letterSpacing: -0.2,
                    color: 'var(--ink)', marginBottom: 8,
                  }}>
                    {it.cardPreview.title}
                  </div>
                  <div style={{
                    fontFamily: 'var(--serif)', fontStyle: 'italic',
                    fontSize: 13, lineHeight: 1.4, color: 'var(--ink-3)',
                  }}>
                    {it.cardPreview.body}
                  </div>
                  <div style={{
                    fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 0.6,
                    color: 'var(--ink-4)', marginTop: 12, textTransform: 'uppercase',
                  }}>
                    View post ↗
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Orbital satellite circles — image-cropped circles orbiting the hovered dot.
            Each satellite is a direct child of the plot container, positioned with calc()
            so the browser never has to paint outside a zero-size ancestor. */}
        {hoverIdx !== null && (() => {
          const it = plotItems[hoverIdx];
          if (!it.previews || it.previews.length === 0 || expandedIdx === hoverIdx) return null;
          const dotHoverRadius = (it.kind === 'cta' ? 140 + 12 : 140 + 40) / 2;
          const satSize = 56;
          const satR = satSize / 2;
          const orbitR = dotHoverRadius + 14 + satR;
          const n = it.previews.length;
          const startDeg = -45;
          return it.previews.map((p, pi) => {
            const deg = n === 1 ? 0 : startDeg + pi * (360 / n);
            const rad = deg * Math.PI / 180;
            const x = orbitR * Math.cos(rad);
            const y = orbitR * Math.sin(rad);
            return (
              <div key={pi} style={{
                position: 'absolute',
                left: `calc(${it.x! * 100}% + ${x - satR}px)`,
                top: `calc(${it.y! * 100}% + ${y - satR}px)`,
                width: satSize, height: satSize,
                borderRadius: '50%',
                overflow: 'hidden',
                border: '2px solid var(--bg)',
                background: p.src
                  ? `url(${p.src}) center/cover no-repeat`
                  : `linear-gradient(135deg, color-mix(in srgb, ${q.tint} 28%, transparent), color-mix(in srgb, ${q.tint} 8%, transparent))`,
                boxShadow: '0 4px 14px rgba(31,30,27,0.14)',
                pointerEvents: 'none',
                zIndex: 3,
              }}>
                {!p.src && p.label && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--sans)', fontSize: 8, letterSpacing: 1,
                    textTransform: 'uppercase', color: 'var(--ink-4)',
                  }}>
                    {p.label}
                  </div>
                )}
              </div>
            );
          });
        })()}

        {/* Event timeline — appears when hovering a dot that has an `events` array.
            Renders a dashed x-axis near the bottom of the plot area, one circle per
            event (positioned at its date x and vertical y), and a dashed vertical
            line from each circle down to the axis.  */}
        {hoverIdx !== null && (() => {
          const it = plotItems[hoverIdx];
          if (!it.events || it.events.length === 0) return null;

          const events = it.events;
          // Date range: span from the earliest event to one month past the latest.
          const parseDate = (s: string) => {
            const [y, m] = s.split('-').map(Number);
            return y * 12 + m;
          };
          const months = events.map((e) => parseDate(e.date));
          const minM = Math.min(...months);
          const maxM = Math.max(...months) + 1;
          const dateToX = (d: string) => (parseDate(d) - minM) / (maxM - minM);

          const fmtDate = (s: string) => {
            const [y, m] = s.split('-').map(Number);
            return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          };

          // Deduplicate x-axis tick dates.
          const tickDates = [...new Set(events.map((e) => e.date))];

          // Layout constants (fraction of the plot container).
          const axisY = 0.88;       // where the dashed x-axis sits
          const plotLeft = 0.08;    // left margin for the timeline
          const plotRight = 0.92;   // right margin
          const baseR = 44;         // base circle radius in px

          return (
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4,
            }}>
              {/* Dashed x-axis */}
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
                <line
                  x1={`${plotLeft * 100}%`} y1={`${axisY * 100}%`}
                  x2={`${plotRight * 100}%`} y2={`${axisY * 100}%`}
                  stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 6"
                />
                {tickDates.map((d) => {
                  const xPct = plotLeft + dateToX(d) * (plotRight - plotLeft);
                  return (
                    <text key={d}
                      x={`${xPct * 100}%`} y={`${(axisY + 0.055) * 100}%`}
                      textAnchor="middle"
                      style={{ fontFamily: 'var(--sans)', fontSize: 12, fill: 'var(--ink-3)' }}
                    >
                      {fmtDate(d)}
                    </text>
                  );
                })}
              </svg>

              {/* Event circles + vertical drop lines */}
              {events.map((ev, ei) => {
                const xFrac = plotLeft + dateToX(ev.date) * (plotRight - plotLeft);
                // `ev.y` is 0 (near axis) → 1 (top of visible area, above axis)
                const circleFrac = axisY - (ev.y ?? 0.5) * (axisY - 0.05);
                const r = baseR * (ev.r ?? 1);
                return (
                  <div key={ei}>
                    {/* Vertical drop line from circle bottom to axis */}
                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
                      <line
                        x1={`${xFrac * 100}%`} y1={`${(circleFrac + 0.01) * 100}%`}
                        x2={`${xFrac * 100}%`} y2={`${axisY * 100}%`}
                        stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 5"
                      />
                    </svg>
                    {/* Circle */}
                    <div style={{
                      position: 'absolute',
                      left: `${xFrac * 100}%`,
                      top: `${circleFrac * 100}%`,
                      width: r * 2, height: r * 2,
                      marginLeft: -r, marginTop: -r,
                      borderRadius: '50%',
                      background: 'color-mix(in srgb, var(--ink) 18%, transparent)',
                      border: '1px solid var(--line)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 10, boxSizing: 'border-box',
                    }}>
                      {ev.name && (
                        <span style={{
                          fontFamily: 'var(--sans)', fontSize: 12, lineHeight: 1.25,
                          color: 'var(--ink-2)', textAlign: 'center',
                          textWrap: 'balance',
                        }}>
                          {ev.name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {plotItems.map((it, i) => {
          const hovered = hoverIdx === i;
          const expanded = expandedIdx === i;
          const dimmed = hoverIdx !== null && !hovered && !expanded;
          const isCta = it.kind === 'cta';
          const external = it.external === true;
          const expandsInline = it.expandsInline === true;
          // Article dots grow more on hover so the longer "question" dek
          // (revealed by the swipe) has room to breathe at a smaller font
          // without overflowing the circle. CTA dots keep the modest grow
          // since their content doesn't change. Expanded inline-gallery dots
          // grow much larger so the previews read as a proper gallery, not
          // a hover hint.
          const baseSize = 140;
          const size = expanded
            ? 320
            : hovered
              ? baseSize + (isCta ? 12 : 40)
              : baseSize;

          return (
            <a key={i} href={it.href}
               target={external ? '_blank' : undefined}
               rel={external ? 'noreferrer' : undefined}
               onClick={(e) => {
                 if (expandsInline) {
                   e.preventDefault();
                   setExpandedIdx(expanded ? null : i);
                   return;
                 }
                 if (!external) dispatchItemClick(e, it.href, onNav);
               }}
               onMouseEnter={() => setHoverIdx(i)}
               onMouseLeave={() => setHoverIdx(null)}
               style={{
                 position: 'absolute',
                 left: `${it.x! * 100}%`, top: `${it.y! * 100}%`,
                 width: size, height: size,
                 transform: 'translate(-50%, -50%)',
                 textDecoration: 'none',
                 cursor: 'pointer',
                 opacity: dimmed ? 0.55 : 1,
                 transition: 'opacity .2s, width .25s cubic-bezier(.2,.7,.2,1), height .25s cubic-bezier(.2,.7,.2,1)',
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
              {/* Title (rest state) — swipes UP on hover. Also fades fully out
                  when this dot is expanded inline so the gallery has the stage. */}
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
                opacity: expanded ? 0 : (hovered && !isCta ? 0 : 1),
                transform: hovered && !isCta ? 'translateY(-14px)' : 'translateY(0)',
                transition: 'opacity .2s ease, transform .28s cubic-bezier(.2,.7,.2,1)',
              }}>
                {it.title}
                {isCta && external && (
                  <span style={{ marginLeft: 4, fontFamily: 'var(--sans)' }}>↗</span>
                )}
              </span>
              {/* Dek (the question) — swipes UP into view on hover. Italic
                  serif so the question reads as a thought, not a label.
                  Suppressed while expanded so the gallery isn't crowded. */}
              {it.dek && !isCta && !expanded && (
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
              {/* Orbital satellites rendered as plot-container siblings below — not here. */}
              {/* Inline gallery — fills the (now-larger) circle with the
                  previews as actual images. Visible only when this dot is in
                  its expanded state. Clicking the dot again collapses it. */}
              {expandsInline && expanded && it.previews && it.previews.length > 0 && (
                <div style={{
                  position: 'absolute',
                  inset: 18,
                  display: 'grid',
                  gridTemplateColumns: it.previews.length > 1 ? '1fr 1fr' : '1fr',
                  gap: 6,
                  pointerEvents: 'none',
                }}>
                  {it.previews.map((p, pi) => (
                    <div key={pi} style={{
                      position: 'relative',
                      borderRadius: 6,
                      overflow: 'hidden',
                      background: p.src
                        ? `url(${p.src}) center/cover no-repeat`
                        : `linear-gradient(135deg, color-mix(in srgb, ${q.tint} 36%, transparent), color-mix(in srgb, ${q.tint} 10%, transparent))`,
                    }}>
                      {!p.src && (
                        <>
                          <div style={{
                            position: 'absolute', inset: 0,
                            background: 'repeating-linear-gradient(45deg, transparent 0 8px, rgba(255,255,255,0.16) 8px 9px)',
                          }} />
                          {p.label && (
                            <div style={{
                              position: 'absolute', left: 0, right: 0, bottom: 8,
                              textAlign: 'center',
                              fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 1,
                              color: '#fff', textTransform: 'uppercase',
                            }}>
                              {p.label}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Tiny close affordance — shows on the expanded dot only. */}
              {expandsInline && expanded && (
                <span style={{
                  position: 'absolute', top: 8, right: 12,
                  fontFamily: 'var(--sans)', fontSize: 14,
                  color: 'rgba(255,255,255,0.7)',
                  pointerEvents: 'none',
                }}>×</span>
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
 * When a signal has an `href` pointing to an article, hovering reveals a mini
 * article preview card — tinted with the article's own surface + tint.
 */
function QuotesLayout({ onNav, itemsOpacity }: LayoutProps) {
  const [hoveredN, setHoveredN] = useState<number | null>(null);

  return (
    <div style={{
      opacity: itemsOpacity, transition: 'opacity .3s',
      borderTop: '1px solid var(--line)',
    }}>
      {signals.map((s) => {
        const hovered = hoveredN === s.n;
        const linkedArticle = s.href?.startsWith('#article:')
          ? bySlug[s.href.slice(9)]
          : null;

        return (
          <div key={s.n}
            onMouseEnter={() => setHoveredN(s.n)}
            onMouseLeave={() => setHoveredN(null)}
            style={{
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
                fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 1.4,
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
              {linkedArticle && (
                <a
                  href={s.href}
                  onClick={(e) => { e.preventDefault(); onNav('article:' + linkedArticle.meta.slug); }}
                  style={{
                    display: 'block',
                    marginTop: 14,
                    padding: '10px 14px 12px',
                    background: linkedArticle.meta.surface,
                    borderRadius: 6,
                    border: '1px solid var(--line)',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    opacity: hovered ? 1 : 0,
                    transform: hovered ? 'translateY(0)' : 'translateY(5px)',
                    transition: 'opacity .2s ease, transform .25s cubic-bezier(.2,.7,.2,1)',
                    pointerEvents: hovered ? 'auto' : 'none',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--sans)', fontSize: 12, letterSpacing: 1.4,
                    textTransform: 'uppercase', color: linkedArticle.meta.tint,
                    marginBottom: 5,
                  }}>
                    {linkedArticle.meta.quality} · {linkedArticle.meta.readtime} min read
                  </div>
                  <div style={{
                    fontFamily: 'var(--serif)', fontWeight: 400,
                    fontSize: 16, lineHeight: 1.15, letterSpacing: -0.3,
                    color: 'var(--ink)', display: 'flex', alignItems: 'baseline', gap: 6,
                  }}>
                    {linkedArticle.meta.title}
                    <span style={{
                      display: 'inline-block',
                      transform: hovered ? 'translateX(3px)' : 'translateX(0)',
                      transition: 'transform .2s',
                      color: linkedArticle.meta.tint,
                    }}>→</span>
                  </div>
                  <div style={{
                    fontFamily: 'var(--serif)', fontStyle: 'italic',
                    fontSize: 13, lineHeight: 1.45, color: 'var(--ink-3)',
                    marginTop: 3, textWrap: 'pretty',
                  }}>
                    {linkedArticle.meta.dek}
                  </div>
                </a>
              )}
            </div>
          </div>
        );
      })}
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

// The 4 cardinal axis endpoints, in cross order: top, right, bottom, left.
// Each section activates exactly the two that bound its quadrant.
const CARDINALS = ['top', 'right', 'bottom', 'left'] as const;
type Cardinal = typeof CARDINALS[number];
const CARDINAL_LABEL: Record<Cardinal, string> = {
  top: 'Qiyu', right: 'Create', bottom: 'Others', left: 'Think',
};
// Which two cardinals are active for each quadrant position.
const POS_ACTIVE: Record<string, [Cardinal, Cardinal]> = {
  TL: ['top', 'left'],
  TR: ['top', 'right'],
  BL: ['bottom', 'left'],
  BR: ['bottom', 'right'],
};

export function InlineMapIcon({ activeIdx, onJump }: IconProps) {
  const [hover, setHover] = useState(false);

  const activeQ = quadrants[activeIdx];
  const activeCardinals: Cardinal[] = activeQ ? POS_ACTIVE[activeQ.pos] ?? [] : [];
  const isCardinalActive = (c: Cardinal) => activeCardinals.includes(c);

  // ——— Collapsed geometry ———
  // 4 dots in a tight cross, no center dot.
  // dot_r=5, arm=18 → diameter 10px, span = (arm + dot_r) * 2 = 46px.
  const C_DOT_R = 5;
  const C_ARM   = 18;
  const C_SPAN  = (C_ARM + C_DOT_R) * 2;   // 46
  const C_CX    = C_SPAN / 2;
  const C_CY    = C_SPAN / 2;

  // ——— Hover geometry ———
  // Same cross, scaled up. Labels overflow the container (overflow: visible).
  const H_ARM        = 52;
  const H_DOT_R_ACT  = 8;   // active dot radius
  const H_DOT_R_IDLE = 6;   // inactive dot radius
  const H_SPAN       = (H_ARM + H_DOT_R_ACT) * 2;
  const H_CX         = H_SPAN / 2;
  const H_CY         = H_SPAN / 2;

  const span = hover ? H_SPAN : C_SPAN;
  const cx   = hover ? H_CX  : C_CX;
  const cy   = hover ? H_CY  : C_CY;

  const dotCenter = (c: Cardinal): { x: number; y: number } => {
    const arm = hover ? H_ARM : C_ARM;
    if (c === 'top')    return { x: cx,       y: cy - arm };
    if (c === 'right')  return { x: cx + arm, y: cy       };
    if (c === 'bottom') return { x: cx,       y: cy + arm };
    return                        { x: cx - arm, y: cy       };
  };

  // Map cardinal → quadrant index for click nav (pick the nearer quadrant when
  // two share a cardinal — preference is the active one first, else index order).
  const cardinalToIdx = (c: Cardinal): number => {
    const matches = quadrants
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => (POS_ACTIVE[q.pos] ?? []).includes(c));
    const active = matches.find(({ i }) => i === activeIdx);
    return (active ?? matches[0])?.i ?? 0;
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        width: span, height: span,
        flexShrink: 0,
        cursor: 'pointer',
        zIndex: hover ? 60 : 1,
        overflow: 'visible',
        transition: 'width .3s cubic-bezier(.2,.7,.2,1), height .3s cubic-bezier(.2,.7,.2,1)',
      }}
    >
      {/* Arms — only rendered in hover state */}
      {hover && CARDINALS.map((c) => {
        const active = isCardinalActive(c);
        const dc = dotCenter(c);
        const lineStyle: React.CSSProperties = {
          position: 'absolute',
          background: active ? 'var(--ink)' : 'rgba(31,30,27,0.18)',
          transition: 'background .2s',
        };
        if (c === 'top')    return <div key={c} style={{ ...lineStyle, left: cx - 0.5, top: dc.y + H_DOT_R_ACT, width: 1, height: H_ARM - H_DOT_R_ACT }} />;
        if (c === 'right')  return <div key={c} style={{ ...lineStyle, left: cx, top: cy - 0.5, width: H_ARM - H_DOT_R_ACT, height: 1 }} />;
        if (c === 'bottom') return <div key={c} style={{ ...lineStyle, left: cx - 0.5, top: cy, width: 1, height: H_ARM - H_DOT_R_ACT }} />;
        return                      <div key={c} style={{ ...lineStyle, left: dc.x + H_DOT_R_ACT, top: cy - 0.5, width: H_ARM - H_DOT_R_ACT, height: 1 }} />;
      })}

      {/* Cardinal dots */}
      {CARDINALS.map((c) => {
        const active = hover ? isCardinalActive(c) : false;
        const r  = hover ? (active ? H_DOT_R_ACT : H_DOT_R_IDLE) : C_DOT_R;
        const dc = dotCenter(c);

        return (
          <button
            key={c}
            onClick={(e) => { e.stopPropagation(); onJump(cardinalToIdx(c)); }}
            style={{
              position: 'absolute',
              left: dc.x - r, top: dc.y - r,
              width: r * 2, height: r * 2,
              borderRadius: '50%',
              background: hover && active ? 'var(--ink)' : 'rgba(31,30,27,0.38)',
              border: 'none', padding: 0, cursor: 'pointer',
              transition: 'left .3s cubic-bezier(.2,.7,.2,1), top .3s cubic-bezier(.2,.7,.2,1), width .3s, height .3s, background .2s',
            }}
          />
        );
      })}

      {/* Labels — only active cardinals in hover state */}
      {hover && CARDINALS.filter(isCardinalActive).map((c) => {
        const dc = dotCenter(c);
        const r  = H_DOT_R_ACT;
        const labelStyle: React.CSSProperties = {
          position: 'absolute',
          fontFamily: 'var(--serif)', fontWeight: 400,
          fontSize: 'clamp(18px, 1.6vw, 26px)',
          lineHeight: 1, letterSpacing: -0.5,
          color: 'var(--ink)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        };
        if (c === 'top')   return <div key={c} style={{ ...labelStyle, left: dc.x - r, bottom: span - dc.y + r + 6 }}>{CARDINAL_LABEL[c]}</div>;
        if (c === 'right') return <div key={c} style={{ ...labelStyle, left: dc.x + r + 10, top: dc.y - r }}>{CARDINAL_LABEL[c]}</div>;
        if (c === 'bottom') return <div key={c} style={{ ...labelStyle, left: dc.x - r, top: dc.y + r + 6 }}>{CARDINAL_LABEL[c]}</div>;
        return                     <div key={c} style={{ ...labelStyle, right: span - dc.x + r + 10, top: dc.y - r }}>{CARDINAL_LABEL[c]}</div>;
      })}
    </div>
  );
}
