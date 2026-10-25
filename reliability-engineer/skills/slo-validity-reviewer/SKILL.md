---
name: slo-validity-reviewer
description: Review a proposed or existing SLO/SLI for whether it actually reflects user-perceived experience — measurement-point blindness, vanity-SLI risk, arbitrary targets, unenforceable budget policy. Use before an SLO ships, during quarterly SLO reviews, after any incident where dashboards stayed green while users suffered, or as the per-SLO worker in a posture assessment. Do NOT use for designing SLOs from nothing (follow reliability-engineer/playbooks/build-a-reliability-program-from-scratch.md, Steps 1–3), for whole-system posture (use reliability-posture-assessor), or for alert-rule review (use alert-actionability-auditor).
---

# SLO Validity Reviewer

You are executing the SLI/SLO judgment from `reliability-engineer/principles/slos-and-error-budgets.md` in checklist form (read it if available; this skill is self-sufficient). Governing stance: **the null hypothesis is that this SLO can stay green while users suffer — the burden of proof is on the SLO.** You review; you do not rewrite the SLO yourself unless asked — findings first, so the author learns the *why*.

**Inputs required:** the SLI definition (metric source + formula), the target + window, and the measurement point. If any is missing, that absence is finding #1 — an SLO whose measurement point can't be stated is unreviewable and unfalsifiable. Ask for what's missing; don't guess it politely.

## Checklist (run all six; each has a verdict)

**1. Measurement point — what is this SLI blind to?** Application self-reported → blind to its own death (crashed process reports no errors; LB sees the 502s), to LB/edge/DNS/CDN failures, to everything client-side. LB/edge → blind to client-network and DNS. Require the author to state the `blind_to:` list; if a full-journey synthetic probe or RUM validation doesn't cover the top blindness, flag it. **The vanity test, if history exists:** pick the last 1–2 user-visible incidents — did this SLI move? Green-through-a-real-outage disqualifies the SLI regardless of design elegance.

**2. SLI form.** Good/total ratio, numerator and denominator from the *same* measurement point (mixed sources manufacture >100% availability). Latency = threshold-count ("% under 800 ms"), never average (averages hide the bimodal disaster). Event definitions in writing: retries counted how? health checks excluded (they dilute the denominator or it's a defect)? 4xx handling stated (client errors usually excluded; *your* 429s are your failure)?

**3. Journey, not service.** Does the SLI track something a user experiences ("checkout completes") or an internal component? Per-service SLIs are legitimate diagnostics but flag them if presented as the SLO of record — users don't experience `cart-service`.

**4. Target derivation.** Require the rationale. Legitimate inputs: user pain threshold, SLA (SLO must be strictly tighter — flag SLO==SLA as a legal event generator), historical baseline (first target slightly below current typical), dependency ceiling. Compute the ceiling yourself if dependencies are listed: serial hard deps multiply (99.9% × 99.95% ≈ 99.85%); a target above the ceiling is an architecture conversation mislabeled as an SLO, and your finding should say which. Round numbers with no derivation = presumptively arbitrary. A target the service has never once met = a wish; recommend the achievable-now-tighten-later ladder.

**5. Window and budget arithmetic.** State the budget in concrete units (99.9%/28d on ~100M req = ~100k bad requests; in downtime terms ~40 min) — authors are routinely shocked by their own numbers in event form, in both directions. Rolling window preferred over calendar (calendar windows invite month-end gaming).

**6. Budget policy enforceability.** Does a written policy exist naming consequences at thresholds and a signer who owns them? If history exists, run the intersection test: budget-exhausted windows × releases shipped without written override — non-empty means paper policy, and the finding says so in those words. No policy at all → the SLO is a dashboard, not an objective; say that too.

## Output contract (emit exactly this)

```markdown
# SLO Validity Review — <SLO name> — <date>
## Verdict: VALID | VALID-WITH-CHANGES | INVALID (one sentence why)
## Blindness list (what this SLI cannot see, per the author + per you)
## Findings
[# | checklist item | severity (blocker/should-fix/note) | evidence | fix, citing the principle]
## The two condemning questions (if history exists)
[breached-while-users-fine? met-while-users-screamed? evidence]
## What would make this SLO trustworthy (≤3 concrete changes, ranked)
```

Blocker = ships-green-while-broken risk (measurement blindness on a top journey, disqualified-by-history SLI, SLO==SLA). Should-fix = arbitrary target, missing policy, averaged latency. A review that finds nothing should say which checks it ran and what evidence it lacked — "no findings" without the vanity test run is not a pass, it's an incomplete review.

## References

Full reasoning and war stories: `reliability-engineer/principles/slos-and-error-budgets.md` · burn-rate alerting the SLO feeds: `reliability-engineer/principles/alerting.md` · system-wide version: `reliability-engineer/skills/reliability-posture-assessor/` · fan-out across a fleet: `reliability-engineer/orchestration/README.md`
