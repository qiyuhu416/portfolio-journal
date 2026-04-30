import type { ReactNode } from 'react';

type Props = { children: ReactNode };

/**
 * Aside — a quiet italic indent for short editorial commentary (offhand
 * remarks, "lol I once said…", side notes). Deliberately NOT a card and
 * NOT bordered: cards are reserved for Sidebar (structured content) and
 * left-borders for blockquote (quoted speech). Aside earns its set-apart
 * voice through italic + slightly smaller size + softer color.
 */
export function Aside({ children }: Props) {
  return (
    <aside style={{
      maxWidth: 680, margin: '28px auto',
      paddingLeft: 28,
      fontFamily: 'var(--reading)', fontStyle: 'italic',
      fontSize: 17,
      lineHeight: 1.55, color: 'var(--ink-3)',
    }}>
      {children}
    </aside>
  );
}
