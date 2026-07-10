# Environment Scheduling & Contention Management

> Last reviewed: 2026-07-09. Tool-agnostic (patterns realized variously in homegrown bookers, CI concurrency controls, and commercial TEM tools).
> **Extended-tier doc:** production patterns + common pitfalls. The strategy question — *whether* an environment should be shared at all — is owned by `../principles/environment-lifecycle-and-contention.md` (see its decision tree). This doc applies **after** that tree lands on "genuinely constrained, must be time-sliced": perf rigs, licensed appliances, partner sandboxes with fixed identity, mainframe test LPARs.

## The judgment

A reservation system is **an admission of scarcity, and scarcity should stay visible.** The moment scheduling works smoothly, it starts hiding the queue cost that would otherwise justify un-sharing (buying the second perf rig, making the environment ephemeral). So every scheduling system carries two obligations: arbitrate access *and* report the contention it's absorbing — wait times, utilization, bumped bookings — because that report is the business case for making the scarcity go away.

## Production patterns

**1. Reservation as code, enforced by credentials.** Bookings live where engineers already work (a `reservations.yaml` in a repo, or the CI system's native concurrency groups — GitHub Actions `concurrency`, GitLab resource_group — which are reservation systems in disguise and the right first reach). Enforcement is the non-negotiable half: the booking system *issues the time-boxed credentials* (or flips the network path / promotes the DNS entry). A calendar that politely asks people not to collide is documentation, not scheduling — the polite version is how the shared-staging war story in `../principles/environment-lifecycle-and-contention.md` happened.

**2. Lease + heartbeat, not start/end times.** Bookings that hold only while the holder heartbeats, with a max-duration cap. This solves the two chronic scheduling failures at once: the run that overstays its slot (cap + revocation) and the slot held by a crashed pipeline (heartbeat lapse frees it). Same lease mechanism as reaper-safety and refresh-safety (`../principles/environment-lifecycle-and-contention.md` failure mode #4, `../principles/data-refresh-and-versioning.md` failure mode #3) — build it once.

**3. Reset-on-handover, owned by the system.** Between reservations, the environment returns to a known baseline (data re-clone from template, config reset) *as a scheduling-system responsibility*, not an outgoing-tenant courtesy. Tenants forget; the previous tenant's residue becoming the next tenant's flake is the whole disease (`../principles/cleanup-and-isolation.md` failure mode #1 at environment scale). Budget the reset time into every slot; a booking system that packs slots back-to-back with no reset window has scheduled the collisions it exists to prevent.

**4. Priority classes with preemption rules written down.** Release-blocking validation outranks exploratory testing; incident reproduction outranks both. Decide the ranking *before* the conflict, publish it, and log every preemption. Ad-hoc bumping by seniority — the default in the absence of rules — teaches teams to hoard bookings defensively, which manufactures the scarcity.

**5. Utilization telemetry as the exit ramp.** Track: booked-vs-actually-used (no-show rate), median/p95 wait to get a slot, queue depth by team. Publish monthly. High wait + high no-show means the booking system is being gamed by defensive booking (fix: shorter default slots, use-it-or-lose-it reclamation after N idle minutes). High wait + high utilization means genuine scarcity — that's the graph you take to the budget conversation for a second rig or the ephemeral-migration project.

## Common pitfalls

- **The advisory calendar.** A wiki/Slack booking convention with no enforcement. Works until the first deadline crunch, then fails exactly when contention is highest. Detection: any "who's on staging?" message in chat is the system failing in real time. Fix: pattern 1 — enforcement via credentials/concurrency groups, even a crude version.
- **Defensive block-booking.** Teams reserve standing daily slots "just in case," utilization telemetry shows 30% actual use, and real demand queues behind phantom demand. Fix: no-show reclamation + booking costs visible per team (a monthly "your team held 40 hours, used 11" report changes behavior without any policy fight).
- **The permanent squatter.** One team's "temporary" exclusive booking becomes de facto ownership; the shared resource is now that team's snowflake with extra paperwork. Detection: any reservation older than the max-duration policy. Fix: caps enforced by lease expiry; if a team genuinely needs permanent access, that's an ownership decision to make explicitly (give them the environment, remove it from the pool, size the pool honestly) — not a booking to renew forever.
- **Scheduling as a substitute for cleanup.** "Team A got Monday, Team B Tuesday" without reset-on-handover just serializes the state pollution — B still inherits A's world, one day later, with better plausible deniability. Time-slicing solves *capacity* collision only; data collision needs the reset (pattern 3) or partitioning (`../principles/environment-lifecycle-and-contention.md` fix #2).
- **Booking the environment but not its dependencies.** The perf rig is reserved; the shared downstream it calls (the one licensed HSM, the partner sandbox) is not — two teams' "isolated" reserved runs collide one hop downstream. Bookings must cover the *dependency closure* of what the test touches; drawing that closure is the same exercise as parity layer 3/4 in `../principles/environment-provisioning.md`.

## Cross-references

- Whether to share at all (read first): `../principles/environment-lifecycle-and-contention.md`
- Reset-from-template mechanics: `../principles/environment-provisioning.md` failure mode #3
- CI-native concurrency controls: `../../test-automation-engineer/principles/ci-cd-integration.md`
- Agents and scheduled jobs as booking consumers (they must hold leases like everyone else): `../orchestration/README.md`
