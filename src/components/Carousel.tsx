import { useEffect, useRef, useState } from 'react';
import { useArticle } from '@/routes/ArticleContext';

type Item = {
  src?: string;
  alt: string;
  caption?: string;
};

type Props = {
  items: Item[];
  fig?: string;
  caption?: string;
  /** How many tiles visible at once. Default 2. */
  perView?: number;
};

const GAP = 16;

/**
 * Direct-show photo carousel. No collapsed preview — renders the strip
 * immediately, with prev/next controls + page dots. Each tile takes
 * (1/perView) of the container width minus gap.
 */
export function Carousel({ items, fig, caption, perView = 2 }: Props) {
  const article = useArticle();
  const tint = article?.tint ?? 'var(--ink-3)';
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, items.length - perView + 1);

  const scrollToPage = (p: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(pageCount - 1, p));
    const tileWidth = (track.clientWidth - (perView - 1) * GAP) / perView;
    track.scrollTo({ left: clamped * (tileWidth + GAP), behavior: 'smooth' });
    setPage(clamped);
  };

  // Sync page state with manual scroll/swipe.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const tileWidth = (track.clientWidth - (perView - 1) * GAP) / perView;
        const next = Math.round(track.scrollLeft / (tileWidth + GAP));
        setPage(Math.max(0, Math.min(pageCount - 1, next)));
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [perView, pageCount]);

  const arrowBase = {
    position: 'absolute' as const,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 36, height: 36,
    borderRadius: 18,
    background: 'transparent',
    border: '1px solid var(--line)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--mono)',
    fontSize: 14,
    color: 'var(--ink-2)',
    zIndex: 2,
    transition: 'background .15s, color .15s, border-color .15s',
  };

  return (
    <figure style={{ maxWidth: 920, margin: '40px auto', padding: '0 32px' }}>
      {/* Outer relative container with horizontal gutters reserved for the
          arrows, so they sit fully outside the image strip rather than
          overlapping it. */}
      <div style={{ position: 'relative', padding: '0 56px' }}>
        <div
          ref={trackRef}
          style={{
            display: 'flex',
            gap: GAP,
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 4,
          }}
        >
          <style>{`figure[data-carousel] [data-carousel-track]::-webkit-scrollbar{display:none}`}</style>
          {items.map((it, i) => (
            <div
              key={i}
              style={{
                flex: `0 0 calc((100% - ${(perView - 1) * GAP}px) / ${perView})`,
                scrollSnapAlign: 'start',
              }}
            >
              {it.src ? (
                <img
                  src={it.src}
                  alt={it.alt}
                  style={{
                    display: 'block',
                    width: '100%',
                    aspectRatio: '4 / 5',
                    objectFit: 'cover',
                    borderRadius: 8,
                    background: 'var(--surface)',
                  }}
                />
              ) : (
                <div
                  role="img"
                  aria-label={it.alt}
                  style={{
                    width: '100%',
                    aspectRatio: '4 / 5',
                    background: 'var(--surface)',
                    borderRadius: 8,
                  }}
                />
              )}
              {it.caption && (
                <div
                  style={{
                    marginTop: 10,
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    letterSpacing: 0.6,
                    color: 'var(--ink-3)',
                    textAlign: 'center',
                    textTransform: 'uppercase',
                  }}
                >
                  {it.caption}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Prev arrow — parked in the left gutter, fully outside the strip */}
        {page > 0 && (
          <button
            type="button"
            aria-label="Previous"
            onClick={() => scrollToPage(page - 1)}
            style={{ ...arrowBase, left: 4 }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(31,30,27,0.04)';
              e.currentTarget.style.borderColor = tint;
              e.currentTarget.style.color = tint;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--line)';
              e.currentTarget.style.color = 'var(--ink-2)';
            }}
          >
            ←
          </button>
        )}

        {/* Next arrow — parked in the right gutter, fully outside the strip */}
        {page < pageCount - 1 && (
          <button
            type="button"
            aria-label="Next"
            onClick={() => scrollToPage(page + 1)}
            style={{ ...arrowBase, right: 4 }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(31,30,27,0.04)';
              e.currentTarget.style.borderColor = tint;
              e.currentTarget.style.color = tint;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--line)';
              e.currentTarget.style.color = 'var(--ink-2)';
            }}
          >
            →
          </button>
        )}
      </div>

      {/* Caption + dots row */}
      <figcaption
        style={{
          marginTop: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--ink-3)',
          letterSpacing: 0.3,
        }}
      >
        <span>
          {fig && <>Fig. {fig} · </>}
          {caption}
        </span>
        {pageCount > 1 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: pageCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => scrollToPage(i)}
                style={{
                  width: 6,
                  height: 6,
                  padding: 0,
                  borderRadius: 3,
                  background: i === page ? tint : 'var(--ink-4)',
                  border: 'none',
                  cursor: 'pointer',
                  opacity: i === page ? 1 : 0.4,
                  transition: 'opacity .2s, background .2s',
                }}
              />
            ))}
          </div>
        )}
      </figcaption>
    </figure>
  );
}
