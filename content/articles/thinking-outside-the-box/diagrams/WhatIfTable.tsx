import type { CSSProperties } from 'react';

export type WhatIfRow = {
  question: string;
  answer: string;
};

export type WhatIfSection = {
  heading: string;
  col1?: string;
  col2?: string;
  rows: WhatIfRow[];
};

export function WhatIfTable({ sections }: { sections: WhatIfSection[] }) {
  return (
    <div style={{ margin: '1.5em 0', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Question</th>
            <th style={{ ...th, paddingLeft: 24, paddingRight: 0 }}>Prototype / Approach</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section, si) => (
            <>
              <tr key={`s-${si}`}>
                <td colSpan={2} style={{
                  padding: si === 0 ? '16px 0 6px' : '28px 0 6px',
                  fontFamily: 'var(--sans)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-4)',
                }}>
                  {section.heading}
                </td>
              </tr>
              {section.rows.map((row, ri) => (
                <tr key={`r-${si}-${ri}`}>
                  <td style={tdLeft}>{row.question}</td>
                  <td style={tdRight}>{row.answer}</td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: CSSProperties = {
  padding: '8px 24px 8px 0',
  textAlign: 'left',
  fontFamily: 'var(--sans)',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink-4)',
  borderBottom: '2px solid var(--line)',
  whiteSpace: 'nowrap',
};

const tdLeft: CSSProperties = {
  padding: '12px 24px 12px 0',
  fontFamily: 'var(--serif)',
  fontStyle: 'italic',
  fontSize: 15,
  lineHeight: 1.5,
  color: 'var(--ink)',
  verticalAlign: 'top',
  width: '48%',
  borderBottom: '1px solid var(--line)',
};

const tdRight: CSSProperties = {
  padding: '12px 0 12px 24px',
  fontFamily: 'var(--sans)',
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--ink-3)',
  verticalAlign: 'top',
  width: '52%',
  borderBottom: '1px solid var(--line)',
};
