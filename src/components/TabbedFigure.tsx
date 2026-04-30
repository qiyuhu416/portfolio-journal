import { useState } from 'react';
import { useArticle } from '@/routes/ArticleContext';
import { WRAPPER_BY_SPAN, PARATEXT_MAX, type FigureSpan } from './figureLayout';

type Item = {
  label: string;
  src?: string;
  alt?: string;
  caption?: string;
  when?: string;   // when this model is the right tool
  where?: string;  // where I actually used it
};

type Props = {
  fig?: string;
  items: Item[];
  height?: number;
  // Mirrors Figure.tsx — 'text' (680, default) for chart-style figures,
  // 'full' (1040) for diagrams with embedded text that need room to breathe,
  // 'bleed' (100%) for atmospheric / hero. Caps at container width inside
  // narrow surfaces (e.g. ArticleDrawer).
  span?: FigureSpan;
};

export function TabbedFigure({ fig, items, height = 380, span = 'text' }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const article = useArticle();
  const tint = article?.tint ?? 'var(--ink-3)';
  const surface = article?.surface ?? 'var(--surface)';
  const active = items[activeIdx];
  const showPlaceholder = !active?.src;

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
              onClick={() => setActiveIdx(i)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 14px',
                fontFamily: 'var(--mono)',
                fontSize: 11,
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

      {showPlaceholder ? (
        <div
          style={{
            height,
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
              fontFamily: 'var(--mono)',
              fontSize: 10,
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
                fontFamily: 'var(--mono)',
                fontSize: 10,
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
        <img
          src={active.src}
          alt={active.alt ?? ''}
          style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 8 }}
        />
      )}

      {(active?.caption || fig) && (
        <figcaption
          style={{
            maxWidth: PARATEXT_MAX,
            margin: '14px auto 0',
            fontFamily: 'var(--mono)',
            fontSize: 11,
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
            paddingTop: 20,
            borderTop: '1px dashed var(--line)',
          }}
        >
          {active?.when && (
            <div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
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
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
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
