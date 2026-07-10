# RAG Systems

**Last reviewed:** 2026-07-06 · **Applies to:** Claude 4.x–5 family, GPT-5-era models; embedding models of the voyage-3 / text-embedding-3 generation. Architecture is model-agnostic.
**Read this when:** designing, debugging, or auditing anything that retrieves-then-generates.
**Related:** guide: `guides/build-a-rag-system.md` · skill: `rag-grounding-auditor`.

The one-sentence model of RAG debugging: **the generator gets blamed for the
retriever's sins.** When answers are wrong, look at what was retrieved before you
touch a prompt. And the one-sentence model of RAG design: **every stage can only
lose information** — a chunking mistake is unrecoverable at retrieval time, a
retrieval miss is unrecoverable at generation time. Invest upstream.

---

## 1. Chunking strategy

**Failure mode.** Chunk boundaries destroy the units of meaning your users ask
about. A fixed 512-token splitter cuts a policy's exception clause away from the
rule it modifies; retrieval finds the rule, the model answers without the
exception — a *confidently wrong* answer built from a true fragment.

**War story.** An HR-policy bot answered "unused PTO is paid out on departure" —
retrieved from the policy, verbatim, grounded. The next sentence in the source,
in the next chunk, was "except for employees in California, where...". Recall was
fine. Precision was fine. The chunk boundary was the bug.

**Tradeoffs, honestly:**

| Strategy | Wins | Loses | Use when |
|---|---|---|---|
| Fixed-size + overlap | Trivial, predictable cost | Cuts semantic units | Baseline; homogeneous prose |
| Structure-aware (headings, sections) | Boundaries match meaning | Needs per-format parsing; uneven sizes | Docs with real structure (policies, manuals, code) — **default** |
| Semantic (embedding-similarity splits) | Adapts to content | Expensive, unstable across re-index | Rarely worth it over structure-aware |
| Parent-child (retrieve small, feed big) | Precise matching + full context to model | 2× storage, more plumbing | Long docs where answers need surrounding context |

Two invariants regardless of strategy: **10–20% overlap** between adjacent chunks
(insures against boundary cuts), and **prepend document context to every chunk** —
title, section path, date ("ACME Employee Handbook 2026 > Leave > PTO payout").
A chunk that can't identify its own document is a distractor waiting to happen.

**Detection.** Sample 20 retrieval results and *read them*: can a human answer the
query from the chunk alone? Failed-answer analysis where the right doc was
retrieved but the answer is incomplete → boundary problem.

**Fix.** Move to structure-aware chunking; add overlap; add parent-child if answers
need surrounding context.

**Prevention.** Chunking is a versioned, evaled parameter like a prompt. Re-run
retrieval evals when you change it. Keep raw documents so you can re-chunk —
chunking decisions should never be one-way doors.

## 2. Embedding model / domain mismatch

**Failure mode.** General-purpose embeddings encode general-purpose similarity.
In your domain, "Section 409A" and "deferred compensation rules" must be near
neighbors and "ATM" (networking) must be far from "ATM" (banking); a general model
guarantees neither. Result: retrieval that looks plausible and is subtly,
systematically wrong on exactly your domain's vocabulary.

**War story.** A telecom KB embedded with a general model: queries about "cell
bleeding" (RF interference) retrieved health-and-safety documents. Every acronym
collision (BER, CDR, MOS) produced a similar off-domain neighbor. No error
anywhere — just the wrong nearest neighbors, forever.

**Detection.** Build a labeled set: 50–100 real queries, each with known-relevant
chunk IDs. Measure recall@k. Then read the *misses*: domain-vocabulary queries
failing while plain-English queries succeed is the mismatch signature.

**Fix, in escalating order of effort:**
1. **Hybrid search** (BM25 + vector, reciprocal-rank fusion). Lexical search nails
   exactly what embeddings fumble — acronyms, part numbers, error codes, names.
   Cheapest large win in RAG; most systems should ship with it by default.
2. Better/newer general embedding model (they improve fast; re-benchmark yearly).
3. Domain-tuned embeddings — real gains, real MLOps cost; only after 1–2 measured
   insufficient.

**Prevention.** The labeled retrieval eval runs in CI against any embedding/index
change. Log queries with low top-result similarity scores — they cluster around
vocabulary the embedding space doesn't understand.

## 3. Retrieval recall vs. precision

**Failure mode.** Tuning k by feel. k too small → the answer isn't in context
(recall failure; model guesses or abstains). k too large → the answer is in
context but buried in distractors (precision failure; model answers from the
wrong chunk, cost and latency inflate). These produce *different wrong answers*
and need different fixes, which is why you must measure them separately.

**Detection.** From the labeled set: recall@k and precision@k curves as k varies.
Also instrument production: at what rank does the chunk the model actually cited
sit? If cited chunks are consistently rank 1–3, your k=12 is pure distractor
budget.

**Fix.** Recall problem → hybrid search, query rewriting (expand acronyms,
decompose multi-part questions), better chunk context, only then larger k.
Precision problem → re-ranking (next section), smaller k, metadata filters
(date, product, audience) to shrink the candidate pool before similarity search.

**Prevention.** Recall@k and precision@k on the dashboard next to answer quality.
When answer quality drops, these two numbers tell you which half of the system to
open up.

## 4. Re-ranking: when it's necessary

Embedding similarity is a *bi-encoder*: query and chunk were embedded
independently, so the score never actually compared them. A re-ranker
(cross-encoder) reads query and chunk together — far more accurate, far too slow
to run over the whole corpus. Hence the two-stage shape: retrieve top-50 cheap,
re-rank to top-5 accurate.

**The decision is a measurement**, not a preference (see
`principles/decision-trees.md` §4): re-ranking helps precisely when recall@20 is
good and precision@5 is bad — the right chunk is *found* but *buried*. If
recall@20 is bad, there's nothing to re-rank; fix retrieval first.

**Failure modes of re-ranking itself:** latency budget blown (+50–300ms — decide
against your TTFT budget, `topics/cost-and-latency.md`); re-ranker domain mismatch
(same issue as §2, one stage later); silently re-ranking garbage when upstream
retrieval regresses — monitor pre- and post-re-rank metrics separately.

## 5. Stale and conflicting documents

**Failure mode.** The corpus contains the 2023 policy and the 2026 policy; both
retrieve; the model synthesizes a blend, or picks the stale one because its
wording matches the query better. Users get an answer that was true once.
This is the most common *production* RAG failure — corpora rot faster than teams
expect, and nothing errors when they do.

**War story.** A sales-enablement bot quoted a discontinued pricing tier for
three weeks. The new pricing page was in the index. The old one was too — in four
places (a PDF export, a wiki copy, a slide deck, the original). Retrieval
"worked" every time.

**Detection.** Corpus audit: distribution of document ages; near-duplicate
detection (embed docs, cluster high-similarity pairs, flag pairs with different
dates). In answers: the `rag-grounding-auditor` skill flags answers whose cited
chunks disagree with each other.

**Fix.**
- **Metadata is not optional:** every chunk carries `effective_date`,
  `supersedes`, `status`. Filter or down-rank stale content at retrieval time.
- Deduplicate at ingestion (near-dup clusters → keep canonical, drop copies).
- Prompt-side last resort: "if retrieved documents conflict, prefer the most
  recent and say that they conflict." This helps only when metadata made
  recency visible in the context.

**Prevention.** Ingestion is a pipeline with an owner, not a one-time script:
re-crawl cadence, tombstones for deleted sources, a freshness SLO ("no chunk
older than its source by > 24h"), and an alert when a source stops updating.

## 6. Citation grounding

**Failure mode.** The model cites chunk 3; the claim is not in chunk 3. Or the
claim is *near* chunk 3's content but adds a number, a condition, a negation.
Citations create trust; ungrounded citations weaponize that trust — users verify
less precisely because the citation exists.

**War story.** The one that made me write this KB. A legal-research assistant
produced a beautifully formatted answer citing "¶ 14 of the retrieved agreement"
for a claim about assignment rights. Paragraph 14 existed. It was about notice
periods. The model had learned the *shape* of a well-cited answer, and the shape
is what it delivered. A partner caught it; the system had been live for a month.

**Detection.** Automated groundedness checking — this is exactly what the
`rag-grounding-auditor` skill does:
1. Decompose the answer into atomic claims.
2. For each claim, check entailment against the cited chunk (an LLM call with a
   strict "supported / partially supported / unsupported" rubric — use a judge
   model one tier above, see `topics/evaluation.md` §judge).
3. Score = fraction of claims supported by their citations. Sample production
   traffic continuously, not just at launch.

**Fix.**
- Require **quote-then-claim**: the model must extract the supporting quote
  verbatim before making the claim. Verbatim quotes are mechanically verifiable
  with a string match against the chunk — turning a semantic problem into `grep`.
- Constrain citations to chunk IDs actually present in context (validate; reject
  and retry on fabricated IDs — models will invent `[7]` when given 5 chunks).
- Give an explicit abstention path: "if no retrieved content supports an answer,
  say so" — and *reward abstention in your evals*, or the model learns that
  guessing scores better (`topics/hallucination-and-reliability.md`).

**Prevention.** Groundedness score is a launch-blocking eval metric and a
production monitor with an alert threshold. Any prompt/model/retrieval change
re-runs it. Fabricated-chunk-ID rate should be tracked and should be zero — it's
mechanical to check and any nonzero value means the validation layer is off.

---

## The debugging order (back to front)

When a RAG answer is wrong, check in this order — each step is cheaper than the
next and upstream of it:

1. **Was the right content in the corpus at all?** (ingestion/staleness)
2. **Did it survive chunking intact?** (read the chunks)
3. **Was it retrieved into the top-k?** (recall)
4. **Did it outrank the distractors?** (precision/re-ranking)
5. **Did the model use it faithfully?** (grounding — only now is it a prompt problem)

Teams that start at step 5 spend weeks prompt-tuning around a stale corpus.

**Related:** `guides/build-a-rag-system.md` (the from-scratch build) ·
`topics/evaluation.md` (labeled sets, judges) · `topics/cost-and-latency.md`
(retrieval caching, k vs. token budget) · skill: `rag-grounding-auditor`.
