import type { ReactNode } from 'react';
import { useArticle } from '@/routes/ArticleContext';

type Props = {
  /** Small uppercase kicker label that names the block ("Method", "Example",
   *  "Field notes"). Renders in tinted mono, top of the card. */
  label: string;
  children: ReactNode;
};

/**
 * Sidebar — a soft tinted card for set-apart article content (worked
 * examples, methods, field notes). Replaces the inline `border-left: 3px
 * solid tint` pattern, which collided with the visual vocabulary of
 * blockquotes. Surface fills do the containment work; the kicker names
 * what the block is.
 */
export function Sidebar({ label, children }: Props) {
  const article = useArticle();
  const tint = article?.tint ?? 'var(--ink-3)';

  return (
    <div style={{
      // Neutral warm-grey surface (not the article's tinted surface) —
      // the article's blush/butter surfaces, when filling a panel,
      // read as alert/warning UI instead of "set-apart sidebar". The
      // article's identity comes through via the kicker tint, not the
      // background.
      background: 'var(--surface)',
      borderRadius: 10,
      padding: '32px 36px',
      margin: '40px 0',
    }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.4,
        textTransform: 'uppercase', color: tint,
        marginBottom: 14,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}
