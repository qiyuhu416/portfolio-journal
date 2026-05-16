import { createContext, useContext } from 'react';
import type { RefObject } from 'react';
import type { ArticleFrontmatter } from '@/content';

const ArticleContext = createContext<ArticleFrontmatter | null>(null);

export const ArticleProvider = ArticleContext.Provider;
export function useArticle() {
  return useContext(ArticleContext);
}

/** Scroll-to-section helper plus enough scroll state for MDX components
 *  (e.g. <InlineTOC />) to drive their own pinned/unpinned behavior:
 *
 *    scrollToSection: anchor a click handler to the modal's inner scroll
 *      container instead of relying on browser anchor scroll (which would
 *      target the outer window).
 *    activeSection: id of the section currently under the reading line —
 *      used by the pinned rail's highlight.
 *    progress: 0 → 1 reading progress, used by the pinned rail's
 *      vertical fill.
 *    scrollContainerRef: handed off so MDX components can use it as the
 *      IntersectionObserver root for their own visibility tracking,
 *      without prop-drilling through the article body. */
export type ArticleScrollValue = {
  scrollToSection: (id: string) => void;
  activeSection: string;
  progress: number;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
};

const ArticleScrollContext = createContext<ArticleScrollValue | null>(null);

export const ArticleScrollProvider = ArticleScrollContext.Provider;
export function useArticleScroll() {
  return useContext(ArticleScrollContext);
}
