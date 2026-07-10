# ESLint Custom Rules — the chosen lint framework, with the judgment attached

**Applies to:** ESLint 9.x (flat config), typescript-eslint 8.x, Node 20/22. **Last verified:** 2026-07-06.** API specifics rot; check `CHANGELOG.md`. The trust economics this implements (`tool-engineer/principles/static-analysis.md`) do not rot — when in doubt, that doc wins.

**Why this framework:** the largest custom-rule ecosystem in the industry, so it's where org-specific rules most often live. The concepts — AST visitors, fixers, rule testers, baseline rollouts — port directly to Ruff plugins, semgrep, and Roslyn analyzers; port the checklists, not the code.

## 1. Rule anatomy (ESLint 9, flat-config era)

```js
// eslint-plugin-myorg/rules/no-legacy-fetch-user.js
'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',            // 'problem' | 'suggestion' | 'layout' — severity honesty starts here
    docs: {
      description: 'fetchUser() drops auth context; use fetchUserWithSession()',
      url: 'https://go/auth-migration',   // REQUIRED in this org: the why-doc, linked from the finding
    },
    fixable: 'code',
    hasSuggestions: false,
    schema: [],                 // validate rule options; empty array = "no options accepted"
    messages: {                 // messageIds only — never inline strings at report sites
      legacyFetch:
        'fetchUser() is deprecated and drops auth context; use fetchUserWithSession() (go/auth-migration).',
    },
  },
  create(context) {
    return {
      'CallExpression[callee.name="fetchUser"]'(node) {
        context.report({
          node,
          messageId: 'legacyFetch',
          fix: (fixer) => fixer.replaceText(node.callee, 'fetchUserWithSession'),
        });
      },
    };
  },
};
```

Judgment notes:

- **`messages`/`messageId` only.** Inline report strings drift per call site and can't be tested for the fix-in-the-message bar (`static-analysis.md` §4). One rule, one vocabulary.
- **`docs.url` is mandatory** for every custom rule; the message names the fix, the URL carries the why. This is your cheapest false-positive-dispute deflector.
- **`meta.type` honesty:** marking a style preference as `problem` is severity inflation — the trust-spend from `static-analysis.md` §2.
- Selector syntax (`'CallExpression[callee.name=...]'`) keeps simple rules simple; drop to full visitor functions when you need surrounding-scope logic.
- **`schema` is not optional.** Omitting it means user typos in rule options pass silently — your own tool committing the silent-failure sin.

## 2. Fixers: the highest-stakes 10 lines you'll write

A broken autofix turns a warning into a build breakage with your name on it. Rules:

- **Fix only what you can prove.** The fixer above is safe because it replaces a single identifier. The moment a fix requires understanding types or imports, either use type services (§4) to prove it, add the import in the same fix (`fixer` supports multiple operations — return an array), or downgrade to `hasSuggestions` (suggestions are human-applied and allowed to be less certain than autofixes — that's their entire purpose).
- **Overlapping fixes:** ESLint applies non-overlapping fixes per pass and re-lints (up to 10 passes). Fixers must therefore be **convergent** — output that re-triggers the same rule loops until ESLint gives up and reports it as a rule bug. Test fix-then-relint stability explicitly.
- **Never fix across comments you'd delete.** `fixer.replaceText` on a wide range eats comments inside it; users notice their `// TODO` vanished and stop trusting `--fix` entirely.

## 3. Testing: RuleTester, and the near-miss discipline

```js
const { RuleTester } = require('eslint');
const rule = require('../rules/no-legacy-fetch-user');

new RuleTester({ languageOptions: { ecmaVersion: 2024, sourceType: 'module' } })
  .run('no-legacy-fetch-user', rule, {
    valid: [
      'fetchUserWithSession(id)',
      'obj.fetchUser(id)',                    // near-miss: method, not the global — MUST stay valid
      'const fetchUser = localImpl; fetchUser(id)',  // near-miss: shadowed local (accepted FP? decide + document)
    ],
    invalid: [
      {
        code: 'fetchUser(id)',
        errors: [{ messageId: 'legacyFetch' }],
        output: 'fetchUserWithSession(id)',   // EXACT fixed output — always assert when fixable
      },
    ],
  });
```

- **The `valid` array is where false positives are prevented.** Write the near-misses: same name different binding, similar shape different semantics, violations inside strings/comments. A rule tested only on its positives has been tested on its marketing material. (The shadowed-local case above is the honest kind of decision this forces: handle scoping via `context.sourceCode.getScope(node)`, or document the FP and eat it — but decide in the test file, visibly.)
- **`output` on every fixable invalid case.** RuleTester asserts exact post-fix text; omitting it means your fixer is untested in exactly the place it can do damage.
- Before org rollout, run the rule across the real codebase and hand-classify 50 findings — the RuleTester suite proves the rule matches your intent; the 50-finding sample proves your intent matches reality (`static-analysis.md` §1). Both gates, always.

## 4. Type-aware rules: power, at 10–100× the cost

typescript-eslint's `parserOptions.projectService: true` (v8 idiom) gives rules access to the type checker (`services.getTypeAtLocation(node)`), which is how you write rules like "no floating promises from our RPC client" that syntax alone can't express.

- **Budget first.** Type-aware linting can take lint from seconds to minutes on a large repo, and it runs on every save and every PR (`static-analysis.md` §4). Split configs: syntax-only rules everywhere; type-aware rules in a separate config run in CI (and editors of those who opt in), not on every keystroke.
- **Reach for types only when syntax lies.** Most "we need types" rules are actually "we need to check the import source" rules — resolvable syntactically from the ImportDeclaration, at 1/100th the cost.
- Measure per-rule cost with `TIMING=all npx eslint .` — it prints a per-rule timing table; that table is your budget enforcement tool, wired into CI on a fixture package.

## 5. Shipping the plugin: flat config, versioning, rollout

```js
// eslint.config.js (consumer repo)
const myorg = require('eslint-plugin-myorg');
module.exports = [
  myorg.configs.recommended,   // ship named configs; consumers compose, never enumerate rules
];
```

- **The plugin is an internal tool with consumers — full distribution discipline applies** (`tool-engineer/principles/distribution-and-versioning.md`): semver where *turning a rule on or raising its severity in a shared config is a breaking change* (it can redden every consumer's CI), a changelog written for consumers, and consumers pin the version. The most common lint incident I've seen is a "minor" plugin release adding one rule to `recommended` and blocking forty repos' merges by lunch.
- Ship **tiered named configs** (`recommended`, `strict`) rather than making each repo enumerate rules; the tier list *is* your rollout lever — new rules enter `strict` (opt-in) first, get promoted to `recommended` only via the §3 gates plus a major version.
- **Baseline-and-ratchet for no-autofix rules** (`static-analysis.md` §3 path B): use the suppressions mechanism (ESLint 9.x bulk-suppressions tooling) or a checked-in baseline file; CI fails on baseline growth. Autofixable rules skip all this — run the fix across the repo yourself, then error (path A).
- Suppression telemetry: `grep -rc "eslint-disable.*myorg/"` per rule, tracked over time — rising = your rule or your message is wrong (§1 economics). Require reasons: `eslint-disable-next-line myorg/no-legacy-fetch-user -- migrating in JIRA-123`, enforced by the built-in comment-description requirement.

## 6. Version-sensitive gotchas (ESLint 9.x / typescript-eslint 8.x)

| Gotcha | Detail |
|---|---|
| Flat config is the only config (9.x) | `.eslintrc.*` support removed; plugins expose flat `configs` objects. Docs/snippets from the 8.x era silently mislead — check dates on anything you copy. |
| `context.sourceCode` (not `context.getSourceCode()`) | 9.x accessor idiom; old API removed. Same for `sourceCode.getScope(node)` taking the node explicitly. |
| `projectService: true` replaces `project: ['./tsconfig.json']` | typescript-eslint 8 idiom; the old form still works but loses editor perf wins. |
| RuleTester requires `languageOptions` | Flat-config shape in tests too; copying 8.x `parserOptions` at top level fails confusingly. |
| Processors/virtual files | Rules run on `.md`/`.vue` code blocks via processors; a fixer that assumes it owns the whole file corrupts them. Guard fixes with a physical-file check if unsure. |

## Cross-references

- Rollout paths, false-positive budgets, ownership review: `tool-engineer/principles/static-analysis.md` — the policy this file mechanizes.
- A lint release just broke builds org-wide: dispatch **`build-breakage-tracer`**; enumerate affected repos: **`change-impact-scanner`**.
- Lint stage placement in CI: `quality-dev/principles/ci-cd-integration.md` (adjacent KB owns CI architecture).
