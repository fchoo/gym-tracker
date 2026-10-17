---
phase: 20
slug: native-acceptance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-06
requirements: [VER-01, VER-02, VER-03, VER-04, VER-05, VER-06, VER-07, VER-08, VER-09, VER-10, VER-11, VER-12, VER-13]
automated_gaps: 0
manual_only: 1
external_conditional: 0
---

# Phase 20 — Validation Strategy

> Task-mapped execution contract. Planning ran no product test, build, emulator/device action, Garmin account sync, Samsung observation, signing, release, deployment, Terminal Seal or commit.

## Mandatory Execution Order

1. **Tooling first:** Plans 20-01 through 20-07 implement, self-test and commit every contract, probe, flow, runner, build-manifest extension, shard validator, final validator, attended utility, readiness generator and package entrypoint. No runtime/native command appears in those plans.
2. **Gate, commit, freeze, build once:** Plan 20-08 gates all terminal Phase 13–19 outputs, selects the exact pinned toolchain, registers every Phase 20 integrity module, runs full `test:all` and coverage, commits the last source change, freezes source, builds one artifact and creates one immutable run/build.json.
3. **Observation shards:** Plans 20-09 through 20-11 change no source. They execute independent SQLite, recovery, Garmin, Calendar, multi-plan, Workout, Library/Running, visual, accessibility and performance shards against the same installed bytes.
4. **Human then seal:** Plan 20-12 runs a no-write preseal, stops at a nonautonomous `checkpoint:human-verify`, validates the resulting Samsung record automatically, then invokes the sole final seal and readiness/rollback generator.
5. **Drift rule:** any source, flow, fixture, contract, tool, APK, signature, installed-byte or identity change after freeze invalidates the run. Preserve it and start a new build/run.

## Infrastructure and Exact Preconditions

| Property | Contract |
|---|---|
| Host | Node 24.19.0; npm 11.17.0; Jest 29.7 projects `unit`, `components`, `sqlite-host`, `integration`; RNTL 14.0.1 |
| Android | Java 17.0.20+8; API 36; Build Tools 36.0.0; NDK 27.1.12297006; ADB; Maestro 2.8.0; apksigner; zipalign |
| Source registries | 172 parity rows; 107 ordered browser occurrences; exact 64 AP-SIZE-ORIENTATION-FONT configurations; native-only packs |
| Host/freeze gate | `npm run validate:v12:prebuild && npm run typecheck && npm run lint && npm run check:boundaries && npm run test:all -- --runInBand && npm run test:coverage -- --runInBand && npm run test:evidence:v12` |
| Prebuild predecessor gate | `npm run validate:v12:prebuild` revalidates the exact terminal Phase 13–19 summary, validation, verification-status and authority contracts before any v1.2 source freeze or native generation. |
| Phase 20 and Phase 18 evidence tests | `npm run test:evidence:v12`; its required npm pre-hook runs `test:evidence:v12:all`, which executes the discovered 48-test Phase 20 manifest and 18-test Phase 18 manifest, including `phase18-garmin-proof.test.mjs`. The Phase 20 suites are grouped as contracts, native actions, CLI black-box acceptance, retained-fixture resolver coverage, and retained-fixture visual coverage so no test is omitted or hidden behind a script-name check. |
| Phase 20 integrity coverage | `npm run test:evidence:v12:all` merges canonical V8 coverage from bounded CLI subprocesses and requires 100% statements, branches, functions, and lines for privacy, typed row resolution, time budgets, and the SQLite producer contract. Ten process/filesystem modules are explicitly classified under separately enforced provenance, atomic-publication, verifier/handoff, Calendar transport, Visual streaming, and SQLite CLI gates; their named suites remain mandatory rather than being hidden by coverage ignores. `npm run test:coverage -- --focus-phase20 --runInBand` separately requires the same four exact-100 metrics for six TypeScript acceptance contracts. |
| Phase 18 aggregate coverage | `npm run test:coverage:phase18` runs real Python `coverage.py`, generated-Android Kotlin JaCoCo, the complete Node evidence manifest, and focused Jest integrity coverage. PR CI generates Android before this aggregate gate instead of substituting a script-name or report-presence check. |
| Native SQLite | `npm run test:sqlite:device -- --suite v1.2-acceptance --manifest "artifacts/native/v1.2/$V12_RUN_ID/build.json"` |
| Native runner | `npm run test:maestro:v12 -- --run "$V12_RUN_ID" --shard <id>` |
| Performance | `npm run benchmark:v12:interactions -- --run "$V12_RUN_ID" --all` |
| Preseal | `npm run verify:v12:evidence -- --run "$V12_RUN_ID" --mode preseal --no-final-write` |
| Sole final seal | `npm run verify:v12:evidence -- --run "$V12_RUN_ID" --mode final`, only after automated attended-record validation |

Any live tool version/path/certificate mismatch blocks. Fast `<automated>` gates validate source or retained artifacts in under 60 seconds; native collection commands are separate.

## Verdict and Identity Rules

- Allowed row verdicts: `NOT_RUN`, `PASS`, `FAIL`, `REVIEW_REQUIRED`, `ACCEPTED_EXCEPTION`, `N_A_REVIEWED`.
- `ACCEPTED_EXCEPTION` is non-PASS and separately counted. It requires deviation ID, owner decision/date, exact scope/configurations, rationale and evidence hashes.
- `CONDITIONALLY_READY` is permitted only by an explicit reviewed policy when every remaining non-PASS row is a valid accepted exception. Any `NOT_RUN`, `FAIL`, or `REVIEW_REQUIRED` prevents it.
- Shards emit observations/gate inputs only. `sealV12FinalEvidence` alone maps all 172 verdicts and writes `ui-state-matrix.json`/`final-evidence.json`.
- `build.json` binds HEAD/tree/lockfile, canonical source hashes, exact toolchain, flows/fixtures, package/profile/version, retained/installed APK equality, alignment, signature/certificate, hashed device and measured configuration/restoration.
- Shared focus acceptance is Phase 14's 3dp ring with 3dp exterior offset. Semantic/input checks do not expand scope into live TalkBack or switch-scanning acceptance.

## Per-Task Verification Map

| Task | Wave | Requirements | Automated gate | Runtime/manual evidence | Status |
|---|---:|---|---|---|---|
| 20-01-01 | 1 | VER-01 | evidence-contract tests | none | pending |
| 20-01-02 | 1 | VER-01 | run-manifest tests | none | pending |
| 20-02-01 | 2 | VER-07/08 | aggregate contract + typecheck | none | pending |
| 20-02-02 | 2 | VER-07 | SQLite-shard adversarial tests | none | pending |
| 20-02-03 | 2 | VER-08 | recovery contract/shard tests | none | pending |
| 20-03-01 | 2 | VER-10 | Garmin contract/shard tests | none | pending |
| 20-03-02 | 2 | VER-06/09 | Calendar contract/shard tests | none | pending |
| 20-04-01 | 2 | VER-01/02/03 | one-to-one flow/capture tests | none | pending |
| 20-04-02 | 2 | VER-02/03 | visual comparison/exception tests | none | pending |
| 20-04-03 | 2 | VER-04/05/06 | accessibility contract/shard tests | none | pending |
| 20-05-01 | 2 | VER-11 | benchmark/marker tests | none | pending |
| 20-05-02 | 2 | VER-11 | benchmark/performance-shard tests | none | pending |
| 20-06-01 | 3 | VER-01/13 | runner/build-manifest self-tests | none | pending |
| 20-06-02 | 3 | VER-01/13 | final-validator/verdict/report tests | none | pending |
| 20-07-01 | 4 | VER-12 | attended schema/identity tests | none | pending |
| 20-07-02 | 4 | VER-12/13 | readiness/rollback/package tests | none | pending |
| 20-08-01 | 5 | VER-01/07/11/13 | exact preflight + test:all + coverage + evidence tests | none | pending |
| 20-08-02 | 5 | VER-01/13 | build.json identity verifier | one build/install and immutable run creation | pending |
| 20-09-01 | 6 | VER-07 | SQLite shard verifier | real Expo SQLite aggregate | pending |
| 20-09-02 | 6 | VER-08 | recovery shard verifier | offline/process-death flow | pending |
| 20-10-01 | 7 | VER-10 | Garmin shard verifier | ARM64 packaging plus login/MFA/read/restart/logout/403/429/JSON/dedupe/match flow | pending |
| 20-10-02 | 7 | VER-06/09 | Calendar shard verifier | intermediate gesture/motion flow | pending |
| 20-11-01 | 8 | VER-01 | shards-only exact-map verifier | fresh multi-plan/workout/library-running reruns | pending |
| 20-11-02 | 8 | VER-02–06 | capture/comparison/accessibility verifiers | 107/native-only × applicable 64 configs | pending |
| 20-11-03 | 8 | VER-11 | performance shard verifier | full release-variant raw samples | pending |
| 20-12-01 | 9 | VER-01–11 | no-write preseal + prepared-checklist validation | none | pending |
| 20-12-02 | 9 | VER-12 | blocking human checkpoint after preseal | owner-attended unchanged Samsung observations | pending |
| 20-12-03 | 9 | VER-01–13 | attended validation → sole final seal → handoff validation | no release action | pending |

## Terminal Output Gate

Before Plan 20-08 may freeze/build, require these exact terminal outputs and every validation/evidence artifact they name:

- `13-14-SUMMARY.md`
- `14-11-SUMMARY.md`
- `15-13-SUMMARY.md`
- `16-07-SUMMARY.md`
- `17-14-SUMMARY.md`
- `18-14-SUMMARY.md`
- `19-10-SUMMARY.md`

A missing/failed output is an upstream block. Phase 20 must not recreate product behavior, downgrade the requirement or substitute an older phase report.

## Settled Baselines and Human Gate

| Baseline / gate | Scope | Pending or failing evidence | Passing contract |
|---|---|---|---|
| DEV-01 | Calendar geometry/accessibility, VER-03/04 | `NOT_RUN`/`REVIEW_REQUIRED` before sufficient proof; `FAIL` on mismatch | Adaptive 6–18dp baseline may PASS with native geometry/hit-target evidence |
| DEV-02 | CAL-03 and Light visual/accessibility, VER-02/04 | `NOT_RUN`/`REVIEW_REQUIRED` before sufficient proof; `FAIL` on mismatch | Light `#9B470B` baseline may PASS with native visual/contrast evidence |
| TIM-01 | DOM-03/15/17, WRK-05/18/21–23/26, VER-07/08 | `NOT_RUN`/`REVIEW_REQUIRED` before complete retirement proof; `FAIL` on any cue/recovery regression | All retirement/foreground/callback/relaunch/restore/merge/zero-cue/rest-set-pointer evidence passes |
| Garmin | GAR-04–09, VER-10 | `NOT_RUN`/`REVIEW_REQUIRED` before complete proof; `FAIL` on packaging/auth/read/restart/403/429/JSON/dedupe/match regression | Bundled ARM64 Python/Chaquopy plus deterministic JSON and attended real-account evidence passes |
| Samsung | VER-12 | blocking human checkpoint | Fresh passed/failed observations on unchanged installed bytes; no N4 reuse or authority transfer |
| Garmin sync budget | VER-11 Garmin subrow | `REVIEW_REQUIRED` if Phase 18 limit absent | Independently fixed Phase 18 limit object and exact maximum fixture hashes |

## Dependency, Wave and Cohesion Audit

| Wave | Plans | Dependency / ownership |
|---:|---|---|
| 1 | 20-01 | Core source-derived vocabulary/manifest contract. |
| 2 | 20-02, 20-03, 20-04, 20-05 | Disjoint SQLite/recovery, Garmin/Calendar, visual/accessibility and performance tooling concerns; no runtime execution. |
| 3 | 20-06 | Generic runner, build-manifest extension and sole final-validator concern after every shard schema exists. |
| 4 | 20-07 | Attended/readiness concern and package entrypoints; completes all tooling commits. |
| 5 | 20-08 | Terminal/pinned/full-suite/coverage gate, source freeze, one build/run. |
| 6 | 20-09 | SQLite and recovery observations under exclusive device/run lease. |
| 7 | 20-10 | Garmin and Calendar observations against unchanged bytes. |
| 8 | 20-11 | One-to-one functional reruns, visual/accessibility and performance observations. |
| 9 | 20-12 | No-write preseal, Samsung checkpoint, automated record validation, sole final seal/readiness. |

No same-wave plans share a source path. Runtime plans are serialized because they share one installed artifact, device state and immutable run directory.

- **20-02 (11 files):** one real-Expo storage/recovery evidence boundary. The aggregate route/runner, SQLite schema and lifecycle contracts share one ordered source-case vocabulary; three tasks each touch at most five files. Splitting again would duplicate that interface or create shared-file ordering conflicts.
- **20-03 (10 files):** two five-file Garmin and Calendar observation-tooling tasks share the pre-freeze interaction-evidence boundary without sharing modified paths or performing runtime work. Further splitting would add a plan without reducing either task below the five-file ceiling.
- **20-04 (12 files):** one native presentation-evidence boundary. Exact cross-phase flow mapping, capture/comparison and accessibility semantics share the 107-state/64-configuration registry; three tasks each touch at most five files. Runtime cannot parallelize on one device, so further plan splitting provides no safe execution gain.
- All other plans modify fewer than ten source/artifact paths. Every task touches at most five files.

## Multi-Source Coverage Audit

| Source | ID | Feature / constraint | Plans | Status |
|---|---|---|---|---|
| GOAL | — | Complete source-bound native parity/data/accessibility/recovery/offline/performance evidence before release decision | 01–12 | COVERED |
| REQ | VER-01 | Exact inventory/route/interaction/state mapping | 01,04,06,08,11,12 | COVERED |
| REQ | VER-02 | Light/Dark/System screenshot comparison | 04,11,12 | COVERED |
| REQ | VER-03 | Four portrait/landscape sizes and four roots | 04,11,12 | COVERED |
| REQ | VER-04 | F200, 48dp, semantics and non-color state | 04,11,12 | COVERED |
| REQ | VER-05 | Keyboard/D-pad/focus/Back/restoration | 04,11,12 | COVERED |
| REQ | VER-06 | Reduced-motion semantic equivalence | 03,04,10–12 | COVERED |
| REQ | VER-07 | Real SQLite migration/portability/idempotency/history | 02,08,09,12 | COVERED |
| REQ | VER-08 | Offline/process-death boundaries | 02,09,12 | COVERED |
| REQ | VER-09 | Native Calendar intermediate gestures | 03,10,12 | COVERED |
| REQ | VER-10 | Bundled ARM64 Python/native packaging, real login/MFA/read/restart/logout, 403/429, JSON fidelity/dedupe and explicit matching | 03,10,12 | COVERED |
| REQ | VER-11 | Locked performance and bounded Garmin sync evidence | 05,08,11,12 | COVERED |
| REQ | VER-12 | Owner-attended Samsung observation | 07,12 | COVERED |
| REQ | VER-13 | Signed-personal readiness preparation and rollback | 06–08,12 | COVERED |
| CONTEXT | D20-01 | 172 source-bound rows; no inherited v1.1 evidence | 01,06,11,12 | COVERED |
| CONTEXT | D20-02 | L/D/System, four sizes, orientations, F100/F200, material states | 01,04,11 | COVERED |
| CONTEXT | D20-03 | 48dp/non-color/labels/input/3dp focus/Back/motion/order | 04,11 | COVERED |
| CONTEXT | D20-04 | Real SQLite/portability/lifecycle/Garmin sync/match/history | 02,03,09,10 | COVERED |
| CONTEXT | D20-05 | Calendar intermediate/threshold/cancel/morph/motion | 03,10 | COVERED |
| CONTEXT | D20-06 | Exact budgets and independently bounded Garmin JSON sync evidence | 05,11 | COVERED |
| CONTEXT | D20-07 | Samsung additional observation; later authority only | 07,08,12 | COVERED |
| CONTEXT | D20-08 | Settled MAP/TIM/DEV/Garmin baselines plus technical verdict/exception/readiness truth | 01,03,04,06,07,10–12 | COVERED |
| RESEARCH | R20-01 | All tooling/probes/flows/validators committed before freeze/build | 01–08 | COVERED |
| RESEARCH | R20-02 | Exact terminal outputs and pinned live toolchain; mismatch blocks | 08 | COVERED |
| RESEARCH | R20-03 | One frozen source/artifact/run; any drift starts a new run | 08–12 | COVERED |
| RESEARCH | R20-04 | Independent observation-only shards and sole post-checkpoint seal | 02–06,09–12 | COVERED |
| RESEARCH | R20-05 | Create/re-execute/bind multi-plan.yaml and library-running.yaml one-to-one | 04,11 | COVERED |
| RESEARCH | R20-06 | Six verdicts, exception metadata/separate counts/policy | 01,04,06,07,12 | COVERED |
| RESEARCH | R20-07 | Source/APK/signature/device/fixture/config identity and privacy | all | COVERED |
| RESEARCH | R20-08 | Real SQLite/recovery/Garmin/Calendar/visual/accessibility/performance | 02–05,09–11 | COVERED |
| RESEARCH | R20-09 | Shared 3dp focus; no live TalkBack/switch expansion | 04,11 | COVERED |
| RESEARCH | R20-10 | Observation-only Samsung and compatible rollback/readiness stop | 07,12 | COVERED |
| EXCLUDED | Deferred | Public release ceremony, Terminal Seal, store distribution, Wear OS, Health Connect | — | EXCLUDED |
| EXCLUDED | Boundary | Product fixes during evidence run | — | EXCLUDED — fail row, retain run, repair owning Phase 13–19, rebuild/new run |

No source-audit item is missing.

## Final Sign-Off

- [ ] All 28 tasks are mapped; the one human checkpoint is followed by automated record validation.
- [ ] Every plan leads with a tracer and every task touches at most five files.
- [ ] The three 10–14-file plans retain explicit cohesion rationale; all others stay below ten files.
- [ ] All code/tooling work is committed before the exact terminal/toolchain/full-suite/coverage/freeze/build gate.
- [ ] One exact artifact/build.json/run is used and any post-freeze drift creates a new run.
- [ ] Every shard emits observations/gate inputs only; only the post-Samsung final task seals verdicts.
- [ ] `multi-plan.yaml` and `library-running.yaml` are source-mapped one-to-one, freshly rerun and bound.
- [ ] ACCEPTED_EXCEPTION remains separately counted non-PASS and conditional readiness remains policy-bound.
- [ ] DEV-01/DEV-02/TIM-01 and the self-contained Garmin route are measured as required baselines; missing evidence is NOT_RUN/REVIEW_REQUIRED, failures are FAIL, and successful implementations may PASS.
- [ ] Samsung evidence is fresh observation-only and final handoff stops without release action or Terminal Seal.

**Approval:** pending later authorized execution, Samsung checkpoint and final owner review. This planning artifact records no runtime pass.
