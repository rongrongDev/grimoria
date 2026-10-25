# SLOs, SLIs, and Error Budgets

**Applies to:** tool-agnostic (examples cite Prometheus 3.x / Grafana 12 / OpenTelemetry, but nothing here depends on them) · **Last verified:** 2026-07-14

**Definitions used in this doc** (full glossary: `reliability-engineer/GLOSSARY.md`): an **SLI** is a measurement of user-experienced behavior, expressed as good events / total events. An **SLO** is a target for that SLI over a window. The **error budget** is `1 − target`: the amount of failure you are allowed, and expected, to spend.

## Why SLOs exist (the argument they end)

Before SLOs, every reliability conversation I sat in was two people with different feelings: product says "the site feels fine, ship the feature," ops says "we're drowning, stop shipping." Neither can win because neither has a number. The SLO is the contract that ends that argument: *this* is what reliable enough means, *this* is how much unreliability we may spend, and when the budget is gone, the pre-agreed policy — not the loudest person — decides what happens next.

Corollary that surprises people: **an SLO is as much a permission to fail as a demand to succeed.** A service holding 99.99% against a 99.9% target is not a triumph; it is either over-spending on reliability or under-shipping features, and its users are silently building expectations you never agreed to fund. Spend the budget.

## Choosing SLIs: measure what the user experiences, or don't bother

The single most common SLO failure I've seen — maybe fifty times across four companies — is an SLI that is green while users suffer. Every variant reduces to the same mistake: **measuring where it's convenient instead of where the user is.**

### Decision tree: where to measure

- **Can you measure at the client (RUM)?** → Do it, at least for your flagship user journeys. It is the only vantage point that sees DNS failures, CDN misconfigurations, TLS errors, and the mobile network. Use it to *validate* your server-side SLIs monthly, even if the SLO itself is server-side (client data is noisier and lags).
- **If not, measure at the outermost point you control** — load balancer or edge proxy, not the application. App-level metrics are blind to the app being down: if the process crashes, it reports no errors, and a naive `errors/requests` SLI reads 100% healthy. LB logs still see the 502s.
- **Application-level SLIs are for latency decomposition and per-endpoint detail,** not for the availability SLO of record.
- **Always add a synthetic probe of the full user journey** (login → action → result) from outside your network. It is your canary for "green dashboards, broken product."

War story, because this rule cost me a weekend: a payments API showed 99.98% server-side success for six hours while roughly 15% of real checkouts failed. A bad edge-router config was black-holing a fraction of TCP connections before they reached anything that produced a metric. Support tickets found it; our dashboards never did. The postmortem action item was the synthetic-probe rule above, and it has caught four similar incidents since.

### SLI design rules

1. **Ratio of good to total, from the same measurement point.** Never divide a numerator from one system by a denominator from another; clock skew and coverage gaps will manufacture impossible numbers (>100% availability tells you this happened).
2. **Latency SLIs are threshold-counts, not averages.** "% of requests faster than 800 ms" — never "average latency < 800 ms." Averages hide bimodal disasters; I've watched a 300 ms average conceal 5% of users waiting 30 s.
3. **One SLI per user journey, not per microservice.** Users experience "checkout," not `cart-service`. Per-service SLOs are fine as *supporting* diagnostics; the SLO of record follows the journey. (For how to compose journey SLOs across a dependency chain, see the dependency math note at the end of this doc.)
4. **Define what counts as an event, in writing.** Do retried requests count once or twice? Do health checks count at all (they must not — they will dominate the denominator and dilute real failures)? Do 4xx count as bad? (Usually no — except 429s caused by *your* over-aggressive limits, which are your failure, not the user's.)
5. **Exclude planned maintenance only if users genuinely don't experience it.** A maintenance window users feel is downtime with paperwork.

An SLO review procedure for checking a *proposed* SLI/SLO against everything in this section is packaged as the `reliability-engineer/skills/slo-validity-reviewer/` skill.

### Failure mode: vanity SLI (green while users suffer)

- **Failure mode:** SLI measures server-side success at the application, missing client-side, edge, and total-outage failures.
- **Detection:** monthly, correlate the SLI against support-ticket volume and RUM error rates. Any incident where tickets preceded alerts is a vanity-SLI finding. Ratio of client-observed to server-observed error rate > 1.5× is a red flag.
- **Fix:** move the SLO of record to LB/edge measurement; add RUM validation and a full-journey synthetic probe.
- **Prevention:** process gate — no SLO ships without passing the `slo-validity-reviewer` checklist, which requires stating the measurement point and what failure classes it *cannot* see.

## Setting the target: from data, not aspiration

Nobody can tell you a priori whether your service needs 99.9% or 99.99%. But you can bound it:

**Floor it with history.** Compute what your candidate SLI actually did over the last 3–6 months. Your first SLO target should be *slightly below* current typical performance — achievable now, honest, and tightenable later. An aspirational target you've never once met isn't an objective, it's a wish, and the team learns to ignore the permanently-red dashboard within a month. I have never seen a team recover respect for an SLO after it spent a quarter red.

**Ceiling it with your dependency chain.** You cannot offer more nines than your critical dependencies compose to. A service hard-depending on a 99.9% database and a 99.95% auth service tops out around 99.85% without architectural work (redundancy, graceful degradation, caching through outages). If someone proposes 99.99% on 99.9% dependencies, the SLO conversation is actually an architecture conversation.

**Price the increments.** Each nine roughly 10×es cost and operational constraint. 99.9% (43.8 min/month) is achievable with good practices and business-hours-ish response. 99.99% (4.4 min/month) means a human can never be in the recovery path — detection, decision, and mitigation must be automatic, because paging a human alone spends 5+ minutes. Say that sentence to whoever is asking for four nines and watch the requirement soften.

**Ask what users actually notice.** If your mobile client retries transparently and users notice nothing below 30 s of outage, a 99.95% availability SLO buys nothing over 99.9% except cost. Conversely, a trading API's users notice 200 ms. Target-setting inputs, in priority order: user-visible pain threshold, contractual SLA (SLO must be strictly tighter), historical performance, dependency ceiling, cost of the next nine.

### Failure mode: arbitrary target

- **Failure mode:** target chosen by round-number instinct ("three nines sounds professional") or copied from another team; either permanently red (ignored) or trivially green (meaningless).
- **Detection:** quarterly SLO review asks: has this SLO been breached in a way users didn't notice, or met while users complained? Either answer condemns the target. Also: an SLO at exactly 99.9%/99.99% with no written rationale is presumptively arbitrary.
- **Fix:** re-derive from the four inputs above; document the rationale inline with the SLO definition.
- **Prevention:** SLO definitions live in reviewed config/code with a mandatory `rationale:` field; the quarterly review is a calendar event with an owner, not an intention.

## Error budget policy: the part that has to hurt

The budget only means something if exhausting it *changes behavior automatically*. The policy is a short document, agreed by engineering **and product leadership** in a calm month, that says what happens at each threshold. Example that has worked for me:

| Budget state (rolling 28d) | Consequence |
|---|---|
| > 50% remaining | Ship freely. Spend budget on deliberate risk (load tests in prod, chaos experiments, fast rollouts). |
| 10–50% remaining | Releases require green canary + on-call sign-off. Reliability items jump the sprint queue. |
| Exhausted | Feature freeze for the service: only reliability work and security fixes ship until the rolling window recovers. Postmortem-driven action items become the sprint. |
| Exhausted 2+ consecutive windows | Escalate to leadership: the service is under-resourced for its target, so either fund reliability work or *formally lower the SLO*. Both are legitimate; silent breach is not. |

Three rules that keep the policy alive:

1. **Sign it before you need it.** The freeze clause will be tested within two quarters, always at the worst possible moment for product. If the VP who signed it isn't willing to enforce it then, you don't have a policy — you have a decoration, and everyone now knows it. One honest enforcement buys years of credibility; one waived freeze destroys it.
2. **Budget consumption must be visible where decisions happen** — in the release pipeline (gate on remaining budget), in sprint planning (budget dashboard in the ritual), not only on a wall dashboard nobody assigned themselves to read.
3. **Escape hatch, in writing:** leadership may explicitly override a freeze, *in writing, accepting the SLO breach*. This sounds like weakness; it is the opposite. Without a legitimate exit, people route around the policy quietly and it dies. With one, every override is a visible, attributable decision — and they become rare.

### Failure mode: paper policy

- **Failure mode:** error budget policy exists in a wiki; budget exhausts; releases continue as if nothing happened.
- **Detection:** trivially checkable — list windows where budget hit zero, list releases shipped during them without a written override. Any non-empty intersection is the finding. (`reliability-engineer/skills/reliability-posture-assessor/` runs exactly this check.)
- **Fix:** re-ratify the policy with the leaders who will pay its cost, or formally lower the SLO to one whose budget you're willing to defend. An honestly loose SLO beats a dishonestly tight one every time.
- **Prevention:** wire the budget into the deploy pipeline as a soft gate (override requires a named human and a reason string, both logged) — see `devops-engineer/` for pipeline mechanics; this KB owns the *decision rule*, that KB owns the plumbing.

## Alerting on SLOs

Don't alert on the SLO ("we're below 99.9%") — by then it's too late to matter and too slow to page on. Alert on **burn rate**: how fast the budget is being consumed. The standard multi-window multi-burn-rate scheme (fast burn: 14.4× over 1h → page; slow burn: 3× over 6h → page; 1× over 3d → ticket) is specified in `reliability-engineer/principles/alerting.md`, which is the canonical home for alert design. The division of labor: this doc decides *what the budget is*; that doc decides *when its consumption wakes someone*.

## Dependency math (for composing journey SLOs)

For serial hard dependencies, availabilities multiply: 99.9% × 99.9% ≈ 99.8%. Practical uses: (a) the target ceiling above; (b) allocating a journey SLO across teams — give each service in a 4-hop chain a budget share, don't hand all four the journey number and hope; (c) spotting free lunches — a cache that serves stale-on-error turns a hard dependency soft and buys back nines cheaper than any infrastructure spend. When a team asks for a tighter SLO *from you* because they hard-depend on you, the first question is whether the dependency should be hard at all.

## Where to go next

- Review a proposed SLO: `reliability-engineer/skills/slo-validity-reviewer/`
- Turn SLOs into pages that don't burn people out: `reliability-engineer/principles/alerting.md`
- Instrument well enough to compute honest SLIs: `reliability-engineer/principles/observability.md`
- Stand up SLOs for a brand-new system, end to end: `reliability-engineer/playbooks/build-a-reliability-program-from-scratch.md`
