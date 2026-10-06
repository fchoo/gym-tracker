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

## Mandatory Execution Order

1. **Tooling first:** Plans 20-01 through 20-07 implement, self-test and commit every contract, probe, flow, runner, build-manifest extension, shard validator, final validator, attended utility, readiness generator and package entrypoint. No runtime/native command appears in those plans.
2. **Gate, commit, freeze, build once:** Plan 20-08 gates all terminal Phase 13–19 outputs, selects the exact pinned toolchain, registers every Phase 20 integrity module, runs full `test:all` and coverage, commits the last source change, freezes source, builds one artifact and creates one immutable run/build.json.
3. **Observation shards:** Plans 20-09 through 20-11 change no source. They execute independent SQLite, recovery, FIT, Calendar, multi-plan, Workout, Library/Running, visual, accessibility and performance shards against the same installed bytes.
4. **Human then seal:** Plan 20-12 runs a no-write preseal, stops at a nonautonomous `checkpoint:human-verify`, validates the resulting Samsung record automatically, then invokes the sole final seal and readiness/rollback generator.
5. **Drift rule:** any source, flow, fixture, contract, tool, APK, signature, installed-byte or identity change after freeze invalidates the run. Preserve it and start a new build/run.

## Infrastructure and Exact Preconditions

| Property | Contract |
|---|---|
| Host | Node 24.19.0; npm 11.17.0; Jest 29.7 projects `unit`, `components`, `sqlite-host`, `integration`; RNTL 14.0.1 |
| Android | Java 17.0.20+8; API 36; Build Tools 36.0.0; NDK 27.1.12297006; ADB; Maestro 2.8.0; apksigner; zipalign |
| Source registries | 172 parity rows; 107 ordered browser occurrences; exact 64 AP-SIZE-ORIENTATION-FONT configurations; native-only packs |
| Host/freeze gate | `npm run typecheck && npm run lint && npm run check:boundaries && npm run test:all -- --runInBand && npm run test:coverage -- --runInBand && npm run test:evidence:v12` |
| Native SQLite | `npm run test:sqlite:device -- --suite v1.2-acceptance --manifest "artifacts/native/v1.2/$V12_RUN_ID/build.json"` |
| Native runner | `npm run test:maestro:v12 -- --run "$V12_RUN_ID" --shard <id>` |
| Performance | `npm run benchmark:v12:interactions -- --run "$V12_RUN_ID" --all` |
| Preseal | `npm run verify:v12:evidence -- --run "$V12_RUN_ID" --mode preseal --no-final-write` |
| Sole final seal | `npm run verify:v12:evidence -- --run "$V12_RUN_ID" --mode final`, only after automated attended-record validation |

Any live tool version/path/certificate mismatch blocks. Fast `<automated>` gates validate source or retained artifacts in under 60 seconds; native collection commands are separate.

## Verdict and Identity Rules

- Allowed row verdicts: `PASS`, `FAIL`, `REVIEW_REQUIRED`, `BLOCKED_OWNER`, `CONDITIONAL_EXTERNAL`, `ACCEPTED_EXCEPTION`, `N_A_REVIEWED`.
- `ACCEPTED_EXCEPTION` is non-PASS and separately counted. It requires deviation ID, owner decision/date, exact scope/configurations, rationale and evidence hashes.
- `CONDITIONALLY_READY` is permitted only by an explicit reviewed policy when every remaining non-PASS row is a valid accepted exception. Any `FAIL`, `REVIEW_REQUIRED`, `BLOCKED_OWNER` or `CONDITIONAL_EXTERNAL` prevents it.
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
| 20-03-01 | 2 | VER-10 | FIT contract/shard tests | none | pending |
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
| 20-10-01 | 7 | VER-10 | FIT shard verifier | original FIT/dedupe/match flow | pending |
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
- `18-12-SUMMARY.md`
- `18-13-SUMMARY.md`
- `19-10-SUMMARY.md`

A missing/failed output is an upstream block. Phase 20 must not recreate product behavior, downgrade the requirement or substitute an older phase report.

## Manual and External Gates

| Gate | Scope | Outcome while open | Closure/exception contract |
|---|---|---|---|
| DEV-01 | Calendar geometry/accessibility, VER-03/04 | `BLOCKED_OWNER` | Dated decision plus both-branch evidence; selected deviation or retained failing oracle becomes non-PASS `ACCEPTED_EXCEPTION` with full metadata |
| DEV-02 | CAL-03 and Light visual/accessibility, VER-02/04 | `BLOCKED_OWNER` | Dated decision plus Light/System-Light evidence; selected candidate or retained failing oracle becomes non-PASS `ACCEPTED_EXCEPTION` with full metadata |
| TIM-01 | DOM-03/15/17, WRK-05/18/21–23/26, VER-07/08 | `BLOCKED_OWNER` | Dated policy plus all playback/foreground/callback/relaunch/restore/merge/zero-cue/rest-set-pointer evidence |
| Garmin | GAR-04–07, NV-IMP-11–13 | `CONDITIONAL_EXTERNAL` | Real program access, granted delivery/scope, real consent and reviewed confidential topology |
| Samsung | VER-12 | blocking human checkpoint | Fresh passed/failed observations on unchanged installed bytes; no N4 reuse or authority transfer |
| FIT budget | VER-11 FIT subrow | `REVIEW_REQUIRED` if Phase 18 limit absent | Independently accepted Phase 18 limit object and exact maximum fixture hashes |

## Dependency, Wave and Cohesion Audit

| Wave | Plans | Dependency / ownership |
|---:|---|---|
| 1 | 20-01 | Core source-derived vocabulary/manifest contract. |
| 2 | 20-02, 20-03, 20-04, 20-05 | Disjoint SQLite/recovery, FIT/Calendar, visual/accessibility and performance tooling concerns; no runtime execution. |
| 3 | 20-06 | Generic runner, build-manifest extension and sole final-validator concern after every shard schema exists. |
| 4 | 20-07 | Attended/readiness concern and package entrypoints; completes all tooling commits. |
| 5 | 20-08 | Terminal/pinned/full-suite/coverage gate, source freeze, one build/run. |
| 6 | 20-09 | SQLite and recovery observations under exclusive device/run lease. |
| 7 | 20-10 | FIT and Calendar observations against unchanged bytes. |
| 8 | 20-11 | One-to-one functional reruns, visual/accessibility and performance observations. |
| 9 | 20-12 | No-write preseal, Samsung checkpoint, automated record validation, sole final seal/readiness. |

No same-wave plans share a source path. Runtime plans are serialized because they share one installed artifact, device state and immutable run directory.

- **20-02 (11 files):** one real-Expo storage/recovery evidence boundary. The aggregate route/runner, SQLite schema and lifecycle contracts share one ordered source-case vocabulary; three tasks each touch at most five files. Splitting again would duplicate that interface or create shared-file ordering conflicts.
- **20-03 (10 files):** two five-file FIT and Calendar observation-tooling tasks share the pre-freeze interaction-evidence boundary without sharing modified paths or performing runtime work. Further splitting would add a plan without reducing either task below the five-file ceiling.
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
| REQ | VER-10 | Actual FIT/dedupe/optional facts/explicit match/API gate | 03,10,12 | COVERED |
| REQ | VER-11 | Locked performance and bounded FIT evidence | 05,08,11,12 | COVERED |
| REQ | VER-12 | Owner-attended Samsung observation | 07,12 | COVERED |
| REQ | VER-13 | Signed-personal readiness preparation and rollback | 06–08,12 | COVERED |
| CONTEXT | D20-01 | 172 source-bound rows; no inherited v1.1 evidence | 01,06,11,12 | COVERED |
| CONTEXT | D20-02 | L/D/System, four sizes, orientations, F100/F200, material states | 01,04,11 | COVERED |
| CONTEXT | D20-03 | 48dp/non-color/labels/input/3dp focus/Back/motion/order | 04,11 | COVERED |
| CONTEXT | D20-04 | Real SQLite/portability/lifecycle/FIT/match/history | 02,03,09,10 | COVERED |
| CONTEXT | D20-05 | Calendar intermediate/threshold/cancel/morph/motion | 03,10 | COVERED |
| CONTEXT | D20-06 | Exact budgets and independently bounded FIT evidence | 05,11 | COVERED |
| CONTEXT | D20-07 | Samsung additional observation; later authority only | 07,08,12 | COVERED |
| CONTEXT | D20-08 | Owner/external/exception/conditional-readiness truth | 01,03,04,06,07,10–12 | COVERED |
| RESEARCH | R20-01 | All tooling/probes/flows/validators committed before freeze/build | 01–08 | COVERED |
| RESEARCH | R20-02 | Exact terminal outputs and pinned live toolchain; mismatch blocks | 08 | COVERED |
| RESEARCH | R20-03 | One frozen source/artifact/run; any drift starts a new run | 08–12 | COVERED |
| RESEARCH | R20-04 | Independent observation-only shards and sole post-checkpoint seal | 02–06,09–12 | COVERED |
| RESEARCH | R20-05 | Create/re-execute/bind multi-plan.yaml and library-running.yaml one-to-one | 04,11 | COVERED |
| RESEARCH | R20-06 | Seven verdicts, exception metadata/separate counts/policy | 01,04,06,07,12 | COVERED |
| RESEARCH | R20-07 | Source/APK/signature/device/fixture/config identity and privacy | all | COVERED |
| RESEARCH | R20-08 | Real SQLite/recovery/FIT/Calendar/visual/accessibility/performance | 02–05,09–11 | COVERED |
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
- [ ] DEV-01/DEV-02/TIM-01 remain BLOCKED_OWNER while open; live Garmin remains CONDITIONAL_EXTERNAL.
- [ ] Samsung evidence is fresh observation-only and final handoff stops without release action or Terminal Seal.

**Approval:** pending later authorized execution, Samsung checkpoint and final owner review. This planning artifact records no runtime pass.
