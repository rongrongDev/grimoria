---
name: structured-data-validator
description: >
  Validate a page's (or template's) structured data three ways: schema.org
  validity, Google rich-result eligibility (required/recommended properties
  for the specific feature), and truthfulness against visible page content
  (the manual-action risk no automated validator checks). Use when asked to
  "check/validate schema markup", "why don't we get rich results", when
  reviewing a diff that touches JSON-LD or its data sources, or as the
  per-template worker in a fan-out audit. Do NOT use for: whole-site
  structured-data discovery (site-crawl-auditor inventories, then fan out
  this skill per template), writing new markup from scratch (read
  principles/structured-data.md decision guide first, then implement, then
  validate with this), or non-search metadata (OpenGraph/Twitter cards).
---

# Structured Data Validator

**Date:** 2026-07-13. **Reflects:** schema.org v29.x and Google rich-result documentation as of mid-2026 (feature list is volatile — step 3a re-verifies at use time).

You are checking structured data against the three bars defined in [`../../principles/structured-data.md`](../../principles/structured-data.md) (read its mental model first): **valid → eligible → truthful.** They fail differently — invalid markup is silently ignored, ineligible markup earns nothing, untruthful markup earns a site-wide manual action — so the report must keep them separate. The third bar is the one only you can check: no validator compares markup to what a human sees on the page, and that comparison is where careers are saved (see the fabricated-ratings war story in the principles doc).

## Inputs

A URL, a rendered HTML file, or a template + repo access. **Always work from the rendered output** (mobile UA — the index is mobile-first, and desktop-only markup is a known pitfall class), not from source templates: what Google parses is the rendered DOM.

## Procedure

**Step 1 — Extract and parse.** Pull every `<script type="application/ld+json">` block (plus any legacy microdata/RDFa — flag those for migration to JSON-LD). Confirm each parses as JSON *at all* — a trailing comma silently kills an entire block, and this five-second check finds real incidents. Confirm the blocks are in the server HTML, not JS-injected (fetch without JS; injected-only markup = finding, per [`rendering-strategy.md`](../../principles/rendering-strategy.md)).

**Step 2 — schema.org validity.** Recognized `@type`s and property names (typos like `aggregateRatings`, wrong casing); value types (numbers as numbers — `"price": "19.99"` string is tolerated but `"$19.99"` is not; ISO 8601 dates; absolute URLs); `@id` graph coherence (entities connected, no duplicate conflicting blocks describing the same thing — the plugin-plus-theme double-markup classic).

**Step 3 — Google eligibility.** Identify which rich-result feature each block targets. Then: (a) **verify the feature still exists** — Google prunes rich-result types regularly; check the current supported-features documentation before promising anything (the KB's principles doc carries a volatility warning for a reason); (b) check every *required* property for that feature is present and non-empty; (c) list missing *recommended* properties (eligibility-relevant, lower priority); (d) check feature-specific rules (e.g. `Product` needs `offers` or review/rating data; images meeting minimum requirements).

**Step 4 — Truthfulness (the pass that matters most).** Render the page as a user sees it and compare against every marked-up claim:

- Ratings/review markup ↔ are there visible reviews with plausibly-matching values? **Where does the rating value come from in code — can it ever be a default/fallback?** A hardcoded or defaulted rating is a finding even if today's value happens to match.
- Price/availability ↔ on-page price and stock state.
- Content-type honesty: is a `FAQPage` actually FAQs visible on the page? `JobPosting` still open? `Event` date real?
- Anything in markup that a user cannot see on this page = finding, severity high.

**Step 5 — Gaps (when reviewing a template, not just a block).** Does this page type have an obvious eligible feature it isn't using? One line, not a project plan — point to the principles doc's decision guide.

## Output format

```
## Structured Data Review: <URL/template> — <date>
Rendered via: <mobile UA fetch | provided HTML> | Blocks found: <n> (server-rendered: y/n each)
### Bar 1 — Validity      | # | Block/@type | Issue | Evidence | Fix |
### Bar 2 — Eligibility   | # | Feature | Missing required | Missing recommended | Feature still supported? (checked <date>) |
### Bar 3 — Truthfulness  | # | Claim in markup | What the page shows | Source in code (if repo access) | Risk |
### Gaps (optional, ≤3 lines)
### Verdict: CLEAN | FIX BEFORE SHIP | MANUAL-ACTION RISK (bar-3 findings present)
```

Severity discipline: any bar-3 finding outranks every bar-1/bar-2 finding — a page with a JSON typo loses a rich result; a page with fabricated ratings can lose rich results *for the whole site*. If you have repo access and found a bar-3 issue, always trace the value to its source: "the markup lies" is a symptom; "the template defaults `ratingValue` to 5.0 when reviews are empty" is the finding.
