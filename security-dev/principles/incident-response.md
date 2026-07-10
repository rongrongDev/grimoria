# Incident Response Fundamentals — Triage, Containment, and Postmortems Without Blame

**Date:** 2026-07-06 · **Tier:** extended (production patterns + pitfalls) · **Standalone:** yes · **Related:** [security-mindset.md](security-mindset.md) §3 (chains), [../topics/secrets-and-keys/](../topics/secrets-and-keys/README.md) (rotation-under-fire), [../GLOSSARY.md](../GLOSSARY.md)

Scope: the judgment layer for application-security incidents — the 2am decisions. Not a full IR program design (that's a dedicated discipline with its own on-call, legal, and comms machinery); this is what an AppSec engineer or an engineering team needs to not make things worse in the first four hours, plus the triage tree for inbound vulnerability reports, which is where most "incidents" actually begin.

## 1. Severity triage: the two-axis call

Severity = **worst plausible impact** × **evidence of active exploitation**. Score both, act on the combination:

| | No evidence of exploitation | Evidence of exploitation |
|---|---|---|
| **Impact: contained** (single user, no lateral path, no sensitive data) | Ticket, fix on normal cadence | Incident, business-hours urgency |
| **Impact: severe** (auth bypass, cross-tenant, RCE-plausible, secrets/PII exposure) | Incident, fix-before-you-sleep; assume exploitation you haven't found | Wake people up. Full response |

Judgment notes learned the hard way:

- **Score the chain, not the finding.** The "low" IDOR that feeds an account-takeover chain is severe ([security-mindset.md](security-mindset.md) §3). Spend the sixty seconds.
- **"No evidence of exploitation" often means "no logging."** Before writing that phrase, confirm you *could* have seen it: were the relevant access logs on, and do they cover the exposure window? Absence of logs is not absence of attackers — say "unknown, logging insufficient," which also feeds §5.
- **Exposure window starts at introduction, not discovery.** A vuln shipped eight months ago means eight months of logs to check and possibly eight months of affected data — not "we found it today so today is day zero."
- **Escalate immediately when:** credentials/keys are confirmed exposed (rotation clock is running); anything cross-tenant; anything plausibly RCE; an external party (researcher, journalist, customer) already knows. **Triage as low when:** requires an implausible pre-condition you can verify is absent, no sensitive-data or privilege delta even when chained, or purely theoretical against a control you can demonstrate. When genuinely torn between two severities, take the higher for the first hour — downgrading later is free; upgrading later means you lost the hour.

## 2. Inbound vulnerability reports (the triage tree)

Most orgs meet security incidents first as an email from a stranger. The tree:

1. **Acknowledge within one business day**, before triage. Researchers escalate to public disclosure when ignored, not when disagreed with. A human "we received it, investigating" buys goodwill that no bounty amount buys back later.
2. **Reproduce before rating.** From the report's claims, on staging where possible. Can't reproduce → ask for detail once, politely; don't close on first failure (environment differences are the usual cause). **Never run a reporter's attached proof-of-concept against production, and never run attached code/binaries anywhere trusted** — treat submitted artifacts as untrusted input (sandbox, read-don't-execute); a vulnerability report is itself a social-engineering channel and has been used as one.
3. **Rate with §1**, resisting two biases: *defensive deflation* ("that's only exploitable if—" — attackers specialize in "only if") and *researcher inflation* (their CVSS assumes your worst config; score your actual deployment, and write down which config facts you relied on).
4. **Widen before closing:** the reported instance is one instance. Same bug, other endpoints? Same pattern, other services? A reporter who found one IDOR has usually found your *pattern* of missing object-level checks — grep for the pattern ([../skills/authz-review/SKILL.md](../skills/authz-review/SKILL.md) mechanizes this), not just the URL.
5. **Close the loop** with the reporter: what you fixed, when, credit if they want it. They're your cheapest red team and they talk to each other.

## 3. Containment vs. eradication — the ordering everyone gets wrong under adrenaline

**Contain first. Understand second. Eradicate third. Recover fourth.** The classic 2am mistake is jumping to eradication — delete the webshell, patch the vuln, reboot — which (a) destroys the evidence you need to know *what they took*, (b) tips the attacker while their other footholds survive, and (c) leaves you confidently wrong about scope.

- **Contain** = stop the bleeding without destroying state: revoke/rotate exposed credentials (the one eradication-like step that never waits — a live credential is active bleeding); isolate affected hosts from the network *without powering off* (memory is evidence); block egress destinations; disable the vulnerable route/feature-flag at the edge. Prefer reversible moves.
- **Understand** = establish the timeline (first malicious event, not first *detected* event), enumerate accessed data/systems, and answer "how did they get in" with evidence. Preserve logs *immediately* — retention windows and log rotation are quietly eating your investigation while you meet. Snapshot first, analyze from copies.
- **Eradicate** = remove access comprehensively in one coordinated pass: patch root cause, rotate *everything the attacker could have touched* — not just what you can prove they touched ([../topics/secrets-and-keys/](../topics/secrets-and-keys/README.md) §rotation) — rebuild compromised hosts from known-good images rather than "cleaning" them. Piecemeal eradication trains the attacker to persist quietly; one incident I supported did three "final" credential rotations across two weeks because each round missed a copy of a key — the attacker kept a 30-second lead the whole time. Enumerate, then rotate once, completely.
- **Recover** = restore service with monitoring specifically tuned for the attacker's known TTPs coming back.

Rule for the room: appoint one incident lead who assigns work and owns the decision log (every action, timestamp, decider — this list is gold for §5 and sometimes for lawyers). Everyone else executes or stays out. Six seniors independently "helping" at 2am is how the same host gets rebooted twice and the timeline dies. And loop in legal/comms *early* when customer data is plausibly involved — notification obligations have clocks (72h in several jurisdictions) that start at awareness, and engineering doesn't get to decide "we're not aware yet."

## 4. The severity-specific first hour (condensed runbooks)

- **Leaked credential/key** (repo, log, paste site): rotate now, ask questions during. Then: audit usage of that credential over the full exposure window; assume used if internet-exposed for >minutes (scanners harvest public commits in seconds — measured, not folklore). Then run [../skills/secret-leak-scanner/SKILL.md](../skills/secret-leak-scanner/SKILL.md) across the repo and its history: leaks cluster.
- **AuthZ hole in production** (IDOR/BFLA): disable or edge-block the route if the function isn't business-critical-right-now; else hotfix the check. Then the hard part: query access logs for the exposure window for *actual* cross-object access — enumeration leaves a signature (sequential IDs, one principal touching many objects). This determines whether you have a vuln or a breach, which determines notification.
- **Vulnerable dependency, exploit circulating:** reachability first — [../agents/dependency-cve-triager.md](../agents/dependency-cve-triager.md) at fleet scale. Reachable + exposed = treat as §1 severe; patch or virtual-patch (WAF rule/feature disable) today. Unreachable = normal cadence, *written down why*.
- **Suspicious-but-unclear** (weird admin account, anomalous egress, "the site looks wrong"): treat as real until disproven; start the §3 contain checklist at its reversible end (snapshot, preserve logs, watch) rather than the destructive end. Most false alarms cost an hour of two people's time; most real ones detected at this stage were survivable *because* someone took the weirdness seriously ([security-mindset.md](security-mindset.md) heuristic 10).

## 5. Postmortems: blameless is a method, not a mood

The purpose is future-incident prevention, and blame is *methodologically* wrong because it stops the causal analysis one level too early — at a person, instead of at the system that set the person up. "Engineer disabled the auth check" is where a blameful postmortem ends and a blameless one begins: why was disabling it one line? Why did no test fail? Why did review not catch it? Why was it silent for six months? Each *why* yields a control; the name yields nothing but a quieter, slower team that hides the next near-miss from you — and near-miss reports are your cheapest incident data.

Non-negotiable outputs, each with an owner and a date:

1. **Timeline** — introduction → exploitation → detection → containment → eradication, with the *detection gap* (introduction-to-detection time) called out as its own finding. That gap is usually the most embarrassing and most fixable number.
2. **Root cause at the class level** — not "the bug" but "the pattern that allowed the bug": which default, gate, or review practice was missing ([security-mindset.md](security-mindset.md) §5's two jobs).
3. **Prevention items in the durable-control form** — a lint/SAST rule, a CI gate, a framework default, a test suite ([secure-sdlc.md](secure-sdlc.md) §2's every-incident-feeds-a-rule). "Be more careful" and "additional training" are not action items; they are the *absence* of action items.
4. **Detection item** — what signal, had it existed, would have cut the detection gap to hours? Build that signal.
5. **A 30/60-day check** that the items actually shipped. Unshipped postmortem items are how orgs have the same incident twice, and most orgs do.

Anti-pattern worth naming: the *retribution postmortem* wearing blameless vocabulary — "no blame, but the change that caused this was merged by the platform team." If it names a team where it could name a missing control, rewrite it.
