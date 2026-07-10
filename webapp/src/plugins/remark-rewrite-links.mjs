import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { visit } from 'unist-util-visit';
import { ROLES } from '../lib/roles.mjs';

// Repo root = two levels up from webapp/src/plugins/
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Rewrites relative links to .md files (e.g. `topics/rag.md`,
 * `../guides/build-a-rag-system.md#step-2`) into site routes so the docs'
 * cross-references navigate within the app. Links pointing outside the role
 * folders are left untouched.
 */
export function remarkRewriteLinks() {
  return (tree, file) => {
    const filePath = file.path ?? file.history?.[0];
    if (!filePath) return;
    const dir = path.dirname(filePath);

    visit(tree, 'link', (node) => {
      const url = node.url;
      if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#') || url.startsWith('/')) return;
      const match = url.match(/^([^#?]+\.md)(#[^?]*)?$/i);
      if (!match) return;

      const abs = path.resolve(dir, decodeURIComponent(match[1]));
      const rel = path.relative(REPO_ROOT, abs);
      if (rel.startsWith('..')) return;

      const segments = rel.split(path.sep).map((s) => s.toLowerCase());
      if (!ROLES.includes(segments[0])) return;

      const last = segments[segments.length - 1].replace(/\.md$/, '');
      segments.pop();
      // README.md is the index of its folder; SKILL.md is the skill's page.
      if (last !== 'readme' && last !== 'skill') segments.push(last);

      node.url = `/${segments.join('/')}/${match[2] ?? ''}`;
    });
  };
}
