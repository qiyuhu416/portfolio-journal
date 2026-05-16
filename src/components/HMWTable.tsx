import type { ReactNode } from 'react';

export type HMWRow = {
  error: ReactNode;
  hmw: ReactNode;
  solutions: ReactNode[];
};

type Props = { rows: HMWRow[] };

/**
 * HMWTable — a 3-column comparison grid (Error found / How might we /
 * Potential solutions). Renders as a real <table> so it inherits the same
 * styling as raw <table> elements in articles: bordered card, rounded
 * corners, surface-filled header row, hairline row + column separators,
 * Source Serif throughout. Visual parity with raw tables is the contract;
 * the only difference is which columns it locks in.
 */
export function HMWTable({ rows }: Props) {
  return (
    <table>
      <thead>
        <tr>
          <th>Error found</th>
          <th>How might we</th>
          <th>Potential solutions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>{row.error}</td>
            <td>{row.hmw}</td>
            <td>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {row.solutions.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ul>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
