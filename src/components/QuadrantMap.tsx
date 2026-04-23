import { useState } from 'react';
import type { NavFn } from '@/App';
import { quadrants, signals, type Quadrant } from '@/content';

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

type TeaserProps = {
  q: Quadrant;
  viewportW: number;
  viewportH: number;
  mapOpacity: number;
  onClick: () => void;
};

export function QuadrantTeaser({ q, viewportW, viewportH, mapOpacity, onClick }: TeaserProps) {
  const cornerPad = 64;
  const style: React.CSSProperties = {
    position: 'absolute',
    maxWidth: Math.min(340, viewportW * 0.3),
    opacity: mapOpacity,
  };
  if (q.pos === 'TL') Object.assign(style, { top: viewportH * 0.2, left: cornerPad });
  if (q.pos === 'TR') Object.assign(style, { top: viewportH * 0.2, right: cornerPad, textAlign: 'right' });
  if (q.pos === 'BL') Object.assign(style, { bottom: viewportH * 0.18, left: cornerPad });
  if (q.pos === 'BR') Object.assign(style, { bottom: viewportH * 0.18, right: cornerPad, textAlign: 'right' });

  return (
    <button onClick={onClick}
      style={{ ...style, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', color: 'inherit' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', color: q.tint, marginBottom: 10, visibility: 'hidden' }}>{q.axis}</div>
      <div style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, letterSpacing: -0.8, color: 'var(--ink)', lineHeight: 1.1 }}>{q.label}</div>
      <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-3)', marginTop: 4 }}>{q.sub}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.6, color: 'var(--ink-4)', marginTop: 14, textTransform: 'uppercase' }}>{q.items.length} items</div>
    </button>
  );
}

type PanelProps = {
  q: Quadrant;
  opacity: number;
  fade: number;
  onNav: NavFn;
};

function dispatchItemClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  href: string,
  onNav: NavFn,
) {
  if (href.startsWith('#article:')) { e.preventDefault(); onNav('article:' + href.slice(9)); }
  else if (href === '#signals' || href === '#loops') { e.preventDefault(); onNav(href.slice(1)); }
  else if (href === '#') { e.preventDefault(); }
}

export function QuadrantPanel({ q, opacity, fade, onNav }: PanelProps) {
  const itemsOpacity = clamp((fade - 0.05) * 2, 0, 1);
  const layout = q.layout ?? 'gallery';
  // Narrower column for list (reading width); wider for gallery (image grid).
  const maxW = layout === 'list' ? 720 : 920;

  return (
    <div style={{
      position: 'absolute',
      top: 80, bottom: 0, left: 0, right: 0,
      padding: '20px 48px',
      opacity,
      overflowY: 'auto',
      pointerEvents: opacity > 0.5 ? 'auto' : 'none',
    }}>
      <div style={{
        maxWidth: maxW,
        margin: '0 auto',
        paddingTop: 16,
        textAlign: 'left',
      }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.6,
          textTransform: 'uppercase', color: q.tint, marginBottom: 10,
        }}>
          {q.axis}
        </div>
        <h2 style={{
          fontFamily: 'var(--serif)', fontWeight: 400,
          fontSize: 'clamp(32px, 3.6vw, 44px)', lineHeight: 1.02, letterSpacing: -1.2,
          margin: 0, color: 'var(--ink)', textWrap: 'balance',
        }}>
          {q.label}.
        </h2>
        <p style={{
          fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 15, lineHeight: 1.4,
          color: 'var(--ink-2)', margin: '8px 0 18px',
          maxWidth: 520,
        }}>
          {q.sub}.
        </p>

        <div style={{ textAlign: 'left' }}>
          {layout === 'list' ? (
            <ListLayout q={q} onNav={onNav} itemsOpacity={itemsOpacity} />
          ) : layout === 'quotes' ? (
            <QuotesLayout itemsOpacity={itemsOpacity} />
          ) : (
            <GalleryLayout q={q} onNav={onNav} itemsOpacity={itemsOpacity} />
          )}
        </div>
      </div>
    </div>
  );
}

type LayoutProps = { q: Quadrant; onNav: NavFn; itemsOpacity: number };

/**
 * Editorial list — for quadrants whose items reward a slow read rather than a quick scan.
 * Large italic serif numerals pace the rows; no images; hairline dividers.
 * Think: a literary journal's table of contents.
 */
function ListLayout({ q, onNav, itemsOpacity }: LayoutProps) {
  return (
    <div style={{
      opacity: itemsOpacity, transition: 'opacity .3s',
      borderTop: '1px solid var(--line)',
    }}>
      {q.items.map((it, i) => (
        <a key={i} href={it.href}
           onClick={(e) => dispatchItemClick(e, it.href, onNav)}
           style={{
             display: 'grid',
             gridTemplateColumns: '64px 1fr auto',
             gap: 28,
             alignItems: 'baseline',
             padding: '14px 0 12px',
             borderBottom: '1px solid var(--line)',
             textDecoration: 'none', color: 'var(--ink)', cursor: 'pointer',
             transition: 'background .2s',
           }}
           onMouseEnter={(e) => {
             e.currentTarget.style.background = 'rgba(31,30,27,0.015)';
             const arrow = e.currentTarget.querySelector('[data-list-arrow]') as HTMLElement | null;
             if (arrow) arrow.style.transform = 'translateX(4px)';
           }}
           onMouseLeave={(e) => {
             e.currentTarget.style.background = 'transparent';
             const arrow = e.currentTarget.querySelector('[data-list-arrow]') as HTMLElement | null;
             if (arrow) arrow.style.transform = 'translateX(0)';
           }}>
          <div style={{
            fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400,
            fontSize: 34, lineHeight: 0.9, letterSpacing: -1,
            color: q.tint,
          }}>
            {String(i + 1).padStart(2, '0')}
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4,
              textTransform: 'uppercase', color: q.tint, marginBottom: 6,
            }}>
              {it.tag}
            </div>
            <div style={{
              fontFamily: 'var(--serif)', fontWeight: 400,
              fontSize: 'clamp(22px, 1.9vw, 28px)', lineHeight: 1.1,
              letterSpacing: -0.6, color: 'var(--ink)', textWrap: 'balance',
            }}>
              {it.title}
            </div>
            <div style={{
              fontFamily: 'var(--serif)', fontStyle: 'italic',
              fontSize: 14, lineHeight: 1.4, color: 'var(--ink-3)',
              maxWidth: 480, marginTop: 4, textWrap: 'pretty',
            }}>
              {it.dek}
            </div>
            {it.companies && it.companies.length > 0 && (
              <div style={{
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 12, lineHeight: 1.5, color: 'var(--ink-4)',
                marginTop: 6, display: 'flex', flexWrap: 'wrap',
                alignItems: 'center', gap: 8,
              }}>
                <span>Reflecting on time at</span>
                {it.companies.map((c, ci) => (
                  <span key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {c.logo ? (
                      <img src={c.logo} alt={c.name}
                        style={{ height: 14, display: 'block', opacity: 0.7 }} />
                    ) : (
                      <span style={{
                        fontStyle: 'normal', color: 'var(--ink-3)',
                        fontFamily: 'var(--sans)', fontSize: 12,
                        letterSpacing: 0.2, fontWeight: 500,
                      }}>
                        {c.name}
                      </span>
                    )}
                    {ci < it.companies!.length - 1 && (
                      <span style={{ color: 'var(--ink-4)', opacity: 0.6 }}>·</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 12,
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.6,
            color: 'var(--ink-4)', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            <span>{it.meta}</span>
            <span data-list-arrow style={{
              color: 'var(--ink-3)', fontSize: 14, transition: 'transform .2s',
            }}>→</span>
          </div>
        </a>
      ))}
    </div>
  );
}

/**
 * Visual contact sheet — for quadrants where the items *are* the experience
 * and each one has a photo, screenshot, or artifact worth seeing up front.
 * Image leads, tag overlays top-left, title/dek underneath.
 */
function GalleryLayout({ q, onNav, itemsOpacity }: LayoutProps) {
  const n = q.items.length;
  const cols =
    n === 2 ? 'repeat(2, minmax(0, 1fr))' :
    n === 3 ? 'repeat(3, minmax(0, 1fr))' :
    n === 4 ? 'repeat(2, minmax(0, 1fr))' :
              'repeat(auto-fill, minmax(300px, 1fr))';
  const rows = n <= 3 ? 1 : Math.ceil(n / (n === 4 ? 2 : 3));
  const rowGap = 24;
  const cardTextH = 90;
  const headerReserve = 340;
  const imageMaxH = `calc((100vh - ${headerReserve}px - ${rows * cardTextH}px - ${(rows - 1) * rowGap}px) / ${rows})`;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: cols,
      gap: `${rowGap}px 24px`,
      opacity: itemsOpacity, transition: 'opacity .3s',
    }}>
      {q.items.map((it, i) => (
        <a key={i} href={it.href}
           onClick={(e) => dispatchItemClick(e, it.href, onNav)}
           style={{
             display: 'flex', flexDirection: 'column', gap: 12,
             textDecoration: 'none', color: 'var(--ink)', cursor: 'pointer',
             transition: 'transform .2s cubic-bezier(.2,.7,.2,1)',
           }}
           onMouseEnter={(e) => {
             e.currentTarget.style.transform = 'translateY(-4px)';
             const img = e.currentTarget.querySelector('[data-card-media]') as HTMLElement | null;
             if (img) img.style.transform = 'scale(1.03)';
           }}
           onMouseLeave={(e) => {
             e.currentTarget.style.transform = 'translateY(0)';
             const img = e.currentTarget.querySelector('[data-card-media]') as HTMLElement | null;
             if (img) img.style.transform = 'scale(1)';
           }}>
          <div style={{
            position: 'relative',
            width: '100%', aspectRatio: '16 / 10',
            maxHeight: imageMaxH,
            borderRadius: 10, overflow: 'hidden',
            border: '1px solid var(--line)',
            background: 'var(--surface)',
          }}>
            <div data-card-media style={{
              position: 'absolute', inset: 0,
              background: it.image
                ? `url(${it.image}) center/cover no-repeat`
                : `linear-gradient(135deg, color-mix(in srgb, ${q.tint} 22%, transparent), color-mix(in srgb, ${q.tint} 6%, transparent))`,
              transition: 'transform .4s cubic-bezier(.2,.7,.2,1)',
            }} />
            {!it.image && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'repeating-linear-gradient(45deg, transparent 0 18px, rgba(255,255,255,0.14) 18px 19px)',
                pointerEvents: 'none',
              }} />
            )}
            <div style={{
              position: 'absolute', top: 14, left: 14,
              fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.4,
              textTransform: 'uppercase', color: q.tint, fontWeight: 500,
              padding: '4px 9px',
              background: 'rgba(250,248,243,0.92)',
              borderRadius: 3,
              backdropFilter: 'blur(4px)',
            }}>
              {it.tag}
            </div>
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--serif)', fontSize: 19, lineHeight: 1.22,
              letterSpacing: -0.3, color: 'var(--ink)', textWrap: 'balance',
            }}>
              {it.title}
            </div>
            <div style={{
              fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14,
              lineHeight: 1.4, color: 'var(--ink-3)', marginTop: 3,
              textWrap: 'pretty',
            }}>
              {it.dek}
            </div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.4,
              color: 'var(--ink-4)', marginTop: 8, textTransform: 'uppercase',
            }}>
              {it.meta}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

/**
 * Quotes — quotes others have said, and what they changed in me.
 * Editorial: large italic numeral, blockquote, small attribution, impact paragraph.
 * Pulled from signals.json so there's one source of truth for "what others changed."
 */
function QuotesLayout({ itemsOpacity }: { itemsOpacity: number }) {
  return (
    <div style={{
      opacity: itemsOpacity, transition: 'opacity .3s',
      borderTop: '1px solid var(--line)',
    }}>
      {signals.map((s) => (
        <div key={s.n} style={{
          display: 'grid',
          gridTemplateColumns: '64px 1fr',
          gap: 28,
          padding: '18px 0 16px',
          borderBottom: '1px solid var(--line)',
          alignItems: 'baseline',
        }}>
          <div style={{
            fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400,
            fontSize: 32, lineHeight: 0.9, letterSpacing: -0.8,
            color: s.tint,
          }}>
            {String(s.n).padStart(2, '0')}
          </div>
          <div>
            <blockquote style={{
              fontFamily: 'var(--serif)', fontWeight: 400,
              fontSize: 'clamp(18px, 1.6vw, 22px)', lineHeight: 1.22,
              letterSpacing: -0.3, margin: 0, color: 'var(--ink)',
              textWrap: 'balance',
            }}>
              &ldquo;{s.text}&rdquo;
            </blockquote>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4,
              textTransform: 'uppercase', color: 'var(--ink-4)', marginTop: 8,
            }}>
              {s.who} · {s.when}
            </div>
            <p style={{
              fontFamily: 'var(--serif)', fontStyle: 'italic',
              fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)',
              margin: '10px 0 0', maxWidth: 540, textWrap: 'pretty',
            }}>
              {s.changed}
            </p>
          </div>
        </div>
      ))}
      <div style={{
        padding: '28px 0 0',
        fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 15,
        lineHeight: 1.5, color: 'var(--ink-4)', textWrap: 'pretty',
      }}>
        More quotes forthcoming — the ones I haven&apos;t written down yet.
      </div>
    </div>
  );
}

type IconProps = { activeIdx: number; onJump: (i: number) => void };

export function InlineMapIcon({ activeIdx, onJump }: IconProps) {
  const [hover, setHover] = useState(false);
  const size = hover ? 160 : 28;
  const pad = hover ? 14 : 4;
  const cellW = (size - pad * 2) / 2;
  const cellH = (size - pad * 2) / 2;

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', width: size, height: size,
        background: hover ? 'rgba(250,248,243,0.98)' : 'transparent',
        border: hover ? '1px solid var(--line)' : 'none',
        borderRadius: 6,
        padding: pad,
        transition: 'width .25s cubic-bezier(.2,.7,.2,1), height .25s cubic-bezier(.2,.7,.2,1), padding .25s, background .2s, border .2s',
        boxShadow: hover ? '0 10px 30px rgba(31,30,27,0.08)' : 'none',
        cursor: hover ? 'default' : 'pointer',
        zIndex: hover ? 60 : 1,
        flexShrink: 0,
      }}>
      <div style={{ position: 'absolute', left: pad, right: pad, top: '50%', height: 1, background: 'var(--ink-3)' }} />
      <div style={{ position: 'absolute', top: pad, bottom: pad, left: '50%', width: 1, background: 'var(--ink-3)' }} />
      {quadrants.map((q, i) => {
        const col = (q.pos === 'TL' || q.pos === 'BL') ? 0 : 1;
        const row = (q.pos === 'TL' || q.pos === 'TR') ? 0 : 1;
        const isActive = i === activeIdx;
        return (
          <button key={q.id} onClick={(e) => { e.stopPropagation(); onJump(i); }}
            style={{
              position: 'absolute',
              left: pad + col * cellW, top: pad + row * cellH,
              width: cellW, height: cellH,
              background: 'transparent', border: 'none', padding: 0,
              cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
            }}>
            {isActive && (
              <div style={{
                position: 'absolute',
                width: hover ? 8 : 6, height: hover ? 8 : 6, borderRadius: '50%',
                background: q.tint,
                left: col === 0 ? (hover ? 6 : '50%') : 'auto',
                right: col === 1 ? (hover ? 6 : '50%') : 'auto',
                top: row === 0 ? (hover ? 6 : '50%') : 'auto',
                bottom: row === 1 ? (hover ? 6 : '50%') : 'auto',
                transform: hover ? 'none' : `translate(${col === 0 ? '-50%' : '50%'}, ${row === 0 ? '-50%' : '50%'})`,
                transition: 'all .25s',
              }} />
            )}
            {hover && (
              <div style={{
                position: 'absolute',
                left: col === 0 ? 6 : 'auto', right: col === 1 ? 6 : 'auto',
                top: row === 0 ? 20 : 'auto', bottom: row === 1 ? 8 : 'auto',
                maxWidth: cellW - 14,
                textAlign: col === 0 ? 'left' : 'right',
              }}>
                <div style={{
                  fontFamily: 'var(--serif)', fontSize: 11, lineHeight: 1.1, letterSpacing: -0.1,
                  color: isActive ? q.tint : 'var(--ink-2)',
                  fontWeight: isActive ? 500 : 400,
                }}>{q.label}</div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
