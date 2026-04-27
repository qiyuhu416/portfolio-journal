import type { NavFn } from '@/App';
import { BackHome } from '@/components/BackHome';
import { signals } from '@/content';

type Props = { onNav: NavFn };

export function Signals({ onNav }: Props) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <BackHome onNav={onNav} />

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '140px 32px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--warm)' }}>
            § · Signals · Input
          </div>
          <div style={{ height: 1, background: 'var(--line)', flex: 1 }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.8, color: 'var(--ink-3)' }}>
            N = 72 · as of Mar 2024
          </div>
        </div>

        <h1 style={{
          fontFamily: 'var(--serif)', fontWeight: 400,
          fontSize: 'clamp(52px, 7vw, 96px)', lineHeight: 1.02, letterSpacing: -2.2,
          margin: 0, textWrap: 'balance', maxWidth: 920,
        }}>
          What I've heard. And <span style={{ fontStyle: 'italic', color: 'var(--warm)' }}>how it changed me</span>.
        </h1>

        <p style={{
          fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 22, lineHeight: 1.5,
          color: 'var(--ink-2)', marginTop: 28, maxWidth: 680,
        }}>
          Most of what I think about design, someone else said to me first. So I've been meeting
          more people — counting them, paying attention to what surprises me. This is what I've
          collected.
        </p>
      </section>

      <section style={{ maxWidth: 1040, margin: '0 auto', padding: '0 32px 80px' }}>
        {signals.map((q) => (
          <article key={q.n} style={{
            padding: '56px 0', borderTop: '1px solid var(--line)',
            display: 'grid', gridTemplateColumns: '80px 1fr', gap: 32,
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 0.8, color: q.tint }}>
              #{String(q.n).padStart(2, '0')}
            </div>
            <div>
              <blockquote style={{ margin: 0 }}>
                <div style={{
                  fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(24px, 2.6vw, 34px)',
                  lineHeight: 1.3, letterSpacing: -0.6, color: 'var(--ink)', textWrap: 'balance',
                }}>
                  "{q.text}"
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', letterSpacing: 0.4, marginTop: 14 }}>
                  — {q.who.toUpperCase()} · {q.when.toUpperCase()}
                </div>
              </blockquote>
              <div style={{
                marginTop: 22, paddingTop: 18, borderTop: '1px dashed var(--line)',
                display: 'flex', gap: 14, alignItems: 'baseline',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: q.tint, flexShrink: 0, paddingTop: 4 }}>
                  What it changed
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 17, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 620 }}>
                  {q.changed}
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section style={{ maxWidth: 1040, margin: '0 auto', padding: '80px 32px 140px', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'start' }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 18 }}>
              Still counting
            </div>
            <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 'clamp(32px, 4vw, 48px)', lineHeight: 1.1, letterSpacing: -1.2, margin: 0, textWrap: 'balance' }}>
              The experiment is <span style={{ fontStyle: 'italic', color: 'var(--warm)' }}>ongoing</span>.
            </h2>
            <p style={{ fontFamily: 'var(--serif)', fontSize: 18, lineHeight: 1.6, color: 'var(--ink-2)', marginTop: 20, maxWidth: 460 }}>
              If you have twenty minutes and something to say, I'd like to meet you. No agenda.
              Coffee, walk, or a call — your pick.
            </p>
          </div>
          <div style={{ paddingLeft: 32, borderLeft: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>N =</div>
              <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 'clamp(72px, 9vw, 120px)', lineHeight: 0.9, letterSpacing: -3, color: 'var(--warm)' }}>72</div>
            </div>
            <a href="mailto:hello@qiyuhu.com?subject=Number%2073" style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 10, marginTop: 28,
              fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink)',
              borderBottom: '1px solid var(--ink)', paddingBottom: 2,
            }}>
              <span style={{ fontStyle: 'italic' }}>Book a chat.</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--warm)', letterSpacing: 0.4 }}>
                You'd be #73.
              </span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
