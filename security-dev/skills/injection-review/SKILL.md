---
name: injection-review
description: >-
  Review a diff, PR, or named files for injection risk across all interpreter classes — SQL/NoSQL query building, OS command execution, template rendering, plus the adjacent parser sinks (deserialization, XML, URL fetchers) — by tracing taint from input origins to interpreter sinks, producing severity-rated findings with parameterized rewrites. Use when reviewing any PR that touches query construction, subprocess calls, template rendering, or parsers of user-supplied data; when asked to "check this for injection/SQLi"; or as the injection pass of security-dev/guides/analyze-existing-project.md Phase 3. Do NOT use for whole-codebase sweeps with no named surface (map first via the analyze-existing-project guide), for XSS in front-end rendering (web-client-security topic doc — browser-context encoding is its own discipline), or for authorization gaps (authz-review skill — run both on handler diffs; they catch disjoint bugs). Defensive review only: findings show the vulnerable pattern and the fixed pattern, never working attack payloads.
---

# Injection Review (SQL / NoSQL / Command / Template / Parser Sinks)

**Date:** 2026-07-06 · **Standards:** OWASP Top 10 2021 A03; CWE-89/943/78/1336/502/611/918

You are reviewing bounded changes for untrusted input reaching an interpreter as code. Self-contained; the why lives in `security-dev/topics/injection/README.md` and `security-dev/topics/ssrf-xxe-deserialization/README.md`.

The one root cause you are hunting: **input meant as data, delivered to something that executes meaning** — a query engine, a shell, a template engine, a deserializer. Every fix is the same move: keep the interpreter's own code/data separation (parameters, argv arrays, context variables, data-only formats). Every "sanitize the string" fix is a finding in itself — flag it and supply the structural rewrite.

## Procedure

1. **Scope:** the diff or named files. If >~30 files without focus, route the caller to the mapping guide instead of skimming.
2. **Sink inventory:** list every interpreter the changed code talks to, using the sink table below — including interpreters hiding inside invoked tools (ImageMagick-class delegates) and libraries (YAML loaders).
3. **Taint trace per sink:** for each non-constant operand, trace to origin. Attacker-influenceable origins include: request data (params, body, headers, cookies, file names/content), **stored data a user ever wrote** (second-order — the DB does not launder taint), queue/webhook payloads, third-party API responses, and config a lower-trust role can edit.
4. **Judge the channel:** does tainted data reach the sink through the safe channel (parameter, argv element, context variable, schema-validated scalar) or through string/structure assembly? Assembly = finding.
5. **Report each finding:** severity · `file:line` · sink class · taint path in one line (`req.query.sort → orderBy string → knex.raw`) · vulnerable pattern (quoted) · **fixed pattern in the codebase's own idiom** (mirror its existing parameterized code; if none exists, that's a structural finding) · the prevention twin (the lint/SAST rule or test that kills the class here).
6. **Verdict:** BLOCK (any Critical) / FIX-BEFORE-MERGE (High) / ADVISE. UNKNOWNs stated, not guessed ("cannot see whether `sanitizeInput` neutralizes shell metachars — its source wasn't in scope; verify").

## Sink table (grep leads → what to check)

| Sink class | Grep leads | It's a finding when... | Fix shape |
|---|---|---|---|
| SQL [Critical] | `"SELECT\|INSERT\|UPDATE\|DELETE` near `+`/`${`/f-string/`format`/`%`; ORM escapes: `raw(`, `whereRaw`, `extra(`, `@Query` concat | any tainted operand in the string | bound parameters; allowlist-map for dynamic identifiers (`ORDER BY`, table/column names — parameters can't cover these; interpolating the user's token is the classic miss) |
| NoSQL/query-object [Critical] | `find(`/`findOne(`/aggregate with request objects passed through; `$where`; query-DSL JSON via string build | request field can arrive as object/array where scalar expected (operator injection); `$where` at all | schema-validate types before query build; pass scalars, never user subtrees; no server-side JS operators |
| OS command [Critical] | `system(`, `popen(`, `exec*` single-string, backticks, `shell=True`, `sh -c` | tainted text in a shell string; tainted argv element that can start with `-` (argument injection) | library call instead of shell-out; argv-array + `shell=False`; `--` separator; server-generated filenames |
| Template/SSTI [Critical — RCE ceiling] | `render_template_string`, engine `compile(`/`Template(` with non-constant input; template *name/path* from request | user input is the template, not a value in it | values as context vars with auto-escaping; templates constant from repo; user-authored templates → logic-less engine + sandbox, flag as design finding |
| Deserialization [Critical] | `pickle.load`, `ObjectInputStream`/`readObject`, `unserialize(`, `Marshal.load`, `BinaryFormatter`, `yaml.load(` non-safe, `eval(` on data | bytes trace to anything attacker-influenceable (incl. cache/queue) | data-only format + schema + explicit mapping; else HMAC-verify *before* parse; type allowlists |
| XML [High] | parser instantiation on risky stacks (Java `DocumentBuilderFactory`/SAX, libxml direct, PHP) without hardening config | DTD/external entities not explicitly disabled where the stack doesn't default safe | `disallow-doctype-decl`-equivalent; hardened shared parser util |
| URL fetch/SSRF [High–Critical in cloud] | HTTP clients (`requests.`, `fetch(`, `http.Get`) with any URL part tainted; also renderers/unfurlers that fetch | no scheme allowlist + resolved-IP deny-set + redirect handling + pinned resolution | fetch-by-ID from allowlist where possible; else the vetted `safe_fetch` util; egress limits as the backstop |
| Regex/other [Medium] | user input compiled into regex (`new RegExp(userInput)`); LDAP/XPath string build | catastrophic backtracking (DoS); filter injection | escape/literal APIs; timeouts; parameterized LDAP/XPath APIs |

## Judgment rules (apply to every hit)

- **Second-order counts.** A value read from the DB is tainted if a user could ever have written it — today's diff concatenating a stored `display_name` into a query is a finding even though no request data appears in the file.
- **Sanitizer-shaped code is a lead, not a mitigation.** Homegrown `escapeSql`/`cleanInput`/regex-strip functions: assume bypassable (encoding, dialect, grammar corner cases); the fix is the safe channel, not a better blocklist. Framework/library escapers used *in their intended context* are acceptable — note which context.
- **Rate the blast radius with the finding:** DB account privileges (can the injected query read other schemas?), egress policy (can an achieved RCE phone home?), sandboxing of parser workloads. A Critical sink behind real containment may report as High — say which control you're crediting so the reader can verify it exists.
- **Chain awareness:** injection findings compose (cache-write access + deserializing consumer = RCE chain). Note plausible chains in one line; do not elaborate exploitation.
- **Never demonstrate.** No working payloads, no "to exploit this you would…". The vulnerable-pattern/fixed-pattern pair is the complete deliverable; a maintainer can verify the bug with a metacharacter-bearing *correctness* test (e.g., a customer named `O'Brien & Sons <em>`), which you may suggest.

## Prevention twins (attach the matching one to every finding)

- SQL/ORM: lint rule flagging raw-escape-hatch calls without a justification comment; CI grep gate for query keywords inside string-building expressions.
- Command: lint ban on shell-string exec APIs (argv-only allowed) — mechanical and low-noise.
- Template: engine compile/render-string APIs restricted to literal arguments by lint; auto-escaping asserted by a config test.
- Deserialization/XML: banned-API list with per-call-site allowlist; hardened shared parser/loader utilities.
- Fetchers: raw client calls with non-constant URLs banned outside the vetted fetch util.
- Cross-class: the hostile-shaped-data correctness test (quotes/braces/angle brackets round-tripping inert) added to the touched endpoints' suites.
