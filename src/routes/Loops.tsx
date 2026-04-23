import type { NavFn } from '@/App';
import { BackHome } from '@/components/BackHome';
import { loopsSpectrum } from '@/content';

type Props = { onNav: NavFn };

export function Loops({ onNav }: Props) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <BackHome onNav={onNav} />

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '140px 32px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--cool)' }}>
            § · Loops · Process
          </div>
          <div style={{ height: 1, background: 'var(--line)', flex: 1 }} />
        </div>

        <h1 style={{
          fontFamily: 'var(--serif)', fontWeight: 400,
          fontSize: 'clamp(52px, 7vw, 96px)', lineHeight: 1.02, letterSpacing: -2.2,
          margin: 0, textWrap: 'balance', maxWidth: 920,
        }}>
          The patterns I <span style={{ fontStyle: 'italic', color: 'var(--cool)' }}>run on myself</span>.
        </h1>

        <p style={{
          fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 22, lineHeight: 1.5,
          color: 'var(--ink-2)', marginTop: 28, maxWidth: 680,
        }}>
          A loop isn't a process — it's something you live inside. These are mine,
          as honestly as I can draw them.
        </p>
      </section>

      <section style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 32px 80px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 18 }}>
          Fig. 01 · Where things sit, on a spectrum
        </div>

        <div style={{ position: 'relative', height: 280, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', padding: '40px 60px' }}>
          <div style={{ position: 'absolute', left: 60, right: 60, top: '50%', height: 1, background: 'var(--ink-3)' }} />
          <div style={{ position: 'absolute', left: 60, top: '50%', marginTop: 14, fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.8, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
            ← makes me uncomfortable
          </div>
          <div style={{ position: 'absolute', right: 60, top: '50%', marginTop: 14, fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.8, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
            comes naturally →
          </div>

          {loopsSpectrum.map((d, i) => {
            const offsetY = i % 2 === 0 ? -44 : 28;
            const c = d.tone === 'warm' ? 'var(--warm)' : 'var(--cool)';
            return (
              <div key={d.label} style={{ position: 'absolute', left: `${d.x}%`, top: '50%' }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: c, transform: 'translate(-50%, -50%)' }} />
                <div style={{
                  position: 'absolute', left: 0, top: offsetY,
                  transform: 'translateX(-50%)',
                  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.4,
                  color: 'var(--ink-2)', whiteSpace: 'nowrap',
                }}>
                  {d.label}
                  <div style={{
                    position: 'absolute', left: '50%', top: offsetY < 0 ? '100%' : -10,
                    width: 1, height: Math.abs(offsetY) - 6, background: 'var(--line)',
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', letterSpacing: 0.3, marginTop: 14, maxWidth: 680 }}>
          Placeholder · The real version will be annotated, interactive, and probably revised
          every few months as I learn new things about myself.
        </p>
      </section>

      <section style={{ maxWidth: 680, margin: '0 auto', padding: '60px 32px 140px' }}>
        <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(22px, 2.4vw, 28px)', lineHeight: 1.45, color: 'var(--ink)', margin: 0, textWrap: 'balance' }}>
          The tension between the left and right side of this chart is <span style={{ color: 'var(--warm)' }}>where the work happens</span>.
          Both help me. Both sometimes make me uncomfortable.
        </p>
      </section>
    </div>
  );
}
