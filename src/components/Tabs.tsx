import { useState } from 'react';
import type { ReactNode } from 'react';

type TabItem = {
  /** Short label shown on the tab button (mono uppercase). */
  label: string;
  /** Content rendered when this tab is active. */
  content: ReactNode;
};

type Props = {
  items: TabItem[];
  /** Optional default active index. Defaults to 0. */
  defaultIndex?: number;
};

/**
 * A small tab control for switching between sibling content blocks
 * (e.g. three TriggerDemos in a Sidebar — show one at a time, swap on click).
 *
 * Visual: mono-uppercase tab buttons in a row, separated from content by a
 * hairline rule. Active tab has a 2px tinted underline that visually meets
 * the rule (negative margin = -1px).
 *
 * No animation between panels — instant swap. Add a fade if you want it
 * later, but for editorial content the immediate cut reads as more intentional.
 */
export function Tabs({ items, defaultIndex = 0 }: Props) {
  const [active, setActive] = useState(defaultIndex);
  const safeActive = Math.min(Math.max(active, 0), items.length - 1);

  return (
    <div>
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--line)',
          marginBottom: 18,
          flexWrap: 'wrap',
        }}
      >
        {items.map((item, i) => {
          const isActive = i === safeActive;
          return (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(i)}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--article-tint, var(--ink))' : 'transparent'}`,
                color: isActive ? 'var(--ink)' : 'var(--ink-3)',
                fontFamily: 'var(--sans)',
                fontSize: 12,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color .15s, border-color .15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--ink-2)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--ink-3)';
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{items[safeActive].content}</div>
    </div>
  );
}
