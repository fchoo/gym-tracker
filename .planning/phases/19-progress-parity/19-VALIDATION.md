---
phase: 19
slug: progress-parity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-06
requirements: [PRO-01, PRO-02, PRO-03, PRO-04, PRO-05, PRO-06, PRO-07, PRO-08, PRO-09, PRO-10, PRO-11, PRO-12, PRO-13, PRO-14, PRO-15, PRO-16, PRO-17, PRO-18]
automated_gaps: 0
manual_only: 0
---

# Phase 19 — Validation Strategy

> Execution-time Nyquist contract for factual Progress parity. No application test, build, benchmark, native flow, or device mutation was run during planning.

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Jest 29.7 projects (`unit`, `components`, `sqlite-host`, `integration`) plus source-owned real Expo SQLite contract cases and Maestro native semantics |
| **Config** | `jest.config.js`, `scripts/run-coverage-gate.mjs`, `scripts/run-native-sqlite-contracts.mjs` |
| **Quick command** | Owning task's focused `<automated>` command below; focused commands target <60 seconds and must be split if measured above that bound |
| **Full host gate** | `npm run typecheck && npm run lint && npm run test:all -- --runInBand && npm run test:coverage:integrity` |
| **Native contract** | `npm run android:devtest:fresh -- --suite phase19 && npm run test:sqlite:device -- --suite progress-parity --manifest artifacts/native/phase19/build.json` |
| **Native UI matrix** | `npm run test:native:phase19 -- --manifest artifacts/native/phase19/build.json --flow maestro/phase19/progress-parity.yaml` |
| **Performance** | `npm run test:progress:benchmark -- --manifest artifacts/native/phase19/build.json` |
| **Evidence** | `npm run verify:phase19:evidence -- --manifest artifacts/native/phase19/build.json --automated-only` |
| **Privacy boundary** | Synthetic facts only; allowlisted codes/counts/timings/hashes/configuration IDs; no raw workout/import/bodyweight/provider payloads |

## Sampling Rate

- **After every task:** run its exact focused command.
- **After each wave:** run all focused commands from the wave plus `npm run typecheck && npm run lint`.
- **After Wave 2:** run the one-snapshot SQLite race/freshness/query-bound matrix before any UI slice depends on it.
- **After Wave 3:** run the root, factual chart/Running history, target, recommendation, and bodyweight domain/component suites; no parallel slice advances with a failing shared contract.
- **After Wave 4:** run Exercise-history snapshot/Relative/route suites against the shared Plan 19-04 factual chart contract.
- **After Wave 5:** run the complete route/runtime/component matrix and static UI/platform/SQL boundary checks.
- **Before `/gsd-verify-work`:** run the full host/coverage gate, real Expo SQLite progress-parity cases, raw-sample benchmark, native configuration matrix, and fail-closed Phase 19 evidence verifier against one retained development-test artifact.
- **Watch mode:** prohibited for acceptance evidence.
- **Native acceptance boundary:** Phase 19 retains automated implementation evidence; Phase 20 owns milestone-integrated and attended acceptance.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirements | Threat Refs | Secure/Factual Behavior | Test Type | Automated Command | File State | Status |
|---|---:|---:|---|---|---|---|---|---|---|
| 19-01-01 | 01 | 1 | PRO-02,04,05 | T-19-01-01..03 | Final upstream ports; accepted revision only; no shadow store | unit + contract + type/boundary | `npm run test:unit -- --runInBand src/testing/contracts/progressUpstreamPorts.contract.test.ts src/domains/progress/dashboardProjection.test.ts && npm run typecheck && npm run lint` | new W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | PRO-02,04..07 | T-19-01-01,04 | All/Running tie-break, target-at-date, rounding, temporal basis, sparse truth | unit | `npm run test:unit -- --runInBand src/domains/progress/dashboardProjection.test.ts src/domains/progress/runningPacing.test.ts && npm run typecheck` | new | ⬜ pending |
| 19-01-03 | 01 | 1 | PRO-02,03,07 | T-19-01-01,04 | Effective Strength comparison, target-at-date, recommendation fence, sparse truth | unit | `npm run test:unit -- --runInBand src/domains/progress/dashboardProjection.test.ts src/domains/progress/periodProjection.test.ts && npm run typecheck` | new + extend | ⬜ pending |
| 19-02-01 | 02 | 2 | PRO-02,04,08 | T-19-02-01,02,04 | One readSnapshot; accepted revisions; runtime least privilege | sqlite-host + unit | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressRepository.test.ts && npm run test:unit -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx && npm run typecheck` | extend | ⬜ pending |
| 19-02-02 | 02 | 2 | PRO-02,03,04,07,08 | T-19-02-01..03 | All sports/ranges, effective facts, bounded queries/refresh, coarse diagnostics | sqlite-host + unit + static | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressRepository.test.ts && npm run test:unit -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx && npm run typecheck && npm run lint` | extend | ⬜ pending |
| 19-03-01 | 03 | 3 | PRO-01,04,05 | T-19-03-01..03 | Typed route, fixed goal, opaque source, obsolete-read guard | component + route | `npm run test:components -- --runInBand src/ui/__tests__/ProgressScreen.test.tsx app/__tests__/progress-route.test.tsx && npm run typecheck` | extend | ⬜ pending |
| 19-03-02 | 03 | 3 | PRO-02..08 | T-19-03-01,02,04 | Exact factual root/state matrix; missing never zero; bounded rebuild | component + route + static | `npm run test:components -- --runInBand src/ui/__tests__/ProgressScreen.test.tsx app/__tests__/progress-route.test.tsx && npm run typecheck && npm run lint` | extend | ⬜ pending |
| 19-04-01 | 04 | 3 | PRO-09 | T-19-04-01,02,04 | Same-series chart/text/data, separate goal line, source revision | component | `npm run test:components -- --runInBand src/ui/__tests__/FactualHistoryChart.test.tsx src/ui/__tests__/RunningHistorySheet.test.tsx && npm run typecheck` | new W0 | ⬜ pending |
| 19-04-02 | 04 | 3 | PRO-09 | T-19-04-01..04 | Empty/sparse/gaps/long/rebuild/focus; full evidence retained | component + static | `npm run test:components -- --runInBand src/ui/__tests__/FactualHistoryChart.test.tsx src/ui/__tests__/RunningHistorySheet.test.tsx && npm run typecheck && npm run lint` | new W0 | ⬜ pending |
| 19-05-01 | 05 | 4 | PRO-10,11 | T-19-05-01,02 | Dated/same-date revision Relative basis; shared FactualHistoryChart; no target side effect | unit + component | `npm run test:unit -- --runInBand src/domains/progress/relativeStrength.test.ts src/domains/history/metricHistory.test.ts && npm run test:components -- --runInBand src/ui/__tests__/ExerciseHistoryScreen.test.tsx` | relative new W0; extend | ⬜ pending |
| 19-05-02 | 05 | 4 | PRO-10,11 | T-19-05-01,02,04 | One-snapshot effective history, targets, dated bases, and sources | unit + sqlite-host | `npm run test:unit -- --runInBand src/domains/history/metricHistory.test.ts src/domains/progress/relativeStrength.test.ts && npm run test:sqlite:host -- --runInBand tests/sqlite-host/historyRepository.test.ts && npm run typecheck` | extend | ⬜ pending |
| 19-05-03 | 05 | 4 | PRO-10,11 | T-19-05-02,03 | Preserved read-only route, shared chart/data, source navigation, exact return | component + route | `npm run test:components -- --runInBand src/ui/__tests__/ExerciseHistoryScreen.test.tsx app/exercise-history/__tests__/exercise-history-route.test.tsx && npm run typecheck` | route test new W0; extend | ⬜ pending |
| 19-06-01 | 06 | 3 | PRO-12 | T-19-06-01..03 | One shared source target command; no-write dismissal | component + unit/runtime | `npm run test:components -- --runInBand src/ui/__tests__/RunningTargetSheet.test.tsx && npm run test:unit -- --runInBand src/bootstrap/runningPlanRuntime.test.tsx src/domains/running/commands.test.ts && npm run typecheck` | sheet new W0; upstream extend | ⬜ pending |
| 19-06-02 | 06 | 3 | PRO-13 | T-19-06-01,02,04 | Domain validation, receipt replay, stale/fault rollback, shared source read-back | unit + integration | `npm run test:unit -- --runInBand src/domains/running/commands.test.ts && npm run test:integration -- --runInBand tests/integration/running-foundation.test.ts && npm run typecheck` | extend | ⬜ pending |
| 19-06-03 | 06 | 3 | PRO-13 | T-19-06-01,03,04 | Draft/focus retention across invalid/stale/fault/retry/read-back | unit/runtime + component | `npm run test:unit -- --runInBand src/bootstrap/runningPlanRuntime.test.tsx && npm run test:components -- --runInBand src/ui/__tests__/RunningTargetSheet.test.tsx && npm run typecheck` | extend | ⬜ pending |
| 19-07-01 | 07 | 3 | PRO-14,15 | T-19-07-01,02,04 | Evidence fence + exactly-once Use replay + post-commit result | unit + integration | `npm run test:unit -- --runInBand src/domains/progression/recommendationCommands.test.ts && npm run test:integration -- --runInBand tests/integration/load-reps.test.ts && npm run typecheck` | command test may be new W0; extend | ⬜ pending |
| 19-07-02 | 07 | 3 | PRO-14,15 | T-19-07-01..04 | Keep/no-write dismiss/stale/failure/history; no fixture resurrection | unit + integration + component | `npm run test:unit -- --runInBand src/domains/progression/recommendationCommands.test.ts && npm run test:integration -- --runInBand tests/integration/load-reps.test.ts && npm run test:components -- --runInBand src/ui/__tests__/RecommendationSurface.test.tsx && npm run typecheck` | extend | ⬜ pending |
| 19-08-01 | 08 | 3 | PRO-17,18 | T-19-08-01,02,04 | First-entry runtime flow; commit/read-back; target isolation | unit/runtime + component | `npm run test:unit -- --runInBand src/bootstrap/trainingFoundationRuntime.test.ts && npm run test:components -- --runInBand src/ui/__tests__/BodyweightEditorSheet.test.tsx && npm run typecheck` | runtime test/sheets new W0 | ⬜ pending |
| 19-08-02 | 08 | 3 | PRO-18 | T-19-08-01..04 | Bounds/date, receipt/revision/tombstone, privacy, protected digests | unit + integration | `npm run test:unit -- --runInBand src/domains/bodyweight/contracts.test.ts src/domains/bodyweight/commands.test.ts && npm run test:integration -- --runInBand tests/integration/bodyweight-history.test.ts && npm run typecheck` | commands test new W0; upstream extend | ⬜ pending |
| 19-08-03 | 08 | 3 | PRO-16,17,18 | T-19-08-01,02 | Settings/history/editor/delete/focus/accessibility | component + static | `npm run test:components -- --runInBand src/ui/__tests__/ProgressSettingsSheet.test.tsx src/ui/__tests__/BodyweightHistorySheet.test.tsx src/ui/__tests__/BodyweightEditorSheet.test.tsx && npm run typecheck && npm run lint` | new W0 | ⬜ pending |
| 19-09-01 | 09 | 5 | PRO-04,08,09,12,13 | T-19-09-01..04 | Running history/source/target read-back and exact return | component/route + runtime | `npm run test:components -- --runInBand src/ui/__tests__/ProgressScreen.test.tsx app/__tests__/progress-route.test.tsx && npm run test:unit -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx && npm run typecheck` | extend | ⬜ pending |
| 19-09-02 | 09 | 5 | PRO-03,10,11,14..18 | T-19-09-01..04 | Strength/recommendation/settings/bodyweight composition; named writes only | component/route + runtime | `npm run test:components -- --runInBand src/ui/__tests__/ProgressScreen.test.tsx app/__tests__/progress-route.test.tsx && npm run test:unit -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx && npm run typecheck` | extend | ⬜ pending |
| 19-09-03 | 09 | 5 | PRO-01..18 UI trace | T-19-09-01..04 | Required layouts/text/input/focus/motion; no silent deviation | full focused components + static | `npm run test:components -- --runInBand src/ui/__tests__/ProgressScreen.test.tsx app/__tests__/progress-route.test.tsx src/ui/__tests__/FactualHistoryChart.test.tsx src/ui/__tests__/RunningHistorySheet.test.tsx src/ui/__tests__/RunningTargetSheet.test.tsx src/ui/__tests__/RecommendationSurface.test.tsx src/ui/__tests__/ProgressSettingsSheet.test.tsx src/ui/__tests__/BodyweightHistorySheet.test.tsx src/ui/__tests__/BodyweightEditorSheet.test.tsx src/ui/__tests__/ExerciseHistoryScreen.test.tsx && npm run typecheck && npm run lint` | mixed | ⬜ pending |
| 19-10-01 | 10 | 6 | PRO-01..18 trace | T-19-10-01..03 | Same source-owned case IDs on host/native; privacy-safe results | unit + type/boundary | `npm run test:unit -- --runInBand src/testing/contracts/progressParity.contract.test.ts && npm run typecheck && npm run lint` | new W0 | ⬜ pending |
| 19-10-02 | 10 | 6 | PRO-01..18 native/perf trace | T-19-10-01..04 | Raw named budgets; full native config/state matrix; no score | Node contracts + synthetic benchmark | `node --test scripts/benchmark-phase19-progress.test.mjs scripts/run-phase19-native-evidence.test.mjs && npm run test:progress:benchmark -- --synthetic && npm run typecheck` | new W0 | ⬜ pending |
| 19-10-03 | 10 | 6 | PRO-01..18 closure | T-19-10-01..05 | Exact evidence IDs, hashes, privacy, coverage, no false acceptance | verifier + full host/coverage | `node --test scripts/verify-phase19-evidence.test.mjs && npm run test:all -- --runInBand && npm run test:coverage:integrity && npm run verify:phase19:evidence -- --automated-only` | new W0 + extend | ⬜ pending |

## Wave 0 Requirements

- [ ] Restore locked dependencies from the existing lockfile before the first Jest command; no package change/install task belongs to Phase 19.
- [ ] Confirm Phase 13, 14, 17, and 18 are complete and run `progressUpstreamPorts.contract.test.ts` before other Phase 19 production edits.
- [ ] Create RED-first pure test files: `progressUpstreamPorts.contract.test.ts`, `dashboardProjection.test.ts`, `runningPacing.test.ts`, `relativeStrength.test.ts`.
- [ ] Create RED-first component/route test files: `FactualHistoryChart.test.tsx`, `RunningHistorySheet.test.tsx`, `RunningTargetSheet.test.tsx`, `ProgressSettingsSheet.test.tsx`, `BodyweightHistorySheet.test.tsx`, `BodyweightEditorSheet.test.tsx`, and `exercise-history-route.test.tsx`.
- [ ] Create/extend RED-first command/integration cases for target receipt replay, recommendation acknowledgment loss, bodyweight bounds/replay/target isolation, and SQLite snapshot races.
- [ ] Create `progressParity.contract.ts`, the benchmark/runner/verifier contract tests, and the Maestro flow before their implementation.
- [ ] Restore Android SDK/emulator/adb and native-build lock availability before Plan 19-10; host/browser evidence cannot replace required native records.

## Manual-Only Verifications

None. All Phase 19 product behavior and automated native implementation evidence has executable coverage. Phase 20 owns integrated/attended acceptance and must not be marked complete by Phase 19 artifacts.

## Multi-Source Coverage Audit

| Source | ID | Feature / Constraint | Plans | Status | Notes |
|---|---|---|---|---|---|
| GOAL | — | Owner understands factual Strength/imported Running progress, goals, gaps, and recommendations without invented evidence or silent target changes | 01-10 | COVERED | Domain, snapshot, UI, explicit commands, integration, and evidence form one chain. |
| REQ | PRO-01 | All/Strength/Running and 4w/12w/all-time semantics/retention/keyboard | 03,09,10 | COVERED | Root controls, integration, native evidence. |
| REQ | PRO-02 | Nearest factual goal, facts, goal line, active/planned context | 01,02,03,10 | COVERED | Deterministic tie-break and single-snapshot source. |
| REQ | PRO-03 | Strength goal/status/review/exercise rows | 01,02,03,09,10 | COVERED | Effective comparable history only. |
| REQ | PRO-04 | Running facts/goals/best/pacing from imports | 01,02,03,04,09,10 | COVERED | Canonical accepted Garmin facts; exact efforts require source-reported summary/lap evidence, never sampled chart inference. |
| REQ | PRO-05 | Fixed 2.4 km target/splits and explicit-only changes | 01,03,10 | COVERED | Integer 660-second rule and target command. |
| REQ | PRO-06 | Unset 10 km/Half and no-zero missing effort | 01,03,10 | COVERED | Null target and absence remain distinct. |
| REQ | PRO-07 | Ready/sparse/empty/loading honesty | 01,02,03,10 | COVERED | Typed states and native matrix. |
| REQ | PRO-08 | Failure/retry/stale/rebuild retention | 02,03,09,10 | COVERED | One snapshot and bounded refresh. |
| REQ | PRO-09 | Accessible history chart/goal line/empty detail | 04,09,10 | COVERED | Same typed series feeds visual/text/data. |
| REQ | PRO-10 | Existing Exercise history route/states/sources/return | 05,09,10 | COVERED | Route extended, not replaced. |
| REQ | PRO-11 | Eligible dated Load/Relative disclosure; no target change | 01,05,09,10 | COVERED | Per-observation temporal basis. |
| REQ | PRO-12 | Running target editor fields/benchmark/save/cancel | 06,09,10 | COVERED | Shared source target sheet. |
| REQ | PRO-13 | Validated target persistence/draft/stale/consistency | 06,09,10 | COVERED | Receipt/revision/commit/read-back. |
| REQ | PRO-14 | Recommendation Current/Proposed/evidence/Keep/Use | 07,09,10 | COVERED | Exact explicit sheet. |
| REQ | PRO-15 | Exactly-once recommendation decision/retry/no rerender | 07,09,10 | COVERED | Receipt replay and stale supersede. |
| REQ | PRO-16 | Body metrics/settings/privacy/no score/demographics | 08,09,10 | COVERED | Exact settings contract. |
| REQ | PRO-17 | Bodyweight empty/history/add/edit/two-step delete | 08,09,10 | COVERED | Row-specific confirmation/focus. |
| REQ | PRO-18 | Dated kg bounds/editor/persistence/errors | 08,09,10 | COVERED | Strict domain + UI + SQLite. |
| CONTEXT | D19-01 | Exact sport/ranges; retained focus/recovery | 02,03,09,10 | COVERED | Typed request and UI state remain separate. |
| CONTEXT | D19-02 | Comparable Latest/Best/Target/Gap/goal/evidence/next only | 01,02,03,04,05 | COVERED | Pure domain comparability and evidence surfaces. |
| CONTEXT | D19-03 | Honest loading/empty/sparse/rebuild/error; no zero | 01,02,03,04,09,10 | COVERED | Source/read/UI/native state matrix. |
| CONTEXT | D19-04 | Exact 2.4 km and unset 10 km/Half | 01,03,06,10 | COVERED | Fixed source rule + explicit editor. |
| CONTEXT | D19-05 | Running best only from accepted imports with sufficient exact/source evidence | 01,02,03,04,10 | COVERED | Source-reported summary/lap facts qualify; sampled/downsampled charts yield Unavailable or More data needed. |
| CONTEXT | D19-06 | Evidence/revision fenced explicit recommendation | 07,09,10 | COVERED | Keep/Use receipt and no-write dismissal. |
| CONTEXT | D19-07 | Optional dated bodyweight, disclosed Relative only | 01,05,08,09,10 | COVERED | At-or-before basis and protected target digests. |
| RESEARCH | R19-01 | Fail-closed Phase 13/17/18 typed port preflight | 01 | COVERED | Compile-time/behavioral upstream contract. |
| RESEARCH | R19-02 | Discriminated sport model; domain-specific comparability | 01 | COVERED | No optional-field bag or cross-sport normalization. |
| RESEARCH | R19-03 | Freshness and facts inside one readSnapshot | 02,05 | COVERED | Progress and exercise history reads. |
| RESEARCH | R19-04 | Target-at-date effective series, resolved stable tie-break, exact half-up split rounding | 01,04,05 | COVERED | Plan-scoped pure rules and chart/table. |
| RESEARCH | R19-05 | One typed series for visual, summary, label, and data | 04,05 | COVERED | SVG never becomes authority. |
| RESEARCH | R19-06 | Target/recommendation/bodyweight receipts, revisions, commit/read-back | 06,07,08,09 | COVERED | Three explicit command families. |
| RESEARCH | R19-07 | Dated Relative transform; no future/latest-for-all basis; deterministic same-date revision order | 01,05 | COVERED | At-or-before per-point disclosure with effective timestamp/revision/fact-ID ties. |
| RESEARCH | R19-08 | Indexed range reads, bounded refresh, long-history handling | 02,04,10 | COVERED | Raw performance/query evidence. |
| RESEARCH | R19-09 | Phase 14 shared sheets/tokens/focus/accessibility | 03-09 | COVERED | No private modal/theme/navigation system. |
| RESEARCH | R19-10 | Real SQLite, complete coverage, native/perf/privacy evidence | 02,06-10 | COVERED | Source-owned cases and fail-closed verifier. |
| EXCLUDED | Deferred | Readiness/composite fitness/muscle heat maps/invented 10 km-Half targets/automatic bodyweight progression | — | EXCLUDED | Explicitly deferred/prohibited in CONTEXT/UI-SPEC. |
| EXCLUDED | Phase 20 | Milestone-integrated attended Samsung/release acceptance | — | EXCLUDED | Phase 20 dependency; Phase 19 provides automated inputs only. |

## Dependency and Wave Audit

| Wave | Plans | Independence / Gate |
|---:|---|---|
| 1 | 19-01 | Fail-closed upstream freeze plus pure factual projection/pacing rules. |
| 2 | 19-02 | Single-snapshot repository/runtime gate; every later surface depends on its typed read. |
| 3 | 19-03, 19-04, 19-06, 19-07, 19-08 | Root read-only UI, shared factual chart/Running history, targets, recommendations, and bodyweight own disjoint files and run in parallel. |
| 4 | 19-05 | Consumes Plan 19-04 FactualHistoryChart for Exercise history and Relative views. |
| 5 | 19-09 | Integrates all slices into route/runtime/root and seals responsive/accessibility behavior. |
| 6 | 19-10 | Adds shared host/native cases, benchmark, native matrix, coverage/privacy verifier, and Phase 20 handoff. |

No same-wave plans share a `files_modified` path.

## Goal-Backward Reachability Audit

| Required truth | Creation path | Reachability |
|---|---|---|
| Factual All/Strength/Running view | upstream facts → one snapshot → `projectProgressDashboard` → runtime → Progress root | REACHABLE |
| Fixed/unset goal truth | Running goal source revision → pacing/projector → root/target sheet | REACHABLE |
| History evidence | factual series → chart/data → Running sheet or Exercise route → source detail | REACHABLE |
| Target decision | root row → RunningTargetSheet → shared Running command/repository → read-back | REACHABLE |
| Recommendation decision | Needs review → RecommendationSurface → evidence-fenced command/receipt → read-back | REACHABLE |
| Optional bodyweight | Progress settings → history/editor → bodyweight command/repository → Relative read basis | REACHABLE |
| Rebuild/failure recovery | generation/freshness → typed state → retained inline Retry/Refresh | REACHABLE |
| Native/performance evidence | source-owned case/benchmark/flow → retained manifest/results → fail-closed verifier → Phase 20 | REACHABLE |

## Pre-Mortem and Mitigations

| Likely failure | Early detection / mitigation |
|---|---|
| Upstream ports differ or are incomplete | 19-01 precondition plus `progressUpstreamPorts.contract.test.ts` halts before Phase 19 creates an adapter/store. |
| Mixed revisions create factual but false views | 19-02 writer-race test requires one `readSnapshot`; 19-05 applies the same rule to Exercise history. |
| Command busy state hides replay/stale bugs | 19-06/07/08 receipt, acknowledgment-loss, changed-payload, stale, and fault tests run below UI. |
| Visual chart diverges from accessible history | 19-04 requires identical typed source rows for summary, label, marks, and data; coordinates are decoration only. |
| Native evidence becomes stale, incomplete, sensitive, or overstated | 19-10 binds identities/configurations, uses synthetic facts, recursively rejects sensitive fields, and forbids Phase 20/release claims. |

## Rollback and Reversibility Audit

| Door | Rating | Recovery |
|---|---|---|
| Progress read union/runtime coordination | costly | Coordinate consumers; source tables/facts remain unchanged and projections rebuild. |
| Running target/recommendation/bodyweight committed facts | costly | Append explicit new target/decision/measurement correction/tombstone; never erase audit history. |
| Projectors, one-snapshot query shape, UI, charts, sheets, benchmarks | reversible | Replace/rebuild from unchanged source facts and retained typed contracts. |
| Evidence artifacts | reversible | Regenerate from exact source/APK/config; retain failures for diagnosis. |

## Validation Sign-Off

- [ ] All 26 task IDs have an automated command and map to requirements/threats.
- [ ] Every PRO requirement, D19 decision, phase goal, and in-scope research constraint is covered.
- [ ] All new test/contract files are created RED-first inside their owning task.
- [ ] No task uses watch mode or a manual-only substitute.
- [ ] Focused feedback latency is measured below 60 seconds or commands are split.
- [ ] One-snapshot Progress and Exercise-history race tests pass.
- [ ] Target/recommendation/bodyweight validation, replay, stale, fault, and authoritative read-back tests pass.
- [ ] Factual chart/text/data equivalence and zero/one/many/long history tests pass.
- [ ] Full host/type/lint/boundary/integrity coverage gates pass.
- [ ] Real Expo SQLite progress-parity cases, raw-sample benchmark, complete native matrix, and 18 evidence IDs pass one fail-closed verifier.
- [ ] Evidence contains no personal/sensitive fields, scores, fabricated baselines, release claims, or Phase 20 acceptance claims.
- [ ] `nyquist_compliant: true` and `wave_0_complete: true` are set only after execution-time validation audit.

**Approval:** pending execution; no unresolved Phase 19 owner decision or manual-only behavior.
