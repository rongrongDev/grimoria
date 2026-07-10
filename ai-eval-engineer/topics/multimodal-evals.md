# Multimodal Evals: Images, Audio, and Documents Without Fooling the Grader

**Version:** 1.0.0 · **Date:** 2026-07-06 · **Tier:** extended (production patterns + common pitfalls) · **Applies to:** vision-language and audio-capable models (Claude 4.x/Fable 5-era multimodal); document-understanding (OCR+layout) systems

---

## What changes when inputs aren't text

The eval *logic* (criteria, golden sets, judges, statistics — all of `../principles/`) is unchanged. What changes is that your inputs are now heavy, lossy-transformable artifacts with their own failure channels: an image can be resized, recompressed, or EXIF-rotated by the harness before the model sees it, and your eval silently becomes a test of your thumbnail pipeline. **In multimodal evals, the input pipeline is part of the instrument** — pin it, hash the *bytes actually sent to the model* (post-preprocessing), and record them in the run metadata.

## Production patterns

- **Ground truth needs modality-appropriate provenance.** "What's in this image" labels made by crowdworkers glancing at thumbnails are a different (worse) instrument than labels made at full resolution with zoom. Record labeling conditions; for document evals, ground truth extracted by a *different* OCR system than any the model uses, or hand-keyed — otherwise shared-OCR errors score as correct (correlated-instrument leakage, cousin of the shared-provenance trap in `../principles/contamination-and-leakage.md` §2).
- **Judge with care across modalities.** Text-only LLM judges grading image tasks can only compare the model's answer to a *text* reference — fine for closed questions ("how many valves?"), structurally blind for open description (they reward agreement-with-reference-phrasing, penalizing correct observations the reference author didn't mention). For open-ended visual tasks: multimodal judge calibrated against humans who saw the image (`../principles/llm-as-judge.md` calibration protocol, with the image in the human's hands), or decompose into checkable visual claims verified per-claim.
- **Stratify by the axes vision actually fails on:** resolution tiers, small-text-in-image, rotated/skewed inputs, low light/noise, charts-vs-photos-vs-screenshots-vs-scans, multi-image reasoning, and — for documents — layout complexity (tables, multi-column, handwriting). A blended "vision score" hides that the model reads clean screenshots perfectly and invoices at 60% (per-stratum reporting rule, `../principles/eval-design.md`).
- **Perturbation-robustness slices, cheaply.** Content-identical variants (recompressed, ±5° rotation, 0.75× resolution) of a golden subset. Scores dropping on content-identical perturbations quantify brittleness — the multimodal analog of the judge compression probe in `../principles/llm-as-judge.md` §3, and it doubles as a canary for harness preprocessing changes.
- **Audio:** transcription-based scoring (WER against reference) is rung-1 trustworthy for verbatim tasks (`../principles/eval-design.md` metric hierarchy), but *understanding* tasks scored via a transcription step inherit the transcriber's errors — score against the audio-derived ground truth, and report speaker-accent/noise-condition strata; those are the production distribution axes that shift (`../principles/production-offline-gap.md`).

## Common pitfalls

- **The harness resized the eval.** Score jump after "infra cleanup" → the image pipeline changed (new max-dimension default, different JPEG quality). Detection: byte-hash of model-received inputs, asserted stable across runs; any hash change = instrument change, comparisons void (`../principles/regression-testing-and-edd.md` §versioning).
- **Text leakage answering the visual question.** Items where filename, surrounding prompt, or OCR-able caption contains the answer measure reading, not seeing. Detection probe: run the suite with images *removed* (or replaced with noise) — every item the model still gets right is leaking through text. Run this once per suite; the result is always humbling.
- **Contamination is worse, not better, for public image benchmarks.** Famous benchmark images (with their canonical Q&A) saturate training corpora, and near-duplicate detection needs perceptual hashing/embeddings, not n-grams. Same triage as `../principles/contamination-and-leakage.md`, swap in image-similarity tooling; completion-probe analog: model names the benchmark or recites the canonical answer to a cropped variant.
- **Human eval without the artifact.** Raters grading "is the description accurate?" from the description alone (image never shown in the rater UI) — it happens more than anyone admits, usually via a tooling default. IRR looks fine; validity is zero. Audit the rater's actual screen (`../principles/human-evaluation.md` pipeline step 3).
- **One-modality golden sets for multi-modality products.** Product accepts images+PDFs+audio; suite is 95% clean PNGs. That's the traffic-weight audit from `../principles/production-offline-gap.md` with modality as the stratification axis.

## Related
`../principles/eval-design.md` · `../principles/llm-as-judge.md` (calibration; judge modality limits) · `../principles/contamination-and-leakage.md` (perceptual near-dups) · `../principles/production-offline-gap.md` (modality mix drift)
