# Information Architecture — Users Navigate Their Model, Not Yours

**Scope:** structure and labeling of content and functions — navigation, grouping, naming, findability. **Validated against:** tree-testing/card-sorting practice (Optimal Workshop-generation tooling; methods are tool-independent), first-click research (Bailey/Wolfson), WCAG 2.2 AA 2.4.x/3.2.x where IA and accessibility intersect. **Date:** 2026-07-13.

## The mental model

Information architecture is a bet about **where users will look and what words they'll look for**. Users arrive with a mental model formed by their work, their vocabulary, and every other product they use — and they navigate by *information scent*: at each junction they pick the label that smells most like their goal, commit shallowly, sniff again. Good IA means the scent trail leads to the goal; bad IA means dead air at a junction (no label matches the goal's smell) or false trails (a label smells right and isn't).

The team building the product is *structurally unable* to feel this by introspection. You know where everything is — you cannot un-know it — and your categories mirror how the product is *built* (the org chart, the database schema, the pricing tiers), which is precisely the model users don't have. So IA is the most empirically testable area in this KB, with cheap, fast methods that need no prototype at all:

- **Card sorting** (generative): users group and name your content → reveals *their* categories and vocabulary. Open sort to discover structure; closed sort to test whether proposed categories absorb the content cleanly. ~15–20 participants for stable clusters.
- **Tree testing** (evaluative): users find items in a bare text hierarchy, no styling, no search → isolates the structure itself. Metrics: task success, **directness** (right answer without backtracking), first-click. Success below ~60–70% on a money task = the structure fails; high success with low directness = right destination, weak scent en route.
- **First-click testing**: where do users click first for this task? Right first click → ~87% eventual success; wrong → ~46% (Bailey/Wolfson). The first junction carries most of the outcome.
- **Search-log and analytics mining** (free, continuous): what users type into search is their vocabulary verbatim; searches for things that *are in the navigation* are findability bug reports.

## Failure modes

### 1. The org-chart navigation

- **Failure:** top-level structure mirrors how the company is organized, not how users think: products split by internal business unit ("Platform" vs. "Solutions" — a distinction no customer has ever made), settings split by which *team owns the backend* ("Account" vs. "Profile" vs. "Preferences," three pages, no user-predictable difference), docs split by internal product codenames. Users bounce between plausible sections (pogo-sticking), give up, and use search or support tickets as their real navigation.
- **Detection:** tree-test the current structure with real task scenarios — org-chart IA typically scores catastrophically on cross-unit tasks; search logs full of nav-available items; support tickets that begin "where do I…"; the tell in meetings: the structure can only be explained by reference to internal facts ("that's under Platform because the Platform team built it").
- **Fix:** open card sort with real users to harvest their groupings and names; rebuild the tree from the clusters; validate with a tree test *before* touching the UI (the whole loop can run in two weeks and costs no engineering).
- **Prevention:** the review question for any proposed structure: *justify every grouping with a user fact, not a company fact.* If the justification names a team, a codename, or a billing system, it's the org chart wearing a trench coat.

### 2. Vocabulary mismatch — labels in the team's dialect

- **Failure:** categories are sensible but the *words* are internal: "Engagements" for what users call projects, "Assets" for what users call files, an invented brand-verb ("Boost", "Spaces", "Moments") where a boring noun would carry scent. Every mismatched label is a junction with no smell — users read it, feel nothing, and pass it by even though it's exactly what they want. The team can't see it because to them the word is transparent.
- **Detection:** search logs (users type *their* word — if searches for "invoice" are landing on a page titled "Billing documents," you have your answer); usability sessions where participants read a label aloud with a question mark ("Engagements…?"); card-sort *names* participants wrote — they're free label research; tree-test failures concentrated at one junction.
- **Fix:** rename to the users' word, even when the internal word is more precise — scent beats precision, and precision that isn't found is worth nothing. Where two user groups genuinely use different words (admins say "roles," end users say "permissions"), the label serves the group that navigates there.
- **Prevention:** a **terminology table** per domain — user word ⇄ internal word — maintained with research and enforced in specs (`spec-handoff.md`); one operation, one verb, everywhere in a flow (also WCAG 3.2.4 — vocabulary drift *within* a journey is an accessibility failure, `journey-accessibility.md` §4).

### 3. Orphaned and unreachable content

- **Failure:** content or features reachable only by direct URL, an old email link, or one buried cross-link — nothing in any navigation path leads there. Common births: a feature shipped behind a promo banner that was later removed; a section cut in a nav redesign whose pages weren't migrated; help content only linked from an error state nobody hits anymore. The feature "has low engagement," so it gets deprioritized, so it decays — a death spiral that started as a linking bug, not a value bug.
- **Detection:** crawl the click-graph — every page/screen should be reachable from the navigation roots in a bounded number of hops; compare the crawl against the route manifest/sitemap and diff. Analytics signature: pages whose traffic is ~100% direct/external with near-zero internal referrers.
- **Fix:** for each orphan, decide deliberately — re-link it into the structure where its users would look (§1's methods say where), or kill it honestly. Don't leave zombie content: it rots, and (for web) it's also an SEO and support liability.
- **Prevention:** "reachable from nav" as a ship checklist item for new surfaces; re-run the orphan crawl after any navigation redesign (that's when orphans are mass-produced); the `auditing-a-flow/README.md` playbook includes the crawl in its IA pass.

### 4. Structural shape mistakes — depth, breadth, and the one-true-place fallacy

- **Failure:** three related shapes. (a) **Too deep**: five clicks of narrow menus to reach anything, each level a fresh chance to guess wrong — error rates compound per junction. (b) **Too flat**: 40 undifferentiated links because "everything is important" — no scent hierarchy at all, users serially scan. (c) **Mono-hierarchy dogma**: the team argues for weeks about the "correct" single home for an item that users look for in two places — and whichever side wins, half the users lose. There is no law that an item lives in one place; polyhierarchy (the same item listed under both plausible parents) is usually the correct answer, and cheap.
- **Detection:** tree-test directness (deep trees show heavy backtracking); first-click spread (flat walls show first-clicks scattered near-uniformly — no scent); for mono-hierarchy pain, card sorts where an item splits ~50/50 between two categories — that split *is* the finding: it belongs in both.
- **Fix:** target 2–3 levels for primary paths with 5–9 well-differentiated options per junction — as a *scent* heuristic, not a magic number: the real criterion is that a user can reject most options at a glance; cross-list the 50/50 items under both parents (one canonical, one reference — for web, one canonical URL); differentiate the flat wall by grouping with headings before adding levels — visible grouping adds scent without adding clicks.
- **Prevention:** treat card-sort split items as polyhierarchy candidates by default; any structure proposal ships with its tree-test results attached, which makes shape mistakes visible before they're built.

## Decision tree — "we're designing / fixing a structure"

1. **Discovering** what the structure should be (new product/section)? → open card sort (15–20 real users) → draft tree from clusters → tree test → iterate until money tasks clear ~70–80% success with high directness. Zero UI needed.
2. **Validating** a proposed structure? → tree test against task scenarios (goal-framed, user vocabulary — same discipline as `usability-testing.md` §3).
3. **Diagnosing** a live product's findability complaints? → search-log mining + analytics (pogo-stick and exit patterns) + orphan crawl first — they're free and name the broken junctions; then tree-test the suspect branches.
4. **One label** in dispute? → first-click test or a 30-second comprehension probe ("what would you expect to find under X?") with 10 users; also check the search logs for the users' own word.
5. **An item that belongs in two places?** → put it in two places. Spend the argument-energy on the canonical location, not on denying the duplication.
6. Whatever you change: re-run the tree test after — IA fixes interact, and a rename that strengthens one trail can weaken another.

## War story

An enterprise HR platform had "low adoption" of its compensation-review feature — the company had considered sunsetting it. The feature sat under **"Workforce Analytics"**, because the analytics team had built it. A two-week IA pass, run before any redesign: search-log mining found "comp review", "salary review", and "merit cycle" among the top twenty searches (the feature was *being hunted*, daily); a tree test on the existing structure put the find-comp-review task at **23% success** — managers looked under "My Team" (61% of first clicks), where it wasn't; an open card sort confirmed every manager-facing task clustered under a "my team" concept that the nav distributed across three org-chart-shaped sections. The fix involved no feature work: move the entry point under My Team, rename it with the users' words ("Compensation review" — the internal name had been "WFA Insights"), cross-list it in Analytics for the HR-analyst persona (polyhierarchy, correctly earned — the card sort split exactly along persona lines). Usage tripled in a quarter. The feature had never had an adoption problem; it had a *findability* problem, and the two are indistinguishable in a usage dashboard. Rule that survived: before believing "users don't want it," prove they can find it — the proof costs two weeks and no engineers.

## Related

- Testing methods discipline (task wording, small-n honesty): `usability-testing.md`.
- Vocabulary consistency as an accessibility criterion inside flows: `journey-accessibility.md` §4.
- Carrying renames/terminology into specs: `research-to-spec.md`, `spec-handoff.md`.
- Structure review inside a broader flow assessment: `auditing-a-flow/README.md` (IA clarity pass).
