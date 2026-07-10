# Background Work — WorkManager, Foreground Services, and the OS That Wants You Dead

> **Applies to:** API 24–36 (targetSdk 36), WorkManager 2.10.x · **Last reviewed:** 2026-07-06
> **Related:** [concurrency.md](concurrency.md) · [lifecycle-and-state.md](lifecycle-and-state.md)

## The premise you must internalize

Since API 26, Android's background policy is adversarial by design: **the OS assumes your background work is optional until you prove otherwise.** Every API level since has ratcheted tighter, and OEMs (Xiaomi MIUI, Huawei EMUI, Oppo ColorOS, Samsung's "sleeping apps") ratchet *far* tighter than AOSP — dontkillmyapp.com exists because OEM task killers are the #1 source of "my alarm didn't fire / my sync didn't run" bugs, and they are per-OEM, undocumented, and change with firmware updates. Design so that **missed background work is recoverable**, because it *will* be missed.

## Choosing the mechanism — decision tree

```
User is actively watching it happen (playback, navigation, call)
  → Foreground service with the CORRECT foregroundServiceType (mandatory API 34+;
    wrong/missing type = SecurityException at startForeground).
Deferrable, must eventually complete, survives process death & reboot
  → WorkManager. This is the default answer for sync/upload/cleanup.
Must run at a precise wall-clock time (alarm clock, medication reminder)
  → AlarmManager.setExactAndAllowWhileIdle + SCHEDULE_EXACT_ALARM permission
    (API 31+: user-revocable; API 33+: USE_EXACT_ALARM only for actual
    alarm/calendar apps — Play rejects others). If you're not an alarm app,
    you don't need exact alarms. You want a window: setWindow or WorkManager.
Short continuation of user-visible work as app leaves foreground (finish a save)
  → In-process: ApplicationScope coroutine; you get a few seconds guaranteed, no more.
    If losing it is unacceptable → it was WorkManager all along.
Triggered by server event → FCM message → schedule expedited WorkManager work.
    High-priority FCM is quota'd; if you spam it, Google silently degrades you
    to normal priority and your "instant" messages arrive hours late (we learned
    this in production during a World Cup push campaign).
Continuous sensor/location in background → step back and redesign the product.
    The permission UX (background location = separate settings-page grant) has
    single-digit acceptance rates.
```

## Failure modes

### 1. WorkManager work that never runs (or runs 40 minutes late)

- **Failure:** Team schedules `PeriodicWorkRequest(15, MINUTES)` and expects a 15-minute heartbeat. Reality: periodic work is *inexact*, deferred by Doze into maintenance windows, batched, and on OEM builds sometimes just dropped when the app is "sleeping." A payments app I consulted for had a token-refresh design that assumed sync every 30 min; tokens expired overnight in Doze; every user's first morning action failed with an auth error. The fix wasn't scheduling — it was making token refresh lazy-on-demand with the periodic sync as best-effort warm-up.
- **Detection:** Log actual vs scheduled execution timestamps to analytics; plot the distribution by OEM. `adb shell dumpsys jobscheduler` shows pending jobs and unmet constraints; `adb shell am get-standby-bucket <pkg>` shows your bucket (a `rare`/`restricted` bucket explains almost-never-running work).
- **Fix:** Design for at-least-once, arbitrarily-late execution: idempotent workers, on-demand fallback paths. Test Doze with `adb shell dumpsys deviceidle force-idle`.
- **Prevention:** Architecture rule: no correctness requirement may depend on background timeliness. Timeliness is an optimization.

### 2. Retry policy as infinite hammer

- **Failure:** `Result.retry()` with default `BackoffPolicy.EXPONENTIAL` but a bug that fails deterministically (malformed row → JSON crash) → worker retries forever, burning battery and hammering the server. Multiply by your install base: I've watched a fleet of retrying workers produce a self-inflicted DDoS after a backend contract change — server 500s caused retries, retries caused load, load caused 500s.
- **Detection:** Server-side: retry storms visible as request spikes with `runAttemptCount`-style headers. Client: log `runAttemptCount` in every worker.
- **Fix:** Classify failures: transient (IO/HTTP 5xx/429) → `retry()`; permanent (4xx, parse error, business rule) → `Result.failure()` + telemetry. Cap attempts: `if (runAttemptCount > 5) return Result.failure()`.
- **Prevention:** A team-standard `BaseWorker`/helper that forces the classification decision and the cap; ban raw `Result.retry()` in review.

### 3. Foreground service type & timing violations (the API 34+ crash factory)

- **Failure:** Three distinct crashes: (a) missing `foregroundServiceType` manifest declaration + runtime type → `MissingForegroundServiceTypeException`; (b) starting an FGS from the background (not on the exemption list) → `ForegroundServiceStartNotAllowedException` — classic trigger: FCM *normal*-priority message handler calling `startForegroundService`; (c) `startForegroundService()` then not reaching `startForeground()` within ~5 s (because you did async init first) → ANR-style crash `ForegroundServiceDidNotStartInTimeException`. All three are top-10 Play Vitals crashes ecosystem-wide.
- **Detection:** These crash loudly — Vitals/Crashlytics. Pre-release: test the FCM path with the app force-stopped and backgrounded, on a device in Doze.
- **Fix:** (a) declare types honestly — `dataSync` type FGS additionally gets a *6-hour per-day cap* on API 34+ (use WorkManager instead); (b) from background context, don't start FGS — enqueue expedited work (`setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)`); (c) call `startForeground()` first line of `onStartCommand`, do init after.
- **Prevention:** Lint checks `ForegroundServiceType` exist since AGP 8.2 — keep them at error severity. CI matrix must include an API 34+ emulator; these bugs are invisible on API 33.

### 4. Expedited work assumed to be immediate

- **Failure:** `setExpedited` treated as "runs now." It runs *subject to quota*; out of quota it either fails to enqueue or degrades per your `OutOfQuotaPolicy`. Teams discover this when the "instant" message-send worker silently degrades and sends land minutes late for heavy users precisely because heavy users burn quota fastest — your best users get the worst behavior.
- **Fix:** Always `RUN_AS_NON_EXPEDITED_WORK_REQUEST`; treat expedited as a fast path, not a guarantee. If the user is watching, do it in-process with an FGS or foreground UI.

### 5. Unique-work name collisions and the duplicate-upload bug

- **Failure:** `enqueueUniqueWork("upload", REPLACE, ...)` — REPLACE cancels an in-flight upload halfway through when the user edits again → truncated uploads; or with APPEND, a failed chain permanently blocks the queue (failed chain = all appended work is dead). Alternatively no unique name at all → double-tap enqueues two uploads → duplicate posts (a top-5 support ticket for a social app I worked on).
- **Fix:** Name per-entity (`"upload-$draftId"`), use `ExistingWorkPolicy.KEEP` for at-most-once semantics, make the worker idempotent server-side (client-generated idempotency key). `APPEND_OR_REPLACE` if you need a queue that self-heals after failure.
- **Prevention:** Idempotency key as a required field in the upload API contract — solves it at the layer that can't be bypassed.

## API-level cheat sheet (the ratchet)

| API | What tightened |
|---|---|
| 23 | Doze + App Standby exist; `setExactAndAllowWhileIdle` needed for alarms in Doze |
| 26 | Background service execution banned (`startService` from background → `IllegalStateException`); implicit broadcast receivers mostly dead |
| 28 | App Standby Buckets — your bucket decides job/alarm frequency |
| 31 | FGS launch from background banned (with exemption list); exact alarms need permission; expedited work replaces some FGS uses |
| 33 | `POST_NOTIFICATIONS` runtime permission — your FGS notification may be invisible; FGS still runs but users don't see it (and then kill you via battery stats blame) |
| 34 | FGS types mandatory; `dataSync` capped at 6 h/day; `SCHEDULE_EXACT_ALARM` denied by default for new installs |
| 35–36 | Continued FGS-type enforcement (`dataSync` further restricted; `mediaProcessing` type with its own cap); sync-FGS patterns should be fully on WorkManager by now |

**Rule:** every `targetSdk` bump gets a dedicated ticket to re-read the behavior-changes page for background work. It changes *every single year* and each change has broken someone I know.

## Callable capabilities

- Subagent **`anr-root-cause-tracer`** — FGS timeout and broadcast-receiver `onReceive` blocking are ANR classes it covers.
- The `analyze-existing-app` guide's audit checklist includes a background-work section sourced from this doc.
