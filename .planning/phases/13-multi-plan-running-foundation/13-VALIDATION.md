---
phase: 13
slug: multi-plan-running-foundation
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-06
requirements: [DOM-01, DOM-02, DOM-03, DOM-04, DOM-05, DOM-06, DOM-07, DOM-08, DOM-09, DOM-10, DOM-11, DOM-12, DOM-13, DOM-14, DOM-15, DOM-16, DOM-17]
automated_gaps: 0
manual_only: 0
validated: 2026-10-08
implementation_head: 69340bdb7ab3cea0ed5516043347531c834ccbdc
docs_only_descendant: 560916141b3a5e0ea124c979fb67afb851de06d2
implementation_source_tree_sha256: 7037f6f15ef062458d010e88422f0ab5071e9575a38064926e354f446c489bc4
---

# Phase 13 — Validation Strategy

> Execution-time Nyquist contract, executed and reconciled on 2026-10-08. Product behavior, retained native evidence, and owner records are verified; release, deployment, and attended-device approval remain outside this automated audit.

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Jest 29.7 (`unit`, `sqlite-host`, `integration`) plus shared real Expo SQLite contracts |
| **Config** | `jest.config.js`, `scripts/run-coverage-gate.mjs`, `scripts/run-native-sqlite-contracts.mjs` |
| **Quick command** | Each task's focused non-watch command below |
| **Full host command** | `npm run typecheck && npm run lint && npm run test:all -- --runInBand` |
| **Native command** | `npm run android:devtest:fresh -- --suite phase13 && npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase13/build.json && npm run test:sqlite:device -- --suite portable-merge --manifest artifacts/native/phase13/build.json && npm run test:sqlite:device -- --suite multi-plan-running --manifest artifacts/native/phase13/build.json` |
| **Evidence command** | `npm run verify:phase13:evidence -- --manifest artifacts/native/phase13/build.json --automated-only` |
| **Feedback target** | Measure focused commands during execution and split any exceeding 60 seconds; no fabricated baseline |

## Sampling Rate

- After each task commit, run its exact command below.
- After each wave, run all focused commands for that wave plus `npm run typecheck && npm run lint`.
- After waves 2, 8, and 10, run the complete host migration/backup/restore/merge regression set.
- Before `/gsd-verify-work`, run full host, complete integrity coverage, all three native suites, and the exact-artifact verifier.
- Watch mode is prohibited for acceptance evidence.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Test Type | Automated Command | File State | Status |
|---|---:|---:|---|---|---|---|---|---|
| 13-01-01 | 01 | 1 | DOM-03, DOM-15 | T-13-01-01/03 | sqlite-host | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts` | verified | green |
| 13-01-02 | 01 | 1 | DOM-01 trace | T-13-01-02 | artifact contract | MAP-01 evidence-content check | verified | green |
| 13-01-03 | 01 | 1 | DOM-01 trace | T-13-01-02 | artifact + owner-record validation | MAP-01 owner-record check | verified | green |
| 13-02-01 | 02 | 2 | DOM-01/02/03/15 | T-13-02-01/04 | shared host/native migration contract | migrations host + native 14/14 | verified | green |
| 13-02-02 | 02 | 2 | DOM-01/02/04/07 | T-13-02-02 | tracer integration | `tests/integration/multi-plan-foundation-tracer.test.ts` | verified | green |
| 13-02-03 | 02 | 2 | DOM-03/06/15/17 | T-13-02-03/04 | tracer integration | `tests/integration/multi-plan-foundation-tracer.test.ts` | verified | green |
| 13-03-01 | 03 | 3 | DOM-07/08/09 | T-13-03-01/03 | unit + type | Running contracts + typecheck | verified | green |
| 13-03-02 | 03 | 3 | DOM-07/08 | T-13-03-01/02 | unit + integration | Running commands/foundation tests | verified | green |
| 13-03-03 | 03 | 3 | DOM-04/07 | T-13-03-01 | unit + integration | schedule-state/running integration tests | verified | green |
| 13-04-01 | 04 | 3 | DOM-10/11 | T-13-04-01/04 | unit + type | Garmin identity/port tests + typecheck | verified | green |
| 13-04-02 | 04 | 3 | DOM-10/11 | T-13-04-01/02 | unit + integration | import-command/activity-facts tests | verified | green |
| 13-04-03 | 04 | 3 | DOM-17 | T-13-04-02 | unit + integration | import-command/activity-facts tests | verified | green |
| 13-11-01 | 11 | 3 | DOM-14/17 | T-13-11-01 | unit + type | bodyweight contracts + typecheck | verified | green |
| 13-11-02 | 11 | 3 | DOM-14/17 | T-13-11-01/02 | integration | `tests/integration/bodyweight-history.test.ts` | verified | green |
| 13-05-01 | 05 | 4 | DOM-06/16 | T-13-05-01 | unit + integration | selected occurrence + Today tests | verified | green |
| 13-05-02 | 05 | 4 | DOM-04/06/16 | T-13-05-01/02 | integration + type | Today/schedule commands/foundation tracer + typecheck | verified; stale removed path replaced | green |
| 13-09-01 | 09 | 7 | DOM-03/17 | T-13-09-01/02 | unit + integration | timing state/commands/repository + Today tests | verified | green |
| 13-09-02 | 09 | 7 | DOM-16/17 | T-13-09-02 | unit + artifact | runtime timing tests + TIM evidence | verified | green |
| 13-09-03 | 09 | 7 | DOM-16 trace | T-13-09-03 | artifact + owner-record validation | TIM-01 owner-record check | verified | green |
| 13-12-01 | 12 | 5 | DOM-04/05 | T-13-12-01 | unit + integration | schedule-state/running/schedule-command tests | verified | green |
| 13-12-02 | 12 | 5 | DOM-13 | T-13-12-02/03 | sqlite-host + type | Calendar/history host tests + typecheck | verified | green |
| 13-06-01 | 06 | 6 | DOM-12 | T-13-06-01/02 | unit + integration | match-command/running-match tests | verified | green |
| 13-06-02 | 06 | 6 | DOM-17 | T-13-06-01/03 | integration | activity-facts/running-match tests | verified | green |
| 13-16-01 | 16 | 6 | DOM-16/17 | T-13-16-01 | unit + integration | set-command/complete-set tests | verified | green |
| 13-16-02 | 16 | 6 | DOM-16/17 | T-13-16-02 | unit + integration | runtime/complete-set/Today tests | verified | green |
| 13-15-01 | 15 | 7 | DOM-13 | T-13-15-01/03 | sqlite-host | Calendar host tests | verified | green |
| 13-15-02 | 15 | 7 | DOM-13/14 | T-13-15-02/03 | unit + integration | progress/bodyweight tests | verified | green |
| 13-07-01 | 07 | 8 | DOM-15/17 | T-13-07-01/03 | unit + sqlite-host | backup-contract/host tests | verified | green |
| 13-07-02 | 07 | 8 | DOM-15/17 | T-13-07-01/02 | unit + sqlite-host + integration | restore/portability tests | verified | green |
| 13-13-01 | 13 | 9 | DOM-13/15/17 | T-13-13-01 | sqlite-host | reconciliation host tests | verified | green |
| 13-13-02 | 13 | 9 | DOM-13/15/17 | T-13-13-02 | sqlite-host + integration | reconciliation/portability tests | verified | green |
| 13-08-01 | 08 | 10 | DOM-15/17 | T-13-08-01/04 | unit | merge-plan/portable-contract tests | verified | green |
| 13-08-02 | 08 | 10 | DOM-15/17 | T-13-08-02/03 | sqlite-host + integration | merge/reconciliation/portability tests | verified | green |
| 13-08-03 | 08 | 10 | DOM-15 | T-13-08-03 | integration | automatic-backup/portability tests | verified | green |
| 13-10-01 | 10 | 11 | DOM-03/16/17 | T-13-10-01 | unit + integration | timing/runtime/Today/portability tests | verified | green |
| 13-10-02 | 10 | 11 | DOM-03/15/16/17 | T-13-10-02/03 | unit + type/boundary | multi-plan contract + typecheck + lint | verified | green |
| 13-14-01 | 14 | 12 | DOM-01/03/15/16/17 | T-13-14-01/02 | integration + coverage | lifecycle test + sealed 131-file 100% coverage | verified | green |
| 13-14-02 | 14 | 12 | DOM-01..17 trace | T-13-14-01/02/03 | full host + native | exact manifest/native result evidence + verifier tests | verified | green |

## Wave 0 Requirements

- [x] `package-lock.json`, engine, and `npm ci` preflight completed without lockfile drift (13-01 summary).
- [x] Android/`adb` device evidence is retained in the sealed automated manifest; host mocks did not substitute for the three native suites.
- [x] RED-first `tests/integration/multi-plan-foundation-tracer.test.ts` exists and its focused behavioral cases passed.
- [x] Running/activity/bodyweight/match/Calendar/portability/lifecycle test owners exist and passed in the grouped task-map audit.
- [x] `src/platform/sqlite/repositories/progressRepository.test.ts` exists and passed in the unit group.
- [x] `13-MAP-01-EVIDENCE.md` and `13-TIM-01-EVIDENCE.md` passed automated owner-record and content verification.

## Owner-Record Verifications

| Behavior | Requirement | Automated verification |
|---|---|---|
| MAP-01 cardinality | DOM-01 | Owner JSON requires `approved` + `one-per-sport`; MAP evidence contains the migration/restore/merge contract. |
| TIM-01 runtime policy | DOM-16, DOM-17 | Owner JSON requires `approved` + `retire-playback` + `legacy_playback_compatibility=false`; TIM evidence covers all recorded seams. |

Every approved policy and its product behavior has an automated owner-record or implementation gate; no product choice remains manual.

## Multi-Source Coverage Audit

| Source | ID | Feature / Constraint | Plan | Status | Notes |
|---|---|---|---|---|---|
| GOAL | — | Concurrent Strength/Running, imports, and history in one authoritative recoverable model | 02-16 | COVERED | Complete tracer precedes all breadth. |
| REQ | DOM-01 | Zero-or-one active Strength and zero-or-one active Running plan with independent schedules | 01, 02, 14 | COVERED | Shared trace: approved record, per-sport constraints, implementation, native closure. |
| REQ | DOM-02 | Create/import/copy/edit remains inactive | 02, 03, 04 | COVERED | Explicit activation only. |
| REQ | DOM-03 | Transactional migration and exact recovery/history | 01, 02, 09, 10, 14 | COVERED | Shared migration/timing/lifecycle trace. |
| REQ | DOM-04 | Independent Rotation/Weekday/timezone/DST schedules | 03, 05, 12 | COVERED | Only selected schedule advances. |
| REQ | DOM-05 | Move run/Move strength/Keep both | 12 | COVERED | Exact occurrence event only. |
| REQ | DOM-06 | Exact occurrence selection and one recovered Strength workout | 02, 05 | COVERED | Tracer read/recovery then complete command cutover. |
| REQ | DOM-07 | Seven Running types and ordered slots | 02, 03 | COVERED | Minimum tracer then breadth. |
| REQ | DOM-08 | Distance/time/date/benchmark/training-day facts | 03 | COVERED | Unset remains absent. |
| REQ | DOM-09 | Advisory pace/HR-zone/RPE; no gender/height | 03 | COVERED | Strict contracts. |
| REQ | DOM-10 | Complete immutable Garmin JSON activity facts | 04 | COVERED | Exact GarminSourceEnvelope, source-component hashes, normalized digest, fidelity, and sparse facts. |
| REQ | DOM-11 | Account-scoped external identity, canonical digest, idempotency, revisions, and no-resurrection | 04 | COVERED | Repeat/changed/reordered/restored envelope delivery and explicit conflicts. |
| REQ | DOM-12 | Explicit confirmed matching | 06 | COVERED | Separate audited event transaction. |
| REQ | DOM-13 | Truthful Calendar/Progress projections | 12, 15, 13 | COVERED | Base events, overlays/queries, deterministic rebuild. |
| REQ | DOM-14 | Dated bodyweight and no target mutation | 11, 15 | COVERED | Facts then direct Progress test. |
| REQ | DOM-15 | Complete backup/restore/merge | 01, 02, 07, 13, 08, 14 | COVERED | Tracer first, then breadth and native closure. |
| REQ | DOM-16 | Offline exclusive commit acknowledgment | 05, 09, 16, 10, 14 | COVERED | Includes explicit completed-set crash cases. |
| REQ | DOM-17 | Revisions/tombstones/metrics/snapshots/recommendations | 02, 04, 06, 07, 08, 09, 10, 11, 13, 14, 16 | COVERED | Deliberate cross-cut trace. |
| CONTEXT | D13-01 | SQLite authority; typed ports; no screen/provider SQL | 02, 05, 12 | COVERED | Exact exported loader included. |
| CONTEXT | D13-02 | Immutable kind and Strength backfill | 02 | COVERED | Migration 0028. |
| CONTEXT | D13-03 | One in-progress Strength workout; sport-aware activation | 02, 05 | COVERED | Separate invariants. |
| CONTEXT | D13-04 | Exact provenance; no current-schedule completion lookup | 02, 05 | COVERED | Immutable query/start/completion identity. |
| CONTEXT | D13-05 | Frozen migration 23; new triggers after tables | 01, 02, 08 | COVERED | Migration 0028 single owner; later test-only. |
| CONTEXT | D13-06 | Versioned portability; sources in, derivatives/secrets out | 02, 07, 13, 08 | COVERED | Early roundtrip plus complete breadth. |
| CONTEXT | D13-07 | Stable seven-type Running revisions | 02, 03 | COVERED | Minimum then full contract. |
| CONTEXT | D13-08 | Multiple ordered same-weekday slots | 02, 03, 12 | COVERED | Tracer before breadth and collision tests. |
| CONTEXT | D13-09 | Imports independent of plans/Strength sessions | 04 | COVERED | Protected graph checks. |
| CONTEXT | D13-10 | One confirmed match; audited unmatch/reassign | 06 | COVERED | Removal also invalidates by event. |
| CONTEXT | MAP-01 | Exactly zero or one active plan per sport | 01, 02 | COVERED | Automatic owner-record gate before DDL. |
| CONTEXT | TIM-01 | Retire playback without compatibility; preserve ordinary facts/rest | 09, 10 | COVERED | Characterization then automatic owner-record gate. |
| CONTEXT | GAR-ARCH | Shared GarminSourceEnvelope; Phase 18 supplies transport | 04, 14 | COVERED | No transport dependency in Phase 13. |
| RESEARCH | R-01 | Complete narrow production tracer before breadth | 02 | COVERED | Migration→readiness→slots→activation→occurrences→detail/recovery→roundtrip. |
| RESEARCH | R-02 | Migration 0028 finalized once | 02, 08 | COVERED | One owner; later plan inspects/tests only. |
| RESEARCH | R-03 | Strength Rotation + Running Weekday, separate zones/DST, selected-only advance | 03, 12 | COVERED | Explicit matrices. |
| RESEARCH | R-04 | Completed-set offline pre/post-commit crash/read-back/no early ack | 16 | COVERED | Dedicated focused plan. |
| RESEARCH | R-05 | Activity remove/restore tombstone and current-match invalidation | 04, 06, 07, 08 | COVERED | Source events, integration, portability. |
| RESEARCH | R-06 | Direct progressRepository test | 15 | COVERED | Exact new file named. |
| RESEARCH | R-07 | Full versioned backup/restore/merge/rebuild/idempotency | 02, 07, 13, 08, 14 | COVERED | Early slice plus complete graph/native. |
| RESEARCH | R-08 | Real SQLite, failure injection, lifecycle, privacy, complete coverage | 02, 07, 08, 10, 14, 16 | COVERED | Host and real Expo SQLite. |
| RESEARCH | R-09 | Remove every singleton reader/deactivation/completion/restore/merge assumption coherently | 02, 05, 07, 08 | COVERED | No UI-only index bypass or first-row fallback. |
| RESEARCH | R-10 | Import identity, match, and bodyweight remain separate source aggregates | 04, 06, 11 | COVERED | No fake Strength session or metric conflation. |
| RESEARCH | R-11 | TIM-01 covers hidden foreground/queued/relaunch/restore/merge paths | 09, 10 | COVERED | Characterization precedes policy branch. |
| RESEARCH | R-12 | Bounded inputs/queries and privacy-safe diagnostics | 03, 04, 12, 14, 15 | COVERED | Limits plus codes/counts/hashes only. |
| CONTEXT | Discretion | Exact migration split | 02 | COVERED | One complete migration 0028; later DDL requires a successor. |
| CONTEXT | Discretion | Query batching/indexes | 12, 15 | COVERED | Bounded Calendar/Progress reads and query-plan tests. |
| EXCLUDED | Deferred | Running Rotation and cumulative multi-activity fulfillment | — | EXCLUDED | Explicitly deferred. |
| EXCLUDED | Other phase | Garmin authentication, Python/Chaquopy packaging, and JSON transport | — | EXCLUDED | Phase 18 supplies GarminSourceEnvelope values. |

## Dependency and Wave Audit

| Wave | Plans | Independence / Gate |
|---:|---|---|
| 1 | 13-01 | Wave 0 environment, migration-23 freeze, MAP evidence, and automatic MAP-01 validation. |
| 2 | 13-02 | Complete narrow production tracer; no breadth starts before it passes. |
| 3 | 13-03, 13-04, 13-11 | Running breadth, activity lifecycle, and bodyweight use disjoint files. |
| 4 | 13-05 | Full selected-occurrence/start/completion runtime cutover. |
| 5 | 13-12 | Schedule/Calendar expansion after provenance cutover. |
| 6 | 13-06, 13-16 | Match/removal and completed-set edit use disjoint aggregates. |
| 7 | 13-09, 13-15 | TIM characterization now depends on completed-set lifecycle; Progress uses disjoint files. |
| 8 | 13-07 | Complete successor backup and clean restore. |
| 9 | 13-13 | Deterministic rebuild/fault/relaunch closure. |
| 10 | 13-08 | Whole-graph merge and source-generation closure; migration 0028 test-only. |
| 11 | 13-10 | Selected TIM branch plus native contract registration. |
| 12 | 13-14 | Full host/native lifecycle and exact evidence seal. |

No same-wave plans share a `files_modified` path.

Wave 1 is a reversible environment/history preflight plus the mandatory one-way decision. Plan 13-02 is the first implementation plan and begins with `type="tracer"`; Tasks 13-02-01..03 collectively complete the production slice before any wave-3 breadth plan is eligible.

## Rollback and Reversibility Audit

| Door | Rating | Gate / Recovery |
|---|---|---|
| MAP-01 cardinality DDL | one-way | 13-01-03 before 13-02; validated schema-27 recovery copy; forward migration after new data. |
| Migration 0028 | one-way | Finalized once in 13-02; never edited later; correction uses a successor migration. |
| Immutable source identities/events | one-way | Locked D13 decisions; corrections/removals/restores append facts and retain old readers. |
| Successor portable format | one-way | Preserve formats 1/2 permanently; add versions rather than redefining. |
| TIM-01 runtime capability | one-way | 13-09-03 before 13-10-01; revert capability branch while preserving data if proof fails. |
| Calendar/Progress/current-match derivatives | reversible | Discard and deterministically rebuild from source facts. |

## Validation Sign-Off

- [x] All 38 task IDs have automated checks; MAP-01 and TIM-01 are validated automated owner-record artifacts.
- [x] Every plan reads `.trae/rules/rules.md` and carries the exact commit trailer.
- [x] Wave 0 `npm ci`/engine/lockfile precondition completed before the first RED test.
- [x] The complete production tracer passed before wave 3 breadth.
- [x] Migration 0028 is modified only in Plan 13-02; later DDL uses successor migrations.
- [x] Every DOM/D13 item maps to a primary plan or explicit shared trace.
- [x] No same-wave `files_modified` overlap and every task touches at most five files.
- [x] No watch mode; the focused Nyquist groups completed in 7s (unit), 16s (integration), and host evidence remains sealed.
- [x] Full host, complete branch coverage, real Expo SQLite, and exact-artifact privacy gates passed at the sealed implementation revision.
- [x] Execution audit completed before setting `nyquist_compliant: true` and `wave_0_complete: true`.

## Nyquist Execution Audit — 2026-10-08

### Scope reconciliation

- **Implementation evidence revision:** `69340bdb7ab3cea0ed5516043347531c834ccbdc`.
- **Checked-out documentation descendant:** `560916141b3a5e0ea124c979fb67afb851de06d2`; its only delta from the implementation revision is `13-REVIEW.md` and `13-REVIEW-FIX.md`.
- **Both implementation trees digest to:** `7037f6f15ef062458d010e88422f0ab5071e9575a38064926e354f446c489bc4` after excluding planning/evidence and generated coverage paths. The sealed APK and installed APK both hash to `aebbfdf16b5b0b3488fbb5b9c4540adaa2cd57f016f9282df498ae362ad0553e`.

### Executed behavioral evidence

| Check | Actual result |
|---|---|
| Task-map unit group (19 named suites) | 19/19 suites, 537/537 tests passed. |
| Task-map integration group (12 named suites) | 12/12 suites, 123/123 tests passed. |
| Task-map sqlite-host group | Passed in the grouped focused command; includes migrations, Calendar/history, backup/restore/reconciliation, and merge repositories. |
| Typecheck and boundary lint | Passed; lint checked 313 files. |
| Source-digest/verifier tests | 9/9 passed, including dirty-source rejection and generated-coverage exclusion without ignoring source-like files. |
| Owner records and MAP/TIM evidence artifacts | Passed: MAP-01 `approved`/`one-per-sport`; TIM-01 `approved`/`retire-playback`/no legacy compatibility. |
| Retained native evidence | migrations-effects 14/14, portable-merge 14/14, multi-plan-running 13/13; all with zero failed/skipped cases, schema 35, exact source/APK/installed hashes, and privacy-validated aggregate results. |

The raw `verify:phase13:evidence` CLI deliberately rejects a docs-only descendant because it requires `HEAD === manifest.base_head`. That exact raw-HEAD behavior is covered by the passing verifier tests. It is not an implementation/APK mismatch here: the required implementation digest is identical at the base evidence revision and the checked-out descendant, and the descendant changes only review documents.

### Mapping correction

`tests/integration/multi-plan-activation.test.ts` was a stale map path, not a missing behavior test. Its concurrent per-sport activation and selected-identity behavior are executed by `multi-plan-foundation-tracer.test.ts`, `schedule-commands.test.ts`, and `today-schedule-workout.test.ts`; Task 13-05-02 now names that real coverage.

**Approval:** all 38 task rows and DOM-01 through DOM-17 are validated; zero automated gaps remain.
