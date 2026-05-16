import { useState } from 'react';
import type { Company } from '@/content';

type Props = {
  exp: Company;
  /** Article tint — used for the avatar disc and the hover-state border/text. */
  tint: string;
};

/**
 * The "Reflected from" chips in the article byline. Renders the
 * company avatar + name as a pill; on hover, a small popover above the chip
 * shows the writer's `role` and `period` at that place — so the reader can
 * see *what* the reflection is grounded in without leaving the page.
 *
 * Renders as a link if `exp.href` is set, otherwise a plain span. Hover state
 * tints the border/text regardless of link-ness, so non-link chips still
 * affirm the cursor is on a clickable-feeling artifact.
 */
export function ExperienceChip({ exp, tint }: Props) {
  const [hover, setHover] = useState(false);
  const initial = exp.name.trim().charAt(0).toUpperCase();
  const hasPopover = !!(exp.role || exp.period);

  const chip = (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px 3px 4px',
      borderRadius: 999,
      border: `1px solid ${hover ? tint : 'var(--line)'}`,
      background: 'transparent',
      fontSize: 12,
      color: hover ? 'var(--ink)' : 'var(--ink-2)',
      transition: 'border-color .15s, color .15s, background .15s',
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: 9,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: tint, color: '#fff',
        fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.4,
        fontWeight: 600,
      }}>
        {initial}
      </span>
      {exp.name}
    </span>
  );

  const inner = exp.href ? (
    <a
      href={exp.href}
      target={exp.href.startsWith('http') ? '_blank' : undefined}
      rel={exp.href.startsWith('http') ? 'noopener noreferrer' : undefined}
      style={{ textDecoration: 'none' }}
    >
      {chip}
    </a>
  ) : chip;

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      {inner}
      {hasPopover && hover && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--ink)',
            color: 'var(--bg)',
            padding: '10px 14px',
            borderRadius: 8,
            // Wide enough that 5–8 word role labels fit on 1–2 lines instead
            // of stacking word-per-line. Centering keeps the caret lined up
            // with the chip even when the box does wrap.
            minWidth: 200,
            maxWidth: 320,
            width: 'max-content',
            whiteSpace: 'normal',
            textAlign: 'center',
            fontSize: 12,
            lineHeight: 1.4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {exp.role && (
            <div style={{
              fontWeight: 500,
              marginBottom: exp.period ? 4 : 0,
              color: 'var(--bg)',
            }}>
              {exp.role}
            </div>
          )}
          {exp.period && (
            <div style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: 0.6,
              opacity: 0.7,
            }}>
              {exp.period}
            </div>
          )}
          {/* Caret pointing down to the chip — uses the same dark fill as the popover. */}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid var(--ink)',
          }} />
        </div>
      )}
    </span>
  );
}
