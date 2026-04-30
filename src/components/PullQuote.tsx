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
        maxWidth: 720, margin: '72px auto',
        padding: '0 32px',
        textAlign: 'center',
        border: 'none',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--reading)', fontStyle: 'italic', fontWeight: 400,
          fontSize: 'clamp(28px, 3.2vw, 38px)',
          lineHeight: 1.3, letterSpacing: -0.2,
          color: 'var(--ink)',
          textWrap: 'balance',
        }}
      >
        {children}
      </div>

      {attribution && (
        <div
          style={{
            fontFamily: 'var(--reading)', fontStyle: 'italic',
            fontSize: 15, color: 'var(--ink-3)',
            marginTop: 22,
            letterSpacing: 0.1,
          }}
        >
          — <span style={{ color: tint }}>{attribution}</span>
        </div>
      )}
    </blockquote>
  );
}
