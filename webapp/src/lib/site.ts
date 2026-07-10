import type { CollectionEntry } from 'astro:content';
import { ROLE_META } from './roles.mjs';

export { ROLES, ROLE_META, GROUP_ORDER } from './roles.mjs';

export type Doc = CollectionEntry<'docs'>;

export const CATEGORY_ORDER = [
  'principles',
  'guides',
  'topics',
  'stacks',
  'engines',
  'frameworks',
  'skills',
  'agents',
  'extended',
];

const CATEGORY_LABELS: Record<string, string> = {
  principles: 'Principles',
  guides: 'Guides',
  topics: 'Topics',
  stacks: 'Stacks',
  engines: 'Engines',
  frameworks: 'Frameworks',
  skills: 'Skills',
  agents: 'Agents',
  extended: 'Extended',
  meta: 'Reference',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? humanize(category);
}

/** Parsed location of a doc within the knowledge base. */
export interface DocInfo {
  role: string;
  /** Category folder, or 'meta' for files at the role root (README, GLOSSARY, ...). */
  category: string;
  /** Subfolder within the category, if nested (e.g. engines/unity). */
  sub: string | null;
  /** Filename without extension, lowercased ('readme', 'skill', 'rag', ...). */
  slug: string;
}

export function docInfo(doc: Doc): DocInfo {
  const parts = doc.id.split('/');
  const role = parts[0];
  const slug = parts[parts.length - 1];
  if (parts.length === 2) return { role, category: 'meta', sub: null, slug };
  return {
    role,
    category: parts[1],
    sub: parts.length > 3 ? parts.slice(2, -1).join('/') : null,
    slug,
  };
}

/** Site route for a doc. README/SKILL files map to their folder's index. */
export function routeFor(doc: Doc): string {
  const parts = doc.id.split('/');
  const last = parts[parts.length - 1];
  if (last === 'readme' || last === 'skill') parts.pop();
  return parts.join('/');
}

export function hrefFor(doc: Doc): string {
  return `/${routeFor(doc)}/`;
}

export function roleLabel(role: string): string {
  return (ROLE_META as Record<string, { label: string }>)[role]?.label ?? humanize(role);
}

export function humanize(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function stripMd(text: string): string {
  return text
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
}

/** First H1 of the doc body, cleaned of markdown syntax. */
export function firstHeading(doc: Doc): string | null {
  const m = doc.body?.match(/^#\s+(.+)$/m);
  return m ? stripMd(m[1]) : null;
}

/** Display title: frontmatter name/title, else derived from the slug. */
export function docTitle(doc: Doc): string {
  const fm = doc.data as Record<string, unknown>;
  if (typeof fm?.name === 'string') return fm.name;
  if (typeof fm?.title === 'string') return fm.title;
  const { slug, sub, category } = docInfo(doc);
  if (slug === 'readme') {
    if (sub) return humanize(sub.split('/').pop()!);
    if (category === 'meta') return 'Overview';
    return humanize(category);
  }
  if (slug === 'skill') return humanize(sub?.split('/').pop() ?? 'skill');
  return humanize(slug);
}

/**
 * Tagline for a role card, taken from the README's H1
 * (e.g. "# @ai-engineer/ — Production LLM Engineering Knowledge Base").
 */
export function roleTagline(readme: Doc | undefined): string | null {
  if (!readme) return null;
  const h1 = firstHeading(readme);
  if (!h1) return null;
  const dash = h1.split(/\s+—\s+|\s+-\s+/);
  return dash.length > 1 ? dash.slice(1).join(' — ') : h1;
}

export interface NavItem {
  label: string;
  href: string;
  id: string;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export interface NavSection {
  category: string;
  label: string;
  groups: NavGroup[];
}

const META_ORDER = ['glossary', 'changelog'];

/** Builds the sidebar structure for a role from its docs. */
export function buildRoleNav(role: string, docs: Doc[]): NavSection[] {
  const roleDocs = docs.filter((d) => d.id.startsWith(role + '/'));
  const sections: NavSection[] = [];

  const byCategory = new Map<string, Doc[]>();
  for (const doc of roleDocs) {
    const { category } = docInfo(doc);
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(doc);
  }

  const categories = [...byCategory.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const category of categories) {
    if (category === 'meta') continue; // handled last
    const catDocs = byCategory.get(category)!;

    const bySub = new Map<string | null, Doc[]>();
    for (const doc of catDocs) {
      const { sub } = docInfo(doc);
      if (!bySub.has(sub)) bySub.set(sub, []);
      bySub.get(sub)!.push(doc);
    }

    const groups: NavGroup[] = [];
    const flat = bySub.get(null);
    if (flat) {
      groups.push({ label: null, items: flat.map(navItem).sort(byLabel) });
    }
    const subs = [...bySub.keys()].filter((s): s is string => s !== null).sort();
    for (const sub of subs) {
      const items = bySub
        .get(sub)!
        .map(navItem)
        .sort((a, b) => {
          // Folder README ("Overview" = shortest href) first, then alphabetical.
          const aIdx = a.id.endsWith('/readme') || a.id.endsWith('/skill') ? -1 : 0;
          const bIdx = b.id.endsWith('/readme') || b.id.endsWith('/skill') ? -1 : 0;
          return aIdx - bIdx || a.label.localeCompare(b.label);
        });
      // A skill folder is a single page — hoist it into the flat list.
      if (category === 'skills' && items.length === 1) {
        if (!groups.length || groups[0].label !== null) groups.unshift({ label: null, items: [] });
        groups[0].items.push(items[0]);
        continue;
      }
      groups.push({ label: humanize(sub.split('/').pop()!), items });
    }
    if (groups.length && groups[0].label === null) groups[0].items.sort(byLabel);

    sections.push({ category, label: categoryLabel(category), groups });
  }

  // Role-root reference docs (GLOSSARY, CHANGELOG, DESIGN notes) minus the README.
  const meta = (byCategory.get('meta') ?? []).filter((d) => docInfo(d).slug !== 'readme');
  if (meta.length) {
    const items = meta.map(navItem).sort((a, b) => {
      const ai = META_ORDER.indexOf(a.id.split('/').pop()!);
      const bi = META_ORDER.indexOf(b.id.split('/').pop()!);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.label.localeCompare(b.label);
    });
    sections.push({ category: 'meta', label: categoryLabel('meta'), groups: [{ label: null, items }] });
  }

  return sections;
}

function navItem(doc: Doc): NavItem {
  return { label: docTitle(doc), href: hrefFor(doc), id: doc.id };
}

function byLabel(a: NavItem, b: NavItem) {
  return a.label.localeCompare(b.label);
}
