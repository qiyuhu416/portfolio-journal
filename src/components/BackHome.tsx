import type { NavFn } from '@/App';

type Props = { onNav: NavFn; label?: string };

export function BackHome({ onNav, label = 'Back to map' }: Props) {
  return (
    <button
      onClick={() => onNav('home')}
      style={{
        position: 'fixed', top: 24, left: 32, zIndex: 38,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderRadius: 999,
        background: 'rgba(250,248,243,0.85)', backdropFilter: 'blur(10px)',
        border: '1px solid var(--line)',
        fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
        color: 'var(--ink-2)', cursor: 'pointer',
      }}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>←</span>
      <span>{label}</span>
    </button>
  );
}
