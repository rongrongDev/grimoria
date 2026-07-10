# Device Farms & Cloud Grids — Production Patterns & Common Pitfalls

**Stamped:** 2026-07-06 · **Applies to:** BrowserStack / Sauce Labs / LambdaTest / AWS Device Farm-class services (SaaS, current as of date) · **Tier:** extended — patterns + pitfalls.

Cloud farms sell two distinct products; keep them separate in your head because the economics differ: **(1) real-browser certification** — actual Safari on actual macOS, legacy Edge/IE estates — and **(2) real mobile devices** — OEM hardware you'll never rack yourself. What they cost beyond the invoice: every test action now crosses the public internet (latency and jitter become *your* flake sources), sessions are metered (parallel slots are the constraint your suite math must respect), and a third-party's infrastructure is now inside your critical path.

## When the farm wins (decision, not vibes)

```
Do you need it at all?
├─ Functional logic coverage                → NO farm. Local/CI browsers
│                                             (Playwright bundled, standalone
│                                             containers) — faster, cheaper,
│                                             more deterministic.
├─ Real-Safari certification of revenue     → YES, Tier-2 cells only
│  journeys (WebKit ≠ Safari)                 (cross-platform-and-browser.md)
├─ Real-device mobile (OEM skins, camera,   → YES — the honest use case.
│  biometrics, perf feel)                     In-house lab beats farm only past
│                                             ~15–20 devices AND a person to
│                                             own it (device labs are pets:
│                                             OS updates, cable rot, MDM).
└─ "Move the whole suite to the cloud grid" → Almost always NO. You'd put
                                              every test behind a WAN hop and
                                              a metered slot. Farms are for
                                              the coverage you can't get
                                              locally, not for capacity.
```

## Production patterns

- **Farm = Tier 1/2 only.** The blocking PR suite never touches the farm (`principles/cross-platform-and-browser.md` tiers): farm runs are nightly/main-only, sized to your slot count. Slot math: `wall_clock ≈ (tests × avg_duration) / slots + queue_wait` — queue wait at your org's peak hour is a real, measured number, not zero; measure before promising a nightly window.
- **Tunnels are infrastructure with an owner.** Testing pre-prod apps requires the vendor's tunnel (BrowserStack Local, Sauce Connect) into your network. Tunnels drop, version-skew against the vendor, and produce failure signatures (`Tunnel not reachable`, connection refused mid-run) that MUST be categorized as infra, not flakes (`frameworks/allure/README.md` categories) — an untagged tunnel blip reads as 60 flaky tests and poisons a week of telemetry. Run tunnels as a supervised service (container/systemd, health-checked), not a step in each job.
- **Timeout recalibration:** WAN latency adds 50–300ms per command. Suites tuned on local browsers flake on the farm at the margins — set per-project timeout profiles (farm project gets +50% action timeout), don't raise global defaults (`principles/waiting-and-synchronization.md` §timeout-policy).
- **Session hygiene:** name every session (test id + run id), set the vendor's test-status API on completion (otherwise every session shows "unknown" and their dashboard is useless for triage), pin OS/browser/device versions explicitly — vendor-default "latest" changes under you overnight (same failure law as `frameworks/selenium/README.md` version skew).
- **Artifacts:** farm-side video/logs are the payoff — wire vendor session links into your report (Allure link template) so triage jumps from failure → farm session replay in one click.
- **Know your exit.** Standard WebDriver/Appium capabilities = portable; vendor-specific SDKs and observability hooks = lock-in. Keep vendor specifics in one config module (driver-factory layer) so switching vendors — or bringing devices in-house — is a config change, not a migration.

## Pitfall table

| Pitfall | Detection | Fix | Prevention |
|---|---|---|---|
| Whole suite on the farm | Farm bill ≈ CI bill; suite wall-clock dominated by queue | Repatriate functional coverage to CI browsers; farm keeps certification cells | Tier policy: farm cells require a stated unique risk |
| Tunnel flakiness as test flakiness | Failure clusters with tunnel/connection signatures across unrelated tests | Supervised tunnel + infra categorization | Tunnel health on the suite dashboard; signature regexes in categories.json |
| Queue-wait blowing the nightly window | Run start-to-finish ≫ tests×duration/slots | Off-peak scheduling; buy slots; shrink farm set | Measured queue-wait in the profiler's report (`agents/ci-runtime-profiler.md`) |
| Local-tuned timeouts flaking on WAN | Farm-only timeout flakes at action level | Farm timeout profile (+50%) | Per-project config, not global raises |
| Vendor "latest" version drift | Suite-wide farm failures with no code change | Pin versions; roll deliberately with weekly canary | Version pins in config reviewed like dependency pins |
| Unlabeled sessions | Vendor dashboard useless; can't map session→test | Session naming + status API in driver factory | Part of the farm driver-factory template |
| Vendor lock-in via SDK sprawl | Vendor imports scattered across suite | Confine to driver-factory module | Lint boundary rule on vendor packages |

## Cross-references

Matrix tiering that decides farm cells: `principles/cross-platform-and-browser.md` · Mobile real-vs-virtual split: `frameworks/appium/README.md` · Infra-vs-flake categorization: `frameworks/allure/README.md` · Slot/shard math: `principles/parallelization-and-sharding.md`
