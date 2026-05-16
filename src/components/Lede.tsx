import type { ReactNode } from 'react';

type Props = { children: ReactNode };

/**
 * Lede — the article's opening sentence, set apart in italic serif at a
 * size between body and h2. Sits at the very top of the article body,
 * above any section heading. One Lede per article. Used to give each
 * piece a single editorial "first breath" before the structured content
 * begins.
 */
export function Lede({ children }: Props) {
  return (
    <p style={{
      fontFamily: 'var(--reading)',
      fontStyle: 'italic',
      fontWeight: 400,
      fontSize: 22,
      lineHeight: 1.4,
      color: 'var(--ink)',
      maxWidth: 680,
      margin: '0 auto 40px',
    }}>
      {children}
    </p>
  );
}
