# Secure Code Review — What a Security Reviewer Actually Looks For

**Date:** 2026-07-06 · **Tier:** core · **Standalone:** yes · **Related:** [security-mindset.md](security-mindset.md), executable versions of three sub-checks: [../skills/authz-review/SKILL.md](../skills/authz-review/SKILL.md), [../skills/injection-review/SKILL.md](../skills/injection-review/SKILL.md), [../skills/secret-leak-scanner/SKILL.md](../skills/secret-leak-scanner/SKILL.md)

Checklists catch the bugs someone already imagined. This doc is the layer above the checklist: how a security reviewer reads code so that the checklist items fall out as special cases — and so the bug *nobody* imagined still gets caught. It's written for a human reviewer or a model reviewing a bounded diff; whole-codebase assessment is [../guides/analyze-existing-project.md](../guides/analyze-existing-project.md).

## 1. Review the data flow, not the diff hunks

Diff-order reading finds style issues. Security issues live on *paths*. For each changed entry point, trace: **input → validation → processing → storage/output**, and at each hop ask the four questions:

1. **Origin** — can an attacker influence this value? (Directly, or via anything they ever touched: DB fields, queue messages, file names, headers. Storage does not launder taint — [security-mindset.md](security-mindset.md) §2.)
2. **Interpreter** — does this value ever reach something that *executes* meaning: SQL, shell, template, `eval`, XPath, LDAP, regex, a URL fetcher, a deserializer, HTML? Every taint→interpreter path is a finding until proven parameterized. ([../topics/injection/](../topics/injection/README.md))
3. **Identity** — at the moment of data access, what proves the caller may act on *this object*? Not "is logged in" — *may touch this row*. ([../topics/authorization/](../topics/authorization/README.md))
4. **Egress** — what leaves? Response bodies (over-fetching, stack traces), logs (PII, secrets, tokens), errors (existence oracles: "user not found" vs "wrong password"), and outbound requests (SSRF surface).

A 30-line diff can take 5 minutes or 45. The 45-minute ones are those whose paths cross a trust boundary; spend accordingly and say so in the review ("this touches the payment path, I went deep").

## 2. Read what's absent

The defining skill of security review — and the reason SAST alone can't do it — is seeing missing code. Nothing highlights the authorization check that isn't there. Deliberate absence-checks, in the order they pay off:

- **The missing authZ check.** New route/handler/resolver: where is object-level authorization enforced? If the answer is "the query filters by user implicitly," find the *second* route to the same data that doesn't. (The `authz-review` skill mechanizes this.)
- **The missing `else`/failure path.** What happens when validation fails, the token doesn't parse, the lock isn't acquired? Fail-open lives in unhandled branches and in `catch` blocks that log-and-continue. Signature verification wrapped in a try/catch whose catch returns success — I have seen this in production code at three companies. (Also: `catch` blocks that swallow *cancellation/timeout* around auth calls, turning "authZ service down" into "allow.")
- **The missing rate limit / bound.** New endpoint that's expensive, enumerable, or an oracle (login, reset, search-by-email): what bounds attempts? What bounds request size, array length, page size?
- **The missing second enforcement.** Constraint enforced in the UI or in one service — is it enforced where the data lands? Uniqueness, ownership, state-machine transitions ("can't refund twice") need enforcement at the store or in a transaction, not in the caller's good manners.
- **The missing test.** The diff adds an authZ check but no test that a foreign user gets 404. Untested security controls decay within two refactors — [threat-modeling.md](threat-modeling.md) §4's costume rule.

## 3. High-yield patterns to grep before reading

Ten minutes of mechanical scanning frames the deep read. On the changed files (whole repo during audits):

| Grep for | Because |
|---|---|
| `raw(`, string-built SQL (`"SELECT` + concat/format/f-string), `$where`, template-string queries | Parameterization opt-outs — [../topics/injection/](../topics/injection/README.md) |
| `exec`, `spawn`, `system`, `popen`, backticks with any variable | Command injection surface |
| `pickle.loads`, `yaml.load(` (non-safe), `ObjectInputStream`, `unserialize(`, `Marshal.load` | Unsafe deserialization — [../topics/ssrf-xxe-deserialization/](../topics/ssrf-xxe-deserialization/README.md) |
| `verify=False`, `rejectUnauthorized: false`, `InsecureSkipVerify`, `ALLOW_ALL_HOSTNAME` | TLS verification disabled "temporarily," forever |
| `dangerouslySetInnerHTML`, `innerHTML =`, `v-html`, `| safe`, `mark_safe`, `html.raw` | Escaping opt-outs (XSS) |
| `alg`, `decode(` near JWT libs; `verify: false`, `ignoreExpiration` | Token validation weakened — [../topics/oauth-oidc-jwt/](../topics/oauth-oidc-jwt/README.md) |
| `http://` in code/config; URL built from request params near an HTTP client | SSRF surface + downgrade |
| `AKIA`, `-----BEGIN`, `password=`, `secret`, `token` in code/config/tests/fixtures | Hardcoded secrets — run [../skills/secret-leak-scanner/SKILL.md](../skills/secret-leak-scanner/SKILL.md) |
| `TODO`, `FIXME`, `XXX`, `HACK` near auth/crypto/payment code | Where the author already told you it's broken |
| `req.body` / `params` spread or bound directly into model create/update | Mass assignment — [../topics/api-security/](../topics/api-security/README.md) |

Grep hits are *leads*, not findings. The judgment step — is this reachable with attacker input, is there a compensating control — is why this table doesn't replace §1.

## 4. Calibrating the response (review politics are part of the job)

Not every true finding is worth the same response. Grade against exploitability-in-context, and say which grade you're assigning:

- **Block merge:** attacker-reachable issue on a sensitive path (authZ gap, injection, secret in code, disabled TLS to prod). Provide the fix or pair on it — blocking without helping trains teams to avoid security review.
- **Fix-forward (merge + ticket with a date):** real weakness behind another real control, or on a not-yet-exposed path. Be honest that fix-forward tickets die; only grant it when there's an owner and a date.
- **Advisory:** hardening opportunities, defense-in-depth suggestions. Clearly labeled so they don't dilute the blocking findings. A review that cries wolf on nitpicks gets its blocking findings ignored — precision is a security control.

One more calibration: **praise the good patterns explicitly** ("this is exactly how the ownership check should look"). Reviews teach; what you praise gets copied, and getting the secure pattern copied is cheaper than catching ten future deviations.

## 5. Reviewing as an AI model — additions and cautions

- Run the mechanical layer (§3) exhaustively — it's what you're best at — but report grep hits as *leads with the taint/reachability analysis attached*, never as findings by count. Twenty ungraded hits is noise the human will skim once and ignore twice.
- You cannot see deployment context (WAF, network policy, gateway auth). When a finding's severity depends on it, state the assumption: "Critical *if* this service is internet-reachable; please confirm."
- Prefer false-negative honesty over false-positive confidence: "I could not determine where authorization is enforced for this route — that's either a gap or a middleware I can't see; verify" is a *good* output.
- For bounded diffs, use the purpose-built skills ([authz-review](../skills/authz-review/SKILL.md), [injection-review](../skills/injection-review/SKILL.md), [secret-leak-scanner](../skills/secret-leak-scanner/SKILL.md)) — they carry per-class check tables this doc deliberately doesn't duplicate. Never generate exploit payloads to "demonstrate" a finding; show the vulnerable pattern and the fixed pattern.
