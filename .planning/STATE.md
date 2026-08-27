---
gsd_state_version: 1.0
milestone: v1.0
current_phase: 05
current_phase_name: Recovery, Distribution, and Release
status: executing
stopped_at: Phase 5 source closure is clean; candidate dispatch blocked on release provisioning
last_updated: "2026-08-26T16:29:00.000Z"
last_activity: 2026-08-26
last_activity_desc: Closed and reconciled source review, then confirmed the remote release/signing prerequisites are not configured
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 64
  completed_plans: 64
milestone_name: milestone
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-08-17)

**Core value:** Open today's workout, see trustworthy next targets, complete each working set with one primary action, recover safely from interruption, and understand exactly why the next target is recommended.
**Current focus:** Provision the release signing identity and protected GitHub environments, authorize the first push to the empty public repository, then dispatch one exact candidate and continue through the single attended gate

## Current Position

Phase: 05 (Recovery, Distribution, and Release) — EXECUTING
Plan: 05-07 source/automation preparation complete; exact-candidate attended execution pending
Status: All 64 live plans are summarized and historical 02-35 is explicitly marked superseded by 05-07; Phase 5 remains in progress until REL-03 through REL-06 receive real candidate and attended evidence
Last activity: 2026-08-26 — Closed the final source-level findings and verified release dispatch is blocked on missing remote/signing prerequisites

Progress: 64/64 live plans summarized; Phase 5 is 7/7 source-preparation complete; final candidate/device/accessibility/design/owner verification remains pending

## Shared Release Verification

| Scope | State | Owner |
|-------|-------|-------|
| Accumulated Phase 2–5 native/device/accessibility/performance/design evidence and owner approval | pending_exact_candidate_gate | Phase 05 Plan 05-07 |

Phases 2–4 have passed their implementation and phase-scoped automated
verification. This table records the separate milestone/release gate; it is not evidence that any
physical or attended check has passed.

## Performance Metrics

**Velocity:**

- Total live plans completed: 64
- Average duration: 1h 54m
- Total execution time: 113h 45m

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Trustworthy Workout Loop | 10/10 | 25h 45m | 2h 35m |
| 2. Owned Library and Planning | 34/34 live complete; 02-35 superseded by 05-07 | 87h 38m | 2h 35m |
| 3. Calendar and History Integrity | 5/5 implementation-verified; release evidence in 05-07 | 8h 25m | 1h 41m |
| 4. Overall Progress and Complete Progression | 8/8 implementation-verified; release evidence in 05-07 | source-only closeout | — |
| 5. Recovery, Distribution, and Release | 7/7 source-preparation complete; exact-candidate attended gate pending | — | — |

**Recent Trend:** Phase 05 Plan 07 prepares a production-only build-once manifest pipeline, exact Phase 2–5 attended rows, protected owner-supplied evidence workflows, strict source-byte validation, serialized no-rebuild promotion, immutable public-asset proof, and post-promotion Terminal Seal validation. All source code-review and security findings are closed. The source-only gate passes 134 suites and 2,348 tests with 90.94% statements, 85.86% branches, 90.21% functions, and 91.13% lines; all 83 integrity-critical files pass at 100%, and focused Phase 5/release tests pass 29/29. Candidate build/sign/install, Maestro/device execution, attended emulator/phone/assistive/design review, owner approval, promotion, and Terminal Seal remain unexecuted.
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 64m | 3 tasks | 26 files |
| Phase 01 P02 | 27m | 2 tasks | 14 files |
| Phase 01 P03 | 19m | 2 tasks | 19 files |
| Phase 01 P04 | 72m | 2 tasks | 12 files |
| Phase 01 P06 | 50m | 2 tasks | 17 files |
| Phase 01 P05 | 66 min | 1 tasks | 21 files |
| Phase 01 P07 | 49 min | 2 tasks | 24 files |
| Phase 01 P08 | 44 min | 2 tasks | 25 files |
| Phase 01 P09 | 89 min | 2 tasks | 28 files |
| Phase 01 P10 | 17h 45m | 3 tasks | 99 files |
| Phase 02 P02 | 26 min | 2 tasks | 7 files |
| Phase 02 P03 | 18 min | 2 tasks | 6 files |
| Phase 02 P01 | 32 min | 3 tasks | 11 files |
| Phase 02 P04 | 38 min | 2 tasks | 9 files |
| Phase 02 P05 | 9h 48m | 3 tasks | 22 files |
| Phase 02 P06 | 64 min | 3 tasks | 10 files |
| Phase 02 P07 | 40 min | 3 tasks | 9 files |
| Phase 02 P08 | 54 min | 2 tasks | 12 files |
| Phase 02 P09 | 26m | 2 tasks | 5 files |
| Phase 02 P13 | 53 min | 2 tasks | 5 files |
| Phase 02 P11 | 42 min | 2 tasks | 13 files |
| Phase 02 P10 | 43 min | 3 tasks | 19 files |
| Phase 02 P16 | 1h 55m | 2 tasks | 4 files |
| Phase 02 P12 | 50 min | 2 tasks | 6 files |
| Phase 02 P14 | 62 min | 2 tasks | 19 files |
| Phase 02 P15 | 38 min | 2 tasks | 15 files |
| Phase 02 P17 | 65 min | 3 tasks | 15 files |
| Phase 02 P18 | 73 min | 3 tasks | 20 files |
| Phase 02 P19 | 73 min | 2 tasks | 20 files |
| Phase 02 P20 | 27 min | 3 tasks | 11 files |
| Phase 02 P21 | 24h 56m elapsed | 3 tasks | 49 commits |
| Phase 02 P22 | 9 min | 2 tasks | 6 files |
| Phase 02 P23 | 17min | 3 tasks | 9 files |
| Phase 02 P25 | 19min | 3 tasks | 7 files |
| Phase 02-owned-library-and-planning P27 | 25min | 3 tasks | 8 files |
| Phase 02-owned-library-and-planning P30 | 12min | 3 tasks | 13 files |
| Phase 02-owned-library-and-planning P24 | 17min | 3 tasks | 12 files |
| Phase 02-owned-library-and-planning P26 | 20m | 3 tasks | 15 files |
| Phase 02-owned-library-and-planning P28 | 32m | 3 tasks | 9 files |
| Phase 02 P29 | 7min | 2 tasks | 4 files |
| Phase 02 P31 | 130 min | 3 tasks | 26 files |
| Phase 02 P32 | 5 min | 2 tasks | 5 files |
| Phase 02 P33 | 17h | 3 tasks | 69 files |
| Phase 02 P34 | 18h 27m | 3 tasks | 9 files |
| Phase 03 P01 | 1h 30m | 3 tasks | 19 files |
| Phase 03 P02 | 1h 10m | 2 tasks | 15 files |
| Phase 03 P03 | 1h 45m | 3 tasks | 16 files |
| Phase 03 P04 | 1h 30m | 3 tasks | 18 files |
| Phase 03 P05 | 2h 30m | 3 tasks | 37 files |
| Phase 04 P01–P07 | 04-07 automated source complete | 7 plans | Phase 4 progress/recommendation/evidence/source-traceability files |
| Phase 05 P01 | automated source complete | 2 tasks | logical snapshot/GTBK/AES-GCM contract files |
| Phase 05 P02 | automated source complete | 2 tasks | candidate manifest, workflows, and no-rebuild promotion files |
| Phase 05 P03 | automated source complete | 2 tasks | logical SQLite collector, encrypted archive/share lifecycle, and Data and recovery tracer |
| Phase 04-overall-progress-and-complete-progression P07 | 17m | 2 tasks | 8 files |
| Phase 04-overall-progress-and-complete-progression P08 | 22m | 2 tasks | 7 files |
| Phase 05 P04 | 3h 17m | 2 tasks | 18 files |
| Phase 05 P05 | 13m | 2 tasks | 9 files |
| Phase 05 P06 | 50m | 2 tasks | 10 files |
| Phase 05 P07 | 99m | 2 tasks | 37 files |

## Accumulated Context

### Decisions

Full decisions live in `.planning/PROJECT.md`.

- The five reviewed delivery milestones are the fixed top-level phase structure.
- SQLite source facts are authoritative; notifications, FTS, projections, recommendations, and UI caches are derivatives.
- Phase 1 must prove a private configured SQLite writer with FIFO serialization and explicit `BEGIN IMMEDIATE`; direct reliance on `withExclusiveTransactionAsync()` is not accepted.
- Accessibility, adaptive layout, CI, migrations, tests, diagnostics, backup seams, and release identity start in Phase 1 and remain continuous gates.
- Signed candidates are built once, approved by digest on a physical device, and promoted unchanged.
- App-owned Argon2id uses direct Expo typed parameters because the optimized mixed-binary record boundary failed before native execution.
- Phase 5 may use Bouncy Castle 1.85.2 provisionally; Plan 01-10 still owns the ten-sample physical-device calibration.
- Timed holds use explicit duration targets and manual-hold policies; they are never encoded as repetitions or load progression.
- Runtime launch generations are monotonic; stale open, migration, or query completions close their kernels and cannot replace current services.
- Set completion correctness is FIFO plus expected revisions plus a conditional incomplete-set update; UI busy state is not the duplicate defense.
- Session targets snapshot exact source target IDs and equipment increments; post-commit derivative failure never negates a saved set.
- Undo restores serialized prior set, exercise, active pointer, and rest state only while `nowMs < undoUntilMs`.
- Rest persists timestamps or paused remaining duration, and Android notification state is repaired from SQLite through the stable `rest:<sessionId>` request identity.
- Expo notification permission `status` is authoritative; denied or failed scheduling remains non-authoritative and retryable.
- Active set values and Complete/Skip are inline within each shared SetRow; Retry appears directly below the set list. The retired editor/action dock is not part of the accepted product contract.
- Exact Phase 1 APK evidence remains bound to implementation HEAD `4e3e521`; later planning, tests, and coverage-tooling commits were independently verified as artifact-neutral.
- The coverage gate preserves global thresholds and independently enforces 100% statements, branches, functions, and lines for 28 explicitly enumerated integrity-critical modules.
- [Phase 05]: Logical export is fail-closed at the table boundary: every source table needs an explicit ownership predicate, catalog authority is reference-only, cache paths stay private behind opaque handles, and owned password/key/plaintext/archive bytes are wiped or deleted on every lifecycle exit.
- [Phase 02]: Metric identity is exactly (profile, contractVersion, exerciseMetricGeneration); generalized consumers never key by profile alone.
- [Phase 02]: Legacy load_reps contract 1 remains loadGrams/reps and timed_hold contract 1 remains durationSeconds; millisecond timed holds are explicit contract 2.
- [Phase 02]: Intervals contract 1 uses the literal plan-authored rounds_then_work comparator and immutable protocol dimensions.
- [Phase 02]: Fixed-distance, fixed-time, and interval aggregates reject mixed protocol populations even when called outside the exposure filter.
- [Phase 02]: Presentation rounding uses decimal formatting so valid maximum safe integers are not corrupted by multiply-divide precision loss.
- [Phase 02]: LocalDate supports years 0001 through 9999 and uses civil calendar ordinals rather than parsing date-only strings as instants.
- [Phase 02]: Stored timezone text is validated and preserved exactly; only instant conversion uses Intl.DateTimeFormat(...).formatToParts.
- [Phase 02]: Rotation advancement consumes the current opportunity only for scheduled completion, Skip, Advance, or explicit Advance rotation after this workout intent.
- [Phase 02]: Weekday Skip and missed outcomes consume only the dated opportunity; recurring bindings remain unchanged by pure transitions.
- [Phase 02]: A detected device-timezone choice is recorded once per detected zone and applies prospectively from an explicit LocalDate.
- [Phase 02]: The accepted catalog is bound to source commit 1783421f145e546fa168c591a0e4d11cae6f23df and exact overlay, pack, manifest, report, and MIT license SHA-256 values.
- [Phase 02]: All ten Phase 1 gym-tracker.original IDs remain visible; six exact semantic candidates are explicitly linked and four ambiguous originals remain preserved without substitution.
- [Phase 02]: Generated catalog artifacts retain pending_owner_acceptance provenance; only the separate accepted record conveys owner authority for those unchanged bytes.
- [Phase 02]: The initial D-50/D-51 diff contains 310 additions, six links, 599 exclusions, and no deletion or newly unavailable transition.
- [Phase 02]: Migration 0004 adds an authoritative Library source graph beside released Phase 1 workout tables; later metric widening remains forward-only.
- [Phase 02]: Runtime content import accepts only exact owner-approved catalog and manifest hashes, then writes bundled rows in one serialized transaction.
- [Phase 02]: Missing accepted bundled rows become Unavailable without deleting identity, attribution, plan references, or historical snapshots.
- [Phase 02]: Normalized search-term uniqueness is per exercise; accepted bundled parsing still rejects catalog-wide collisions.
- [Phase 02]: Plan 02-11 remains the sole final runtime migration-manifest owner; 0004 is direct-imported only in focused tests until then.
- [Phase 02]: The owner accepted exactly six starter templates bound to asset SHA-256 8c1fbd0f6a114e5c5f9fa7ae2c4edf8f32d46890397b7488e65c768bea4126f4 and review SHA-256 f339971327ef613a476b2aa6b784043bbd82929894ef6edb4129151eaffa2f21.
- [Phase 02]: Gym Body-Part Split follows D-55 exactly: Monday Chest, Tuesday Back, Wednesday Shoulders, Thursday Legs, Friday Arms, with four load_reps exercises per day and no substitutions.
- [Phase 02]: The first five starter templates remain byte-identical to the final pre-amendment candidate at 2d2df33; the sixth template is additive.
- [Phase 02]: Starter candidate files retain pending_owner_acceptance provenance; only starter-plans-acceptance.json conveys owner authority for the unchanged approved bytes.
- [Phase 02]: Migration 0005 remains direct-imported only; Plan 02-11 owns runtime migration manifest registration.
- [Phase 02]: Exercise search FTS parity is measured against shadow docsize stable IDs, not external-content passthrough reads.
- [Phase 02]: One- and two-code-point search uses bounded relational matching; three or more normalized code points use prepared quoted trigram MATCH.
- [Phase 02]: FTS repair runs rebuild plus parity and source-aware integrity-check inside one private serialized write transaction.
- [Phase 02]: Phase 2 FTS contract databases disable Expo automatic unused-statement close cleanup while retaining explicit statement finalization.
- [Phase 02]: D-34 through D-39 is an owner-approved one-way future-only metric migration bound to registry SHA-256 ea8cca49791400150c41f32511d88ce79e7191b70d81c437494b93726b1e3037.
- [Phase 02]: Migration 0006 preserves released JSON and timed-hold seconds while assigning deterministic complete legacy identity and remains outside the runtime manifest until Plan 02-11.
- [Phase 02]: Custom profile migration requires exact target and policy occurrence sets, expected revisions, no active workout use, exact idempotent request replay, and a fresh generation baseline.
- [Phase 02]: Migration 0008 is an additive direct successor of retained version 6 with version 7 intentionally unused; Plan 02-11 remains the sole runtime manifest owner.
- [Phase 02]: Accepted starter activation consumes only exact owner-approved asset and acceptance bytes, then binds template revision, schedule preview, and copy choice into confirmation and canonical request identities.
- [Phase 02]: Occurrence-level metric overrides live in the authoritative owned Phase 2 graph with immutable source maps instead of mutating bundled exercise identities.
- [Phase 02]: Existing starter copies require explicit create_another or reactivate_existing intent; reactivation preserves the plan and appends an immutable effective schedule version.
- [Phase 02]: Retained legacy schedules are bridged into migration 0008, and a legacy active plan without a schedule is explicitly deactivated on the first valid accepted activation.
- [Phase 02]: D-11 search rank comes only from authoritative normalized canonical and alias rows; FTS/BM25, Favorite, Recent, and candidate precision never affect order.
- [Phase 02]: D-10 visibility defaults to available non-hidden non-archived rows, while explicit visibility values OR within the group and AND across every non-empty filter group.
- [Phase 02]: Recent is the ten latest unique exercises with completed working sets in completed or partial sessions; warm-ups, drafts, and non-final sessions do not count.
- [Phase 02]: Search cursors bind normalization, query, canonical filters, read-only catalog fingerprint, exact rank tuple, and stable exercise ID; drift returns typed restart.
- [Phase 02]: Search reads never write source rows and expose only bounded diagnostic codes, counts, versions, strategies, and duration.
- [Phase 02]: New custom exercises require a complete registered metric identity; no profile is inferred and absent progression is explicit manual Hold.
- [Phase 02]: Likely custom duplicates require normalized-name equality, the same metric profile/version, overlapping equipment, stable ID order, and exact create_anyway acknowledgement.
- [Phase 02]: Bundled exercise authority permits Favorite/hide preferences and fresh custom copies only; copied identities have no source namespace, upstream ID, catalog-source row, or transferred history.
- [Phase 02]: Custom archive/restore changes owner preference state only and binds exercise, preference, plan, day, occurrence, and preview revisions before commit.
- [Phase 02]: Migration 0009 is additive and the final runtime manifest registers released versions 1, 2, 3, 4, 5, 6, 8, and 9 with validated recovery before destructive 0006.
- [Phase 02]: Owned-plan requests persist canonical SHA-256 receipts in SQLite; exact retries return already_committed and changed request identity conflicts.
- [Phase 02]: Post-draft graph identity topology changes return requires_schedule_impact; ordinary values and reorders retain IDs and save atomically without permanent deletion.
- [Phase 02]: Owned-plan duplication creates fresh graph IDs and an inactive cloned schedule while active schedules and in-progress workout snapshots remain unchanged.
- [Phase 02]: Active workout commands carry and verify complete immutable metric identity: profile, contract version, and exercise metric generation.
- [Phase 02]: Exact completed-set replay requires matching idempotency key, observation JSON bytes, and complete metric identity.
- [Phase 02]: Fixed distance, fixed time, and interval protocol dimensions remain immutable labelled targets; only actual measurements are editable.
- [Phase 02]: Retained Phase 1 schema and JSON bytes use explicit compatibility adapters while complete-identity rows remain strict registry contracts.
- [Phase 02]: All nine profiles use one shared inline SetRow; profile-specific routes, modals, ValueEditorSheet, and WorkoutActionDock remain absent.
- [Phase 02]: Schedule command request identity and committed replay results live in immutable schedule-event payloads as one receipt authority.
- [Phase 02]: Rotation pointer state is reconstructed from immutable versions plus later pointer events; historical versions are never updated in place.
- [Phase 02]: Pending and consumed date overrides take precedence over recurring Weekday or Rotation intent for their LocalDate.
- [Phase 02]: Following device timezone appends a complete prospective version; keeping current timezone records only the explicit decision event.
- [Phase 02]: Scheduled completion advances only after the committed session matches plan, plan day, scheduled source, and start LocalDate.
- [Phase 02]: Only the selected Plans or Exercises section is persisted; Library query filters selection and scroll remain process-local.
- [Phase 02]: Library section writes are idempotent for the same committed value and reject different stale revisions inside the serialized transaction.
- [Phase 02]: Library presents catalog and starter facts only after their owner-accepted hash boundaries validate exact reviewed bytes.
- [Phase 02]: Favorites and Recent use independent authoritative reads and never derive from the first All Exercises page or alter search relevance.
- [Phase 02]: D-50 is created only from a committed changed ContentUpdateResult; update failure preserves the previous trusted Library.
- [Phase 02]: Starter discovery and detail render only exact owner-accepted starter revision 2 facts through a typed runtime catalog.
- [Phase 02]: Starter activation requires explicit copy choice and confirmation-bound date, mode, bindings, and current revisions before one transaction commits.
- [Phase 02]: Template updates create a fresh inactive accepted copy with an idempotent duplicate receipt; the current plan, schedule, and workout remain unchanged.
- [Phase 02]: Retained Phase 1 Full Body Foundation copies are mapped read-only as source revision 1 for comparison without rewriting legacy rows.
- [Phase 02]: Owned editor reads and commands share the trusted base runtime kernel through a typed port; routes and UI never import SQL or platform modules.
- [Phase 02]: Schedule and Activate eligibility follows only committed graphStatus; local target/day edits remain unschedulable until Save plan commits.
- [Phase 02]: Dirty leave uses exact Save changes, Discard, and Keep editing across visible and hardware Back; native gesture-pop is disabled.
- [Phase 02]: requires_schedule_impact preserves draft/source facts and defers structural schedule execution to Plan 02-18.
- [Phase 02]: Ordinary Create custom exercise starts blank, while Create custom copy carries a distinct prepopulated origin and creates nothing until Save exercise.
- [Phase 02]: Ordinary custom exercise edit keeps metric identity read-only; profile changes use the explicit D-34 future-target migration flow.
- [Phase 02]: Custom detail and migration reads stay behind bounded trusted runtime capabilities; routes and screens import no SQLite or repository modules.
- [Phase 02]: D-34 replacement and policy sets cover retained plan_* and final owned_plan_* graphs before any source write commits.
- [Phase 02]: Installed custom-exercise Maestro is public-semantic and authored-only in Plan 02-17; unchanged-APK execution remains Plan 02-21 scope.
- [Phase 02]: D-32 removal retires owned day rows outside the current days_per_week ordinal window and appends one prospective schedule version without rewriting history.
- [Phase 02]: Plan-impact previews bind complete plan schedule override candidate occurrence target warm-up policy and revision facts before one serialized transaction.
- [Phase 02]: D-52 compatibility is exact profile contractVersion and exerciseMetricGeneration equality; no comparability inference or history migration occurs.
- [Phase 02]: D-53 replacement preserves occurrence and child identities and changes only explicitly selected future exercise references.
- [Phase 02]: Today reads active owned schedules through one typed runtime port; legacy Today remains only the fallback and still owns active or saved-partial workout precedence.
- [Phase 02]: Schedule editor and Today routes contain no SQL; complete drafts, expected revisions, preview tokens, explicit actions, and authoritative readback cross the trusted runtime boundary.
- [Phase 02]: A scheduled workout advances Rotation only after the workout completion transaction commits and the persisted session matches plan, day, source, and start LocalDate.
- [Phase 02]: Training under an effective override may advance Rotation only through explicit Train anyway intent; ordinary Repeat, Skip, and Advance remain blocked by override precedence.
- [Phase 02]: Schedule Maestro remains public-semantic; exact midnight and DST execution stays in real SQLite integration and Plan 02-20 native schedule contracts.
- [Phase 02]: The aggregate phase2 suite contains exactly the six Plan 02-20 modules and 29 unique source-owned cases; the existing eight-case phase2-fts prerequisite remains separate.
- [Phase 02]: Every Plan 02-20 native case uses a fresh database and production parser, migration, domain, or repository path; contract-local seeds create authoritative source rows.
- [Phase 02]: Phase 2 native route and runner totals derive from exported IDs and unsupported suite names fail closed instead of receiving a generic fallback count.
- [Phase 02]: Plan 02-11 remains the sole final migration-manifest writer; Plan 02-20 consumes exact versions 1,2,3,4,5,6,8,9 read-only.
- [Phase 02]: The retained pre-remediation APK/evidence is diagnostic only after physical review added D-56 through D-67; Plan 02-34 must build one new exact-HEAD candidate and regenerate every automated artifact.
- [Phase 02]: Plans 02-22 through 02-34 cover the real expanded rail, semantic date/time/number controls, app-wide grey/black cards, current-schema add/copy repair, unlimited active-session completed-set editing, sticky Today's-plan workout UI, compact rest controls, configurable tone/haptic alerts, and source-derived automated evidence. Historical Plan 02-35 is superseded by 05-07.
- [Phase 02]: Expo SQLite benchmark and successful recovery-validation kernels remain process-scoped with explicit strong references; the host force-stops the benchmark app after result, error, or timeout.
- [Phase 02]: Phase 2 benchmark evidence preserves every duration sample through bounded versioned indexed logcat chunks that fail closed on missing, duplicate, malformed, or stale records.
- [Phase 05]: Plan 05-07 is the sole owner of the one exact-candidate Phase 2–5 attended checklist, literal owner approval, no-rebuild promotion proof, and terminal-seal handoff. No earlier phase may create or imply that evidence.
- [Phase 02]: Expanded root navigation derives navigator tabBarPosition left from the same 840dp classification as the rail visual treatment.
- [Phase 02]: Route-component test selection escapes Expo Router parenthesized directory names before passing them to Jest.
- [Phase 02]: Calendar selection stays a private civil LocalDate draft until Confirm date; Cancel date never mutates its owner draft.
- [Phase 02]: Calendar navigation and bounds use validated LocalDate strings only, preserving stored schedule timezone and DST semantics.
- [Phase 02]: Content cards are a separate semantic role from generic surfaces, so field, sheet, navigation, dialog, and notice treatment stays unchanged.
- [Phase 02]: Library status remains textual plus a semantic border, and favorite controls use content-card foregrounds to avoid color-only or low-contrast state.
- [Phase 02]: Inserted workout sets persist the exact profile, contract version, and exercise metric generation from their authoritative source snapshot.
- [Phase 02]: Completed-working-set correction is active-session-only, revision-checked, and never alters later progress, active pointer, rest state, or immutable snapshots.
- [Phase 02]: Runtime mutation results include committedSetId for Plan 02-28 focus/reveal and expose bounded retryability metadata while preserving typed rejections.
- [Phase 02-owned-library-and-planning]: Rest alerts use immutable v2 Android channels per sound/vibration combination; a channel mismatch is repaired as a derived notification projection while SQLite rest facts remain authoritative. — Android channel sound and importance settings are immutable, so four deterministic v2 IDs preserve independent preference control without mutating workout truth.
- [Phase 02]: TimeDurationField confirms canonical seconds before caller-owned conversion; SemanticNumberField provides only numeric affordances and retains screen/domain validation authority.
- [Phase 02]: Active duration autosave receives its confirmed canonical value directly, preserving profile-specific seconds and milliseconds observations.
- [Phase ?]: Content cards are an app-wide semantic role; card-contained content must use card-safe foreground, border, focus, and state tokens in every appearance.
- [Phase ?]: Fields, live set rows, sheets, dialogs, navigation, transient notices, recommendation actions, and docks retain their dedicated semantic surfaces rather than becoming nested cards.
- [Phase ?]: Plan 02-26 changes visual containment only; Plans 02-28 and 02-29 retain workout-action, sticky identity, Today's-plan, and RestDock behavior ownership.
- [Phase ?]: Workout-plan review is structurally presentation-only because its UI receives no mutation port.
- [Phase ?]: Committed set identity drives row reveal, scroll restoration, and focus; completed-set correction stays active-session-only through Plan 02-27 revisions.
- [Phase ?]: RestDock presentation is locally collapsible while remaining time and paused/running semantics continue to derive from authoritative RestStateV1.
- [Phase ?]: Skip renders directly from the committed idle rest result, with a synchronous in-flight guard preventing rapid duplicate rest commands.
- [Phase 04]: Progress source IDs come only from current effective-history facts in the selected civil-date window; no second analytics authority was introduced.
- [Phase 04]: Non-load outcomes are deterministic Session Detail projections from raw/effective SQLite history; no mutable recommendation authority was introduced.
- [Phase 04]: Effective non-load outcomes resolve policy identity through retained raw target links and fail closed on voided or unresolved history.
- [Phase 05]: Restore reconciliation retains local catalog authority; archive bundled rows never replace approved local content.
- [Phase 05]: Restore acknowledgement requires parity-proven ready state; interrupted FTS or history recovery remains explicitly rebuild_pending and retryable.
- [Phase 05]: Clean-install parity is proven with controlled host SQLite; native and device clean-install evidence is consolidated in Plan 05-07.
- [Phase 05]: CSV v1 uses fixed record-type rows with canonical atomic metric, audit, and recommendation context.
- [Phase 05]: CSV export reads one serialized query-only SQLite snapshot; overlays wholly replace raw effective rows and sharing uses an opaque bounded cache handle.
- [Phase 05]: The canonical release manifest is the sole candidate identity and includes production source/package/version, workflow run/repository, APK/AAB, and inner bundle/config hashes.
- [Phase 05]: Every machine producer remains automated-only/evidence_pending and binds one installed production package/device plus recomputed manifest and raw-report hashes.
- [Phase 05]: Attended approval requires every exact row passed with nonblank evidence, immutable attachment bytes, exact candidate devices, and literal lowercase CLI token approved.
- [Phase 05]: Promotion selects successful candidate and attended runs, checks out the candidate commit, rejects reuse/existing tags, and publishes only after public hashes match.
- [Phase 05]: Protected human evidence upload proves candidate workflow, commit, environment, and artifact provenance before executing candidate source; all staged files stay under a configured evidence root and fixed runner-temp directory.
- [Phase 05]: Promotion is repository-serialized and completes before Terminal Seal; immutable public-asset promotion proof is an input to the sole final non-mutating verifier command.

### Blockers/Concerns

- Official Expo/React Native transitive audit advisories remain for security review; incompatible forced downgrades are not accepted.
- Exact-candidate dispatch is blocked: `fchoo/gym-tracker` is an empty public
  repository with no default branch, no Actions secrets, and no protected
  release environments; no local release keystore or signing variables are
  available. Do not generate a long-lived release key, publish the repository,
  or dispatch the one candidate run without owner authorization and recoverable
  key custody.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Ecosystem | Wear OS and Health Connect | v2 | Project initialization |
| Training | Per-repetition or cluster-set timers | v2 | Project initialization |
| Portability | Merge restore | v2 | Project initialization |

## Session Continuity

Last session: 2026-08-26T16:29:00.000Z
Stopped at: Phase 5 source closure is clean; candidate dispatch blocked on release provisioning
Resume file: .planning/phases/05-recovery-distribution-and-release/05-UAT.md
Next action: After the owner authorizes the first public push and supplies or creates a recoverably backed-up release signing identity plus protected environments, push the clean commit and dispatch the candidate workflow once. Complete the exact-candidate UAT, promote unchanged bytes, and execute `05-TERMINAL-SEAL.md` only as the literal final command.
