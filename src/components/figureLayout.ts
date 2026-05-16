import type { CSSProperties } from 'react';

export type FigureSpan = 'text' | 'full' | 'bleed';

export const WRAPPER_BY_SPAN: Record<FigureSpan, CSSProperties> = {
  text:  { maxWidth: 'min(680px, 100%)',  margin: '40px auto' },
  // Breaks out of .article-body's 680px column. Centers within the viewport,
  // capped at 1040px with a 16px gutter on small viewports.
  full: {
    position: 'relative',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(1040px, calc(100vw - 32px))',
    maxWidth: 'none',
    margin: '56px 0',
  },
  bleed: { maxWidth: '100%', margin: '72px 0', paddingLeft: 0, paddingRight: 0 },
};

export const PARATEXT_MAX = 'min(680px, 100%)';
