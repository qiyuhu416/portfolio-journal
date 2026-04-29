import type { ComponentType } from 'react';
import signalsData from '@content/signals.json';
import quadrantsData from '@content/quadrants.json';
import loopsSpectrumData from '@content/loops-spectrum.json';

export type ArticleSection = { id: string; label: string };

export type ArticleLayout = 'centered' | 'split';

export type ArticleFrontmatter = {
  slug: string;
  num: string;
  quality: string;
  title: string;
  dek: string;
  date: string;
  readtime: number;
  tint: string;
  surface: string;
  hero?: string;
  sections: ArticleSection[];
  /** Per-article layout. 'centered' (default) puts title above body in one column.
   *  'split' anchors title/dek/section-rail in a sticky left column, body in the right. */
  layout?: ArticleLayout;
};

export type Article = {
  meta: ArticleFrontmatter;
  Body: ComponentType;
};

type MdxModule = { default: ComponentType; frontmatter: ArticleFrontmatter };

const mods = import.meta.glob<MdxModule>('../content/articles/*/index.mdx', {
  eager: true,
});

export const articles: Article[] = Object.values(mods)
  .map((m) => ({ meta: m.frontmatter, Body: m.default }))
  .sort((a, b) => a.meta.num.localeCompare(b.meta.num));

export const bySlug: Record<string, Article> = Object.fromEntries(
  articles.map((a) => [a.meta.slug, a]),
);

export type Signal = {
  n: number;
  text: string;
  who: string;
  when: string;
  changed: string;
  tint: string;
};

export type Company = {
  name: string;
  /** Optional path to a monochrome SVG/PNG mark. If omitted, the name renders as text. */
  logo?: string;
};

/** Small thumbnail revealed on scatter-dot hover. `src` optional — placeholder chips render
 *  as a tinted square when there's no asset yet, so the dot still hints at content shape. */
export type PreviewChip = { label?: string; src?: string };

export type QuadrantItem = {
  tag: string;
  title: string;
  dek: string;
  meta: string;
  href: string;
  image?: string;
  /** Where the thinking came from — the "reflection credit line" under the dek. */
  companies?: Company[];
  /** Normalized plot coords (0–1) — only used when the parent quadrant's layout is 'scatter'. */
  x?: number;
  y?: number;
  /** 'cta' renders the scatter dot as an open-ring call-to-action with a count and ↗ glyph
   *  instead of an article-style filled dot. Default is article-like. */
  kind?: 'cta';
  /** Headline number for 'cta' items (e.g., "72" → "N = 72"). */
  count?: string;
  /** Small preview chips revealed on scatter-dot hover, hinting at the content's shape. */
  previews?: PreviewChip[];
  /** When true, render the link with target=_blank — for CTA items pointing off-site. */
  external?: boolean;
};

export type QuadrantLayout = 'list' | 'gallery' | 'quotes' | 'projects' | 'scatter' | 'statement';

/** A single chunk of a statement-layout quadrant. Plain `text` reads as body
 *  copy; a `phrase` is a hoverable, colored highlight that opens an article
 *  modal on click. The href follows the standard `#article:<slug>` convention. */
export type StatementSegment =
  | { type: 'text'; text: string }
  | { type: 'phrase'; text: string; href: string; tint: string };

/** Labels for the scatter plot's axes. Tuples are [low, high] — i.e. [left, right] and [top, bottom]. */
export type QuadrantAxes = {
  x: [string, string];
  y: [string, string];
};

export type Quadrant = {
  id: string;
  label: string;
  sub: string;
  axis: string;
  pos: 'TL' | 'TR' | 'BL' | 'BR';
  tint: string;
  framing: string;
  layout?: QuadrantLayout;
  axes?: QuadrantAxes;
  items: QuadrantItem[];
  /** Used when `layout === 'statement'`: an ordered list of text and phrase
   *  segments that compose the panel's hero sentence. */
  statement?: StatementSegment[];
};

export type LoopPoint = { x: number; label: string; tone: 'warm' | 'cool' };

export const signals = signalsData as Signal[];
export const quadrants = quadrantsData as Quadrant[];
export const loopsSpectrum = loopsSpectrumData as LoopPoint[];

export function findQuadrantBySlug(slug: string): Quadrant | null {
  const href = `#article:${slug}`;
  for (const q of quadrants) {
    if (q.items.some((it) => it.href === href)) return q;
  }
  return null;
}
