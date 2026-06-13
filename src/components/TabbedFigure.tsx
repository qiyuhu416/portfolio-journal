import { useState, type ReactNode } from 'react';
import { useArticle } from '@/routes/ArticleContext';
import { WRAPPER_BY_SPAN, PARATEXT_MAX, type FigureSpan } from './figureLayout';

type Item = {
  label: string;
  src?: string;
  alt?: string;
  caption?: string;
  when?: string;   // when this model is the right tool
  where?: string;  // where I actually used it
  /** Abstract preview of the figure (typically an SVG). When present, the
   *  figure starts collapsed: reader sees the abstract, taps to reveal the
   *  full image. Lets a complex diagram preview as structure-only first. */
  abstract?: ReactNode;
  /** Custom rendered figure (e.g. an inline SVG using the article's tokens)
   *  to use in place of <img src=...>. Takes precedence over `src`. */
  figure?: ReactNode;
};

type Props = {
  fig?: string;
  items: Item[];
  // Mirrors Figure.tsx — 'text' (680, default) for chart-style figures,
  // 'full' (1040) for diagrams with embedded text that need room to breathe,
  // 'bleed' (100%) for atmospheric / hero. Caps at container width inside
  // narrow surfaces (e.g. ArticleDrawer).
  span?: FigureSpan;
};

// Single aspect ratio for every state (abstract preview, actual screenshot,
// custom figure, placeholder) so swapping tabs or revealing the detail view
// never causes layout shift. Tuned to roughly match the source PNGs
// (bridge-startup ~2.19, bridge-roche ~2.32) — averaged so neither letterboxes
// hard.
const FIGURE_ASPECT = '2.2 / 1';

export function TabbedFigure({ fig, items, span = 'text' }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const article = useArticle();
  const tint = article?.tint ?? 'var(--ink-3)';
  const surface = article?.surface ?? 'var(--surface)';
  const active = items[activeIdx];
  const showPlaceholder = !active?.src && !active?.figure;
  const showAbstract = Boolean(active?.abstract) && !revealed;

  return (
    <figure style={{ ...WRAPPER_BY_SPAN[span], padding: '0 32px' }}>
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 14,
          borderBottom: '1px solid var(--line)',
        }}
      >
        {items.map((it, i) => {
          const isActive = i === activeIdx;
          return (
            <button
              key={i}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setActiveIdx(i);
                setRevealed(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 14px',
                fontFamily: 'var(--sans)',
                fontSize: 12,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: isActive ? tint : 'var(--ink-4)',
                cursor: 'pointer',
                borderBottom: isActive ? `2px solid ${tint}` : '2px solid transparent',
                marginBottom: -1,
                transition: 'color .2s, border-color .2s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--ink-2)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--ink-4)';
              }}
            >
              {it.label}
            </button>
          );
        })}
      </div>

      {showAbstract ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          aria-label="Reveal full diagram"
          style={{
            position: 'relative',
            display: 'block',
            width: '100%',
            aspectRatio: FIGURE_ASPECT,
            padding: 0,
            background: 'var(--surface)',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            textAlign: 'left',
            overflow: 'hidden',
            transition: 'background .2s',
          }}
          onMouseEnter={(e) => {
            const hint = e.currentTarget.querySelector<HTMLElement>('[data-reveal-hint]');
            if (hint) {
              hint.style.background = tint;
              hint.style.color = 'white';
              hint.style.borderColor = tint;
            }
          }}
          onMouseLeave={(e) => {
            const hint = e.currentTarget.querySelector<HTMLElement>('[data-reveal-hint]');
            if (hint) {
              hint.style.background = 'transparent';
              hint.style.color = tint;
              hint.style.borderColor = tint;
            }
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              padding: '32px 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {active?.abstract}
          </div>
          <div
            data-reveal-hint
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              padding: '6px 12px',
              fontFamily: 'var(--sans)',
              fontSize: 12,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: tint,
              border: `1px solid ${tint}`,
              borderRadius: 999,
              background: 'transparent',
              transition: 'background .15s, color .15s',
            }}
          >
            Tap to reveal ↗
          </div>
        </button>
      ) : showPlaceholder ? (
        <div
          style={{
            width: '100%',
            aspectRatio: FIGURE_ASPECT,
            background: surface,
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'repeating-linear-gradient(45deg, transparent 0 18px, rgba(255,255,255,0.18) 18px 19px)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 18,
              left: 22,
              fontFamily: 'var(--sans)',
              fontSize: 12,
              color: tint,
              letterSpacing: 0.5,
              opacity: 0.8,
            }}
          >
            {active?.alt ? `PLACEHOLDER · ${active.alt.toUpperCase()}` : 'PLACEHOLDER · IMAGE'}
          </div>
          {fig && (
            <div
              style={{
                position: 'absolute',
                bottom: 20,
                right: 22,
                fontFamily: 'var(--sans)',
                fontSize: 12,
                color: tint,
                letterSpacing: 0.6,
                opacity: 0.7,
              }}
            >
              FIG. {fig}
            </div>
          )}
        </div>
      ) : (
        <div style={{ position: 'relative', width: '100%', aspectRatio: FIGURE_ASPECT }}>
          {active?.figure ? (
            <div style={{
              position: 'absolute',
              inset: 0,
              padding: '32px 28px',
              background: 'var(--surface)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {active.figure}
            </div>
          ) : (
            <img
              src={active.src}
              alt={active.alt ?? ''}
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                background: 'var(--surface)',
                borderRadius: 8,
              }}
            />
          )}
          {active?.abstract && (
            <button
              type="button"
              onClick={() => setRevealed(false)}
              aria-label="Show abstract diagram"
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                padding: '6px 12px',
                fontFamily: 'var(--sans)',
                fontSize: 12,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                border: '1px solid var(--line)',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(6px)',
                cursor: 'pointer',
                transition: 'color .15s, border-color .15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = tint;
                e.currentTarget.style.borderColor = tint;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--ink-3)';
                e.currentTarget.style.borderColor = 'var(--line)';
              }}
            >
              ← Back to abstract
            </button>
          )}
        </div>
      )}

      {(active?.caption || fig) && (
        <figcaption
          style={{
            maxWidth: PARATEXT_MAX,
            margin: '14px auto 0',
            fontFamily: 'var(--sans)',
            fontSize: 12,
            color: 'var(--ink-3)',
            letterSpacing: 0.3,
          }}
        >
          {fig && <>Fig. {fig} · </>}
          {active?.caption}
        </figcaption>
      )}

      {(active?.when || active?.where) && (
        <div
          style={{
            maxWidth: PARATEXT_MAX,
            margin: '22px auto 0',
            display: 'grid',
            gridTemplateColumns: active?.when && active?.where ? '1fr 1fr' : '1fr',
            gap: 32,
            paddingBottom: 22,
            borderBottom: '1px dashed var(--line)',
          }}
        >
          {active?.when && (
            <div>
              <div
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 12,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: tint,
                  marginBottom: 8,
                }}
              >
                When to use
              </div>
              <div
                style={{
                  fontFamily: 'var(--reading, var(--serif))',
                  fontSize: 17,
                  lineHeight: 1.55,
                  color: 'var(--ink)',
                }}
              >
                {active.when}
              </div>
            </div>
          )}
          {active?.where && (
            <div>
              <div
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 12,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: tint,
                  marginBottom: 8,
                }}
              >
                Where I used it
              </div>
              <div
                style={{
                  fontFamily: 'var(--reading, var(--serif))',
                  fontSize: 17,
                  lineHeight: 1.55,
                  color: 'var(--ink)',
                }}
              >
                {active.where}
              </div>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
