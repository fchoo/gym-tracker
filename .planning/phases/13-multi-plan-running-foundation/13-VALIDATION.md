---
phase: 13
slug: multi-plan-running-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-06
requirements: [DOM-01, DOM-02, DOM-03, DOM-04, DOM-05, DOM-06, DOM-07, DOM-08, DOM-09, DOM-10, DOM-11, DOM-12, DOM-13, DOM-14, DOM-15, DOM-16, DOM-17]
automated_gaps: 0
manual_only: 2
---

# Phase 13 — Validation Strategy

> Execution-time Nyquist contract. Planning created commands and case ownership only; no product test, build, device mutation, or release was run.

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
| 13-01-01 | 01 | 1 | DOM-03, DOM-15 | T-13-01-01/03 | sqlite-host | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts` | fixture ❌ W0; harness ✅ | ⬜ |
| 13-01-02 | 01 | 1 | DOM-01 trace | T-13-01-02 | artifact contract | `node -e "const fs=require('fs');const p='.planning/phases/13-multi-plan-running-foundation/13-MAP-01-EVIDENCE.md';const s=fs.readFileSync(p,'utf8');for(const x of ['one-per-sport','one_active_owned_plan','one_active_owned_schedule','restore','merge','rollback'])if(!s.includes(x))throw new Error(x)"` | ❌ W0 | ⬜ |
| 13-01-03 | 01 | 1 | DOM-01 trace | T-13-01-02 | artifact + owner-record validation | `node -e "const d=JSON.parse(require('fs').readFileSync('.planning/v1.2-owner-decisions.json','utf8')).decisions['MAP-01'];if(d.status!=='approved'||d.selection!=='one-per-sport')throw Error('MAP-01')"` | approval ✅; evidence ❌ W0 | ⬜ |
| 13-02-01 | 02 | 2 | DOM-01/02/03/15 | T-13-02-01/04 | shared host/native migration contract | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts && npm run typecheck` | ✅ extend | ⬜ |
| 13-02-02 | 02 | 2 | DOM-01/02/04/07 | T-13-02-02 | tracer integration | `npm run test:integration -- --runInBand tests/integration/multi-plan-foundation-tracer.test.ts -t "minimum Running activation and ordered occurrences"` | ❌ W0 | ⬜ |
| 13-02-03 | 02 | 2 | DOM-03/06/15/17 | T-13-02-03/04 | tracer integration | `npm run test:integration -- --runInBand tests/integration/multi-plan-foundation-tracer.test.ts` | ❌ W0 | ⬜ |
| 13-03-01 | 03 | 3 | DOM-07/08/09 | T-13-03-01/03 | unit + type | `npm run test:unit -- --runInBand src/domains/running/contracts.test.ts && npm run typecheck` | ❌ W0 | ⬜ |
| 13-03-02 | 03 | 3 | DOM-07/08 | T-13-03-01/02 | unit + integration | `npm run test:unit -- --runInBand src/domains/running/commands.test.ts && npm run test:integration -- --runInBand tests/integration/running-foundation.test.ts` | ❌ W0 | ⬜ |
| 13-03-03 | 03 | 3 | DOM-04/07 | T-13-03-01 | unit + integration | `npm run test:unit -- --runInBand src/domains/scheduling/scheduleState.test.ts src/domains/running/contracts.test.ts && npm run test:integration -- --runInBand tests/integration/running-foundation.test.ts tests/integration/schedule-commands.test.ts` | mixed | ⬜ |
| 13-04-01 | 04 | 3 | DOM-10/11 | T-13-04-01/04 | unit + type | `npm run test:unit -- --runInBand src/domains/activities/garminActivitySourcePort.test.ts src/domains/activities/activityIdentity.test.ts && npm run typecheck` | ❌ W0 | ⬜ |
| 13-04-02 | 04 | 3 | DOM-10/11 | T-13-04-01/02 | unit + integration | `npm run test:unit -- --runInBand src/domains/activities/importCommands.test.ts && npm run test:integration -- --runInBand tests/integration/imported-activity-facts.test.ts` | ❌ W0 | ⬜ |
| 13-04-03 | 04 | 3 | DOM-17 | T-13-04-02 | unit + integration | `npm run test:unit -- --runInBand src/domains/activities/importCommands.test.ts && npm run test:integration -- --runInBand tests/integration/imported-activity-facts.test.ts` | ❌ W0 | ⬜ |
| 13-11-01 | 11 | 3 | DOM-14/17 | T-13-11-01 | unit + type | `npm run test:unit -- --runInBand src/domains/bodyweight/contracts.test.ts && npm run typecheck` | ❌ W0 | ⬜ |
| 13-11-02 | 11 | 3 | DOM-14/17 | T-13-11-01/02 | integration | `npm run test:integration -- --runInBand tests/integration/bodyweight-history.test.ts` | ❌ W0 | ⬜ |
| 13-05-01 | 05 | 4 | DOM-06/16 | T-13-05-01 | unit + integration | `npm run test:unit -- --runInBand src/domains/scheduling/activePlanSelection.test.ts && npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts` | mixed | ⬜ |
| 13-05-02 | 05 | 4 | DOM-04/06/16 | T-13-05-01/02 | integration + type | `npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts tests/integration/schedule-commands.test.ts tests/integration/multi-plan-activation.test.ts && npm run typecheck` | activation test ❌ W0 | ⬜ |
| 13-09-01 | 09 | 7 | DOM-03/17 | T-13-09-01/02 | unit + integration | `npm run test:unit -- --runInBand src/domains/advancedTiming/advancedTimingState.test.ts src/domains/advancedTiming/advancedTimingCommands.test.ts src/platform/sqlite/repositories/advancedTimingRepository.test.ts && npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts` | ✅ extend | ⬜ |
| 13-09-02 | 09 | 7 | DOM-16/17 | T-13-09-02 | unit + artifact | `npm run test:unit -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx && node -e "const s=require('fs').readFileSync('.planning/phases/13-multi-plan-running-foundation/13-TIM-01-EVIDENCE.md','utf8');for(const x of ['foreground','queued callback','relaunch','restore','merge','between-set rest','retire-playback'])if(!s.includes(x))throw new Error(x)"` | evidence ❌ W0 | ⬜ |
| 13-09-03 | 09 | 7 | DOM-16 trace | T-13-09-03 | artifact + owner-record validation | `node -e "const d=JSON.parse(require('fs').readFileSync('.planning/v1.2-owner-decisions.json','utf8')).decisions['TIM-01'];if(d.status!=='approved'||d.selection!=='retire-playback'||d.legacy_playback_compatibility!==false)throw Error('TIM-01')"` | approval ✅; evidence ❌ W0 | ⬜ |
| 13-12-01 | 12 | 5 | DOM-04/05 | T-13-12-01 | unit + integration | `npm run test:unit -- --runInBand src/domains/scheduling/scheduleState.test.ts && npm run test:integration -- --runInBand tests/integration/running-foundation.test.ts tests/integration/schedule-commands.test.ts` | mixed | ⬜ |
| 13-12-02 | 12 | 5 | DOM-13 | T-13-12-02/03 | sqlite-host + type | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/trainingCalendarRepository.test.ts tests/sqlite-host/historyRepository.test.ts && npm run typecheck` | calendar ❌ W0 | ⬜ |
| 13-06-01 | 06 | 6 | DOM-12 | T-13-06-01/02 | unit + integration | `npm run test:unit -- --runInBand src/domains/running/activityMatchCommands.test.ts && npm run test:integration -- --runInBand tests/integration/running-activity-match.test.ts tests/integration/running-foundation.test.ts` | ❌ W0 | ⬜ |
| 13-06-02 | 06 | 6 | DOM-17 | T-13-06-01/03 | integration | `npm run test:integration -- --runInBand tests/integration/imported-activity-facts.test.ts tests/integration/running-activity-match.test.ts` | ❌ W0 | ⬜ |
| 13-16-01 | 16 | 6 | DOM-16/17 | T-13-16-01 | unit + integration | `npm run test:unit -- --runInBand src/domains/workout/setCommands.test.ts && npm run test:integration -- --runInBand tests/integration/complete-set.test.ts` | ✅ extend | ⬜ |
| 13-16-02 | 16 | 6 | DOM-16/17 | T-13-16-02 | unit + integration | `npm run test:unit -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx && npm run test:integration -- --runInBand tests/integration/complete-set.test.ts tests/integration/today-schedule-workout.test.ts` | ✅ extend | ⬜ |
| 13-15-01 | 15 | 7 | DOM-13 | T-13-15-01/03 | sqlite-host | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/trainingCalendarRepository.test.ts` | ❌ W0 | ⬜ |
| 13-15-02 | 15 | 7 | DOM-13/14 | T-13-15-02/03 | unit + integration | `npm run test:unit -- --runInBand src/platform/sqlite/repositories/progressRepository.test.ts && npm run test:integration -- --runInBand tests/integration/bodyweight-history.test.ts` | progress test ❌ W0 | ⬜ |
| 13-07-01 | 07 | 8 | DOM-15/17 | T-13-07-01/03 | unit + sqlite-host | `npm run test:unit -- --runInBand src/domains/portability/backupContracts.test.ts && npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalBackupRepository.test.ts` | ✅ extend | ⬜ |
| 13-07-02 | 07 | 8 | DOM-15/17 | T-13-07-01/02 | unit + sqlite-host + integration | `npm run test:unit -- --runInBand src/domains/portability/restoreCommands.test.ts && npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalRestoreRepository.test.ts && npm run test:integration -- --runInBand tests/integration/multi-plan-portability.test.ts` | portability ❌ W0 | ⬜ |
| 13-13-01 | 13 | 9 | DOM-13/15/17 | T-13-13-01 | sqlite-host | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/restoreReconciliationRepository.test.ts` | ✅ extend | ⬜ |
| 13-13-02 | 13 | 9 | DOM-13/15/17 | T-13-13-02 | sqlite-host + integration | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/restoreReconciliationRepository.test.ts && npm run test:integration -- --runInBand tests/integration/multi-plan-portability.test.ts` | mixed | ⬜ |
| 13-08-01 | 08 | 10 | DOM-15/17 | T-13-08-01/04 | unit | `npm run test:unit -- --runInBand src/domains/portability/mergePlan.test.ts src/testing/contracts/portableMerge.contract.test.ts` | ✅ extend | ⬜ |
| 13-08-02 | 08 | 10 | DOM-15/17 | T-13-08-02/03 | sqlite-host + integration | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalMergeRepository.test.ts tests/sqlite-host/restoreReconciliationRepository.test.ts && npm run test:integration -- --runInBand tests/integration/portable-merge.test.ts tests/integration/multi-plan-portability.test.ts` | mixed | ⬜ |
| 13-08-03 | 08 | 10 | DOM-15 | T-13-08-03 | integration | `npm run test:integration -- --runInBand tests/integration/automatic-drive-backup.test.ts tests/integration/multi-plan-portability.test.ts` | mixed | ⬜ |
| 13-10-01 | 10 | 11 | DOM-03/16/17 | T-13-10-01 | unit + integration | `npm run test:unit -- --runInBand src/domains/advancedTiming/advancedTimingCommands.test.ts src/platform/sqlite/repositories/advancedTimingRepository.test.ts src/bootstrap/workoutAppRuntime.test.tsx && npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts tests/integration/multi-plan-portability.test.ts` | mixed | ⬜ |
| 13-10-02 | 10 | 11 | DOM-03/15/16/17 | T-13-10-02/03 | unit + type/boundary | `npm run test:unit -- --runInBand src/testing/contracts/multiPlanRunning.contract.test.ts && npm run typecheck && npm run lint` | ❌ W0 | ⬜ |
| 13-14-01 | 14 | 12 | DOM-01/03/15/16/17 | T-13-14-01/02 | integration + coverage | `npm run test:integration -- --runInBand tests/integration/multi-plan-lifecycle.test.ts && npm run test:coverage -- --runInBand` | lifecycle ❌ W0 | ⬜ |
| 13-14-02 | 14 | 12 | DOM-01..17 trace | T-13-14-01/02/03 | full host + native | `npm run typecheck && npm run lint && npm run test:all -- --runInBand && npm run test:evidence:phase13` | ❌ W0 | ⬜ |

## Wave 0 Requirements

- [ ] Before Task 13-01-01, assert `package-lock.json` exists, Node/npm satisfy `package.json.engines`, and run `npm ci`; fail on lockfile drift. This environment step installs no new package.
- [ ] Restore Android SDK/`adb` before Plan 13-14; host mocks cannot substitute for real Expo SQLite.
- [ ] Create RED-first `tests/integration/multi-plan-foundation-tracer.test.ts`; no breadth plan starts until the full tracer passes.
- [ ] Create the new Running/activity/bodyweight/match/Calendar/portability/lifecycle tests named by their owning tasks before production edits.
- [ ] Create `src/platform/sqlite/repositories/progressRepository.test.ts` before modifying `progressRepository.ts`.
- [ ] Generate `13-MAP-01-EVIDENCE.md` and `13-TIM-01-EVIDENCE.md`; validate both against the dated owner records before affected implementation.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| MAP-01 cardinality | DOM-01 | Approved zero-or-one active plan per sport | Validate `one-per-sport` from owner JSON; record source/date/evidence status in `13-01-SUMMARY.md` before Plan 13-02. |
| TIM-01 runtime policy | DOM-16, DOM-17 | Approved complete playback retirement | Validate `retire-playback` and compatibility=false; record source/date/evidence status in `13-09-SUMMARY.md` before Plan 13-10. |

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

- [ ] All 38 task IDs have automated checks; the two owner decisions additionally have blocking human checks.
- [ ] Every plan reads `.trae/rules/rules.md` and carries the exact commit trailer.
- [ ] Wave 0 `npm ci`/engine/lockfile precondition is complete before the first RED test.
- [ ] The complete production tracer passes before wave 3 breadth begins.
- [ ] Migration 0028 is modified only in Plan 13-02; later DDL uses a successor migration.
- [ ] Every DOM/D13 item maps to a primary plan or explicit shared trace.
- [ ] No same-wave `files_modified` overlap and every task touches at most five files.
- [ ] No watch mode; focused feedback is below 60 seconds after measurement.
- [ ] Full host, complete branch coverage, real Expo SQLite, and exact-artifact privacy gates pass.
- [ ] Set `nyquist_compliant: true` and `wave_0_complete: true` only after execution audit.

**Approval:** MAP-01/TIM-01 finalized; execution and technical evidence pending
