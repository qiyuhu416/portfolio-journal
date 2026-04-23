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
    <blockquote style={{
      maxWidth: 680, margin: '40px auto',
      padding: '24px 32px',
      borderTop: '1px solid var(--line)',
      borderBottom: '1px solid var(--line)',
    }}>
      <div style={{
        fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400,
        fontSize: 32, lineHeight: 1.2, letterSpacing: -0.6, color: 'var(--ink)',
      }}>
        {typeof children === 'string' ? `"${children}"` : children}
      </div>
      {attribution && (
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)',
          letterSpacing: 0.4, marginTop: 14, textTransform: 'uppercase',
        }}>
          — <span style={{ color: tint }}>{attribution}</span>
        </div>
      )}
    </blockquote>
  );
}
