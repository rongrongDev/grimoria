# RAG Evaluation: Two Subsystems, One Score, Zero Attribution

**Version:** 1.0.0 · **Date:** 2026-07-13 · **Tier:** extended (production patterns + common pitfalls) · **Applies to:** retrieval-augmented systems — vector, hybrid, and agentic retrieval; single- and multi-hop

---

## The core shift

A RAG answer is the product of two subsystems that fail differently: the **retriever** (did the evidence reach the context?) and the **generator** (did the model use the evidence it got?). An end-to-end score alone cannot attribute a failure to either — and un-attributed RAG failures get "fixed" by prompt-tweaking the generator when the retriever was the problem, which is the most common wasted quarter in RAG teams. Every serious RAG eval therefore runs at three levels: retriever-only, generator-with-gold-context, and end-to-end. The end-to-end number is the launch claim; the other two are what make its failures actionable.

## Production patterns

**Retriever-only metrics, against labeled relevance judgments.** The gating metric is **recall@k at your production k**: if the gold evidence isn't in the top-k that actually reaches the prompt, the generator has already lost — no generator improvement recovers it. Complement with **context precision** (what share of retrieved chunks are relevant, rank-weighted — irrelevant chunks aren't free, they dilute attention and invite plausible-but-wrong grounding) and MRR/nDCG when position in the prompt matters. All of these need a labeled set: (query → relevant chunk IDs), built as a real labeling job with the full human-eval pipeline — chunk-level relevance is boundary-disagreement territory (`../principles/human-evaluation.md` §rubric boundaries), and "relevant" needs the same binary decomposition as any rubric word.

**The triad for the generation side — three separate numbers, never blended:**
- **Faithfulness/groundedness:** is every claim in the answer supported by the retrieved context? Score by claim decomposition — extract atomic claims programmatically or with a judge, verify each claim against the context as a binary item (`../principles/llm-as-judge.md` §binary checklists). Holistic "is this grounded? 1–10" over-passes fluent summaries reliably.
- **Answer relevance:** does it answer the question asked? (A perfectly grounded answer to a different question passes faithfulness.)
- **Answer correctness against ground truth — kept separate from faithfulness**, because *faithful to a wrong or stale chunk is still wrong*. Faithfulness measures the generator's discipline; correctness measures the system's output. Conflating them is how corpus-rot failures hide inside a green "groundedness" number.

**Attribution triage, run on every end-to-end failure batch:** was the gold evidence retrieved? **No** → retriever failure — and split further into *in-corpus-but-not-retrieved* (retriever/embedding/chunking problem) vs. *not in corpus at all* (content gap — a different owner entirely). **Yes** → generator failure — ignored the context, or overrode it with parametric knowledge. Report the split per release; the trend tells you where the next engineering month should go.

**Gold-context ("oracle") runs.** Feed hand-verified correct chunks straight to the generator: that score is the generator ceiling, and end-to-end minus oracle is the retriever's cost, measured. Cheap to run (no index in the loop) and the single fastest way to settle a "the model got dumber" vs. "the index rotted" argument.

**The index is part of the eval instrument.** Embedding-model change, re-chunking, reranker swap, corpus refresh — each is an instrument change requiring a same-day baseline re-run and a CHANGELOG discontinuity note, exactly like a judge-prompt change (`../principles/regression-testing-and-edd.md` §instrument versioning). Pin corpus snapshot + index build parameters into the run record.

**Tooling note (as of 2026-07):** Ragas is the canonical RAG-metric library (faithfulness/relevance/context-precision implementations); DeepEval and Arize Phoenix ship the triad too. Treat their metric *implementations* as judges that need calibration against your human labels like any other judge — a library name is not calibration evidence.

## Common pitfalls

- **Eval references that share provenance with the corpus.** Reference answers written by reading the corpus, or golden questions derived from corpus documents, make recall@k and faithfulness saturate by construction — the shared-provenance contamination channel of `../principles/contamination-and-leakage.md` §2, in its natural habitat. Author references from ground truth independent of the corpus where possible; where not, tag the dependency and interpret ceilings accordingly.
- **Measuring retrieval at the wrong k, or without the production reranker.** Recall@20 offline while production truncates to 5 post-rerank is measuring a different system (`../principles/production-offline-gap.md` §system mismatch). Mirror the production pipeline shape or state loudly which slice you're measuring.
- **Static eval corpus vs. living production corpus.** The corpus grows and rots between eval refreshes; stale-chunk answers are a production failure your frozen-corpus eval structurally cannot see. Date-stamp the eval corpus snapshot and refresh it on the same calendar as the golden set.
- **Embedding-similarity as the answer metric.** Already this KB's canonical war story (`../principles/eval-design.md` §measuring what's easy — a RAG team, not coincidentally): sound-alike-ness optimizes phrasing, not support. Rung 7 of the trust hierarchy; tripwire only.
- **Multi-hop scored with single-chunk recall.** If the gold evidence is a *set* of chunks across hops, retrieving 2 of 3 is a retrieval fail for the missing hop — score gold-set coverage, not any-hit, or multi-hop weakness hides inside a healthy recall@k.
- **Judging faithfulness with the judge's own knowledge.** A judge that "knows" the true answer passes unsupported-but-correct claims, quietly converting your faithfulness metric into a correctness metric. Instruct: support must come from the provided context only — and probe it with items whose context contradicts world knowledge (the context must win).

## Related
`../principles/eval-design.md` (metric-trust hierarchy, golden sets) · `../principles/llm-as-judge.md` (claim-level binary judging, calibration) · `../principles/contamination-and-leakage.md` (shared provenance) · `../principles/production-offline-gap.md` (system mismatch, corpus drift) · `../guides/build-eval-suite-from-scratch.md` §step 4 (Ragas in the harness landscape)
