# International SEO — Common Pitfalls

**Date:** 2026-07-13. **Reflects:** Google hreflang documentation as of mid-2026. Companion to [`production-patterns.md`](production-patterns.md).

Each pitfall: failure mode → detection → fix → prevention.

## 1. Missing return tags (the #1 hreflang failure, by a mile)

`/en/page` declares `hreflang="de"` → `/de/page`, but `/de/page` doesn't declare the English variant back. Google discards the non-reciprocal annotation; wrong-locale pages start ranking. Root cause is almost always *partial generation*: the English template got hreflang support, the German one shipped later without it, or the two locales render from different templates/services.

- **Detection:** graph-closure check (crawl all variants, assert symmetry) — GSC reports "no return tags" but lags and samples; your own check is authoritative.
- **Fix:** generate all locales' annotations from one shared source (the translation-relationship table), never per-template.
- **Prevention:** the CI closure test from production-patterns; hreflang emission owned by one code path.

## 2. Invented or wrong locale codes

`en-UK` (correct: `en-GB`), `en-EU` (no such region), `se` for Swedish (that's the *country* code for Sweden; the language is `sv`), `cz` for Czech (correct: `cs`). Silently ignored — no error, just no effect, discovered months later when the wrong locale ranks.

- **Detection/prevention:** validate every emitted code against the ISO 639-1 / 3166-1 lists in CI. A lookup table, five minutes, permanent immunity.

## 3. Hreflang pointing at non-canonical or redirecting URLs

The graph references `http://` URLs after an https migration, or trailing-slash variants that 301, or pages that canonical elsewhere. Google follows the reference, finds it isn't a canonical 200 page, discards the annotation. Especially common *after site migrations* — the redirect map got updated, the hreflang generator didn't ([`../site-migrations/common-pitfalls.md`](../site-migrations/common-pitfalls.md)).

- **Detection:** fetch every hreflang target: assert 200, no redirect, self-canonical. Part of the CI closure test and the `site-crawl-auditor` brief.
- **Prevention:** hreflang generator consumes the same canonical-URL builder as everything else ([`../../principles/site-architecture.md`](../../principles/site-architecture.md) §one-URL-builder).

## 4. Cross-locale canonicalization — deindexing your own translations

All locale variants canonical → the English page ("they're duplicates, right?"). Wrong: you just told Google to drop every non-English variant from the index. Traffic from every non-English market evaporates; the symptom in GSC is "Duplicate, Google chose different canonical" or "Alternate page with proper canonical tag" swallowing entire locale folders.

- **Fix:** self-canonical per variant + hreflang, per production-patterns Pattern 3.
- **Prevention:** template test asserting each locale page canonicals to *itself*.

## 5. IP-based force-redirects hiding locales from Google

Visitors (and Googlebot, from US IPs) hitting `/de/` get 302'd to `/en/` "for their convenience." Google can never crawl the German pages; they fall out of the index; German rankings go to competitors. Also infuriates VPN users and travelers.

- **Detection:** fetch locale URLs from a US IP (or plain curl from your US CI runner) — do you get the content or a redirect?
- **Fix/prevention:** dismissable suggestion banner, never a redirect (Pattern 4). This one is worth a deploy-checklist line because "helpful" geo-redirects get re-added by well-meaning PMs roughly annually.

## 6. Machine-translating at scale and calling it a locale strategy

Thousands of raw machine-translated pages, no local review, thin duplicated boilerplate — this lands in scaled-content-abuse territory under Google's spam policies and can drag the whole site, not just the translations. Translated ≠ localized either: an `en-GB` page with dollar prices and US phone numbers converts nobody even when it ranks.

- **Prevention:** launch locales you can actually maintain; noindex (or don't ship) machine-translation-only tiers; localize the money elements (currency, contact, trust markers) before scaling page count.

## 7. Locale-splitting one language without differentiation

Separate `en-US`, `en-GB`, `en-AU`, `en-CA` pages that are byte-identical. You've quadrupled crawl load and split ranking signal four ways for zero targeting benefit — near-duplicate fragmentation, the [`site-architecture.md`](../../principles/site-architecture.md) §1 disease with a passport.

- **Fix:** one `en` page unless variants differ materially (pricing, availability, spelling, legal); split only the page types that need it.
