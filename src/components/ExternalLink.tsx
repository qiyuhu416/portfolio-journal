import { useState, type ReactNode } from 'react';
import { useArticle } from '@/routes/ArticleContext';

type Props = {
  href: string;
  kind?: string;     // eyebrow label in popup, e.g. "FigJam", "LinkedIn"
  title?: string;    // big title shown in popup
  dek?: string;      // italic description in popup
  children: ReactNode;
};

// Minimal Figma F mark — single-color so it inherits the article tint.
export function FigmaMark() {
  return (
    <svg
      width="9"
      height="13"
      viewBox="0 0 24 36"
      fill="currentColor"
      aria-hidden="true"
      style={{ verticalAlign: '-2px', marginRight: 5 }}
    >
      {/* top row */}
      <path d="M6 0h6v12H6a6 6 0 0 1 0-12z" />
      <path d="M12 0h6a6 6 0 0 1 0 12h-6V0z" />
      {/* middle row */}
      <path d="M6 12h6v12H6a6 6 0 0 1 0-12z" />
      <circle cx="18" cy="18" r="6" />
      {/* bottom row — open pill on the left */}
      <path d="M6 24a6 6 0 0 0 6 6 6 6 0 0 0 0-12 6 6 0 0 0-6 6z" />
    </svg>
  );
}

export function ExternalLink({ href, kind = 'External', title, dek, children }: Props) {
  const current = useArticle();
  const [hover, setHover] = useState(false);
  const tint = current?.tint ?? 'var(--warm)';
  const showPopup = hover && (title || dek);

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{
          color: tint,
          textDecoration: 'none',
          borderBottom: `1px dotted ${tint}`,
          cursor: 'pointer',
          paddingBottom: 1,
        }}
      >
        {children}
        <span style={{ color: 'var(--ink-4)', marginLeft: 3, fontSize: '0.85em' }}>↗</span>
      </a>
      {showPopup && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 8px)',
            minWidth: 260,
            maxWidth: 320,
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            boxShadow: '0 16px 36px rgba(31,30,27,0.14)',
            padding: '12px 14px',
            zIndex: 200,
            pointerEvents: 'none',
            textAlign: 'left',
            whiteSpace: 'normal',
          }}
        >
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.4,
              textTransform: 'uppercase', color: tint,
            }}
          >
            {kind} · peek ↗
          </span>
          {title && (
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 500,
                color: 'var(--ink)', marginTop: 6, lineHeight: 1.2,
                letterSpacing: -0.2,
              }}
            >
              {title}
            </span>
          )}
          {dek && (
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 13, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.4,
              }}
            >
              {dek}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
