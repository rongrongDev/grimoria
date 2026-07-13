# Mobile-First Indexing — Common Pitfalls

**Date:** 2026-07-13. Companion to [`production-patterns.md`](production-patterns.md).

Each pitfall: failure mode → detection → fix → prevention.

## 1. "Streamlined" mobile pages missing indexable substance

The mobile template drops the spec table, the FAQ, the review content, or half the nav "for a cleaner mobile UX" — and because the index is mobile-only, that content and those links are simply *gone from Google*, while the desktop-viewing team sees everything and suspects nothing. Rankings for the dropped content's queries decay over weeks.

- **Detection:** parity diff — fetch with smartphone vs desktop UA (or compare breakpoint DOMs on responsive), diff extracted text and link sets per template. GSC URL Inspection's rendered mobile HTML is the authority.
- **Fix:** restore content to the mobile DOM; use progressive-disclosure UI (accordions/tabs) rather than removal.
- **Prevention:** parity diff as a CI/release check on template changes; design review rule: mobile may *reorganize* indexable content, never *remove* it.

## 2. Fearing accordions — or trusting `display:none` too far in the wrong direction

Two symmetrical mistakes. (a) Teams remove content entirely because "hidden content is devalued" — obsolete advice: under mobile-first indexing, content in the DOM behind accordions/tabs is indexed at full weight; collapsed-by-default is a fine mobile pattern. (b) The opposite error: content *not in the DOM at all* until a click fetches it (lazy-fetch-on-expand) claims to be an accordion but is invisible to the crawler — Googlebot doesn't click ([`../../principles/rendering-strategy.md`](../../principles/rendering-strategy.md)).

- **Detection:** is the text in the rendered mobile HTML *before* any interaction? View-source / URL Inspection answers it.
- **Prevention:** accordion pattern = content server-rendered in the DOM, CSS-collapsed. Fetch-on-expand reserved for genuinely non-indexable extras.

## 3. Metadata and structured data present on desktop, missing on mobile

Separate-serving and even some responsive setups render structured data, hreflang, or meta robots conditionally — desktop full, mobile partial (a "lighter head" optimization, or a mobile template that predates the schema work). Mobile-first indexing reads the mobile head: rich results vanish, hreflang graphs break, and the desktop-checking engineer sees valid markup everywhere they look.

- **Detection:** Rich Results Test and validation runs against the *mobile* rendering (they default to smartphone UA — don't override it); [`structured-data-validator`](../../skills/structured-data-validator/SKILL.md) checks the mobile DOM.
- **Prevention:** one head-rendering code path for all form factors; validation in CI uses smartphone UA.

## 4. UA-detection rot on dynamic serving

The device-detection library ages; new Googlebot smartphone UA strings fall through to the desktop branch; Google now indexes your desktop page while users get mobile — every mobile-side bug becomes invisible and every desktop-side quirk becomes canonical. Fails silently for months.

- **Detection:** log analysis — which variant is smartphone Googlebot actually receiving (response size per UA is a quick tell)? GSC URL Inspection screenshot looks like your desktop site = smoking gun.
- **Fix/prevention:** retire dynamic serving for responsive (the standing recommendation); until then, pin UA-detection library updates to a calendar and test against current published crawler UAs in CI.

## 5. Blocking mobile assets or APIs in robots.txt

`Disallow: /mobile-api/` or a blocked JS bundle used only by the mobile layout: smartphone Googlebot renders a broken page — the page *you never see* because desktop works and your phone has a session cookie the crawler lacks.

- **Detection:** GSC URL Inspection → rendered mobile screenshot + "page resources" list showing blocked resources.
- **Prevention:** robots.txt changes get the [`indexability-regression-reviewer`](../../skills/indexability-regression-reviewer/SKILL.md) pass, which includes an asset-path check; never Disallow paths that the mobile rendering fetches.

## 6. Intrusive mobile interstitials

Full-screen app-install banners, newsletter walls, or CMPs that dominate the mobile viewport: an explicit negative page-experience signal (Google has penalized intrusive interstitials since 2017), and if the interstitial replaces DOM content, it's also *what gets indexed*.

- **Detection:** URL Inspection mobile screenshot; a human with a phone in incognito.
- **Prevention:** interstitial policy — overlays must be dismissable, not viewport-dominating on entry from search, and never DOM-replacing; legally-required CMPs sized as banners.
