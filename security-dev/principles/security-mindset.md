# The Security Mindset — Trust Boundaries, Attacker Economics, Defense in Depth

**Date:** 2026-07-06 · **Tier:** foundational (read first) · **Standalone:** yes · **Related:** [threat-modeling.md](threat-modeling.md), [secure-code-review.md](secure-code-review.md), [../GLOSSARY.md](../GLOSSARY.md)

This is the judgment layer under everything else in this KB. The topic docs tell you what SQL injection *is*; this doc is how you decide what to worry about when nobody has told you what to worry about.

## 1. The one question that generates all the others

> **"What does this code assume about its input, its caller, and its environment — and who can violate that assumption?"**

Every vulnerability class in this KB is a specific answer to that question. SQL injection: the query assumed input was data, an internet user violated it. IDOR: the handler assumed callers only ask for their own objects. SSRF: the fetcher assumed URLs point outward. Dependency confusion: the resolver assumed the package name meant *your* package.

Corollary that separates seniors from juniors: **assumptions are fine — *unenforced* assumptions are the bug.** "The frontend validates this" is an assumption. It becomes safe only when the backend enforces it, because the frontend is attacker-controlled by definition. When you find yourself saying "that can't happen because the client...", stop: the client is the attacker's code, not yours.

## 2. Trust boundaries: where security work actually lives

A trust boundary is any point where data or control moves between parties with different trust levels. Security review is 80% the discipline of enumerating these crossings and checking what's enforced *at the crossing* — not somewhere earlier that the attacker can route around.

Boundaries people reliably miss (each has funded at least one real breach I've triaged):

| Missed boundary | Why it's missed | What it cost |
|---|---|---|
| Internal service → internal service | "It's inside the VPC" | One SSRF in a PDF renderer became read access to every internal admin API — no service checked *who* was calling. See [zero trust](../GLOSSARY.md) |
| Message queue → consumer | Producer is "us" | A consumer executing queue payloads as commands; one compromised low-value producer escalated to the fleet |
| Database → application (read path) | Data "came from us" | Stored XSS: data written safely a year ago, rendered unsafely by a new UI. **Storage does not launder taint** |
| Third-party webhook → handler | "It's Stripe/GitHub calling" | Unverified webhook signatures = anyone can call. Forged "payment succeeded" events shipped real goods |
| Log pipeline → log viewer | Logs are "output" | Attacker-controlled strings in logs exploited the log *viewer* and, in the Log4Shell era, the logger itself |
| Build system → artifact | CI is "infrastructure" | Compromised CI is a signing oracle: it turns attacker code into *your* trusted release. The build IS a trust boundary |

Practical drill: draw the data-flow of any feature and put a red mark at every arrow between different trust levels. Anything enforced only on the *unmarked* side of an arrow is decoration. This drill is operationalized in [threat-modeling.md](threat-modeling.md) §2 and [../guides/analyze-existing-project.md](../guides/analyze-existing-project.md) Phase 1.

## 3. Attacker economics: what actually gets attacked

You don't have infinite defense budget; attackers don't have infinite attack budget. Judgment is allocating yours against theirs.

**Attackers automate; scanners are the weather.** Anything internet-facing is probed within hours of appearing. Default-credential checks, path scans, credential stuffing — this happens to everyone, always. Design consequences: no route survives on obscurity, rate-limit and lock down authentication endpoints from day one, and expect your staging environment (which someone forgot had prod data in it) to be found.

**Attackers take the cheapest path to the goal.** Nobody burns a zero-day on you when your S3 bucket is public, a valid credential is in a leaked `.env` on a public repo, or your password-reset flow has an IDOR. Ranked by real-world frequency, initial access is: (1) valid credentials — stolen, stuffed, phished; (2) exposed misconfigurations; (3) known CVEs in unpatched edge software; (4) application vulnerabilities; and only then (5) anything exotic. Allocate defense in that order. Teams that gold-plate their crypto while running no MFA on the admin panel have the order inverted.

**Chains, not single bugs.** Real compromises are sequences of individually "minor" issues. War story, generalized: a "low-severity" IDOR let any user read other users' profile metadata — triaged low, because the metadata was "not sensitive." The metadata included the email used for password reset *and* the last-four the reset flow used as a knowledge check. IDOR + over-informative reset flow + no reset rate limit = full account takeover of arbitrary accounts. Every link was individually defensible; the chain was catastrophic. **Triage rule this teaches: severity of a finding is the severity of the best chain it enables, not the finding in isolation.** When you triage anything as "low," spend sixty seconds asking what it combines with.

## 4. Defense in depth — and its counterfeit

Real defense in depth: layers that fail **independently**, so the attacker needs multiple distinct wins.

For, say, the database write path: parameterized queries (app layer) + DB account that can't `DROP` or read other schemas (privilege layer) + egress filtering so a compromised app can't exfiltrate freely (network layer) + query-anomaly alerting (detection layer). Four different mistakes are needed to lose everything.

The counterfeit — **correlated layers** — looks like depth and isn't:

- Two services both "validating" by trusting the same upstream JWT without checking `aud` — one forged token passes both.
- WAF + app validation where the app team *relies* on the WAF and stops validating: one layer wearing two hats.
- Backup credentials stored in the same vault the primary credentials are in, reachable by the same compromised role.

Test: for each pair of layers, ask "what single event defeats both?" If there's an answer, you have one layer.

**Depth has a cost budget too.** Every layer is code someone maintains and a false-positive source someone triages. Depth on the crown jewels (auth, payments, PII stores); framework defaults elsewhere. Uniform maximal depth everywhere is how security teams lose the org's goodwill and then the important battles.

## 5. Secure by default beats secure by vigilance

Humans are reliably unreliable; vigilance doesn't scale past ~10 engineers or ~6 months. The durable wins are defaults and structural controls:

- ORM/query-builder that parameterizes *unless you opt out* — then a grep/SAST rule for the opt-out escape hatch (`raw(`, `Statement` concat) instead of "review every query."
- An authZ layer where handlers *cannot compile/route* without declaring a policy (deny-by-default middleware), instead of "remember to check ownership."
- Template engines with auto-escaping on; secret managers injected at runtime so there's nothing *to* commit; CI that fails on a detected secret rather than a wiki page saying don't.

**When you find a vulnerability, you have two jobs:** fix the instance, then change a default/gate so the *class* can't recur. The second job is the one that compounds; this KB's topic docs all end their sections with "prevention" for exactly this reason. A team that only ever does job one meets the same bug annually, wearing a new feature's clothes.

## 6. Judgment heuristics (the ones I'd tattoo on the team)

1. **All input is hostile until proven otherwise** — including from your database, your queue, your own other services, and your logs. Taint is about *origin*, and storage does not wash it off.
2. **AuthN is not authZ.** "Logged in" answers *who*; it never answers *may they do this to this object*. Conflating them is the root of the IDOR epidemic — see [../topics/authorization/README.md](../topics/authorization/README.md).
3. **Deny by default.** Allowlists over blocklists — for input validation, egress destinations, CORS origins, permissions. Blocklists encode only the attacks you've already thought of; that's the one list the attacker also has.
4. **Validate at the boundary, enforce at the resource.** Input shape-checking at the edge; authorization at the point of data access, where it can't be bypassed by a forgotten second route to the same data.
5. **Fail closed.** When the authZ service is down, the answer is no. When signature verification errors, the webhook is rejected. Every "fail open for availability" decision must be written down and owned by someone senior — it's sometimes right, and it's never right silently.
6. **Complexity is attack surface.** Every parser, format, flag, and "flexible" option is somewhere for a bug to live. The most secure code is the code you didn't write.
7. **Never roll your own crypto — or your own session management, password hashing, or token format.** The failure mode isn't "slightly weaker"; it's "broken in a way you can't see and an attacker can." [../topics/cryptography/README.md](../topics/cryptography/README.md) covers using real libraries correctly.
8. **Detection is a control.** You will miss preventions; the difference between a bad day and a company-ending quarter is whether you *notice*. Auth failures, authZ denials, egress anomalies — logged, alerted, rehearsed. See [incident-response.md](incident-response.md).
9. **Data you don't hold can't be breached.** Retention limits, field-level minimization, and "do we actually need this column" are security controls that cost nothing at design time and are politically impossible to add later. The best incident-response story is "we didn't have that data."
10. **Suspicion is a finding.** If something feels off — an unexplained admin account, a dependency doing network calls at install, an auth check you can't find — pull the thread or hand it to someone who will. Every large breach postmortem contains a person who noticed and moved on.

## When NOT to apply this doc's full weight

Right-sizing is part of the mindset. An internal prototype with fake data does not need the payment-system treatment — it needs honest labeling ("not hardened; do not point at prod data") and a gate before it quietly becomes production, which is the actual failure mode of prototypes. [threat-modeling.md](threat-modeling.md) §5 gives the right-sizing rubric.
