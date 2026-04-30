import { useEffect, useId, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useArticle } from '@/routes/ArticleContext';

type Span = 'text' | 'full' | 'bleed';

export type CollageItem = {
  /** Imported image (preferred) or string URL. Omit to render a labeled placeholder. */
  src?: string;
  /** Required — describes the image for screen readers and placeholder labels. */
  alt: string;
  /** Small caption under the image inside the expanded row. Optional. */
  caption?: string;
  /** For placeholder items: CSS aspect-ratio string, e.g. "1 / 1", "4 / 3", "3 / 4". */
  aspectRatio?: string;
};

type Layout = 'preview' | 'strip';

type Props = {
  items: CollageItem[];
  fig?: string;
  /** Short label shown next to the preview stack in collapsed state,
   *  and as the figcaption in expanded state. */
  caption?: ReactNode;
  span?: Span;
  /** If true, the collage starts expanded. Default: false (compact preview). */
  defaultExpanded?: boolean;
  /** "preview" (default): card stack that expands on click.
   *  "strip": bleeds beyond the column, all items tilted in a row, no toggling. */
  layout?: Layout;
};

const WRAPPER_BY_SPAN: Record<Span, CSSProperties> = {
  text:  { maxWidth: 680,  margin: '40px auto' },
  full:  { maxWidth: 1040, margin: '40px auto' },
  bleed: { maxWidth: 'none', margin: '48px 0' },
};

// Deterministic per-index angles — same item gets the same rotation every render.
const EXPANDED_ROTATIONS = [-4, 3, -1, 4, -3, 2, -2, 5];
const PREVIEW_ROTATIONS = [-8, 2, 6];

/**
 * Expandable moodboard. Compact by default: three preview tiles fanned out
 * like cards on a desk, beside a serif label. Click to expand into a horizontal
 * scrolling row of all items. ESC (or the Collapse button) closes.
 */
export function Collage({
  items, fig, caption, span = 'full', defaultExpanded = false, layout = 'preview',
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const article = useArticle();
  const tint = article?.tint ?? 'var(--ink-3)';
  const surface = article?.surface ?? 'var(--surface)';
  const id = useId();

  // ---------- STRIP ----------
  // Bleeds beyond the article column; renders all items as a tilted row.
  if (layout === 'strip') {
    return (
      <figure
        style={{
          // The calc() trick lets the figure escape the article-body's 680px
          // max-width by spanning the full viewport width, then re-centering.
          margin: '56px calc(50% - 50vw)',
          padding: 0,
          width: '100vw',
          maxWidth: 'none',
        }}
      >
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 32px' }}>
          <div
            style={{
              display: 'flex',
              gap: 28,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {items.map((it, i) => {
              const angle = EXPANDED_ROTATIONS[i % EXPANDED_ROTATIONS.length];
              const tile = it.src ? (
                <img
                  src={it.src}
                  alt={it.alt}
                  style={{
                    display: 'block',
                    width: '100%',
                    aspectRatio: it.aspectRatio ?? '1 / 1',
                    objectFit: 'cover',
                    borderRadius: 6,
                    boxShadow: '0 10px 28px rgba(31,30,27,0.10)',
                    background: surface,
                  }}
                />
              ) : (
                <div
                  role="img"
                  aria-label={it.alt}
                  style={{
                    width: '100%',
                    aspectRatio: it.aspectRatio ?? '1 / 1',
                    background: surface,
                    borderRadius: 6,
                    boxShadow: '0 10px 28px rgba(31,30,27,0.10)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background:
                        'repeating-linear-gradient(45deg, transparent 0 14px, rgba(255,255,255,0.18) 14px 15px)',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 8,
                      textAlign: 'center',
                      fontFamily: 'var(--mono)',
                      fontSize: 9,
                      letterSpacing: 0.4,
                      color: tint,
                      opacity: 0.8,
                      textTransform: 'uppercase',
                    }}
                  >
                    {it.alt}
                  </div>
                </div>
              );
              return (
                <div
                  key={i}
                  style={{
                    flex: '1 1 0',
                    minWidth: 0,
                    transform: `rotate(${angle}deg)`,
                    transition: 'transform .3s cubic-bezier(.2,.7,.2,1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'rotate(0deg) scale(1.04)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = `rotate(${angle}deg) scale(1)`;
                  }}
                >
                  {tile}
                </div>
              );
            })}
          </div>

          {(caption || fig) && (
            <figcaption
              style={{
                marginTop: 32,
                textAlign: 'center',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                letterSpacing: 0.3,
                color: 'var(--ink-3)',
              }}
            >
              {fig && <>Fig. {fig} · </>}
              {caption}
            </figcaption>
          )}
        </div>
      </figure>
    );
  }

  // ESC collapses
  useEffect(() => {
    if (!expanded) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [expanded]);

  // Render one tile at a given height. Images size to their natural aspect;
  // placeholders use the aspectRatio on the item (default 1:1).
  const renderTile = (it: CollageItem, sizeHeight: number) => (
    it.src ? (
      <img
        src={it.src}
        alt={it.alt}
        style={{
          display: 'block',
          height: sizeHeight, width: 'auto',
          borderRadius: 4,
          boxShadow: '0 8px 24px rgba(31,30,27,0.08)',
        }}
      />
    ) : (
      <div
        role="img"
        aria-label={it.alt}
        style={{
          height: sizeHeight,
          aspectRatio: it.aspectRatio ?? '1 / 1',
          background: surface,
          borderRadius: 4,
          boxShadow: '0 8px 24px rgba(31,30,27,0.08)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0,
          background: 'repeating-linear-gradient(45deg, transparent 0 14px, rgba(255,255,255,0.18) 14px 15px)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 8, textAlign: 'center',
          fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.4,
          color: tint, opacity: 0.8, textTransform: 'uppercase',
        }}>
          {it.alt}
        </div>
      </div>
    )
  );

  // ---------- COLLAPSED ----------
  if (!expanded) {
    const previewItems = items.slice(0, 3);
    return (
      <figure style={{ ...WRAPPER_BY_SPAN[span], padding: '0 32px' }}>
        <button
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-controls={id}
          style={{
            display: 'flex', alignItems: 'center', gap: 28,
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', color: 'inherit', textAlign: 'left',
            padding: '10px 0',
            width: '100%',
            transition: 'opacity .2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          {/* Preview stack — 3 tiles fanned out like cards on a desk */}
          <div style={{
            position: 'relative',
            width: 150, height: 110, flexShrink: 0,
          }}>
            {previewItems.map((it, i) => (
              <div key={i}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: i * 30,
                  transform: `rotate(${PREVIEW_ROTATIONS[i]}deg)`,
                  zIndex: i,
                }}
              >
                {renderTile(it, 90)}
              </div>
            ))}
          </div>

          {/* Label */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {caption && (
              <div style={{
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 18, lineHeight: 1.35,
                color: 'var(--ink)',
              }}>
                {caption}
              </div>
            )}
            <div style={{
              marginTop: caption ? 6 : 0,
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
              textTransform: 'uppercase', color: tint,
            }}>
              {fig && <>Fig. {fig} · </>}{items.length} photos · see all →
            </div>
          </div>
        </button>
      </figure>
    );
  }

  // ---------- EXPANDED ----------
  return (
    <figure id={id} style={{ ...WRAPPER_BY_SPAN[span], padding: 0 }}>
      {/* Header: caption + collapse button */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', marginBottom: 14,
      }}>
        <figcaption style={{
          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', letterSpacing: 0.3,
          margin: 0,
        }}>
          {fig && <>Fig. {fig} · </>}{caption}
        </figcaption>
        <button
          onClick={() => setExpanded(false)}
          aria-label="Collapse"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 11px', borderRadius: 999,
            background: 'transparent', border: '1px solid var(--line)',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)',
            letterSpacing: 0.8, textTransform: 'uppercase',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(31,30,27,0.04)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span>×</span><span>Collapse</span>
        </button>
      </div>

      {/* Horizontal scrolling row */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 24,
        padding: '20px 32px 28px',
        overflowX: 'auto',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
      }}>
        {items.map((it, i) => {
          const angle = EXPANDED_ROTATIONS[i % EXPANDED_ROTATIONS.length];
          return (
            <div key={i} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
              <div style={{
                transform: `rotate(${angle}deg)`,
                transition: 'transform .3s cubic-bezier(.2,.7,.2,1)',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'rotate(0deg) scale(1.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = `rotate(${angle}deg) scale(1)`; }}
              >
                {renderTile(it, 260)}
              </div>
              {it.caption && (
                <div style={{
                  marginTop: 12,
                  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.4,
                  color: 'var(--ink-4)', textAlign: 'center',
                  textTransform: 'uppercase',
                }}>
                  {it.caption}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </figure>
  );
}
