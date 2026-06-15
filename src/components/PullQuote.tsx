import type { ReactNode } from 'react';
import { useArticle } from '@/routes/ArticleContext';

type Props = {
  attribution?: ReactNode;
  children: ReactNode;
};

export function PullQuote({ attribution, children }: Props) {
  const article = useArticle();
  const tint = article?.tint ?? 'var(--ink)';

  return (
    <blockquote
      style={{
        // Match the article body's max-width (680px) so the pull-quote sits
        // within the column rather than offset from it. Italic + display size
        // already do the "this is emphasized" work; centering or width-shift
        // would be a third differentiation slot spent on the same idea.
        maxWidth: 680, margin: '72px auto',
        padding: 0,
        textAlign: 'left',
        border: 'none',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-primary)',
          fontWeight: 400,
          fontSize: 'clamp(28px, 3.2vw, 38px)',
          lineHeight: 1.3,
          color: 'var(--ink)',
          textWrap: 'balance',
        }}
      >
        {children}
      </div>

      {attribution && (
        <div
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: '15px',
            color: 'var(--ink-3)',
            marginTop: 22,
            fontWeight: 400,
            lineHeight: 1.333,
          }}
        >
          — <span style={{ color: tint }}>{attribution}</span>
        </div>
      )}
    </blockquote>
  );
}
