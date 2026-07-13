# System Prompt Design

**Last reviewed:** 2026-07-13 · **Applies to:** Claude 4.x–5, GPT-5-era models. The instruction-hierarchy specifics (how strongly system outranks user turns) vary by model family — see `extended/cross-model-portability.md`.
**Read this when:** writing a system prompt, or inheriting one nobody fully remembers writing.
**Worldview:** `principles/core-principles.md` rules 9–10 · **Multi-turn persistence:** `extended/multi-turn-design.md`.

A system prompt is the *constitution* of a deployment: the rules true for every request, holding the highest slot in the instruction hierarchy, persisting across the whole conversation. That's also its curse — because it's always in scope, every incident looks fixable by adding a sentence to it, and constitutions amended weekly by whoever was on call stop being constitutions.

The load order that works, and why:
1. **Role** — who the model is (one paragraph, decisions not flavor — §1)
2. **Hard constraints / policy** — the never/always rules, fewest possible, each earning its place (§2)
3. **Task rules** — how to do the actual job, including edge-case and uncertainty behavior
4. **Reference material** — delimited, clearly marked as data (`extended/injection-aware-structure.md`)
5. **Output contract** — format, skeleton last (rule 10: nearest tokens pull hardest)

---

## 1. Role-setting: too vague to constrain, or too rigid to survive edge cases

**Failure mode, vague flank.** "You are a helpful customer support assistant." — constrains nothing. Every behavioral question (may it discuss competitors? promise timelines? apologize on behalf of the company?) is left to per-request improvisation, which is `topics/clarity-and-specification.md` §1 wearing a persona. The author *feels* they've set behavior because the sentence reads like behavior-setting; a role earns its tokens only through what it decides.

**Failure mode, rigid flank.** The overcorrection: a role so specific it fails legitimate inputs. "You are a mortgage specialist; only discuss mortgages" — user asks whether to also close a linked checking account, and the model stonewalls a reasonable adjacent question, or worse, contorts it into mortgage advice. Rigid roles fail *silently at the boundaries*, where real conversations actually live.

**War story.** A financial-advice assistant's role said "You are an expert advisor. Be confident and decisive" (added to fix hedging complaints). It started delivering confident, decisive answers to questions outside its retrieval corpus — the persona instruction outweighed the grounding instruction on out-of-corpus queries. Confidence is not a personality trait to request; it's a property that should *emerge from having grounds*. The fix defined behavior by grounds: "answer from the provided documents; when they don't cover the question, say so and name what's missing" — and the hedging complaints stayed fixed, because the original problem had been hedging *on well-covered questions*, which the grounds-based rule also addressed.

**Detection.**
- **Decision test for vagueness:** list five behavioral questions the deployment will face; check whether the role text answers any. Zero answers = decorative role.
- **Boundary probe for rigidity:** run adjacent-but-legitimate requests (the checking-account question) and off-mission requests; a good role passes the first and deflects the second. If it fails both the same way, it's rigid; if it passes both, it's vague.
- The `edge-case-behavior-scanner` with an off-role input category measures this directly.

**Fix.** Write the role as *decisions plus an escape hatch*: identity in one sentence, then what it does, what it never does, and — the part everyone omits — **what to do with requests outside the lane** ("politely redirect to X" / "answer briefly, then return to the task"). The escape hatch is what converts rigid into robust; without it the model invents a different deflection per request.

**Prevention.** Role review question in every audit: "name a behavior this role text *changes*." Regression set includes boundary cases on both flanks (in-lane edge, adjacent-legit, off-mission).

## 2. Patch accumulation — the unmaintainable system prompt

**Failure mode.** Every incident adds a sentence; nothing is ever deleted; ordering reflects incident chronology, not logic. Eighteen months later the prompt is 2,000 tokens of sedimented patches: rules whose motivating features were deprecated, three partial restatements of the same instruction with different wording (each teaching the model the others are negotiable), and instructions that contradict at the edges. No one has read it end-to-end in months, because reading it is frightening. Attention dilution makes every rule weaker; each new patch degrades compliance with the old ones, which causes incidents, which cause patches. It compounds.

**War story.** The callback-collision prompt (`principles/core-principles.md` rule 9): "always offer a callback" (March) vs. "never offer callbacks during high-volume periods" (July), "high-volume" undefined, discovered only when someone finally read the whole prompt aloud in an incident review. The pair had been alternating in production for weeks. Neither sentence had been wrong when added; the *accumulation process* was the defect.

**Detection.**
- **The read-aloud test:** one person reads the entire prompt to another, who flags every rule they can't explain. Crude, embarrassing, devastatingly effective.
- Mechanical signals: prompt length trending monotonically up across versions; multiple sentences sharing a topic (grep for repeated keywords — "refund" appearing in five rules is five chances to disagree); rules referencing features/policies you can't find in the current product.
- `prompt-clarity-reviewer` step 3 (pairwise conflict scan) catches the collisions; only a human with product context can catch the *obsolete*.

**Fix.** Refactor like legacy code, with the same safety protocol:
1. Freeze a regression set against current behavior *first* (what's worth keeping must be pinned before you touch anything — `topics/versioning-and-regression-testing.md`).
2. Inventory every rule with its motivating incident (git archaeology; ask the old-timers).
3. Rules with dead motivations → delete. Restatements → merge into one canonical rule. Collisions → resolve with explicit precedence or a defined condition (`topics/clarity-and-specification.md` §2).
4. Reorder into the load order at the top of this doc.
5. Regression run; diff with the `prompt-version-differ` subagent; expect to *intentionally* change some behaviors — list them for stakeholder sign-off rather than discovering them in production.

**Prevention.** Three habits, cheap individually, transformative together:
- **Every rule's motivation lives in version notes** (not in the prompt — the model doesn't need the history; the maintainer does). A rule without a recoverable motivation is presumed deletable.
- **Prefer a regression case to a prompt sentence** where the behavior is already implied — most patches legislate what the prompt already said, because nobody checked before adding (`principles/decision-trees.md` §6).
- **A token budget with an owner.** When the prompt exceeds it, something must be deleted or merged before anything is added. Budgets force the deletions that goodwill never gets around to.

## 3. Conflicting instructions accumulated across iterative editing

**Failure mode.** The temporal flavor of conflict: not two authors disagreeing, but *one prompt disagreeing with its own past*. Edits update rule text in one place while stale echoes persist elsewhere — the tone section says "professional and concise" while a later example cheerfully emits emoji; the policy block was rewritten but the closing summary sentence still paraphrases the old policy. The model receives all layers simultaneously and resolves per-request. Distinct from §2 (too many rules) — this is *inconsistent versions of the same rule*, and it especially afflicts prompts edited by multiple people without a single owner.

Special case that deserves its own alarm: **instructions vs. embedded examples.** Editing instructions while examples still demonstrate the old behavior means the examples win (`topics/few-shot-examples.md` §4). The system-prompt variant is nastier because system-prompt examples are read on *every request of every conversation*.

**Detection.**
- **Thematic diff:** group every sentence touching the same theme (tone, refusals, formats, one per grep) and read each group as a set. Stale echoes announce themselves.
- Version-control archaeology: edits that changed one occurrence of a rule when the prompt contains two.
- Behavior signature: output matches an instruction you *remember deleting* — you deleted one copy.

**Fix.** One rule, one home: each behavioral theme gets exactly one place in the prompt where it's defined, and summaries/examples/closing reminders *reference* rather than restate ("follow the tone rules above" — restating is how echoes breed). Then the thematic diff, then reconcile every example against current rules.

**Prevention.** Single named owner per production system prompt — not sole editor, but sole *merger*, the person who reads every diff against the whole. PR-template checklist for prompt changes: "grep'd for other statements of this rule? examples still consistent?" Regression run on every edit, however trivial the edit looks; one-word edits have flipped behaviors (rule 1's war story was an adjective).

---

## Cross-references

- Instruction placement and cache-friendly layout: `principles/decision-trees.md` §4, `extended/cost-and-token-efficiency.md` §2.
- Keeping system-prompt authority over long conversations: `extended/multi-turn-design.md`.
- Separating your constitution from untrusted content: `extended/injection-aware-structure.md`.
- The refactor protocol, end to end, on an inherited prompt: `guides/audit-an-existing-prompt.md`.
