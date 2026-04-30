import type { ReactNode } from 'react';

type Props = { children: ReactNode };

/**
 * MicroHeading — a real heading for the punchy in-section lines that
 * articles previously faked with `<p><b>…</b></p>`. Body-family serif
 * (so it reads as a *beat within the section*, not a new section), one
 * step heavier than body, with heading-shaped margins (more space
 * above than below). Renders as <h4> for semantics.
 */
export function MicroHeading({ children }: Props) {
  return (
    <h4 style={{
      fontFamily: 'var(--reading)',
      fontSize: 21,
      fontWeight: 600,
      lineHeight: 1.3,
      letterSpacing: -0.2,
      color: 'var(--ink)',
      margin: '32px 0 10px',
    }}>
      {children}
    </h4>
  );
}
