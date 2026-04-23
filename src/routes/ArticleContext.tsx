import { createContext, useContext } from 'react';
import type { ArticleFrontmatter } from '@/content';

const ArticleContext = createContext<ArticleFrontmatter | null>(null);

export const ArticleProvider = ArticleContext.Provider;
export function useArticle() {
  return useContext(ArticleContext);
}
