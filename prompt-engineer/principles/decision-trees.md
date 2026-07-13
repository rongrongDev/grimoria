# Decision Trees — The Forks, With Defaults

**Last reviewed:** 2026-07-13 · **Applies to:** Claude 4.x–5 family, GPT-5-era models. Defaults are stated for current-generation frontier models; older or much smaller models shift several forks (noted inline).
**Read this when:** you're at a design fork and about to write "it depends" in a design doc.

Each tree gives a default, the conditions that overturn it, and where the deep treatment lives. Defaults are chosen for *production reliability*, not benchmark squeezing.

---

## 1. Zero-shot vs. few-shot

**Default: start zero-shot with a precise spec and an output skeleton. Add examples only for what prose can't specify.**

```
Is the task format/style/judgment hard to state precisely in words?
├── NO — the spec is statable (extract X, classify into these 5 labels with
│        definitions, answer from the document)
│   └── Zero-shot + explicit spec + literal output skeleton.
│       Examples here mostly add cost and overfit risk (rule 5).
└── YES — "write it like this", nuanced label boundaries, tone, edge-case
         judgment calls that resist definition
    ├── Can you write 3–5 examples that are *correct, current, and diverse*?
    │   ├── YES → few-shot. Design them per topics/few-shot-examples.md —
    │   │        selection, ordering, and diversity are the actual work.
    │   └── NO → fix that first. Wrong or stale examples are worse than none;
    │            the model follows them over your instructions.
    └── Is the ambiguity actually resolvable by *definitions*?
        └── Often YES — before adding examples, try defining the label
            boundary in words. Cheaper, and it doesn't smuggle in accidental
            patterns.
```

Overturns the default toward few-shot: smaller models (Haiku-class) follow examples better than abstractions; genuinely style-transfer tasks; label sets whose boundaries you failed to define after honest effort. Overturns toward zero-shot: strict token budgets; tasks where examples keep going stale (`topics/few-shot-examples.md` §4); current frontier models on well-specified extraction/classification, where examples measurably add little.

## 2. Chain-of-thought or not

**Default: no explicit CoT for retrieval-shaped, extraction-shaped, or single-hop tasks; CoT (or a native reasoning mode) for genuinely multi-step ones. Decide by eval, not vibes.**

```
Does a competent human need scratch work for this task?
├── NO (lookup, extraction, simple classification, rewrite)
│   └── Skip CoT. It adds tokens, latency, and — on classification —
│       sometimes *hurts* by talking the model out of a right first answer.
├── YES (math, multi-constraint planning, multi-hop inference, code reasoning)
│   ├── Model has a native reasoning/extended-thinking mode?
│   │   ├── YES → prefer it over prompted "think step by step"; it's
│   │   │        trained-for and separable from the answer. Budget it.
│   │   └── NO → prompted CoT into a delimited section (<thinking>…),
│   │            answer in a separate section so parsers never see the trace.
│   └── Either way: run the eval with and without. Keep CoT only if
│       accuracy moves. Verbosity that doesn't move accuracy is pure cost.
└── UNSURE → run 30 eval cases both ways. This fork is cheap to test and
             expensive to guess.
```

Never: rely on the trace as a correctness check (`topics/reasoning-elicitation.md` §3), or let trace text reach downstream parsers or end users unreviewed.

## 3. Prompted structure vs. API-enforced structured output

**Default: if the output feeds a parser, use API-level enforcement (tool/function schema, JSON mode, grammar constraints). Prompt-only JSON is for prototypes.**

```
Will code parse this output?
├── NO (human reads it) → prompt-level formatting (markdown, sections) is fine.
├── YES
│   ├── Provider offers schema enforcement for your shape?
│   │   ├── YES → use it. The prompt still owns SEMANTICS: field meanings,
│   │   │        null-vs-empty rules, enum boundary definitions. Enforcement
│   │   │        guarantees valid JSON, not correct JSON.
│   │   └── NO (exotic format, no API support) →
│   │       literal output skeleton in the prompt + example + "output nothing
│   │       else" + a downstream validator with a repair path. Expect a
│   │       nonzero break rate; measure it. (topics/structured-output.md §2)
│   └── Is the schema fighting the model's priors (deeply nested, unusual
│       key conventions, prose-in-JSON)?
│       └── Flatten the schema before strengthening the prompt. The format
│           that's easy to emit is the format you'll get reliably.
```

## 4. Where does an instruction go — system prompt vs. user turn vs. data block?

**Default: stable rules → system prompt; per-request task and data → user turn; reference material → delimited data blocks; format anchor → last thing before generation.**

```
Is it true for every request this deployment serves?
├── YES (role, policy, output contract, edge-case rules) → system prompt.
│        Also the stable-prefix cache zone — keep volatile values OUT
│        (extended/cost-and-token-efficiency.md §2).
├── NO, varies per request → user turn. Task statement first, then data,
│        then the format reminder/skeleton last (rule 10: endings are
│        load-bearing).
└── It's CONTENT the model should read but not obey (documents, tool
    results, user-generated anything) → delimited block + explicit
    data-plane declaration. Never interleaved with instructions.
    (extended/injection-aware-structure.md)
```

## 5. One prompt or two? (splitting a call)

**Default: one call per *decision*. Split when a single prompt is doing two jobs that interfere, when untrusted content meets dangerous capability, or when an intermediate result needs validation.**

Split when:
- **Quality interference** — extraction + judgment in one call and one degrades the other (classic: "extract the fields AND flag anything suspicious" — flagging quality collapses once extraction fills the attention budget).
- **Trust boundary** — the call reads untrusted content *and* holds consequential capability; separate reader from actor (`@ai-engineer/topics/prompt-design.md` §2 — that's a system-architecture decision, made there).
- **Checkpointing** — you need to validate/log/gate the intermediate.

Don't split for cosmetics: two calls = two prompts to version, two failure surfaces, added latency and cost. A prompt that's merely *long* is not a split criterion; a prompt with two masters is.

## 6. Fix by instruction, example, or eval case?

**Default order when a failure appears: (1) check for ambiguity — fix the spec; (2) if the spec was clear, add/adjust an *example* demonstrating the case; (3) always add the case to the regression set, whichever fix you chose.**

The anti-pattern is jumping straight to appending a new rule sentence (rule 9: patch accumulation). A surprising fraction of "the model ignored my instruction" reports are actually "two of my instructions disagree and it obeyed the other one" — run the `prompt-clarity-reviewer` skill before adding words.

## 7. Which model tier for this prompt?

Owned by `@ai-engineer/principles/decision-trees.md` (cost/capability is a system decision). The prompt-craft corollary that lives here: **the smaller the model, the more the prompt must carry** — tighter spec, more examples, simpler schema, shorter leash on judgment calls. A prompt tuned on a frontier model is *not* validated for a smaller one; re-run the regression set on the actual production tier (`extended/cross-model-portability.md`).

## 8. Is this prompt done? (ship gate)

Not a tree — a checklist. Ship when:
1. Spec survived an ignorance-simulation review (`prompt-clarity-reviewer`, or a colleague answered the task from the text alone without questions).
2. Examples, if any, audited for coverage and accidental patterns (`few-shot-example-auditor`).
3. Regression set exists (≥20 cases including the edge cases the spec had to resolve) and passes.
4. Assembled prompt reviewed with worst-case slot contents, not just the template.
5. Version stamped: prompt text, model ID, date, regression results (`topics/versioning-and-regression-testing.md` §1).

If a fork you face isn't here, it's probably a system-architecture fork (`@ai-engineer/`) or an eval-methodology fork (`@ai-eval-engineer/`) wearing a prompt costume.
