# Monitoring & Drift

**Version 1.0 — 2026-07-06.** Framework-agnostic. Standalone. Related: [train-serve-skew.md](train-serve-skew.md) (skew is what monitoring most often finds), [deployment-and-serving.md](deployment-and-serving.md) (rollback is what monitoring most often triggers), [evaluation.md](evaluation.md). Callable counterpart: `.claude/agents/pipeline-regression-tracer` (when monitoring fires and the cause must be traced).

---

A deployed model degrades by default. The world it modeled moves — user behavior, upstream schemas, adversaries, the product around it — while the weights stay frozen. Service monitoring (latency, errors, saturation) will report this degradation as *perfect health*, because a model serving nonsense serves it fast and without exceptions. Model monitoring exists to catch the failures that don't throw.

The formative incident is in [train-serve-skew.md](train-serve-skew.md): a units mismatch degraded conversions for three weeks behind green dashboards, found by a human eyeballing a business chart. Everything in this doc is the answer to "what would have caught that in hours."

## 1. Concept drift vs. data drift — different diseases, different treatments

**Data drift (covariate shift):** P(X) changes — the inputs move. New user demographics, a marketing campaign, a new device type, seasonality. The mapping X→Y the model learned may still be valid; the model is being asked about regions of input space it saw rarely.

**Concept drift:** P(Y|X) changes — the *relationship* moves. Fraudsters adapt to your model, a pandemic changes purchase behavior, a price change alters conversion propensity. The same inputs now have different correct answers. No amount of input monitoring detects this directly; only outcomes do.

**Why the distinction is operational, not academic:** data drift *without* concept drift → retraining on recent data helps, and sometimes just reweighting does. Concept drift → retraining helps *only if recent labels reflect the new concept*, and gradual retraining can lag an adversary indefinitely (fraud models need faster loops and adversarial features, not just cron-driven retrains). Diagnose before prescribing: input distributions moved but label-conditional relationships stable = data drift; input distributions stable but accuracy fell = concept drift; both moved = both (usual, during real-world shocks).

**Label lag is the crux.** Concept drift detection needs outcomes, and outcomes arrive late (chargebacks: weeks; churn: months). Hence the layered monitor below: fast label-free proxies to *suspect*, delayed label-based metrics to *confirm*.

## 2. What to actually monitor (the four layers)

Prerequisite for all of it: **log every prediction** — inputs (served feature vector), score, model version, timestamp, entity, and later the joined outcome label. This log is the monitoring substrate, the skew-audit substrate, and the regression-tracer's evidence. If you log nothing else, log this. (Sample if volume forces it, but sample by entity, not uniformly, so you can trace individual histories.)

**Layer 1 — Input/feature health (fast, label-free, catches skew and upstream breakage):**
- Per-feature: null rate, UNK/out-of-vocabulary rate, out-of-range rate, and distribution vs. a reference window (training set, or trailing 4 weeks). Step changes in null/UNK rates are the single highest-yield alert in my experience — they catch schema drift, join breakage, and upstream defaults changing, usually same-day.
- Volume and freshness: rows scored per period, feature age at serve time vs. freshness SLO ([train-serve-skew.md](train-serve-skew.md) §2).

**Layer 2 — Prediction distribution (fast, label-free, catches model+input jointly):**
- Score distribution: mean, percentiles, fraction above the action threshold, per key slice. A fraud model whose flag-rate doubles overnight is telling you something — maybe attack, maybe broken feature; either way, page.
- Prediction-vs-incumbent divergence during rollouts ([deployment-and-serving.md](deployment-and-serving.md) §4).
- Calibration drift once partial labels arrive: predicted-vs-observed rate in score buckets.

**Layer 3 — Outcome quality (slow, the truth):**
- The eval-spec primary metric ([evaluation.md](evaluation.md) §1) computed on production predictions joined to arrived labels, **windowed by prediction time and by label maturity** — naive joins mix immature cohorts and show phantom regressions (last week's cohort always looks worse because its labels haven't finished arriving; compute metrics per cohort at fixed maturity, e.g. "quality at 14 days after prediction").
- Always sliced ([evaluation.md](evaluation.md) §1) — aggregate quality flat while the newest user segment collapses is the standard silent failure.

**Layer 4 — Business/system guardrails:**
- The downstream decision metric (conversion, block rate, revenue per session), the degradation-ladder rung mix, timeout/fallback firing rate ([deployment-and-serving.md](deployment-and-serving.md) §5). These catch what your model metrics abstract away — including the failure where the model is fine but nobody's consuming it (the timed-out fraud model story).

**Drift statistics, chosen boringly:** PSI per feature (alert ≳0.2, investigate ≳0.1) or KS tests for continuous features; χ² or L∞ distance on category frequencies for categoricals. On large traffic, *everything* is statistically significant — set thresholds on effect size (PSI, absolute rate change), not p-values. Multivariate/embedding drift detectors exist; deploy them after the univariate basics are solid, not instead.

## 3. Alerting design: catching silent regressions without crying wolf

**Failure mode.** Two symmetric deaths: (a) no model-quality alerts, regression found by a human weeks later; (b) 400 per-feature drift alerts a week, all ignored within a month, then the real one arrives pre-ignored. Alert fatigue isn't a people problem; it's a design problem — every alert that doesn't change someone's next action is training the team to ignore the channel.

**Design rules:**
- **Tier the response, not just the threshold.** Page: prediction volume drops, score distribution steps outside guardrails, null/UNK step change on a top feature, fallback rung firing. Ticket (next business day): moderate PSI drift, calibration slope trending, single-slice quality decline. Dashboard-only: everything else. If it can't name the action the responder takes, it's a dashboard, not an alert.
- **Alert on steps and trends, not levels.** Seasonal traffic makes level-thresholds flap. Compare same-hour-last-week, or use changepoint-style detection on the monitored series.
- **Aggregate correlated alerts:** 40 features drifting simultaneously is *one* event (an upstream deploy), not 40. Group by upstream source/pipeline in the alert routing.
- **Every alert links its runbook:** which dashboard, which recent-deploys list (model registry + feature pipeline + upstream), and when to dispatch the `pipeline-regression-tracer` agent (i.e., when the cause isn't obvious within 30 minutes of looking).
- **Test the alerts.** Inject a synthetic null-spike / score-shift in staging (or replay one from a past incident) and confirm the page fires. An untested alert is a hope.

**The retrain-on-drift trap:** auto-retraining triggered by drift alerts sounds self-healing and quietly institutionalizes garbage-in: if the drift *is* upstream breakage (nulls, unit change), retraining teaches the model the breakage. Rule: **drift alerts trigger diagnosis; only diagnosed benign drift triggers retraining.** Automate the diagnosis checklist before automating the retrain.

## 4. Feedback loops: the model contaminating its own future

**Failure mode.** The model's decisions shape the labels you collect: the loan model only observes repayment for loans it approved; the recommender only gets clicks on items it showed; the fraud model's blocks prevent the fraud labels that would prove it right. Retrain on that data naively and the model amplifies its own blind spots — each generation more confident about the region it acts on, blinder outside it. This is slow (generations, not days), which makes it the hardest drift to notice from inside.

**Detection.** Compare the feature/score distribution of *labeled* rows vs. *all scored* rows — a growing gap measures the selection your decisions impose. Track inter-generation prediction divergence on a fixed reference set: successive retrains drifting monotonically in one direction on unchanged inputs is the amplification signature.

**Fix/prevention.** Keep an exploration slice (small % of decisions randomized or threshold-relaxed) to collect labels outside the model's chosen region — the same slice that fixes off-policy evaluation ([evaluation.md](evaluation.md) §3); weight it into retraining. Log the *decision* and model version with the label so training can condition on or correct for the policy that generated the data. For blocked/rejected populations where outcomes are unobservable, hold out a tiny audit sample (approve a small random slice of would-be-blocked cases, with product sign-off) or accept, in writing, that model quality on that region is unmeasured.

## 5. When the alert fires: first 30 minutes

1. **Deploys first, data second, world third** — in base-rate order: check model registry (new model version?), feature-pipeline deploys, upstream schema/producer changes. Most "drift" is a deploy.
2. Scope it: which features/slices/segments, since exactly when (step or ramp?). Step = deploy/breakage; ramp = drift/adaptation.
3. Overlay the timeline against the deploy history of every system in the prediction path.
4. Obvious within 30 minutes → fix forward or roll back ([deployment-and-serving.md](deployment-and-serving.md) §3). Not obvious → dispatch `pipeline-regression-tracer` with the scope evidence; don't trawl logs in the incident channel.
5. Afterward: did an alert catch it, or a human? If a human, add the alert that would have; if an alert was ignored, fix the alert's action-linkage, not the human.
