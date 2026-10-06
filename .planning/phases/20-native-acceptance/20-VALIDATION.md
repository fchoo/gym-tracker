---
phase: 20
slug: native-acceptance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-06
requirements: [VER-01, VER-02, VER-03, VER-04, VER-05, VER-06, VER-07, VER-08, VER-09, VER-10, VER-11, VER-12, VER-13]
automated_gaps: 0
manual_only: 4
external_conditional: 1
---

# Phase 20 — Validation Strategy

> Task-mapped execution contract. Planning ran no product test, build, emulator/device action, FIT import, Samsung observation, signing, release, deployment, Terminal Seal or commit.

## Ordering Invariant

1. Plans 20-01 through 20-05 implement, self-test and commit every contract, probe, flow, runner, manifest extension, shard validator, final validator, attended utility, readiness generator and package entrypoint.
2. Plan 20-06 gates every terminal Phase 13–19 output, selects the exact pinned toolchain, registers all Phase 20 integrity modules, runs `test:all` plus exact coverage, commits that final source change, freezes source, builds exactly one artifact and creates one immutable run/build.json.
3. Plans 20-07 through 20-09 execute observation shards only. They modify no implementation/tooling source and never derive row verdicts or write `final-evidence.json`.
4. Plan 20-10 runs a no-write preseal, stops at a nonautonomous `checkpoint:human-verify`, validates the resulting Samsung record automatically, and only then invokes the sole final seal and readiness/rollback generator.
5. Any source, flow, fixture, contract, tool, APK, signature, installed-byte or identity change after freeze invalidates the run. Preserve it and start a new build/run.

## Test and Evidence Infrastructure

| Property | Value |
|---|---|
| Host frameworks | Node 24.19.0 `node:test`; Jest 29.7 `unit`, `components`, `sqlite-host`, `integration`; RNTL 14.0.1 |
| Native framework | Maestro 2.8.0, real Expo SQLite, ADB-measured configuration/geometry/semantics, Android frame traces |
| Build toolchain | npm 11.17.0; Java 17.0.20+8; Android API 36; Build Tools 36.0.0; NDK 27.1.12297006; ADB; apksigner; zipalign |
| Canonical source | 172-row parity JSON; 107-state serial walk; exact 64 static configurations; Requirements/UI-SPEC/deviations/native matrix; Revision 18 hashes |
| Tooling self-test | `npm run test:evidence:v12` after Plans 20-01–05 |
| Full host/freeze gate | `npm run typecheck && npm run lint && npm run check:boundaries && npm run test:all -- --runInBand && npm run test:coverage -- --runInBand && npm run test:evidence:v12` |
| Native SQLite | `npm run test:sqlite:device -- --suite v1.2-acceptance --manifest "artifacts/native/v1.2/$V12_RUN_ID/build.json"` |
| Native runner | `npm run test:maestro:v12 -- --run "$V12_RUN_ID" --shard <id>` |
| Performance | `npm run benchmark:v12:interactions -- --run "$V12_RUN_ID" --all` |
| Preseal | `npm run verify:v12:evidence -- --run "$V12_RUN_ID" --mode preseal --no-final-write` |
| Sole final seal | `npm run verify:v12:evidence -- --run "$V12_RUN_ID" --mode final` after attended record validation |

Fast `<automated>` gates validate source or retained artifacts in under 60 seconds. Native collection commands are recorded separately and execute only after authorization/freeze.

## Verdict and Identity Contract

- Allowed row verdicts: `PASS`, `FAIL`, `REVIEW_REQUIRED`, `BLOCKED_OWNER`, `CONDITIONAL_EXTERNAL`, `ACCEPTED_EXCEPTION`, `N_A_REVIEWED`.
- `ACCEPTED_EXCEPTION` is non-PASS, counted separately, and requires deviation ID, owner decision/date, exact scope/configurations, rationale and evidence hashes.
- `CONDITIONALLY_READY` is permitted only by an explicit reviewed policy when every remaining non-PASS is a valid accepted exception. Any failure, review-required, owner-blocked or external-conditional row prevents it.
- Shards emit observations and gate inputs only. `sealV12FinalEvidence` alone maps all 172 verdicts and writes `ui-state-matrix.json`/`final-evidence.json`.
- `build.json` binds HEAD/tree/lockfile, all canonical source hashes, exact pinned toolchain, fixtures/flows, package/profile/version, retained/installed APK hash/size equality, alignment, signature/certificate, hashed device and measured settings/restoration.
- Shared focus acceptance is the Phase 14 3dp ring with 3dp exterior offset. Native semantic/input validation does not expand scope into live TalkBack or switch-scanning acceptance.

## Per-Task Verification Map

| Task | Wave | Requirements | Fast automated gate | Runtime/manual evidence | Status |
|---|---:|---|---|---|---|
| 20-01-01 | 1 | VER-01 | `node --test scripts/v12-evidence-contract.test.mjs` | none | pending |
| 20-01-02 | 1 | VER-01 | manifest contract tests | none | pending |
| 20-02-01 | 2 | VER-07/08 | aggregate contract + typecheck | none | pending |
| 20-02-02 | 2 | VER-07 | SQLite-shard adversarial tests | none | pending |
| 20-02-03 | 2 | VER-08 | recovery contract/shard tests | none | pending |
| 20-03-01 | 2 | VER-10 | FIT contract/shard tests | none | pending |
| 20-03-02 | 2 | VER-06/09 | Calendar contract/shard tests | none | pending |
| 20-04-01 | 2 | VER-01/02/03 | capture/flow mapping tests | none | pending |
| 20-04-02 | 2 | VER-02/03 | comparison adversarial tests | none | pending |
| 20-04-03 | 2 | VER-04/05/06 | accessibility contract/shard tests | none | pending |
| 20-05-01 | 3 | VER-11 | benchmark/marker tests | none | pending |
| 20-05-02 | 3 | VER-01/13 | central verifier/build-script tests | none | pending |
| 20-05-03 | 3 | VER-12/13 | attended/readiness/verifier tests | none | pending |
| 20-06-01 | 4 | VER-01/07/11/13 | pinned preflight + test:all + coverage + all evidence self-tests | none | pending |
| 20-06-02 | 4 | VER-01/13 | build.json fast identity verifier | one build/install and immutable run creation | pending |
| 20-07-01 | 5 | VER-07 | SQLite shard verifier | real Expo SQLite aggregate | pending |
| 20-07-02 | 5 | VER-08 | recovery shard verifier | offline/process-death flow | pending |
| 20-08-01 | 6 | VER-10 | FIT shard verifier | original FIT/dedupe/match flow | pending |
| 20-08-02 | 6 | VER-06/09 | Calendar shard verifier | intermediate gesture/motion flow | pending |
| 20-09-01 | 7 | VER-01 | shards-only exact-map verifier | re-executed multi-plan/workout/library-running flows | pending |
| 20-09-02 | 7 | VER-02–06 | capture/comparison/accessibility verifiers | 107/native-only × applicable 64 configs | pending |
| 20-09-03 | 7 | VER-11 | performance shard verifier | full release-variant raw samples | pending |
| 20-10-01 | 8 | VER-01–11 | no-write preseal + checklist-prepared validation | none | pending |
| 20-10-02 | 8 | VER-12 | checkpoint follows validated preseal | owner-attended unchanged Samsung observations | pending |
| 20-10-03 | 8 | VER-01–13 | attended validation + sole final seal + handoff validation | no release action | pending |

## Wave 0 Preconditions

- [ ] Terminal outputs exist and are read: `13-14-SUMMARY.md`, `14-11-SUMMARY.md`, `15-13-SUMMARY.md`, `16-07-SUMMARY.md`, `17-14-SUMMARY.md`, `18-12-SUMMARY.md`, `18-13-SUMMARY.md`, and `19-10-SUMMARY.md`, plus every final `*-VALIDATION.md` and evidence artifact they name.
- [ ] MAP-01 has a recorded Phase 13 result. DEV-01/DEV-02/TIM-01 remain `BLOCKED_OWNER` when unresolved or incompletely evidenced. Phase 18 live Garmin remains `CONDITIONAL_EXTERNAL` without real prerequisites.
- [ ] Phase 20 execution is explicitly authorized in current state before any native/build/device step.
- [ ] Exact Node/npm/Java/API/Build Tools/NDK/ADB/Maestro/apksigner/zipalign versions are selected and read back; any mismatch blocks.
- [ ] Every tool/probe/flow/validator from Plans 20-01–05 and the integrity registry change is committed before freeze.
- [ ] Full type/lint/boundary/test:all/coverage/evidence self-tests pass before freeze; no watch mode.
- [ ] One exclusive Android target/device-settings lease is held. No shard runs concurrently against it.
- [ ] Only deterministic synthetic databases, archives, workouts, measurements, activities, routes and original FIT files are used.

## Manual and External Gates

| Gate | Affected scope | Outcome while open | Closure/exception contract |
|---|---|---|---|
| DEV-01 | Calendar geometry/accessibility, VER-03/04 | `BLOCKED_OWNER` | Owner decision/date plus exact both-branch scope/config/evidence; accepted adaptation or retained failing oracle becomes non-PASS `ACCEPTED_EXCEPTION` |
| DEV-02 | CAL-03 and Light visual/accessibility, VER-02/04 | `BLOCKED_OWNER` | Owner decision/date plus exact Light/System-Light scope/config/evidence; accepted candidate or retained failing oracle becomes non-PASS `ACCEPTED_EXCEPTION` |
| TIM-01 | DOM-03/15/17, WRK-05/18/21–23/26, VER-07/08 | `BLOCKED_OWNER` | Dated policy plus every selected-policy playback/foreground/callback/relaunch/restore/merge/zero-cue/rest-set-pointer fixture |
| Garmin | GAR-04–07, NV-IMP-11–13 | `CONDITIONAL_EXTERNAL` | Actual program access, granted delivery/scope contract, real consent and reviewed confidential topology |
| Samsung | VER-12 | blocking human checkpoint | Fresh passed/failed rows on unchanged installed bytes; observation only |
| FIT budget | VER-11 FIT subrow | `REVIEW_REQUIRED` if Phase 18 limit absent | Independently accepted Phase 18 limit object and exact maximum fixture hashes |

## Dependency and Wave Audit

| Wave | Plans | Constraint |
|---:|---|---|
| 1 | 20-01 | Establish source-derived vocabulary and immutable manifest contract. |
| 2 | 20-02, 20-03, 20-04 | Disjoint SQLite/recovery, FIT/Calendar, and visual/accessibility tooling files; no runtime execution. |
| 3 | 20-05 | Integrate runner/final validator/build manifest/performance/attended/readiness tooling after all shard schemas exist. |
| 4 | 20-06 | Gate terminal outputs, register coverage, run full host gates, commit, freeze, build once and create run. |
| 5 | 20-07 | Execute SQLite and recovery under the exclusive device/run lease. |
| 6 | 20-08 | Execute FIT and Calendar against unchanged bytes. |
| 7 | 20-09 | Re-execute/bind multi-plan/Workout/Library-Running one-to-one, then visual/accessibility/performance. |
| 8 | 20-10 | No-write preseal → Samsung checkpoint → automated record validation → sole final seal/readiness handoff. |

Wave 2 has no source-file overlap. Runtime plans are serialized because they share one installed artifact, device state and immutable run directory.

## Multi-Source Coverage Audit

| Source | ID | Feature / constraint | Plans | Status |
|---|---|---|---|---|
| GOAL | — | Source-bound complete native parity/data/accessibility/recovery/offline/performance evidence before release decision | 01–10 | COVERED |
| REQ | VER-01 | Exact inventory/route/interaction/state mapping | 01,04,05,06,09,10 | COVERED |
| REQ | VER-02 | Light/Dark/System screenshot comparison | 04,09,10 | COVERED |
| REQ | VER-03 | Four portrait/landscape sizes and four roots | 04,09,10 | COVERED |
| REQ | VER-04 | F200, 48dp, semantics, non-color | 04,09,10 | COVERED |
| REQ | VER-05 | Keyboard/D-pad/focus/Back/restoration | 04,09,10 | COVERED |
| REQ | VER-06 | Reduced-motion semantic equivalence | 03,04,08,09,10 | COVERED |
| REQ | VER-07 | Real SQLite migration/portability/idempotency/history | 02,06,07,10 | COVERED |
| REQ | VER-08 | Offline/process-death boundaries | 02,07,10 | COVERED |
| REQ | VER-09 | Native Calendar intermediate gestures | 03,08,10 | COVERED |
| REQ | VER-10 | Actual FIT/dedupe/optional facts/explicit match/API gate | 03,08,10 | COVERED |
| REQ | VER-11 | Locked performance and bounded FIT evidence | 05,06,09,10 | COVERED |
| REQ | VER-12 | Owner-attended Samsung observation | 05,10 | COVERED |
| REQ | VER-13 | Signed-personal readiness preparation and rollback | 05,06,10 | COVERED |
| CONTEXT | D20-01 | 172 source-bound rows; no inherited v1.1 evidence | 01,05,09,10 | COVERED |
| CONTEXT | D20-02 | L/D/System, four sizes, orientations, F100/F200, material states | 01,04,09 | COVERED |
| CONTEXT | D20-03 | 48dp/non-color/labels/input/focus/Back/motion/order | 04,09 | COVERED |
| CONTEXT | D20-04 | Real SQLite/portability/lifecycle/FIT/match/history | 02,03,07,08 | COVERED |
| CONTEXT | D20-05 | Calendar intermediate/threshold/cancel/morph/motion | 03,08 | COVERED |
| CONTEXT | D20-06 | Exact product/backup/merge budgets and bounded FIT evidence | 05,09 | COVERED |
| CONTEXT | D20-07 | Samsung additional observation; later authority only | 05,06,10 | COVERED |
| CONTEXT | D20-08 | Owner/external/exception/conditional-readiness truth | 01,03–05,08–10 | COVERED |
| RESEARCH | R20-01 | Implement/commit all tooling before freeze/build | 01–06 | COVERED |
| RESEARCH | R20-02 | Exact pinned live toolchain; mismatch blocks | 06 | COVERED |
| RESEARCH | R20-03 | One frozen source, one artifact/run; any change starts new run | 06–10 | COVERED |
| RESEARCH | R20-04 | Independent observation-only shards and sole final seal | 02–05,07–10 | COVERED |
| RESEARCH | R20-05 | Explicit multi-plan/library-running one-to-one flow creation and rerun | 04,09 | COVERED |
| RESEARCH | R20-06 | Seven verdicts, accepted-exception metadata/separate counts/policy | 01,04,05,10 | COVERED |
| RESEARCH | R20-07 | Source/APK/signature/device/fixture/config identity and privacy | all | COVERED |
| RESEARCH | R20-08 | Real SQLite, recovery, FIT, Calendar, visual, accessibility, performance | 02–09 | COVERED |
| RESEARCH | R20-09 | 3dp shared focus; no live TalkBack/switch scope expansion | 04,09 | COVERED |
| RESEARCH | R20-10 | Observation-only Samsung and compatible rollback/readiness stop | 05,10 | COVERED |
| EXCLUDED | Deferred | Public release ceremony, Terminal Seal, store distribution, Wear OS, Health Connect | — | EXCLUDED |
| EXCLUDED | Boundary | Product fixes during evidence run | — | EXCLUDED — fail row, retain run, repair owning Phase 13–19, rebuild/new run |

No source-audit item is missing.

## Pre-Mortem Controls

| Failure | Earliest detector | Mitigation |
|---|---|---|
| Evidence tooling changes after first native result | 20-06 freeze gate | All tooling committed first; source hash drift forces new build/run. |
| A terminal phase output is absent | 20-06 preflight | Exact terminal summary/evidence list; block rather than substitute. |
| Thousands of captures hide omissions | 20-01/04 self-tests | Source-derived exact 172/107/64 registries and one-to-one flows. |
| Parallel device shards corrupt settings/state | wave scheduler | Single-device lease and serialized Waves 5–8 with restore proof. |
| Shard self-awards PASS | 20-05 validator tests | Observation/gate-input schemas only; sole post-checkpoint seal. |
| Accepted exception inflates PASS | 20-01/04/05 adversarial tests | Required metadata, separate count and policy-only conditional readiness. |
| Samsung preference overrides automation | 20-10 checkpoint/record validator | Observation-only schema and post-checkpoint automated validation. |
| Private FIT/workout/device data leaks | first shard verifier | Synthetic fixtures, hashed identity, safe paths and recursive privacy scan. |

## Final Sign-Off

- [ ] All 25 tasks have executable verification; the single human checkpoint is followed by automated record validation.
- [ ] All plans lead with a tracer; all code-producing tasks occur in Plans 20-01–05 before freeze/build.
- [ ] Terminal summaries/evidence for Phases 13–19 are complete and gated exactly.
- [ ] Exact pinned live toolchain matches and full test:all/coverage/evidence gates pass before freeze.
- [ ] One exact artifact/build.json/run is used; no post-freeze source change occurred.
- [ ] All independent shards emit observations/gate inputs only and validate against the same identity.
- [ ] Multi-plan.yaml and library-running.yaml are present, one-to-one mapped, freshly executed and bound.
- [ ] Seven-verdict ledger has 172 rows; accepted exceptions are non-PASS and separately counted.
- [ ] Samsung observation is fresh, owner-attended, automated-record-validated and does not reuse N4.
- [ ] Sole final seal runs after the checkpoint and readiness handoff stops without release action or Terminal Seal.

**Approval:** pending future authorized execution, the Samsung checkpoint and final owner review. This planning document records no runtime pass.
