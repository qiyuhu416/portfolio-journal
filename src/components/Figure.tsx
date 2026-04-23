import type { CSSProperties, ReactNode } from 'react';
import { useArticle } from '@/routes/ArticleContext';

type Span = 'text' | 'full' | 'bleed';

type Props = {
  src?: string;
  alt?: string;
  fig?: string;
  caption?: ReactNode;
  span?: Span;
  height?: number;
  placeholder?: boolean;
};

const WRAPPER_BY_SPAN: Record<Span, CSSProperties> = {
  text:  { maxWidth: 680,  margin: '40px auto' },
  full:  { maxWidth: 1040, margin: '56px auto' },
  bleed: { maxWidth: 'none', margin: '72px 0', paddingLeft: 0, paddingRight: 0 },
};

export function Figure({
  src,
  alt = '',
  fig,
  caption,
  span = 'text',
  height = 380,
  placeholder,
}: Props) {
  const article = useArticle();
  const tint = article?.tint ?? 'var(--ink-3)';
  const surface = article?.surface ?? 'var(--surface)';
  const showPlaceholder = placeholder || !src;

  return (
    <figure style={{ ...WRAPPER_BY_SPAN[span], padding: '0 32px' }}>
      {showPlaceholder ? (
        <div style={{
          height, background: surface,
          position: 'relative', overflow: 'hidden', borderRadius: 8,
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(45deg, transparent 0 18px, rgba(255,255,255,0.18) 18px 19px)' }} />
          <div style={{ position: 'absolute', top: 18, left: 22, fontFamily: 'var(--mono)', fontSize: 10, color: tint, letterSpacing: 0.5, opacity: 0.8 }}>
            {alt ? `PLACEHOLDER · ${alt.toUpperCase()}` : 'PLACEHOLDER · IMAGE'}
          </div>
          {fig && (
            <div style={{ position: 'absolute', bottom: 20, right: 22, fontFamily: 'var(--mono)', fontSize: 10, color: tint, letterSpacing: 0.6, opacity: 0.7 }}>
              FIG. {fig}
            </div>
          )}
        </div>
      ) : (
        <img src={src} alt={alt}
          style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 8 }} />
      )}
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
