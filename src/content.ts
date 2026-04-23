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

export type QuadrantItem = {
  tag: string;
  title: string;
  dek: string;
  meta: string;
  href: string;
  image?: string;
  /** Where the thinking came from — the "reflection credit line" under the dek. */
  companies?: Company[];
};

export type QuadrantLayout = 'list' | 'gallery' | 'quotes' | 'projects';

export type Quadrant = {
  id: string;
  label: string;
  sub: string;
  axis: string;
  pos: 'TL' | 'TR' | 'BL' | 'BR';
  tint: string;
  framing: string;
  layout?: QuadrantLayout;
  items: QuadrantItem[];
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
