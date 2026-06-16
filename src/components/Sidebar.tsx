import type { ReactNode } from 'react';

type Props = {
  /** Small uppercase kicker label that names the block ("Method", "Example",
   *  "Field notes"). Renders in Caption 2 (tinted), top of the card. */
  label: string;
  children: ReactNode;
};

/**
 * Sidebar — a set-apart article content (worked examples, methods, field notes).
 * Styled like Sidenote (italic 17px serif) but with tinted border instead of
 * neutral. The kicker labels what the block is.
 */
export function Sidebar({ label, children }: Props) {
  return (
    <div
      data-sidebar
      style={{
        margin: '28px auto',
        padding: '20px 24px',
        borderRadius: 8,
        background: 'var(--surface)',
        font: 'var(--text-callout)',
        color: 'var(--ink)',
      }}
    >
      <div style={{
        font: 'var(--text-kicker)',
        letterSpacing: 1.4,
        textTransform: 'uppercase', color: 'var(--nav-accent)',
        marginBottom: 14,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}
