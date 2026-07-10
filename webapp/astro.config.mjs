import { defineConfig } from 'astro/config';
import { remarkRewriteLinks } from './src/plugins/remark-rewrite-links.mjs';

export default defineConfig({
  server: {
    allowedHosts: ['grimoria.rongrong.dev'],
  },
  markdown: {
    remarkPlugins: [remarkRewriteLinks],
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});
