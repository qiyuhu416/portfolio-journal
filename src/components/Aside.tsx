import type { ReactNode } from 'react';
import { useArticle } from '@/routes/ArticleContext';

type Props = { children: ReactNode };

export function Aside({ children }: Props) {
  const article = useArticle();
  const tint = article?.tint ?? 'var(--ink-3)';
  const surface = article?.surface ?? 'var(--surface)';

  return (
    <aside style={{
      maxWidth: 680, margin: '32px auto',
      padding: '18px 22px',
      background: surface,
      borderLeft: `3px solid ${tint}`,
      fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 20,
      lineHeight: 1.5, color: 'var(--ink-2)',
    }}>
      {children}
    </aside>
  );
}
