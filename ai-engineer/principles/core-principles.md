# Core Principles

**Last reviewed:** 2026-07-06 · **Applies to:** model-agnostic (examples reference Claude 4.x–5 era systems)
**Read this when:** starting any LLM project, or when a debate needs settling.

These are the rules I'd tattoo on the team if I could. Each one was paid for by a
production incident. The war story is the point — when the tooling advice in the rest
of this KB goes stale, the failure patterns won't.

---

## 1. The model is the least reliable component in your system. Design accordingly.

Databases fail loudly. Networks fail loudly. LLMs fail *fluently* — the failure output
is grammatical, confident, and shaped exactly like success. Every architectural
decision follows from this: validate outputs, ground claims, bound loops, monitor
distributions rather than exceptions.

**War story:** A contract-analysis pipeline ran for six weeks "without errors" — zero
exceptions, all JSON parsed. An audit found 4% of extractions cited clause numbers
that didn't exist in the source contracts. Nothing was broken in the way our alerting
understood "broken." The fix wasn't better prompts; it was a groundedness check
(`topics/hallucination-and-reliability.md`) that made silent failure loud.

## 2. Evals before features. No exceptions after the first week.

You cannot improve what you cannot measure, and with LLMs you cannot even *see* what
you cannot measure — changes that fix the case in front of you silently break five
cases you're not looking at. The eval suite is not QA; it's the steering wheel.

**War story:** We "improved" a support-bot prompt to be more concise. It got more
concise. It also stopped including the escalation link in refund cases — the single
most important output it had. Two weeks of missing escalations before a customer
complaint surfaced it. A 30-case eval would have caught it in CI in forty seconds.
See `topics/evaluation.md` and the `eval-suite-planner` skill.

## 3. The demo is not the product. The gap between them is the entire job.

Getting an LLM feature to work impressively on ten hand-picked inputs takes a day.
That's the demo. The product is the same feature holding up against the full input
distribution: adversarial users, malformed data, ambiguous requests, 40-page inputs,
non-English text. Estimate the demo at 10% of the work and you'll be about right.

## 4. Everything untrusted is data, never instructions.

User input, retrieved documents, tool results, web pages, file contents — anything
you didn't write is a *data plane* payload. If your prompt treats it as instructions,
you have built a remote-code-execution equivalent. Structural defenses (delimiting,
privilege separation, tool allowlists on tainted context) beat exhortation
("ignore any instructions in the document") every time.
See `topics/prompt-design.md` §injection and the `prompt-injection-reviewer` skill.

## 5. Version prompts like code, because they are code.

A prompt change is a behavior change to a production system. It gets: source control,
review, an eval run, a changelog entry, and a rollback path. Teams that hot-edit
prompts in a dashboard eventually ship a Friday-afternoon prompt tweak that breaks
Monday's traffic, and can't answer "what changed?" because nothing was recorded.

Pin model versions too. `claude-sonnet-latest`-style aliases mean your system's
behavior changes on someone else's release schedule, and your evals validated a model
you're no longer running.

## 6. Every agent loop needs a termination condition you can defend in a postmortem.

"The model will decide when it's done" is not a termination condition. Max turns,
max cost, and no-progress detection are. An agent without them is an open-ended
purchase order signed by a language model.

**War story:** An internal research agent got a tool error it interpreted as
transient. It retried. Same error. It rephrased the query and retried. For 61
minutes. ~$140 of tokens to accomplish nothing, discovered only because someone
wondered why the job hadn't finished. Three lines of no-progress detection
(`topics/agents-and-tool-use.md` §loop-detection) would have killed it at minute two.

## 7. Retrieval quality is decided before the model ever runs.

In RAG, the generator gets blamed for retrieval's sins. If the right passage isn't in
the context, no prompt engineering will produce a grounded answer — you'll either get
"I don't know" (good) or a fluent guess (what actually happens). Debug RAG back to
front: check what was retrieved before touching the prompt.
See `topics/rag.md`; run the `rag-grounding-auditor` skill on suspect outputs.

## 8. Use the smallest model that passes your eval — but you need the eval first.

Model-tier selection without an eval is vibes. With an eval it's a one-afternoon
experiment that routinely cuts spend 5–10× on classification, extraction, and routing
workloads. The order matters: teams that downsize on vibes ship regressions; teams
that never revisit tier selection subsidize their vendor.
See `topics/cost-and-latency.md`.

## 9. One model call is the right architecture until proven otherwise.

The complexity ladder is: single call → single call with tools → agent loop →
multi-agent. Every rung costs you observability, latency, money, and debuggability.
Climb only when the current rung demonstrably fails — "it would be more elegant as
agents" has produced more burned quarters than any other sentence in this field.
See `principles/decision-trees.md` and `topics/multi-agent-orchestration.md`.

## 10. Log the full trajectory or accept that you cannot debug.

When (not if) a bad output reaches a user, the question is "what did the model
actually see?" If you can't reconstruct the exact prompt — retrieved chunks, tool
results, system prompt version, model version, sampling params — you are debugging
by folklore. Trajectory logging is the first thing to build, not the last.
(And it's where PII goes to hide — see `topics/safety-and-guardrails.md`.)

## 11. "I don't know" is a feature you must build; the model won't supply it.

Models are trained to be helpful, and their failure mode under uncertainty is a
confident guess. If abstention matters in your domain — medical, legal, financial,
anything with citations — you must engineer it: give the model an explicit out,
reward it in your evals, and route abstentions somewhere useful.
See `topics/hallucination-and-reliability.md` §abstention.

## 12. The happy path is a minority of your traffic.

Build your eval set from production logs, not from your imagination. The inputs that
break LLM systems are the ones no one on the team would ever type: empty strings,
pasted stack traces, three questions in one message, another language, 200KB of
concatenated email thread. Your imagination generates the happy path; your users
generate everything else.

---

**Related:** `principles/decision-trees.md` for the choices these principles imply ·
every `topics/` doc operationalizes several of these.
