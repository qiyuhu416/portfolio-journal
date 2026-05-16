import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useArticle, useArticleScroll } from '@/routes/ArticleContext';

type Props = {
  /** Optional intro override. Falls back to meta.tocIntro from the
   *  article's frontmatter. Pass plain text or rich children if the
   *  intro needs <strong>, <em>, or links. */
  intro?: ReactNode;
};

const PINNED_VIEWPORT_MIN = 1180;

/**
 * InlineTOC — a writer-placed outline that owns *two* states:
 *
 *   1. Inline (in the body, where the writer placed it). A numbered serif
 *      list with the tocIntro sentence above. Reads as the writer's
 *      announcement of the piece's structure — content, not chrome.
 *
 *   2. Pinned to the right margin once the reader has scrolled past the
 *      inline placement. Drops the numbers and italic preamble, picks up
 *      a mono kicker + a vertical progress fill + active-section highlight,
 *      and tucks itself into the right-hand gutter as the navigation rail.
 *
 * The two states aren't separate widgets — they're one component, one
 * conceptual TOC, that *moves* as the reader moves. When the inline
 * placeholder scrolls above the viewport, the pinned state slides in from
 * the right; scroll back up and it slides out as the inline reappears.
 *
 * Visibility threshold: the pinned state only shows on viewports wide
 * enough to host a body column + 220px rail + breathing room (1180px+).
 * Below that, the article reads centered with no side rail — the inline
 * outline is the whole TOC.
 */
export function InlineTOC({ intro }: Props) {
  const meta = useArticle();
  const scroll = useArticleScroll();
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [viewportW, setViewportW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );

  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Watch the inline placeholder against the modal's scroll container.
  // Pin when the placeholder has scrolled above the viewport top — i.e.
  // the reader is past the announcement and into the body proper.
  useEffect(() => {
    if (!placeholderRef.current || !scroll) return;
    const root = scroll.scrollContainerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const rect = entry.boundingClientRect;
          const rootRect = entry.rootBounds;
          if (!rootRect) continue;
          // Only pin when the placeholder is ABOVE the viewport (reader has
          // scrolled past it). When it's below (not reached yet), stay
          // unpinned — the rail shouldn't appear before the writer's
          // announcement does.
          setPinned(!entry.isIntersecting && rect.bottom < rootRect.top);
        }
      },
      { root, threshold: 0 },
    );
    observer.observe(placeholderRef.current);
    return () => observer.disconnect();
  }, [scroll]);

  if (!meta || !meta.sections || meta.sections.length === 0) return null;
  const introNode = intro ?? meta.tocIntro;
  const canPin = viewportW >= PINNED_VIEWPORT_MIN;
  const showPinned = pinned && canPin;

  return (
    <>
      {/* Inline placement. The placeholder always occupies its space so the
          body doesn't reflow when the pinned state takes over — only the
          opacity flips. */}
      <div
        ref={placeholderRef}
        style={{
          maxWidth: 520,
          margin: '32px auto',
          opacity: showPinned ? 0 : 1,
          transition: 'opacity .35s ease',
          pointerEvents: showPinned ? 'none' : 'auto',
        }}
      >
        {introNode && (
          <p style={{
            fontFamily: 'var(--reading)', fontSize: 18, lineHeight: 1.5,
            color: 'var(--ink-2)', fontStyle: 'italic',
            margin: '0 0 18px',
            textWrap: 'pretty',
          }}>
            {introNode}
          </p>
        )}
        <ol style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          fontFamily: 'var(--reading)',
          fontSize: 18,
          lineHeight: 1.5,
          color: 'var(--ink)',
        }}>
          {meta.sections.map((s, i) => (
            <li key={s.id} style={{
              display: 'flex',
              gap: 14,
              alignItems: 'baseline',
            }}>
              <span style={{
                color: 'var(--ink-3)',
                fontVariantNumeric: 'tabular-nums',
                minWidth: 22,
                flexShrink: 0,
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <a
                href={`#${s.id}`}
                onClick={(e) => {
                  if (!scroll) return;
                  e.preventDefault();
                  scroll.scrollToSection(s.id);
                }}
                style={{
                  color: 'var(--ink)',
                  textDecoration: 'underline',
                  textDecorationColor: 'var(--line)',
                  textDecorationThickness: 1,
                  textUnderlineOffset: 4,
                  transition: 'text-decoration-color .2s',
                  borderBottom: 'none',
                  paddingBottom: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = 'var(--article-tint)')}
                onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = 'var(--line)')}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </div>

      {/* Pinned state: same TOC, relocated to the right margin and reshaped
          as a navigation rail. Vertical progress fill drives off the same
          progress value the reader's already seeing in scroll position;
          active-state highlight follows the section under the reading
          line. Slides in from the right as the inline state fades out. */}
      {canPin && (
        <aside
          aria-hidden={!showPinned}
          style={{
            position: 'fixed', top: '50%', right: 32,
            width: 220,
            opacity: showPinned ? 1 : 0,
            transform: `translateY(-50%) translateX(${showPinned ? 0 : 16}px)`,
            pointerEvents: showPinned ? 'auto' : 'none',
            transition: 'opacity .35s ease, transform .35s ease',
            zIndex: 8,
          }}
        >
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4,
            textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 18,
          }}>
            In this piece
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
            <div style={{
              position: 'absolute', left: 0, top: 4, bottom: 4, width: 2,
              background: 'var(--line)',
            }} />
            <div style={{
              position: 'absolute', left: 0, top: 4, width: 2,
              height: `calc((100% - 8px) * ${scroll?.progress ?? 0})`,
              background: 'var(--article-tint)',
              transition: 'height .15s linear',
            }} />
            {meta.sections.map((s) => {
              const isActive = s.id === scroll?.activeSection;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={(e) => {
                    if (!scroll) return;
                    e.preventDefault();
                    scroll.scrollToSection(s.id);
                  }}
                  style={{
                    fontFamily: 'var(--reading)', fontSize: 13, lineHeight: 1.4,
                    color: isActive ? 'var(--ink)' : 'var(--ink-3)',
                    fontWeight: isActive ? 500 : 400,
                    textDecoration: 'none',
                    paddingLeft: 14,
                    transition: 'color .25s, font-weight .25s',
                    borderBottom: 'none',
                    paddingBottom: 0,
                  }}
                >
                  {s.label}
                </a>
              );
            })}
          </nav>
        </aside>
      )}
    </>
  );
}
