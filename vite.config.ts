import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editMdxPlugin } from './vite-plugin-edit-mdx';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      enforce: 'pre',
      ...mdx({
        remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
      }),
    },
    react({ include: /\.(jsx|tsx|mdx)$/ }),
    // Dev-only: exposes /api/edit-mdx so <EditMode> can persist inline edits
    // back to source MDX files. Stripped from production builds automatically
    // (the plugin sets `apply: 'serve'`).
    editMdxPlugin({ contentRoot: 'content/articles' }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      '@content': path.resolve(root, 'content'),
    },
  },
});
