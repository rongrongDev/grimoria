# International SEO — Production Patterns

**Date:** 2026-07-13. **Reflects:** Google hreflang and geo-targeting documentation as of mid-2026. Extended tier: patterns + [`common-pitfalls.md`](common-pitfalls.md) only — for canonicalization fundamentals see [`../../principles/crawlability-indexability.md`](../../principles/crawlability-indexability.md).

## The mental model

International SEO answers one question per locale: *which URL should rank for a user in language L / country C?* The machinery — URL structure, hreflang, geo-signals — exists only to make your answer legible to Google. Hreflang doesn't make pages rank; it makes the *right variant* rank where several could. If your locales have genuinely different content (not just translations), most of this doc doesn't apply — they're just different pages.

## Pattern 1: URL structure per locale — decide once

```
Need country-level targeting AND have country-scale resources?
├── ccTLDs (example.de, example.fr) — strongest geo signal, highest cost:
│   separate domains, split authority, N× everything. Rarely worth it anymore.
├── Subdirectories (example.com/de/, /fr-ca/) — DEFAULT CHOICE. One domain's
│   authority shared, one infra, geo-targeting via hreflang + GSC. Use unless
│   you have a specific reason not to.
└── Subdomains (de.example.com) — weakest of both worlds; inherit only if you must.
Never: locale by cookie/Accept-Language on the SAME URL — Google crawls one
variant (usually US) and the rest don't exist. One locale = one URL, always.
```

Locale codes in paths: use the same ISO codes you'll use in hreflang (`/de/`, `/fr-ca/`) and keep them consistent site-wide.

## Pattern 2: hreflang, the implementation that survives audits

Hreflang is a *bidirectional annotation graph*: every variant lists every variant (including itself), and every listed page must link back. One missing return tag and Google ignores the pair.

- **Codes:** language in ISO 639-1, optionally region in ISO 3166-1 Alpha-2: `de`, `de-AT`, `en-GB`. There is **no code for "region without language"** and common inventions (`en-EU`, `en-UK` instead of `en-GB`, `en-LATAM`) are silently discarded.
- **`x-default`** points to the page for users matching no variant — usually the language-selector or global-English page. Include it.
- **Every hreflang URL must be**: absolute, canonical (self-canonicalizing, 200, indexable). Hreflang pointing at redirecting or non-canonical URLs is discarded.
- **Delivery mechanism — pick by page count:** `<link rel="alternate" hreflang>` in `<head>` for small sites (< a few hundred pages × locales — it bloats every page's HTML by the full variant list); **XML sitemap hreflang for anything large** (keeps pages clean, one generation point, easier to test); HTTP headers for non-HTML (PDFs).
- **Generate, never hand-write.** The graph is O(locales²) per page cluster; humans cannot maintain it. Generate from the CMS's translation-relationship data — the same source of truth that knows page X's German twin — and emit it in one place.

## Pattern 3: canonicalization across locales

Each locale variant is **self-canonical**. Even near-identical content (en-US vs en-GB with different prices) — hreflang exists precisely to tell Google these are deliberate alternates, not duplicates to fold. The one exception: true duplicates *within* one locale cluster (e.g., `/de/` and `/de-de/` serving identical pages) — canonicalize those together first, then hreflang the survivors. Canonical and hreflang must agree: hreflang targets are always the canonical URLs.

## Pattern 4: geo-signals without cloaking

Googlebot crawls predominantly from US IPs. Production pattern:

- **Never force-redirect by IP/Accept-Language.** Best case Google only ever sees the US variant; worst case it's treated as cloaking-adjacent flakiness. Instead: serve the URL requested, and offer a *dismissable banner* ("Looks like you're in Germany — view the German site?") that sets a preference cookie.
- GSC geo-targeting settings where applicable, local business schema, local links/content for country relevance.
- Currency/pricing/stock per locale rendered server-side on the locale's own URL, not geo-swapped on a shared URL.

## Testing & monitoring

- CI: validate the hreflang graph on generation — every target 200 + self-canonical + return-tag closure (a graph-closure test is ~30 lines and catches the top failure class).
- GSC (per property/locale): International Targeting-equivalent hreflang error reporting, and Performance filtered by country — the operational metric is *wrong-locale impressions* (German queries landing on the English page = the graph is broken somewhere).
- Include locale variants in the [`site-crawl-auditor`](../../agents/site-crawl-auditor.md) standing brief: it cross-checks hreflang ↔ canonical ↔ sitemap consistency at scale.
