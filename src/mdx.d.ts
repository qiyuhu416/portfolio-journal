/// <reference types="vite/client" />

declare module '*.mdx' {
  import type { ComponentType } from 'react';
  import type { ArticleFrontmatter } from '@/content';
  export const frontmatter: ArticleFrontmatter;
  const Component: ComponentType;
  export default Component;
}
