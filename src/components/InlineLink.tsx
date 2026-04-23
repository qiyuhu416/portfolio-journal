import { useState, type ReactNode } from 'react';
import { useDrawer } from '@/routes/DrawerContext';
import { useArticle } from '@/routes/ArticleContext';
import { bySlug } from '@/content';

type Props = {
  to: string;
  children: ReactNode;
};

export function InlineLink({ to, children }: Props) {
  const { open } = useDrawer();
  const current = useArticle();
  const [hover, setHover] = useState(false);
  const target = bySlug[to];
  const tint = current?.tint ?? 'var(--warm)';

  if (!target) return <>{children}</>;

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <a
        href={`#article:${to}`}
        onClick={(e) => {
          e.preventDefault();
          setHover(false);
          open(to);
        }}
        style={{
          color: tint,
          textDecoration: 'none',
          borderBottom: `1px dotted ${tint}`,
          cursor: 'pointer',
          paddingBottom: 1,
        }}
      >
        {children}
      </a>
      {hover && (
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
              textTransform: 'uppercase', color: target.meta.tint,
            }}
          >
            {target.meta.quality} · peek
          </span>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 500,
              color: 'var(--ink)', marginTop: 6, lineHeight: 1.2,
              letterSpacing: -0.2,
            }}
          >
            {target.meta.title}
          </span>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--serif)', fontStyle: 'italic',
              fontSize: 13, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.4,
            }}
          >
            {target.meta.dek}
          </span>
        </span>
      )}
    </span>
  );
}
