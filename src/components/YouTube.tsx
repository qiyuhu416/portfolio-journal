import type { CSSProperties, ReactNode } from 'react';

type Span = 'text' | 'full' | 'bleed';

type Props = {
  /** YouTube video ID — the part after `youtu.be/` or `v=`. e.g. "cUdWs5kfGss" */
  id: string;
  /** Optional start time in seconds */
  start?: number;
  /** Figure number shown in the caption ("Fig. 02 · …"). Optional. */
  fig?: string;
  caption?: ReactNode;
  /** Accessible title for the iframe. Falls back to "Embedded video". */
  title?: string;
  /** Column width: `text` (680), `full` (1040), or `bleed` (edge-to-edge). */
  span?: Span;
};

const WRAPPER_BY_SPAN: Record<Span, CSSProperties> = {
  text:  { maxWidth: 680,  margin: '40px auto' },
  full:  { maxWidth: 1040, margin: '56px auto' },
  bleed: { maxWidth: 'none', margin: '72px 0' },
};

/**
 * YouTube video embed, styled to match the site's Figure language.
 * Uses youtube-nocookie.com for privacy. 16:9 aspect ratio preserved
 * across widths via CSS aspect-ratio.
 */
export function YouTube({
  id,
  start,
  fig,
  caption,
  title = 'Embedded video',
  span = 'text',
}: Props) {
  const params = new URLSearchParams();
  if (start) params.set('start', String(start));
  params.set('rel', '0'); // don't show other-channel recommendations after
  const src = `https://www.youtube-nocookie.com/embed/${id}${
    params.toString() ? `?${params.toString()}` : ''
  }`;

  return (
    <figure style={{ ...WRAPPER_BY_SPAN[span], padding: '0 32px' }}>
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--surface)',
      }}>
        <iframe
          src={src}
          title={title}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            border: 'none',
          }}
        />
      </div>
      {(caption || fig) && (
        <figcaption style={{
          maxWidth: 680, margin: '14px auto 0',
          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', letterSpacing: 0.3,
        }}>
          {fig && <>Fig. {fig} · </>}{caption}
        </figcaption>
      )}
    </figure>
  );
}
