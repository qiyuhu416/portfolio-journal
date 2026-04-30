import type { CSSProperties } from 'react';

export type FigureSpan = 'text' | 'full' | 'bleed';

export const WRAPPER_BY_SPAN: Record<FigureSpan, CSSProperties> = {
  text:  { maxWidth: 'min(680px, 100%)',  margin: '40px auto' },
  full:  { maxWidth: 'min(1040px, 100%)', margin: '56px auto' },
  bleed: { maxWidth: '100%', margin: '72px 0', paddingLeft: 0, paddingRight: 0 },
};

export const PARATEXT_MAX = 'min(680px, 100%)';
