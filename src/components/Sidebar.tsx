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
        padding: '20px 24px 20px 28px',
        borderLeft: '3px solid #C13D2F',
        borderRadius: 8,
        background: 'var(--surface)',
        font: 'var(--text-callout)',
        color: 'var(--ink)',
      }}
    >
      <div style={{
        font: 'var(--text-caption-2)',
        letterSpacing: 1.4,
        textTransform: 'uppercase', color: '#C13D2F',
        marginBottom: 14,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}
