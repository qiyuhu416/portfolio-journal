import { useEffect, useState } from 'react';
import type { NavFn } from '@/App';
import { quadrants } from '@/content';
import { QuadrantTeaser, QuadrantPanel } from '@/components/QuadrantMap';

type Props = { onNav: NavFn };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function smoothstep(p: number) { return p * p * (3 - 2 * p); }

export function Home({ onNav }: Props) {
  const [scrollY, setScrollY] = useState(0);
  const [forceWordmarkExpanded, setForceWordmarkExpanded] = useState(false);
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );
  const [viewportW, setViewportW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    const onResize = () => {
      setViewportH(window.innerHeight);
      setViewportW(window.innerWidth);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const vh = viewportH;
  const ch2 = vh * 1.6;
  const chLen = vh * 1.0;

  const zoom = clamp(scrollY / ch2, 0, 1);
  const zoomEase = smoothstep(zoom);

  const tourProgress = (scrollY - ch2) / chLen;
  const inTour = scrollY >= ch2 - vh * 0.3;
  const activeIdx = inTour ? clamp(Math.floor(Math.max(0, tourProgress)), 0, 3) : -1;
  const tourFrac = inTour ? clamp(tourProgress - Math.floor(Math.max(0, tourProgress)), 0, 1) : 0;

  const splitProgress = clamp((scrollY - (ch2 - vh * 0.3)) / (vh * 0.6), 0, 1);
  const splitEase = smoothstep(splitProgress);

  const bigPx = Math.min(220, viewportW * 0.13);
  const smallPx = 18;
  const fontPx = bigPx + (smallPx - bigPx) * zoomEase;
  const letter = -6 + (-0.3 - -6) * zoomEase;

  const jumpTo = (i: number) => window.scrollTo({ top: ch2 + chLen * i + 10, behavior: 'smooth' });

  const outroFade = 1 - clamp((scrollY - (ch2 + chLen * 4)) / (vh * 0.5), 0, 1);

  const padX = 80 / viewportW;
  const padY = 80 / viewportH;
  const targetsByIdx = [
    { x: 1 - padX, y: 1 - padY },
    { x: padX,     y: 1 - padY },
    { x: 1 - padX, y: padY },
    { x: padX,     y: padY },
  ];
  const t = clamp(tourProgress, 0, 3);
  const tIdx = Math.floor(t);
  const rawF = t - tIdx;
  const holdFrac = 0.8;
  const transF = rawF < holdFrac ? 0 : (rawF - holdFrac) / (1 - holdFrac);
  const f = smoothstep(transF);
  const a = targetsByIdx[tIdx];
  const b = targetsByIdx[Math.min(3, tIdx + 1)];
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const diagonal = dx > 0.1 && dy > 0.1;
  let tgtX: number, tgtY: number;
  if (diagonal) {
    const fx = smoothstep(clamp(transF / 0.5, 0, 1));
    const fy = smoothstep(clamp((transF - 0.5) / 0.5, 0, 1));
    tgtX = a.x + (b.x - a.x) * fx;
    tgtY = a.y + (b.y - a.y) * fy;
  } else {
    tgtX = a.x + (b.x - a.x) * f;
    tgtY = a.y + (b.y - a.y) * f;
  }
  const crossX = (0.5 + (tgtX - 0.5) * splitEase) * viewportW;
  const crossY = (0.5 + (tgtY - 0.5) * splitEase) * viewportH;

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '100vh', zIndex: 10, overflow: 'hidden' }}>
        {(() => {
          const lineOpacity = Math.max(0, (zoomEase - 0.4) / 0.6) * outroFade;
          const labelOpacity = Math.max(0, (zoomEase - 0.5) / 0.5) * outroFade;
          const labelBase: React.CSSProperties = {
            position: 'absolute',
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6,
            textTransform: 'uppercase', color: 'var(--ink-3)',
            opacity: labelOpacity, pointerEvents: 'none',
            background: 'var(--bg)', padding: '2px 6px',
            zIndex: 20,
          };
          return (
            <>
              <svg viewBox={`0 0 ${viewportW} ${viewportH}`}
                   style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: lineOpacity, pointerEvents: 'none', zIndex: 20 }}>
                <line x1={8} y1={crossY} x2={viewportW - 8} y2={crossY} stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 6" />
                <line x1={crossX} y1={64} x2={crossX} y2={viewportH - 8} stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 6" />
              </svg>
              {(() => {
                const autoExpand = zoomEase < 0.3;
                const wordmarkExpanded = forceWordmarkExpanded || autoExpand;
                const taglineOpacity = wordmarkExpanded
                  ? clamp(1 - zoomEase * 1.4, 0, 1) + (forceWordmarkExpanded ? 1 : 0)
                  : 0;
                return (
                  <button
                    onClick={() => setForceWordmarkExpanded((v) => !v)}
                    style={{
                      ...labelBase,
                      left: crossX, top: 46, transform: 'translateX(-50%)',
                      opacity: 1,
                      border: 'none', cursor: 'pointer',
                      pointerEvents: 'auto',
                      display: 'inline-flex', alignItems: 'baseline', gap: 0,
                    }}
                  >
                    <span style={{ color: 'var(--ink)', fontWeight: 500, letterSpacing: 0.4 }}>Qiyu</span>
                    <span style={{
                      display: 'inline-block',
                      maxWidth: wordmarkExpanded ? 480 : 0,
                      overflow: 'hidden',
                      opacity: Math.min(1, taglineOpacity),
                      transition: 'max-width .35s cubic-bezier(.2,.7,.2,1), opacity .25s',
                      whiteSpace: 'nowrap',
                    }}>
                      <span style={{ color: 'var(--ink)', fontWeight: 500, letterSpacing: 0.4 }}>&nbsp;Hu</span>
                      {' · designer · researcher · starter'}
                    </span>
                  </button>
                );
              })()}
              <div style={{ ...labelBase, left: crossX, bottom: 4, transform: 'translateX(-50%)' }}>Others</div>
              <div style={{ ...labelBase, left: 12, top: crossY, transform: 'translateY(-50%)' }}>Think</div>
              <div style={{ ...labelBase, right: 12, top: crossY, transform: 'translateY(-50%)' }}>Do</div>
            </>
          );
        })()}
        <div style={{
          position: 'absolute', inset: 0,
          opacity: 1 - splitEase,
          pointerEvents: splitEase > 0.5 ? 'none' : 'auto',
        }}>
          {quadrants.map((q, i) => (
            <QuadrantTeaser key={q.id} q={q}
                            viewportW={viewportW} viewportH={viewportH}
                            mapOpacity={Math.max(0, (zoomEase - 0.35) / 0.65)}
                            onClick={() => jumpTo(i)} />
          ))}

          <h1 style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            fontFamily: 'var(--serif)', fontWeight: 400,
            fontSize: fontPx, letterSpacing: letter, lineHeight: 0.88,
            margin: 0, color: 'var(--ink)', whiteSpace: 'nowrap', pointerEvents: 'none',
            opacity: 1 - zoomEase * 0.7,
          }}>
            Thinking, <span style={{ fontStyle: 'italic', color: 'var(--warm)' }}>out loud</span>.
          </h1>
        </div>

        {splitEase > 0.01 && activeIdx >= 0 && (() => {
          const clipFor = (pos: string) => {
            const rInset = Math.max(0, viewportW - crossX);
            const bInset = Math.max(0, viewportH - crossY);
            const lInset = Math.max(0, crossX);
            const tInset = Math.max(0, crossY);
            switch (pos) {
              case 'TL': return `inset(0px ${rInset}px ${bInset}px 0px)`;
              case 'TR': return `inset(0px 0px ${bInset}px ${lInset}px)`;
              case 'BL': return `inset(${tInset}px ${rInset}px 0px 0px)`;
              case 'BR': return `inset(${tInset}px 0px 0px ${lInset}px)`;
              default: return 'none';
            }
          };
          const renderClipped = (q: typeof quadrants[number]) => (
            <div key={q.id} style={{
              position: 'absolute', inset: 0,
              clipPath: clipFor(q.pos),
              pointerEvents: 'auto',
            }}>
              <QuadrantPanel q={q} opacity={splitEase} fade={1} onNav={onNav} />
            </div>
          );
          const curr = quadrants[activeIdx];
          const next = tourFrac > holdFrac && activeIdx < quadrants.length - 1
            ? quadrants[activeIdx + 1]
            : null;
          return (
            <>
              {renderClipped(curr)}
              {next && renderClipped(next)}
            </>
          );
        })()}

        <div style={{
          position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
          opacity: Math.max(0, 1 - zoomEase * 2),
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--ink-3)',
          pointerEvents: 'none',
        }}>
          <span>scroll to zoom out</span>
          <span style={{ width: 1, height: 20, background: 'var(--ink-4)', animation: 'scrollHint 1.8s ease-in-out infinite' }} />
        </div>
      </div>

      <div style={{ height: `${vh * 6.2}px` }} />

      <footer style={{
        position: 'relative', zIndex: 50,
        background: 'var(--surface)',
        borderTop: '1px solid var(--line)',
        padding: '72px 48px 32px',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 48 }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6,
              textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 18,
            }}>
              Why this site is shaped this way
            </div>
            <p style={{
              fontFamily: 'var(--serif)', fontWeight: 400,
              fontSize: 'clamp(22px, 2vw, 28px)', lineHeight: 1.35, letterSpacing: -0.3,
              color: 'var(--ink)', margin: 0, textWrap: 'balance',
            }}>
              Most portfolios show what I&rsquo;ve done. This one shows the shape of the thinking behind it — what I read, who I listen to, what I start without permission.
            </p>
            <p style={{
              fontFamily: 'var(--serif)', fontStyle: 'italic',
              fontSize: 18, lineHeight: 1.45, color: 'var(--ink-2)',
              margin: '14px 0 0', textWrap: 'pretty',
            }}>
              If you hire me for the skills list, you hire half of me.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 420 }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6,
                textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10,
              }}>
                Colophon
              </div>
              <div style={{
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 18, lineHeight: 1.35, color: 'var(--ink-3)',
              }}>
                Still being drawn. Most of it still in pencil.
              </div>
            </div>
            <nav style={{ display: 'flex', gap: 28, fontSize: 13, color: 'var(--ink-2)', flexWrap: 'wrap' }}>
              <a href="#">As a Designer</a>
              <a href="#">As a Collaborator</a>
              <a href="#">Resume<span style={{ color: 'var(--ink-4)' }}> ↗</span></a>
              <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer">LinkedIn<span style={{ color: 'var(--ink-4)' }}> ↗</span></a>
            </nav>
          </div>

          <div style={{
            fontFamily: 'var(--serif)', fontWeight: 400,
            fontSize: 'clamp(72px, 14vw, 180px)',
            letterSpacing: '-0.04em', lineHeight: 0.92,
            color: 'var(--ink)',
            whiteSpace: 'nowrap',
          }}>
            Qiyu <span style={{ fontStyle: 'italic', color: 'var(--warm)' }}>Hu</span>.
          </div>

          <div style={{ borderTop: '1px solid var(--line)' }} />

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            gap: 24, flexWrap: 'wrap',
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.4,
            textTransform: 'uppercase', color: 'var(--ink-3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: 'var(--warm)',
                animation: 'livePulse 2.4s ease-in-out infinite',
              }} />
              Open to work
            </div>
            <div style={{ textAlign: 'right', lineHeight: 1.6 }}>
              <div>Anywhere · U.S.</div>
              <div>Any industry</div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
