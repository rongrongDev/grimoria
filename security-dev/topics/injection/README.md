# Injection — SQL, NoSQL, Command, Template

**Date:** 2026-07-06 · **Tier:** core (full depth) · **Standards:** OWASP Top 10 2021 A03; CWE-89 (SQL), CWE-943 (NoSQL/query), CWE-78 (OS command), CWE-1336/94 (template/code) · **Standalone:** yes · **Executable review procedure:** [../../skills/injection-review/SKILL.md](../../skills/injection-review/SKILL.md) · **Scope note:** detection and fix patterns only — no payloads.

## 0. One root cause, four costumes

Every injection class is the same bug: **untrusted input reaches an interpreter as *code* when the developer meant it as *data*.** The interpreter varies — SQL engine, shell, query object evaluator, template engine — the mistake doesn't. Consequently every fix is the same move: **keep the code/data channel separation the interpreter already offers** (parameters, argument vectors, sandboxed contexts), and every "sanitize the string" fix is a bet that you know the interpreter's grammar better than its authors. You lose that bet on the encoding, the second-order path, or the dialect feature you didn't know existed.

Taint reminder ([../../principles/security-mindset.md](../../principles/security-mindset.md) §2): input includes your database (second-order injection — data stored safely last year, concatenated into a query today), queue messages, file names, and headers. Storage does not launder taint.

## 1. SQL injection (CWE-89)

**Failure mode.** Query text built by string concatenation/interpolation with attacker-influenced values; attacker input changes the query's structure, not just its values. Impact ceiling: full read/write of the DB, often lateral movement via DB features. Modern variants that still ship in 2026: f-string/template-literal queries in "just this one dynamic filter"; ORM escape hatches (`raw()`, `whereRaw`, `extra()`, native `@Query` with concat); **dynamic identifiers** — table/column names and `ORDER BY` fields, which parameterization cannot cover, interpolated straight from `?sort=`.

**Detection.**
- *Code review / grep leads:* query keywords adjacent to concatenation or interpolation (`"SELECT` + `+`/`${`/`f"`/`format(`/`%`); ORM raw-escape-hatch calls; `ORDER BY`/table-name built from variables. Then the taint question: can any operand trace to request data, stored user content, or a queue?
- *SAST:* taint rules source=request → sink=query-execution are the highest-precision rules in any SAST product; enable and gate on them ([../../principles/secure-sdlc.md](../../principles/secure-sdlc.md) §2).
- *Runtime signals:* query-shape anomalies (same endpoint suddenly issuing structurally different SQL), DB syntax-error spikes in logs — attackers' *probes* fail loudly before their successes succeed quietly. Alert on syntax-error rate per endpoint.

**Fix.**
- Values: parameterized statements / bound parameters, always, including in raw-SQL blocks. There is no performance or complexity argument that survives contact with this bug class; prepared statements are also faster.
- Dynamic identifiers: allowlist map from user token → known identifier (`{"date": "created_at", "name": "display_name"}[sort_key]`), never interpolation of the user token itself.
- Dynamic *structure* (optional filters): query builders that compose parameterized fragments; never conditional string assembly.
- LIKE clauses: parameterize the value AND escape `%`/`_` in it (a value-level, not structure-level, issue — but users searching for "100%" will find your bug).

**Prevention (durable controls).**
- Lint/SAST rule flagging every ORM raw escape hatch; each use requires an inline justification comment — makes the exception auditable instead of invisible.
- DB accounts per service with least privilege ([../../GLOSSARY.md](../../GLOSSARY.md)): app account can't read other schemas, can't `DROP`, no file-system/OS procedures. Turns a missed injection from a breach into an incident.
- CI grep gate: no `SELECT|INSERT|UPDATE|DELETE` inside string-building expressions in changed files (tune to your codebase's idiom; keep precision high per [../../principles/secure-sdlc.md](../../principles/secure-sdlc.md) §4).
- Review checklist line: "every query in this diff is parameterized or reads only constants; dynamic identifiers go through an allowlist map."

## 2. NoSQL / query-object injection (CWE-943)

**Failure mode.** Document-store queries built from request objects *structurally*: the attacker sends an object where the code expected a scalar (`{"password": {"$ne": null}}` shape — note this is the *shape* to detect, not a recipe: qs/body parsers turn `password[$ne]=` into exactly this), or reaches operators that evaluate code (`$where`, `mapReduce`, aggregation expressions with user input). Auth bypass via operator injection into login queries remains the canonical instance. Same class: injection into OpenSearch/Elastic query DSL and GraphQL filter objects assembled from raw request JSON.

**Detection.** Grep leads: request body/params passed *as objects* into `find(`/`findOne(`/query builders (`find(req.query)`, `find({email: req.body.email, password: req.body.password})` where body fields aren't type-checked); any `$where`; query-DSL JSON built by string interpolation. Review question: "what happens if this field arrives as an object or array instead of a string?" — if the answer is "it's passed through," it's a finding.

**Fix.** Schema-validate request shape *before* query construction (types, not just presence — a string field must be a string); pass scalars, not user-controlled subtrees, into query objects; disable/never use server-side JS evaluation operators; for search DSLs, build the query server-side from validated scalars rather than accepting query fragments.

**Prevention.** Central request-validation middleware (JSON Schema/zod/joi equivalent) required on every route — make "unvalidated body reaches a handler" impossible by construction; SAST/lint rule for `$where` and for `req.(body|query|params)` appearing inside a query-call argument; test in the auth suite: login with object-typed fields must 400.

## 3. OS command injection (CWE-78)

**Failure mode.** User input reaches a shell string: `exec("convert " + filename + " out.png")` — filename came from an upload. Shell metacharacters give the attacker their own command. Sub-variant that survives the obvious fix: **argument injection** — input passed safely as an argv element, but beginning with `-` and interpreted as a flag by the tool (some tools' flags execute programs or write files: `--use-compress-program`, `-oProxyCommand`-class options). Second sub-variant: the invoked tool has its own injection surface (ImageMagick delegates, `ffmpeg` protocol handlers) — you inherited an interpreter you didn't know you called.

**Detection.** Grep leads: `system(`, `popen(`, `exec`-family with a single string argument, backticks, `shell=True`, `sh -c` — with any variable in the string. For argument injection: argv arrays where element 0..n comes from user input without a leading `--` separator. Runtime: egress alerts and child-process monitoring on service hosts (a web app spawning `curl` is a detection, whatever caused it).

**Fix.** In order of preference: (1) don't shell out — use the language-native library for the operation; (2) exec with an **argument vector and no shell** (`shell=False`, `execve`-style APIs), constant program path; (3) user input only as data arguments, after `--` end-of-options where the tool supports it, allowlist-validated (filenames: generate your own server-side name instead of using the upload's); (4) if the invoked tool is itself powerful (ImageMagick-class), run it sandboxed (separate unprivileged container, no network, resource limits) — you're operating a parser farm whether you meant to or not.

**Prevention.** Lint ban on shell-string exec APIs (allow argv-style only) — this is a mechanical, low-false-positive rule; every rule engine has it; code-review checklist: "any new subprocess call: why not a library? argv-form? `--` separator? sandboxed if it parses user files?"; egress-deny by default on app hosts so an achieved injection can't phone home ([../../principles/security-mindset.md](../../principles/security-mindset.md) §4).

## 4. Template injection — SSTI (CWE-1336)

**Failure mode.** Untrusted input used **as the template**, not as a value rendered into one: `render_template_string(user_input)`, user-editable email templates, CMS "custom layout" features, template names/paths chosen by request data. Server-side template engines expose object graphs and callables; SSTI in most engines escalates to RCE — treat it at that ceiling, not as "formatting bug." (Client-side sibling: user input compiled into a front-end template = XSS with extra steps.)

**Detection.** Grep leads: `render_template_string`, `Template(` / `new Function` / engine-compile calls with non-constant input; template *name* parameters fed from requests; any product feature described as "users can customize their {email, page, report} template." That last one is a *design-level* finding — flag it at threat-model time ([../../principles/threat-modeling.md](../../principles/threat-modeling.md)), because retrofitting is expensive.

**Fix.** Values go into templates as *context variables* with auto-escaping on; templates themselves are code — constant, from the repo, reviewed. If users genuinely must author templates: use a **logic-less engine** (Mustache-class) or a sandboxed environment *designed* for hostile templates, allowlist the exposed variables explicitly, render with a strict timeout, and treat the sandbox as one layer of several (sandbox escapes in template engines have a rich CVE history) — e.g. render in an isolated unprivileged worker.

**Prevention.** Lint rule: engine compile/render-string APIs allowed only with literal/constant arguments; design-review checklist line for any user-authored-content feature: "is any part of this evaluated by an engine, and which sandbox holds it?"; auto-escaping asserted on in a config test so a future "temporary" global disable fails CI.

## 5. Cross-class review drill

For any diff (mechanized in [../../skills/injection-review/SKILL.md](../../skills/injection-review/SKILL.md)):

1. List every interpreter the changed code talks to (SQL, shell, template, query DSL, regex, XPath, LDAP...). Include the ones hiding inside invoked tools and libraries.
2. For each, trace every non-constant operand back to its origin. Attacker-influenceable (directly or second-order) → must reach the interpreter through a parameter/argv/context-variable channel, never through string assembly.
3. For each violation: is there a compensating control, what's the blast radius (DB account privileges, egress policy, sandbox), and does severity survive the chain check ([../../principles/security-mindset.md](../../principles/security-mindset.md) §3)?
4. Every fix lands with its prevention twin: the lint/SAST rule or test that makes the *class* recur-proof, per this doc's prevention subsections.
