import type { ReactNode } from 'react';

type Props = { children: ReactNode };

/**
 * Lede — the article's opening sentence. Uses Subheadline with larger size
 * for editorial presence. Sits at the very top of the article body.
 * One Lede per article. Gives each piece a "first breath" before content begins.
 */
export function Lede({ children }: Props) {
  return (
    <p style={{
      fontFamily: 'var(--font-primary)',
      fontSize: '18px',
      fontWeight: 400,
      lineHeight: 1.4,
      color: 'var(--ink)',
      maxWidth: 680,
      margin: '0 auto 40px',
    }}>
      {children}
    </p>
  );
}
