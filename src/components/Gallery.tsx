import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  columns?: 2 | 3;
};

export function Gallery({ children, columns = 2 }: Props) {
  return (
    <div style={{
      maxWidth: 1040, margin: '56px auto', padding: '0 32px',
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 24,
    }}>
      {children}
    </div>
  );
}
