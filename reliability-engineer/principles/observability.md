# Observability: Having Data vs. Being Able to Answer Questions

**Applies to:** tool-agnostic principles; examples cite Prometheus 3.x, OpenTelemetry SDK/Collector 1.x/0.1xx, Grafana 12, Loki/Elasticsearch-class log stores · **Last verified:** 2026-07-14

**Working definition:** observability is the ability to answer questions about your system's internal state *that you did not anticipate when you instrumented it*, from the outside, during an incident, at 3am, by someone who didn't write the code. Everything else — the pillars, the tooling, the pipelines — is means to that end. The test of an observability stack is not what data it has; it's how long it takes a stressed human to get from "checkout SLO is burning" to "it's the connection pool on `payments-db-3`."

## The three signals are complementary, not redundant

Teams buy all three then use each badly, because nobody told them the division of labor:

| Signal | Question it answers | Strength | Inherent limit |
|---|---|---|---|
| **Metrics** | *Is* something wrong? How wrong? Since when? | Cheap, pre-aggregated, long retention, fast to query, alertable | Aggregation destroys the individual event; can't tell you *which* request failed or why |
| **Traces** | *Where* in the request path is it wrong? | Follows one request across service boundaries; turns "everything is slow" into "the fan-out to `inventory` is slow" | Sampled — the trace you need may not exist (see sampling below); useless without propagated context |
| **Logs** | *What exactly* happened at that spot? | Arbitrary detail, the only place for things that aren't numbers (stack traces, request payloads, decisions taken) | Expensive at volume; unqueryable if unstructured; drowning in them is the default state |

The intended incident flow is **metrics → traces → logs**: the alert (metrics) says checkout latency is burning budget; the trace exemplar says the time went into `inventory-service` calls; the logs for that service, filtered by the trace ID, say the connection pool is exhausted. Each hop needs a *link*: metrics that carry trace exemplars (OpenMetrics exemplars / Grafana-Tempo linking), and logs that carry the `trace_id`. **If your logs don't include trace IDs, fix that this quarter; it is the single highest-leverage observability improvement per unit of effort I know.** Without the links, your three pillars are three silos and your responders do the joins by hand, at 3am, by timestamp squinting.

Corollary: money spent making one pillar do another's job is wasted. Metrics-from-logs pipelines that parse errors out of log lines are fragile and slow; logging every request to compute a rate is paying log prices for metric work; tracing retained at 100% "so we can query it like logs" is the most expensive log store ever built.

## Instrumentation: the gap you find during the incident

Every instrumentation gap gets discovered the same way: mid-incident, someone asks a question, and the room goes quiet. "How many users are affected?" Silence. "Is it all regions or just eu-west?" Silence. The gap was always there; the incident just administered the exam.

**Minimum instrumentation standard for any user-facing service** (make it a production-readiness gate, not a suggestion):

1. The four golden signals — latency (as histograms, never averages), traffic, errors, saturation — labeled by endpoint and region.
2. RED metrics for every *dependency* the service calls (rate, errors, duration per downstream) — most incidents are dependency incidents, and this is how you tell "we're broken" from "they're broken" in one glance.
3. Trace propagation through every hop, including queues (inject context into message headers; the async gap is where traces go to die).
4. Structured logs (JSON), with `trace_id`, `service`, `version`, and `region` on every line.
5. A `version`/build label on metrics, so "did the deploy cause this" is a query, not a debate. (Deploy *markers* into the dashboard annotations too — the mechanics belong to `devops-engineer/`, the requirement is ours.)

### Failure mode: instrumentation gap discovered during an incident

- **Failure mode:** the question that decides mitigation ("who is affected?", "which shard?") cannot be answered with existing telemetry; responders fall back to guessing or SSH archaeology, and MTTR triples.
- **Detection:** you detect this *before* incidents by rehearsal: game days where the scenario is real but the exam is your telemetry ("here's the symptom — find the cause using only dashboards"). During postmortems, explicitly ask "what question couldn't we answer?" and file the gap as an action item — see `reliability-engineer/principles/postmortems.md`.
- **Fix:** instrument the specific gap; add the dashboard panel that would have answered the question.
- **Prevention:** the production-readiness gate above for new services; a per-service "key questions" doc (five questions this service's dashboards must answer in under five minutes — affected-user count, region breakdown, dependency vs. self, deploy correlation, saturation headroom) verified quarterly and after major architecture changes.

## High cardinality: the outage your metrics cause

Cardinality — the count of distinct time series — is the product of a metric's label value counts. It grows multiplicatively and bills the same way. The classic self-inflicted wound: someone adds `user_id` or `session_id` or raw URL path (with embedded IDs) as a metric label. A metric with 10 endpoints × 5 regions × 3 status classes is 150 series; add `customer_id` for 50k customers and it's 7.5 million. I have watched a single well-intentioned label take down the metrics backend during an incident — which is the worst possible time to be blind, and exactly when you will be, because incident-time traffic patterns maximize label spread.

- **Failure mode:** unbounded label (user ID, request ID, raw path, container ID on short-lived pods, error *message* as label) causes memory/cost blowup in the TSDB; queries slow to useless or the backend OOMs, typically during an incident.
- **Detection:** alert on series count per metric name (Prometheus: top-k `prometheus_tsdb_head_series` growth, `count by (__name__)({__name__=~".+"})` in a recording rule; most vendors expose a cardinality dashboard). Weekly review of top-10 metrics by series count; any metric whose cardinality tracks business volume rather than infrastructure size is a defect.
- **Fix:** drop or hash the label at the collection layer (OTel Collector processors / Prometheus relabeling) *today*; re-instrument properly after. Per-user data belongs in traces and logs (which are per-event by design), not metric labels.
- **Prevention:** a written labeling standard ("labels must have bounded, enumerable value sets; anything user-scoped or request-scoped is forbidden") enforced in code review; cardinality limits at ingestion (per-metric series caps) so mistakes degrade one metric instead of the platform.

## Trace sampling: the rare trace you needed

Nobody retains 100% of traces at scale; the question is which strategy loses which data, on purpose.

**Decision tree:**

- **Low traffic (< ~50 req/s aggregate)?** → Sample 100%. Your problem is adoption, not cost; don't complicate.
- **High traffic, budget-constrained, no collector tier you can operate?** → Head sampling (decide at request start, e.g. 1–10%). Accept the known cost: *the rare bad request is sampled out with probability 1 − rate.* The 0.1% of requests that fail are exactly what you bought tracing for, and at 1% head sampling you keep 1% of them.
- **High traffic and you can run a buffering collector tier?** → Tail sampling: hold spans until the request completes, keep 100% of errors and high-latency traces, 1% of boring ones. This is the right answer for most orgs above mid-scale; the price is operating the buffer (memory, and *all spans of a trace must route to the same collector instance* — load-balance by trace ID, or your kept traces arrive amputated).
- **Either way:** always propagate context even when not recording (so downstream sampling decisions stay consistent), and exempt your top user journeys from aggressive sampling — checkout gets 100% error retention even if the long tail doesn't.

- **Failure mode:** the incident's characteristic trace doesn't exist — errors were head-sampled away — so responders reconstruct the request path from logs by hand.
- **Detection:** during any incident retro, check: did we have a trace for the failing pattern within 2 minutes of looking? Track the hit rate.
- **Fix/prevention:** move error/latency retention to tail sampling or error-biased head rules; verify quarterly by picking a real production error and confirming its trace exists.

## Logs: volume is not signal

Log cost grows linearly with traffic and prose; log *value* is concentrated in a tiny fraction of lines. The discipline:

- **Structured (JSON) or it doesn't exist.** During an incident, `{level, ts, service, trace_id, msg, err, user_impact_fields...}` is queryable; prose is grep-able if you're lucky and the author was consistent. They never are.
- **Log decisions and state transitions, not progress.** "Retrying payment, attempt 2/3, last_err=timeout" is signal. "Entering function processPayment" is cost. INFO-per-request at the edge is fine; INFO-per-request at every internal hop is paying five times for one fact — that's the trace's job.
- **Sample repetitive errors at the source** (first N per minute per signature, then a counter). An error storm that 10×es your log bill *while also* pushing the useful lines out of view is a double failure; I've seen the log pipeline itself become the incident's second victim, and the backpressure took out a service that shared the pipeline.
- **Tier retention:** hot searchable (7–14 days) for incident response; cold/archive (1 year+) for compliance and the rare deep postmortem. Most orgs keep everything hot out of inertia and pay 5× for data nobody queries after day 10.

- **Failure mode:** log volume grows until cost forces a panic cut, done by whoever owns the bill rather than whoever knows the signal, deleting the lines you needed.
- **Detection:** monthly log-volume-by-service-by-level review; any service logging more DEBUG/INFO bytes than request bytes is a finding.
- **Fix:** demote progress logging, sample repetitive lines, tier retention.
- **Prevention:** per-service log budgets with alerts at 80%, and a logging-standards doc enforced at review — the same shape of gate as the metrics labeling standard.

## Usable during an incident: the 3am test

Data you cannot navigate under stress is decoration. The bar: **a responder who didn't build the service, at 3am, gets from symptom to suspect subsystem in under five minutes using only what's linked from the alert.**

What that requires, concretely:

1. **Every page links to a dashboard and a runbook** (`reliability-engineer/principles/alerting.md` makes this a hard rule). The dashboard it links to is the *diagnosis* dashboard, not the vanity wall-display one.
2. **Diagnosis dashboards are question-shaped, not data-shaped.** Top row: is the SLO burning, since when, deploy markers. Second row: self vs. dependencies (the RED-per-dependency panels). Third row: saturation candidates. A dashboard with 40 equal panels is a data dump; the responder needs an argument, ordered by likelihood.
3. **Consistent naming across services.** If one service calls it `http_request_duration_seconds` and the next `api_latency_ms`, every cross-service query is a research project. Adopt a convention (OTel semantic conventions are fine) and lint it.
4. **Drills.** Once a quarter, hand an engineer a past incident's symptom and time how long to diagnosis using current dashboards. The time series of that drill *is* your observability quality metric — it catches rot (broken panels, renamed metrics, stale runbooks) that no amount of good intention does.

- **Failure mode:** the org "has observability" — three vendors, sixty dashboards — but incident diagnosis still happens over SSH by the one person who knows where things are; when they're on vacation, MTTR doubles.
- **Detection:** the quarterly drill above; also measure "time from page to first correct hypothesis" across real incidents from postmortem timelines (`reliability-engineer/agents/incident-timeline-reconstructor.md` extracts this while reconstructing).
- **Fix:** build the question-shaped dashboards for the top 3 user journeys; wire alert → dashboard → runbook links.
- **Prevention:** the drill, on the calendar, with the result reported alongside SLO compliance. What gets drilled stays usable.

## Where to go next

- What deserves a page at all: `reliability-engineer/principles/alerting.md`
- Computing SLIs from this telemetry: `reliability-engineer/principles/slos-and-error-budgets.md`
- Using it under fire: `reliability-engineer/principles/incident-management.md`
- Auditing an existing system's telemetry: `reliability-engineer/playbooks/assess-an-existing-systems-reliability.md`
