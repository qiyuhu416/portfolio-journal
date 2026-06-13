import { useState } from 'react';

export type WhatIfRow = {
  whatIf: string;
  poc: string;
  images?: string[];
};

export function WhatIfTable({ rows }: { rows: WhatIfRow[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [imgIdx, setImgIdx] = useState(0);

  const openRow = (i: number) => { setOpen(i); setImgIdx(0); };
  const close = () => setOpen(null);
  const activeRow = open !== null ? rows[open] : null;
  const images = activeRow?.images ?? [];

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 12,
        margin: '1.5em 0',
      }}>
        {rows.map((row, i) => {
          const hasImages = (row.images?.length ?? 0) > 0;
          const thumb = row.images?.[0];
          return (
            <div
              key={i}
              onClick={hasImages ? () => openRow(i) : undefined}
              style={{
                borderRadius: 6,
                overflow: 'hidden',
                border: '1px solid var(--line)',
                cursor: hasImages ? 'pointer' : 'default',
                background: 'var(--surface)',
                transition: 'box-shadow .18s, transform .18s',
                display: 'flex',
                flexDirection: 'column',
              }}
              onMouseEnter={e => {
                if (!hasImages) return;
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.10)';
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '';
                (e.currentTarget as HTMLDivElement).style.transform = '';
              }}
            >
              {/* Image / placeholder */}
              <div style={{
                aspectRatio: '4/3',
                background: thumb ? undefined : 'var(--line)',
                overflow: 'hidden',
                flexShrink: 0,
              }}>
                {thumb
                  ? <img src={thumb} alt={row.poc} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>add image</span>
                    </div>
                }
              </div>

              {/* Text */}
              <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  What if…
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.45, color: 'var(--ink)', fontStyle: 'italic' }}>
                  {row.whatIf}
                </div>
                <div style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4, marginTop: 2 }}>
                  {row.poc}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {open !== null && images.length > 0 && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg)',
              borderRadius: 8,
              overflow: 'hidden',
              maxWidth: 900,
              width: '100%',
              boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '14px 20px', borderBottom: '1px solid var(--line)',
            }}>
              <div>
                <div style={{ fontFamily: 'var(--sans)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 4 }}>What if…</div>
                <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--ink)' }}>{activeRow?.whatIf}</div>
              </div>
              <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--ink-3)', lineHeight: 1, padding: '2px 6px' }}>×</button>
            </div>

            <img
              src={images[imgIdx]}
              alt={activeRow?.poc}
              style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '65vh', objectFit: 'contain', background: 'var(--surface)' }}
            />

            {images.length > 1 && (
              <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)', overflowX: 'auto' }}>
                {images.map((src, j) => (
                  <img key={j} src={src} onClick={() => setImgIdx(j)}
                    style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', flexShrink: 0, outline: j === imgIdx ? '2px solid var(--tint-tr)' : '2px solid transparent' }}
                  />
                ))}
              </div>
            )}

            <div style={{ padding: '10px 20px', fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--ink-3)', borderTop: images.length > 1 ? 'none' : '1px solid var(--line)' }}>
              PoC — {activeRow?.poc}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
