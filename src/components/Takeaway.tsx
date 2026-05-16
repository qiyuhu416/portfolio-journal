import type { ReactNode } from 'react';

type Props = {
  /** Label shown alongside the mono kicker (e.g. "01", "02").
   *  Renders as "TAKEAWAY {label}" in tinted mono uppercase. */
  label: string;
  /** Optional override for the kicker word. Default: "Takeaway".
   *  Use "Finding" / "Insight" / etc. when "Takeaway" doesn't fit. */
  kicker?: string;
  children: ReactNode;
};

/**
 * Takeaway — a typographic step between H3 and body for marking a section's
 * structural conclusion or punchline.
 *
 * Mono kicker (tinted) + serif at body-bold weight. NO card chrome —
 * takeaways are the argument's spine, not tangential set-apart content.
 * Reserve cards for *worked examples / methods / field notes* (Sidebar);
 * use Takeaway for *the punchline the rest of the section earned*.
 *
 * Visual hierarchy: sits below H3, above body. Pairs naturally with a
 * following <p> for the lead-in / explanation, then optional <ul> bullets.
 *
 * Usage:
 *   <Takeaway label="01">Trust can be designed.</Takeaway>
 *   <p>Below is a decision tree we propose, …</p>
 */
export function Takeaway({ label, kicker = 'Takeaway', children }: Props) {
  return (
    <div style={{ margin: '48px 0 14px' }}>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: 'var(--article-tint, var(--ink-3))',
          marginBottom: 8,
        }}
      >
        {kicker} {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 21,
          lineHeight: 1.35,
          fontWeight: 500,
          color: 'var(--ink)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
