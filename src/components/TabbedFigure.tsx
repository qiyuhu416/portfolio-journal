import { useState } from 'react';
import { useArticle } from '@/routes/ArticleContext';

type Item = {
  label: string;
  src?: string;
  alt?: string;
  caption?: string;
};

type Props = {
  fig?: string;
  items: Item[];
  height?: number;
};

export function TabbedFigure({ fig, items, height = 380 }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const article = useArticle();
  const tint = article?.tint ?? 'var(--ink-3)';
  const surface = article?.surface ?? 'var(--surface)';
  const active = items[activeIdx];
  const showPlaceholder = !active?.src;

  return (
    <figure style={{ maxWidth: 680, margin: '40px auto', padding: '0 32px' }}>
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
            maxWidth: 680,
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
    </figure>
  );
}
