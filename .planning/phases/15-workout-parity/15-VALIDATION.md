---
phase: 15-workout-parity
status: planned
nyquist: true
wave_0_complete: false
requirements: [WRK-01, WRK-02, WRK-03, WRK-04, WRK-05, WRK-06, WRK-07, WRK-08, WRK-09, WRK-10, WRK-11, WRK-12, WRK-13, WRK-14, WRK-15, WRK-16, WRK-17, WRK-18, WRK-19, WRK-20, WRK-21, WRK-22, WRK-23, WRK-24, WRK-25, WRK-26, WRK-27, WRK-28, WRK-29, WRK-30, WRK-31, WRK-32, WRK-33, WRK-34, WRK-35, WRK-36]
plans: [15-01, 15-02, 15-03, 15-04, 15-05, 15-06, 15-07, 15-08, 15-09, 15-10, 15-11, 15-12, 15-13]
---

# Phase 15 Validation Contract

This is the executable validation map for Phase 15. It maps every plan task to a narrow automated check, the final fresh-native backstop, and one canonical workout.* evidence ID. It records planned proof only; no application test, build, device mutation, evidence capture, or release has run while creating this file.

## Phase gate

Phase 15 passes only when all of the following are true:

1. Phase 13 and Phase 14 execution summaries required by 15-01 exist and their verification gates passed. Phase 15 must consume their exact selected-occurrence, shell, token, overlay, toast, focus, and settings contracts rather than recreate them.
2. 15-01 proves a real Phase 13 occurrence from Workout through Active/recovery and exports a command-free facts presenter that Phase 16 can consume without constructing any mutation capability.
3. All Workout-root and overlay consumers use the canonical Phase 14 74dp bottom navigation plus safe area and 82% available-height sheet cap; no Phase 15-local geometry variant exists.
4. TIM-01 characterization passes and the owner records exactly retire-playback or retain-compatibility at the blocking-human checkpoint. retain-compatibility blocks Phase 15 cutover; silence, auto-advance, or prototype appearance cannot close the gate.
5. Every implementation task's focused test passes, followed by npm run typecheck, npm run lint, npm run check:boundaries, npm run test:all -- --runInBand, and npm run test:coverage -- --runInBand under Node 24.19.0/npm 11.17.0.
6. Every changed integrity-critical domain/repository/runtime module has complete branch coverage. Presentation-only geometry is covered by component and native evidence without weakening the integrity gate.
7. npm run verify:cng passes from a clean tracked tree; one fresh Phase 15 dev-test APK is built and retained; its manifest binds HEAD, source digest, package, APK hash, installed bytes, device/API/ABI, and evidence reports.
8. The native matrix covers Light, Dark, System-to-both appearances; all seven UI-SPEC viewport/orientation rows; 100%/200% text; touch, keyboard, D-pad, semantic activation; standard/reduced motion; all nine metric editor profiles; root/Active/rest/edit/outcome/completion failures; background/process death/offline restart; notification denial; long names/lists; and the accepted TIM-01 branch. Accessibility is gated by the native semantic tree, exact labels/roles/states/actions, focus order/restoration, target bounds, and keyboard/D-pad traces; a live TalkBack run is optional supplementary evidence.
9. Native performance measures the actual rendered compact-dock to rest-dock transition plus representative long-session work with at least 100 valid samples, p95 no greater than 150ms, and ordinary Active Workout JS task no greater than 50ms.
10. node scripts/verify-phase15-evidence.mjs --manifest artifacts/native/phase15/build.json --all accepts exactly one passed evidence set for each canonical ID and rejects missing, duplicate, skipped, failed, stale, identity-mismatched, unmapped, or privacy-unsafe rows. It recomputes the pinned approved JSON/HTML/source-manifest/reference hashes and verifies every native screenshot, overlay, and difference SHA-256 plus its derivation inputs.
11. Phase 15 evidence and diagnostics contain codes, versions, counts, hashes, bounded timings, and opaque scoped IDs only. No workout rows, exercise/set values, owner notes, filenames, or raw payloads are emitted.
12. Every executor commit is atomic and ends with the exact trailer required by .trae/rules/rules.md: Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>.

## Task-to-validation map

| Plan task | Behavior under change | Narrow automated proof | Native / artifact backstop | Requirement / evidence |
|---|---|---|---|---|
| 15-01-01 | Exact Phase 13 occurrence start/resume/read retry/Back | root route component tests plus today-schedule integration | process-death selected-occurrence journey | WRK-01,05,08 / root-identity, start-resume, active-back |
| 15-01-02 | Immutable facts presenter, one list, sole edge, row states | WorkoutSessionPresentation plus Active component tests | Active overview Light/Dark/long-list capture | WRK-07,09-11 / active-layout, disclosure, active-indicator, set-states |
| 15-01-03 | Phase 16 command-free reuse boundary | presenter structural tests plus check:boundaries | read-only fixture semantic trace with zero command calls | cross-phase / readonly-presentation |
| 15-02-01 | Legacy timing byte/state/callback/recovery characterization | advanced timing unit/runtime, today integration, restore/merge SQLite tests | TIM evidence matrix bound to source hash | WRK-23,26 / timing-compatibility |
| 15-02-02 | Owner TIM-01 choice | exact decision record parser plus human review | owner disposition/evidence hash in verifier | TIM-01 / timing-policy |
| 15-02-03 | Approved zero-hidden-playback branch with rest intact | runtime/timing/today/rest tests | foreground, queued callback, relaunch, restore, merge and rest-cue traces | WRK-23,25,26 / timing-retirement |
| 15-03-01 | Approved scheduled Workout root and exact Start/Resume | Today/index component tests | scheduled root and recovered root captures | WRK-01,02,05 / root-identity, day-switch, start-resume |
| 15-03-02 | Rest/no-plan/start alternatives/Running context/failures | Today/start-sheet/index component tests | root-state and contextual-navigation journey | WRK-03,04,06 / scheduled-rest-empty, start-alternate, context-running |
| 15-03-03 | Day selector keyboard/focus/responsive/200% | selector/Today component table | seven-width input/focus/200% matrix | WRK-02,04 / day-switch, start-alternate |
| 15-04-01 | Row tap and explicit Save/cancel boundary | editor/row/Active component tests | load-reps keyboard Save/cancel trace | WRK-12,13 / row-edit, load-reps-editor |
| 15-04-02 | All nine metric profiles and timed/fixed/interval units | editor/profile/domain/cross-profile suites | one native editor case per profile | WRK-13-15 / editor profile IDs |
| 15-04-03 | Failure/retry/focus/no timing UI | editor/Active plus boundary tests | injected save/refresh failure and accessibility tree | WRK-12,15,25 / row-edit, all-metrics, exercise-menu |
| 15-05-01 | Compact Add/Complete, held commit, replay | dock/Active plus complete-set integration | commit-crash window and duplicate-tap trace | WRK-18,19 / complete-commit, complete-failure |
| 15-05-02 | Warm-up order/ordinals/Add set/progress/rest exclusion | Active/dock plus cross-profile/complete integration | W1/W2 and 01/02 transition capture | WRK-16,17,20 / warmup-order, add-set, completion-collapse |
| 15-05-03 | Failure preserves values; final commit collapse/reveal | dock/Active/complete-set tests | final exercise transition standard/reduced motion | WRK-19,20 / complete-failure, completion-collapse |
| 15-06-01 | Plan-scoped rest/increment read/write/restart/conflict | preference unit/runtime/SQLite tests | settings relaunch/source digest | WRK-26,27 / timing-flat, plan-increment |
| 15-06-02 | Preference backup/restore/merge/remap/replay | restore and portable-merge SQLite tests | clean restore and merge source digest | WRK-26,27 / preference-portability |
| 15-06-03 | Revision-fenced exercise default_rest_seconds plus preference/source isolation | session-exercise/rest integration plus preference/SQLite digests | stale/retry/reload and active-rest invariance | WRK-26,27 / timing-flat, preference-noninterference |
| 15-07-01 | Full mutually exclusive rest dock and four controls | RestDock/Active/rest integration | running/paused/expired/skip captures | WRK-21,22 / rest-dock, rest-controls |
| 15-07-02 | Deadline/pause/cues recovery and exercise-override/plan-default resolution for later rest | lifecycle/notification/rest integration suites | background/process-death/offline/denial plus active-rest invariance | WRK-23,26 / rest-recovery, timing-flat |
| 15-07-03 | Exercise/plan saved-draft-pending-failure-retry-reload plus preference-to-editor integration | Plan settings/editor/Active and edit/rest integration | 200% keyboard/focus, stale reload, and injected-write failure | WRK-26-28 / timing-flat, plan-increment, plan-after-workout |
| 15-08-01 | Global searchable Add exercise picker | Active/route/command/edit integration | add loading/empty/error/retry/cancel journey | WRK-29 / add-exercise |
| 15-08-02 | Replace compatibility, two-step Delete, 8dp reorder | Active/command/edit integration | drag cancel, Move up/down, history-preserved delete | WRK-30-32 / replace, delete, reorder |
| 15-08-03 | Contextual Undo and committed-refresh recovery | Active/route/complete/edit integration | Undo window, rest reconciliation and reload trace | WRK-33 / undo |
| 15-09-01 | Comparable six-session Recent/Best/Change trend | metricHistory unit plus trend/Active components | accessible chart/table and empty state | WRK-24 / trend |
| 15-09-02 | Exact menu separation and deferred real editor navigation | Active/route components | focus order, three-item menu and post-session editor journey | WRK-25,28 / exercise-menu, plan-after-workout |
| 15-10-01 | Commit-gated finish and completion navigation | Active/completion route/outcome/integration | held/failure/unknown/success finish journey | WRK-34 / outcomes |
| 15-10-02 | Partial/later/zero/discard and factual completion review | Active/completion/route/outcome integration | all outcome confirmations/failures plus complete/partial captures | WRK-34,35 / outcomes, completion-review |
| 15-10-03 | Domain-produced default-No write-back rows/apply/no-difference | plan-impact unit/component/integration | long all-profile preview, stale/retry/no-difference | WRK-36 / completion-writeback |
| 15-11-01 | Exact identity-bound evidence ledger/runner/verifier tracer | evidence mutation self-tests | declared full current-APK root-to-completion journey | WRK-01-36 / all |
| 15-11-02 | Complete coverage, semantic, privacy, TIM, and visual hash-chain verifier | evidence mutation self-tests | pinned inputs plus native/overlay/difference output schema | WRK-01-36 / all |
| 15-12-01 | Executable root-to-completion native flow and visual derivation | native-matrix/verifier self-tests | one current-APK root-to-completion journey | WRK-01-36 / all |
| 15-12-02 | Full native UI/accessibility/recovery matrix | native-matrix/verifier self-tests | all required device configurations/cases | WRK-01-36 / all |
| 15-13-01 | Actual rendered dock and long-session benchmark | benchmark unit/self-tests | raw current-device samples and percentiles | WRK-01,05,07,18,20,21,23,32,34-36 / performance |
| 15-13-02 | Complete source/native/visual/semantic/recovery/performance gate | final verifier after full action sequence | fresh exact-HEAD APK and complete evidence set | WRK-01-36 / all |

## Canonical evidence ledger

| Evidence ID | Requirement | Primary owner | Required evidence classes |
|---|---|---|---|
| workout.root-identity | WRK-01 | 15-01, 15-03, 15-12 | route/component, native screenshot/semantic, source identity |
| workout.day-switch | WRK-02 | 15-03, 15-12 | component keyboard/zero-write, native focus |
| workout.scheduled-rest-empty | WRK-03 | 15-03, 15-12 | component states, native captures |
| workout.start-alternate | WRK-04 | 15-03, 15-12 | sheet/focus/zero-write, native journey |
| workout.start-resume | WRK-05 | 15-01, 15-03, 15-12 | route/integration, process-death native |
| workout.context-running | WRK-06 | 15-03, 15-12 | independent-schedule component/route/native |
| workout.active-layout | WRK-07 | 15-01, 15-12 | presenter/Active component, long-list native |
| workout.active-back | WRK-08 | 15-01, 15-12 | route zero-write, native Back/focus |
| workout.exercise-disclosure | WRK-09 | 15-01, 15-12 | stable-ID component, keyboard/native |
| workout.active-indicator | WRK-10 | 15-01, 15-12 | component color+semantic, native overlay |
| workout.set-states | WRK-11 | 15-01, 15-12 | row component, native state captures |
| workout.row-edit | WRK-12 | 15-04, 15-12 | explicit-Save/cancel component/native |
| workout.load-reps-editor | WRK-13 | 15-04, 15-12 | domain/component, native input |
| workout.duration-editor | WRK-14 | 15-04, 15-12 | domain/component, native minus/plus five |
| workout.all-metrics | WRK-15 | 15-04, 15-12 | all-profile unit/integration/native |
| workout.warmup-order | WRK-16 | 15-05, 15-12 | component/integration/native |
| workout.add-set | WRK-17 | 15-05, 15-12 | scoped menu/component/integration |
| workout.complete-commit | WRK-18 | 15-05, 15-12 | held-commit/replay, native crash window |
| workout.complete-failure | WRK-19 | 15-05, 15-12 | rollback/retry component/native |
| workout.completion-collapse | WRK-20 | 15-05, 15-12 | authoritative reveal/reduced-motion native |
| workout.rest-dock | WRK-21 | 15-07, 15-12 | component geometry/native |
| workout.rest-controls | WRK-22 | 15-07, 15-12 | command/unit/component/native |
| workout.rest-recovery | WRK-23 | 15-02, 15-07, 15-12 | lifecycle/notification/native |
| workout.trend | WRK-24 | 15-09, 15-12 | domain/component/chart semantics/native |
| workout.exercise-menu | WRK-25 | 15-08, 15-09, 15-12 | exact menu/accessibility/native |
| workout.timing-flat | WRK-26 | 15-02, 15-06, 15-07, 15-12 | exercise command/preference/TIM/rest/component/native |
| workout.plan-increment | WRK-27 | 15-06, 15-07, 15-12 | preference/portability/editor-stepper/native |
| workout.plan-after-workout | WRK-28 | 15-07, 15-09, 15-12 | route guard/native journey |
| workout.add-exercise | WRK-29 | 15-08, 15-12 | command/integration/picker/native |
| workout.replace-exercise | WRK-30 | 15-08, 15-12 | compatibility/history integration/native |
| workout.delete-exercise | WRK-31 | 15-08, 15-12 | two-step/history source digest/native |
| workout.reorder | WRK-32 | 15-08, 15-12 | exact-membership/cancel/a11y/native |
| workout.undo | WRK-33 | 15-08, 15-12 | source/rest recovery/native toast |
| workout.outcomes | WRK-34 | 15-10, 15-12 | command/integration/native failures |
| workout.completion-review | WRK-35 | 15-10, 15-12 | route/component/native complete/partial |
| workout.completion-writeback | WRK-36 | 15-10, 15-12 | domain/token/integration/native preview |

Cross-cutting evidence IDs required by the verifier:

- workout.readonly-presentation — Phase 16 adapter renders facts with zero mutation capabilities/calls.
- workout.timing-policy — fresh TIM-01 characterization, exact owner choice, selected branch, retained source digests.
- workout.accessibility — 48dp, native semantic-tree labels/roles/states/actions, focus order/return, 200% text, keyboard/D-pad, and reduced motion; live TalkBack is optional supplementary evidence.
- workout.appearance — Light/Dark/System and Revision 18 390x844 native overlay results.
- workout.offline-recovery — root/Active/rest/edit/outcome/completion process-death and offline lifecycle.
- workout.performance — exact sample count/raw percentiles/rendered transition/long-session metrics.

### Pinned visual inputs and required derived hashes

| Artifact | Required SHA-256 / rule |
|---|---|
| Revision 18 approved.json | b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf |
| approved-hybrid.html | b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96 |
| source-manifest.json | 90de9f6040f36dc029b97ad3687d0e3569fd9bc33ad3eaab2cafc649ae1196a4 |
| Light/Dark Workout root references | 513173987c6b29d370f5428e3226608a795d48cdf5a9c258a8624dd2bed0ad2d / ffd8cf979d3ba679cc744e58a91d30d7bd34cda055fc0bff5ae8c09d886de301 |
| Light/Dark Active overview references | 0c40bbb3555550653d89ee517df29c882269cf92d58b95487512e9e6dfde5b18 / aa2b56418d8cc13446fdfc0bef8ce6c1c8d7fff5bbad3ff9530c709fe4d9b61f |
| Light/Dark committed-rest references | 09aa4b4bda47451d35be6316b769a03fd70b5736ec4c7842ad1399015f47253b / 5d7a7035df19c63feedc0b400453c57c79b9ec3a1f8e51727807b867924bd0d7 |
| Native screenshot / overlay / difference | Every case records full SHA-256 values; overlay/difference metadata binds both the pinned reference hash and native screenshot hash. |

## Wave and file-ownership validation

| Wave | Plans | Dependency reason | Same-wave overlap verdict |
|---|---|---|---|
| 1 | 15-01 | Phase tracer proves occurrence and presenter boundary | one plan |
| 2 | 15-02, 15-03 | TIM/runtime files versus Workout-root files | no overlap |
| 3 | 15-04, 15-06 | Active editor files versus preference/runtime/portability files | no overlap |
| 4 | 15-05 | Requires explicit editor before dock completion | one plan |
| 5 | 15-07 | Requires dock and persisted preferences | one plan |
| 6 | 15-08 | Shared Active controller after rest/settings | one plan |
| 7 | 15-09 | Shared Active controller after edit/menu ownership | one plan |
| 8 | 15-10 | Shared Active/outcome/completion after secondary actions | one plan |
| 9 | 15-11 | Ledger/verifier freezes complete acceptance and hash contracts after implementation | one plan |
| 10 | 15-12 | Native flows consume the completed ledger/verifier | one plan |
| 11 | 15-13 | Performance and final current-APK execution consume completed native flows | one plan |

No same-wave plans share a files_modified path. Every later plan that shares ActiveWorkoutScreen, runtime, route, or tests has an explicit dependency chain.

## Goal-backward reachability

| Observable truth | Required artifact/path | Reachability proof |
|---|---|---|
| Owner orients/starts/resumes exact real workout | Phase 13 occurrence → TodayRoute → Workout root → start/resume transaction | 15-01/03 route and plan-switch/process-death cases |
| Owner scans/edits/completes every set safely | WorkoutSessionView → facts presenter → editor/dock → command → committed view | 15-01/04/05 held-commit and all-profile cases |
| Owner rests/restarts offline safely | persisted rest → runtime lifecycle → RestDock/notification projection | 15-07 lifecycle/native cases |
| Owner edits session composition without history loss | picker/menu/reorder → receipt command → authoritative reload | 15-08 canonical source/history digests |
| Owner sees factual trend/completion and controls future plan changes | metric history/completion facts → projections → default-No token-bound apply | 15-09/10 domain/component/integration proof |
| Calendar can reuse Active-shaped facts without authority | SessionDetail/planned adapter → WorkoutSessionPresentation only | 15-01 structural zero-capability proof |

## Multi-source coverage audit

### Goal

| SOURCE | ID | Feature / constraint | Plan(s) | Status | Notes |
|---|---|---|---|---|---|
| GOAL | — | Orient, start/resume, edit, complete, recover and finish a Strength workout through the approved scan-first experience without losing committed facts/offline guarantees | 15-01..15-13 | COVERED | Tracer, expansions, ledger, native flows, and final gate cover the complete outcome. |

### Requirements

| SOURCE | ID | Feature / requirement | Plan(s) | Status |
|---|---|---|---|---|
| REQ | WRK-01 | Real identity, summary, full preview, primary Start/Resume | 15-01,03,12 | COVERED |
| REQ | WRK-02 | Real day preview selection without schedule mutation | 15-03,12 | COVERED |
| REQ | WRK-03 | Scheduled/rest/no-plan/start-empty truth | 15-03,12 | COVERED |
| REQ | WRK-04 | Scheduled/alternate/empty choices and focus return | 15-03,12 | COVERED |
| REQ | WRK-05 | Exact occurrence/session start/resume/recovery/retry | 15-01,03,12 | COVERED |
| REQ | WRK-06 | Running View plan/Sync Garmin context | 15-03,12 | COVERED |
| REQ | WRK-07 | Full scan-first Active list/identity/progress | 15-01,12 | COVERED |
| REQ | WRK-08 | Back preserves active session/context | 15-01,12 | COVERED |
| REQ | WRK-09 | Stable disclosure, names, separate trend/menu | 15-01,09,12 | COVERED |
| REQ | WRK-10 | Sole active edge and no second stripe | 15-01,12 | COVERED |
| REQ | WRK-11 | Set/Previous/Target-or-Result/State truth | 15-01,12 | COVERED |
| REQ | WRK-12 | Any row opens explicit-Save editor | 15-04,12 | COVERED |
| REQ | WRK-13 | Load/reps input, steppers, validation, Save labels | 15-04,12 | COVERED |
| REQ | WRK-14 | Duration-only sec editor and five-second controls | 15-04,12 | COVERED |
| REQ | WRK-15 | All nine metric profiles | 15-04,12 | COVERED |
| REQ | WRK-16 | Warm-up-first independent ordinals/progress | 15-05,12 | COVERED |
| REQ | WRK-17 | Exact Add warm-up/working menu and ordering | 15-05,12 | COVERED |
| REQ | WRK-18 | Compact Add/Complete, pending and duplicate suppression | 15-05,12 | COVERED |
| REQ | WRK-19 | Save failure preserves values/current row and retry | 15-05,12 | COVERED |
| REQ | WRK-20 | Final commit collapse/reveal; warm-up no rest | 15-05,12 | COVERED |
| REQ | WRK-21 | Full mutually exclusive rest dock | 15-07,12 | COVERED |
| REQ | WRK-22 | Ordered rest controls/bounds/no set completion | 15-07,12 | COVERED |
| REQ | WRK-23 | Rest deadline/pause/cues lifecycle recovery | 15-02,07,12 | COVERED |
| REQ | WRK-24 | Comparable six-session trend/chart/empty | 15-09,12 | COVERED |
| REQ | WRK-25 | Exact exercise menu; separate trend | 15-02,08,09,12 | COVERED |
| REQ | WRK-26 | Flat sec timing/preferences; no cadence authoring | 15-02,06,07,12 | COVERED |
| REQ | WRK-27 | Saved 1.25/2.5/5 increment without target rewrite | 15-06,07,12 | COVERED |
| REQ | WRK-28 | Real post-workout plan editor route | 15-07,09,12 | COVERED |
| REQ | WRK-29 | Global searchable Add exercise picker/retry | 15-08,12 | COVERED |
| REQ | WRK-30 | Compatible Replace with history preservation | 15-08,12 | COVERED |
| REQ | WRK-31 | Two-step Delete with safe protected history/pointer | 15-08,12 | COVERED |
| REQ | WRK-32 | 8dp drag, cancel, Move up/down, stable identity | 15-08,12 | COVERED |
| REQ | WRK-33 | Contextual Undo/edit-removal recovery | 15-08,12 | COVERED |
| REQ | WRK-34 | Finish/partial/later/zero-set/discard and retries | 15-10,12 | COVERED |
| REQ | WRK-35 | Factual completion/partial/results/effort/retry | 15-10,12 | COVERED |
| REQ | WRK-36 | Explicit default-No factual plan write-back | 15-10,12 | COVERED |

### Context decisions

| SOURCE | ID | Decision | Plan(s) | Status | Notes |
|---|---|---|---|---|---|
| CONTEXT | D15-01 | Editorial real-identity Workout root; Running/Garmin contextual | 15-01,03 | COVERED | Exact Phase 13 occurrences only. |
| CONTEXT | D15-02 | One vertical Active list; header target ownership | 15-01,09 | COVERED | One scroll owner and separate targets. |
| CONTEXT | D15-03 | Sole 4dp active edge; amber current; no row stripe | 15-01,12 | COVERED | Component plus native overlay. |
| CONTEXT | D15-04 | Warm-up-first W ordinals, working-only progress/rest | 15-05 | COVERED | Separate commands and tests. |
| CONTEXT | D15-05 | Row-tap explicit Save; committed acknowledgement/failure values | 15-04,05 | COVERED | All-nine and held-commit proof. |
| CONTEXT | D15-06 | Compact Add/Complete; full replacement rest dock | 15-05,07 | COVERED | Mutually exclusive dock states. |
| CONTEXT | D15-07 | Final-commit collapse; dock-safe toast; accessible reorder | 15-05,08 | COVERED | Stable-ID source transitions. |
| CONTEXT | D15-08 | Exact flat menu; no cadence/nested timing/cue UI | 15-02,04,07,09 | COVERED | Runtime cut remains separately gated. |
| CONTEXT | D15-09 | Preserve edits/recovery/outcomes/completion/default-No write-back | 15-08,10 | COVERED | Existing domain/storage owners retained. |
| CONTEXT | TIM-01 | Preserve timing facts/recovery; owner-gate hidden runtime retirement | 15-02,11 | COVERED | blocking-human; retain option blocks cutover. |

### Research features and constraints

| SOURCE | ID | Feature / constraint | Plan(s) | Status | Notes |
|---|---|---|---|---|---|
| RESEARCH | R15-01 | Strangler refactor; preserve proven repositories/commands | all | COVERED | UI/domain work follows exact analog map. |
| RESEARCH | R15-02 | Phase 13 exact occurrence/start/provenance prerequisite | 15-01,03 | COVERED | Precondition and tracer. |
| RESEARCH | R15-03 | Phase 14 shell/token/overlay/toast/focus prerequisite | 15-01,03,04,07-10 | COVERED | No local design-system fork. |
| RESEARCH | R15-04 | Facts-only presentation for Phase 16 | 15-01 | COVERED | Type-level zero mutation capability. |
| RESEARCH | R15-05 | Explicit editor draft and one Save boundary | 15-04 | COVERED | Blur-as-save removed. |
| RESEARCH | R15-06 | Commit-result-driven success/effects | 15-05,08,10 | COVERED | Held-commit/replay/unknown cases. |
| RESEARCH | R15-07 | Durable rest, disposable OS projection | 15-07 | COVERED | Lifecycle/notification proof. |
| RESEARCH | R15-08 | Reorder preview versus exact commit | 15-08 | COVERED | 8dp/cancel/accessible parity. |
| RESEARCH | R15-09 | Typed plan-scoped preferences, revision-fenced exercise rest, and ordered editor/rest integration | 15-06,07 | COVERED | Stable plan identity/remap; weightIncrementGrams stepper; exercise override then plan default; active-rest invariance. |
| RESEARCH | R15-10 | Comparable source-based trend | 15-09 | COVERED | No formatted-string comparison. |
| RESEARCH | R15-11 | Domain-produced write-back rows/token | 15-10 | COVERED | All-profile/no-difference/stale proof. |
| RESEARCH | R15-12 | Fresh exact-identity native/accessibility/privacy evidence | 15-11,12 | COVERED | Ledger/verifier and native flows are separate; historical/browser artifacts are inputs only. |
| RESEARCH | R15-13 | Actual rendered performance gates and long-session measurement | 15-13 | COVERED | 100 samples, p95/JS thresholds, final exact-APK gate. |
| RESEARCH | R15-14 | No package addition/upgrade | all | COVERED | No install task exists. |

Deferred/excluded items are not gaps: Calendar month/focus belongs to Phase 16; Running authoring to Phase 17; FIT/provider transport to Phase 18; Progress analytics to Phase 19; in-app run recording, cadence/per-rep authoring, nested timing, and new progression logic are explicitly out of scope. Legacy timing facts/recovery are retained rather than deferred.

## Pre-mortem controls

| Likely failure | Earliest detector | Planned mitigation |
|---|---|---|
| Selected day starts whichever plan later appears active | 15-01 route/integration tracer | Carry complete Phase 13 occurrence envelope and test a plan switch before commit. |
| UI claims set/outcome success before SQLite commit | held-commit tests in 15-05/10 | Apply only authoritative result/view; effects only for committed. |
| Explicit editor still writes on blur/dismiss | 15-04 editor/row tests | Sheet-local draft; Save is sole command boundary. |
| Hidden timing callbacks emit cues after UI removal | 15-02 characterization before blocking-human gate | Enumerate every runtime cut point; zero-cue lifecycle proof; retain option blocks cutover. |
| Calendar gains mutation authority through reuse | 15-01 structural boundary test | Command-free presenter props/imports and zero-command fixture. |
| Preferences corrupt targets or active rest | 15-06 canonical pre/post digests | Separate versioned plan preference row and strict non-interference tests. |
| Protected history is deleted or reorder changes current identity | 15-08 integration suite | Retain receipt/disposition/exact membership and canonical source digests. |
| Plan preview fabricates changes from strings | 15-10 domain tests | Typed current/proposed/unit rows generated by canonical domain preview. |
| Long list/large text harms floor usability | 15-12/13 native and performance matrices | Actual rendered transition, long-session benchmark, seven viewports, 200% text. |
| Evidence is stale or leaks workout data | 15-11 verifier mutation/self-tests | Exact identity binding and recursive privacy allowlist. |

## Final validation command sequence

After implementation authorization and all plan summaries exist, the executor runs:

1. npm run typecheck
2. npm run lint
3. npm run check:boundaries
4. npm run test:all -- --runInBand
5. npm run test:coverage -- --runInBand
6. node --test scripts/phase15-evidence-scripts.test.mjs scripts/phase15-native-matrix.test.mjs scripts/benchmark-phase15-workout.test.mjs
7. npm run verify:cng
8. npm run android:devtest:fresh -- --suite phase15
9. npm run test:maestro:phase15 -- --manifest artifacts/native/phase15/build.json
10. npm run benchmark:phase15:workout -- --manifest artifacts/native/phase15/build.json
11. npm run verify:phase15:evidence -- --manifest artifacts/native/phase15/build.json --all

No implementation, test, build, emulator/device mutation, evidence capture, release, deployment, or commit is authorized by this validation document. Those commands run only after the milestone owner authorizes execution.

**Approval:** pending Phase 13/14 execution, TIM-01 blocking-human disposition, Phase 15 implementation, and fresh native verification.
