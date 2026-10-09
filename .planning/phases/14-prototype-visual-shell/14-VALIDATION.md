---
phase: 14-prototype-visual-shell
status: validated
nyquist: false
requirements: [SHL-01, SHL-02, SHL-03, SHL-04, SHL-05, SHL-06, SHL-07, SHL-08, SHL-09, SHL-10, SHL-11, SHL-12, SHL-13]
plans: [14-01, 14-02, 14-03, 14-04, 14-05, 14-06, 14-07, 14-08, 14-09, 14-10, 14-11, 14-12]
---

# Phase 14 Validation Contract

This is the executable validation map and audit record for Phase 14. It maps every real plan task to a narrow automated check, the native evidence backstop, and one or more canonical `shell.*` artifacts. The audit below records executed results; `status: validated` means this artifact was audited, not that the Phase 14 gate passed. Nyquist remains false because current-checkout native identity and CNG verification are unresolved.

## Phase gate

Phase 14 passes only when all of the following are true:

1. Plan 14-01 authors, tests and commits the font source/oracle/harness without building. Plan 14-02 then begins from that clean exact HEAD and a ready Android device; its native Archivo gate must pass before theme migration. A load-only, 800-weight proxy or browser-only result is insufficient.
2. Every implementation task's narrow automated command passes, followed by `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and `npm run test:all` under Node 24.19.0/npm 11.17.0.
3. `npm run verify:cng` passes from a clean tracked tree, then one fresh `phase14` dev-test APK is built and retained.
4. The Phase 14 runner completes the owner-requested Light/Dark/System, width, orientation, 200% text, motion, keyboard/D-pad/focus, startup, settings, and recovery matrix against that exact APK.
5. `node scripts/verify-phase14-evidence.mjs --manifest artifacts/native/phase14/build.json --all` validates all 13 canonical evidence files with no missing, duplicate, skipped, failed, stale, privacy-unsafe, or unmapped row.
6. DEV-02 is approved: production Light Calendar Strength titles use `#9B470B`, border/rail/swatch stays `#D97820`, Dark is unchanged, and complete native blended-fill evidence is required before acceptance.
7. A missing ready Android device blocks only 14-02-T1 and 14-10 native evidence execution; it does not invalidate source research, harness authoring, component planning, or this validation contract.
8. Every implementation task is committed atomically under `.trae/rules/rules.md`, and every commit message ends with `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>`.

## Task-to-validation map

| Plan task | Behavior under change | Narrow automated proof | Native / artifact backstop | Requirement / evidence |
|---|---|---|---|---|
| 14-01-T1 | Official Archivo/OFL/hash plus deterministic 57px/condensed/wght-890/-0.07em oracle | `npm run test:unit -- --runInBand src/testing/phase14FontProof.test.ts` | Source/oracle only; no native claim in this task | SHL-04 / font harness prerequisite |
| 14-01-T2 | Production-isolated attended-preview font harness and fail-closed runner | attended-preview component test + runner self-test | Harness is committed before build; production profile cannot reach it | SHL-04 / font harness prerequisite |
| 14-02-T1 | Clean-tree exact-HEAD Android font proof with <=1 normalized physical-pixel tolerance and exact wrapping | runner self-test then existing-artifact verifier | Fresh `phase14-font-proof` manifest/APK, family/metric/wrap/baseline/overlay captures; mismatch creates proposed deviation + owner checkpoint | SHL-04 / `font-axis-proof.json` |
| 14-02-T2 | Exact tokens, proven editorial 890 oracle, DESIGN.md sync, live System, bounded preference persistence, approved DEV-02 roles | Store unit + foundation component tests | Light/Dark/System live switch on mounted Phase 14 root/sheet/deep route; token screenshot/metrics | SHL-03, SHL-04 / `shell.appearance`, `shell.tokens` |
| 14-02-T3 | Fonts/preference/SQLite loading/trusted/failure/retry and notification permission states | Root layout + RootFailureState component tests; existing runtime launch regressions | Cold launch, injected font/source failure, retry, permission undecided/denied, Continue without alerts | SHL-07 / `shell.launch` |
| 14-03-T1 | Four ordered roots in one bottom composition; selected state; root state retention/focus | `_layout.test.tsx` + `AppRootShell.test.tsx` width/state table | 360/390/600/840 portrait/landscape, 200% text, root-switch journey and state readback | SHL-01, SHL-02 / `shell.four-roots`, `shell.root-state` |
| 14-03-T2 | Deep-route trigger/heading focus and AdaptiveScreen scroll/safe-area ownership | NavigationRow + foundation + AppRootShell tests | D-pad/Back/deep route traces, exact trigger return, stable fallback, one scroll owner | SHL-02 / `shell.root-state` |
| 14-04-T1 | Shared sheet scrim/82% cap/focus trap/IME/Back/Escape/scrim/return | `BottomSheet.test.tsx` | Keyboard/D-pad and semantic accessibility-action flow at portrait/landscape and 200% text; no live assistive-service gate | SHL-05 / `shell.sheets` |
| 14-04-T2 | ConfirmationDialog plus exported ConfirmationSheet/AppearanceSheet delegation | ConfirmationDialog + foundation compatibility tests | Existing consumers inherit one focus/keyboard/scrim frame | SHL-05 / `shell.sheets` |
| 14-04-T3 | Semantic toast queue, severity announcement, motion, dwell and avoidance | SemanticToast + AppRootShell tests | Root/Active placement captures with nav/dock/IME bounds and reduced motion; GAR-16 / Phase 18 owns Garmin observation | SHL-06 / `shell.toasts` |
| 14-05-T1 | Active Workout picker frame migration preserves drafts/commands/dock | ActiveWorkoutScreen component regression | Native keyboard picker, cancel/confirm, dock non-overlap and no premature command result | SHL-05 / `shell.sheets` |
| 14-05-T2 | Timing/date sheet frame migration preserves exact actions/state | AdvancedTimingConfigSheet and CalendarField suites | Native Back/Escape/scrim/IME/200% proof on representative sheets | SHL-05 / `shell.sheets` |
| 14-05-T3 | Duration/start sheet frame migration preserves validation, selection and command ownership | SemanticInputFields + foundation WorkoutStartSheet regressions | Native keyboard/open-close/start-cancel focus trace | SHL-05 / `shell.sheets` |
| 14-06-T1 | One App Settings content tree in root sheet/direct route; appearance first | SettingsScreen + AppRootShell component tests | Open from all four roots, live theme switch while mounted, exact trigger return | SHL-03, SHL-09 / `shell.appearance`, `shell.settings-deep-links` |
| 14-06-T2 | RestAlertSettingsSheet frame migration plus sound/vibration/notification and required settings routes | index route + RestAlertSettingsSheet + SettingsScreen tests | Native rest loading/write failure/denial and Removed/Data route Back focus | SHL-08, SHL-09 / `shell.rest-alerts`, `shell.settings-deep-links` |
| 14-07-T1 | Restore removed session once; selected identity/revision; reload-before-toast | RemovedSessionsScreen + route tests; existing history lifecycle tests | Deterministic removed workout review/busy/failure/success plus post-read source digest | SHL-10 / `shell.removed-sessions` |
| 14-07-T2 | Removed-history loading/empty/error/retry/one-many/focus states | RemovedSessionsScreen component tests | Native empty/error/200%/focus-return captures | SHL-10 / `shell.removed-sessions` |
| 14-08-T1 | Automatic status and CSV prepare/share/cancel/failure/retry/cleanup | data-and-recovery + CSV controller tests | Deterministic automatic states and CSV lifecycle without sensitive paths | SHL-11 / `shell.data-recovery` |
| 14-08-T2 | Google policy/disconnect/delete/takeover/partial/new-backup/privacy | automatic-backup-settings + privacy route tests | Native exact DELETE/safe actions, partial recovery and privacy copy/focus | SHL-12 / `shell.automatic-backup` |
| 14-08-T3 | Encrypted create/share, Restore clean, merge, exact phrases, token/latch/rebuild | manual backup + controller + data/recovery tests; existing portability integration | Native REPLACE/MERGE review/cancel/busy/failure/ready/rebuild with source digest | SHL-13 / `shell.manual-backup` |
| 14-09-T1 | 13-ID source ledger plus fail-closed current-artifact/privacy/no-legacy-Modal verifier | `node --test scripts/phase14-evidence-scripts.test.mjs` plus type/boundary | Mutated/stale/missing/duplicate/skipped/secret fixtures and direct legacy Modal owners are rejected | SHL-01–13 / all `shell.*` |
| 14-09-T2 | Phase 14 package commands plus obsolete font dependency removal after zero-reference audit | Clean `npm ci --ignore-scripts`, typecheck, boundaries and evidence self-tests | Packaged APK font table in `shell.tokens` | SHL-04 / `shell.tokens` |
| 14-09-T3 | Native theme/viewport/text/motion/input/startup/settings/recovery matrix | `node --test scripts/phase14-native-matrix.test.mjs` | Three Maestro flows and per-configuration report/screenshot manifests; no Garmin-specific acceptance | SHL-01–13 / all `shell.*` |
| 14-10-T1 | Native roots/state/appearance/tokens | Phase verifier scoped to four IDs | Individual screenshots/differences, font metrics, target/focus bounds, state trace | SHL-01–04 / first four `shell.*` |
| 14-10-T2 | Native sheets/toasts/launch/rest/deep routes | Phase verifier scoped to five IDs | Input/focus/IME/motion/startup/settings journey and no-write digests | SHL-05–09 / middle five `shell.*` |
| 14-10-T3 | Native removed/data/cloud/manual recovery | Full phase verifier `--all` | Deterministic recovery states, exact confirmation, cleanup and authoritative result digests | SHL-10–13 / last four `shell.*` |
| 14-11-T1 | DEV-02 approved value is validated, not inferred | Verifier requires approved owner record, exact token roles, and separate evidence state | Automatic record check plus measured native artifacts | SHL-04 / decision record |
| 14-11-T2 | Reconcile native evidence with approved DEV-02 roles | Deviation-row status/date/token/evidence gate | Approval remains fixed; missing/failing native evidence remains technical work and cannot pass | SHL-04 / deviation evidence |
| 14-12-T1 | Library sheets preserve query/filter/selection/scroll/draft state | LibraryScreen component regression | Native Library sheet open/theme/close/Back focus journey | SHL-05 / `shell.sheets` |
| 14-12-T2 | Completion confirmation preserves exact consequence and one-shot source command | WorkoutCompletionScreen component regression | Native cancel/confirm/busy/failure source digest and focus return | SHL-05 / `shell.sheets` |

## Audit result: every mapped task

The host-side task checks were executed against Node 24.19.0/npm 11.17.0 with `NODE_OPTIONS=--max-old-space-size=8192`. `GREEN (host)` means the behavioral unit/component/integration proof ran and passed. `NATIVE ESCALATED` means the required native backstop was not accepted as current-checkout proof. The native-only 14-10 tasks are escalated directly.

| Task | Automated result | Native/manual result | Finding |
|---|---|---|---|
| 14-01-T1 | GREEN (host) | Source-only by contract | FILLED |
| 14-01-T2 | GREEN (host) | Source-only by contract | FILLED |
| 14-02-T1 | GREEN self-tests; retained font verifier failed `phase14_font_manifest_stale` | Exact-HEAD Android font proof not accepted | ESCALATED — BLOCKER |
| 14-02-T2 | GREEN (host) | Live theme/token native evidence not current-head verified | ESCALATED — BLOCKER |
| 14-02-T3 | GREEN (host) | Cold launch/failure/retry native evidence not current-head verified | ESCALATED — BLOCKER |
| 14-03-T1 | GREEN (host) | Width/orientation/200% native matrix not current-head verified | ESCALATED — BLOCKER |
| 14-03-T2 | GREEN (host) | D-pad/Back/deep-route native trace not current-head verified | ESCALATED — BLOCKER |
| 14-04-T1 | GREEN (host) | Native keyboard/D-pad/focus-trap evidence not current-head verified | ESCALATED — BLOCKER |
| 14-04-T2 | GREEN (host) | Native shared-dialog delegation evidence not current-head verified | ESCALATED — BLOCKER |
| 14-04-T3 | GREEN (host) | Native compact-toast placement/announcement evidence not current-head verified | ESCALATED — BLOCKER |
| 14-05-T1 | GREEN (host) | Native picker/dock/busy evidence not current-head verified | ESCALATED — BLOCKER |
| 14-05-T2 | GREEN (host) | Native timing/date sheet evidence not current-head verified | ESCALATED — BLOCKER |
| 14-05-T3 | GREEN (host) | Native duration/start sheet evidence not current-head verified | ESCALATED — BLOCKER |
| 14-06-T1 | GREEN (host) | Native settings live-theme/deep-route evidence not current-head verified | ESCALATED — BLOCKER |
| 14-06-T2 | GREEN (host) | Native rest-alert rollback/permission evidence not current-head verified | ESCALATED — BLOCKER |
| 14-07-T1 | GREEN (host), including rapid duplicate-confirm restore test | Native restore/reload/source-digest evidence not current-head verified | ESCALATED — BLOCKER |
| 14-07-T2 | GREEN (host) | Native empty/error/200%/focus-return evidence not current-head verified | ESCALATED — BLOCKER |
| 14-08-T1 | GREEN (host/integration) | Native automatic-status/CSV cleanup evidence not current-head verified | ESCALATED — BLOCKER |
| 14-08-T2 | GREEN (host) | Native Google policy/takeover/delete/privacy evidence not current-head verified | ESCALATED — BLOCKER |
| 14-08-T3 | GREEN (host/integration) | Native REPLACE/MERGE/rebuild/source-digest evidence not current-head verified | ESCALATED — BLOCKER |
| 14-09-T1 | GREEN — 16 evidence self-tests | Retained evidence is structurally complete but current identity is unverified | ESCALATED — BLOCKER |
| 14-09-T2 | GREEN — typecheck/lint/boundary/full test gates | Fresh CNG/package proof blocked by missing OAuth environment | ESCALATED — BLOCKER |
| 14-09-T3 | GREEN — native matrix self-tests | Native matrix execution/verifier not current-head verified | ESCALATED — BLOCKER |
| 14-10-T1 | Not a host substitute for native proof | Verifier rerun failed `spawnSync adb ENOENT` | ESCALATED — BLOCKER |
| 14-10-T2 | Not a host substitute for native proof | Verifier rerun failed `spawnSync adb ENOENT` | ESCALATED — BLOCKER |
| 14-10-T3 | Not a host substitute for native proof | Verifier rerun failed `spawnSync adb ENOENT` | ESCALATED — BLOCKER |
| 14-11-T1 | GREEN — owner/deviation record checks | Native blended-fill proof remains open | ESCALATED — BLOCKER |
| 14-11-T2 | WARNING — plan command is absent; equivalent owner-record checks pass | Native DEV-02 reconciliation remains open | ESCALATED — BLOCKER |
| 14-12-T1 | GREEN (host) | Native Library sheet/focus evidence not current-head verified | ESCALATED — BLOCKER |
| 14-12-T2 | GREEN (host) | Native completion busy/failure/focus evidence not current-head verified | ESCALATED — BLOCKER |

## Audit result: SHL-01 through SHL-13

All 13 requirements have executable host-side behavioral coverage in the mapped component/unit/integration suites and the full test gate. Their native claims remain escalated together because the evidence contract binds every report, screenshot, semantic tree, focus trace, overlay, source digest, APK, installed APK, package/profile, and device identity to the current checkout. The retained evidence was inspected offline as 13 stages, 13 evidence rows, and 17 matrix cells with 17 references per required artifact class; that structural result does not replace the failed current-checkout CLI verification.

| Requirement | Automated behavioral coverage | Native/manual-only coverage | Verdict |
|---|---|---|---|
| SHL-01 | GREEN — full component gate plus native-matrix self-test | Four-root geometry/width/orientation screenshots and semantic tree | ESCALATED |
| SHL-02 | GREEN — root/deep-route/focus component coverage plus native-matrix self-test | D-pad/Back/deep-route focus and retained-state trace | ESCALATED |
| SHL-03 | GREEN — appearance store/foundation/settings coverage | Live System/Light/Dark mounted-route screenshots | ESCALATED |
| SHL-04 | GREEN — font oracle/token/evidence self-tests; owner roles checked | Android font metrics/wrap/overlay and DEV-02 blended-fill proof | ESCALATED |
| SHL-05 | GREEN — BottomSheet/dialog/sheet-consumer regressions | Keyboard/D-pad/IME/focus-trap geometry and return trace | ESCALATED |
| SHL-06 | GREEN — SemanticToast/root-shell regressions | Compact top-toast avoidance and native announcement/motion evidence | ESCALATED |
| SHL-07 | GREEN — startup/root-failure/retry regressions | Pre-runtime retry, notification, and cold-launch native trace | ESCALATED |
| SHL-08 | GREEN — rest-alert settings and rollback regressions | Native permission/write-failure recovery evidence | ESCALATED |
| SHL-09 | GREEN — settings route/deep-link regressions | Native Back/focus return from required settings routes | ESCALATED |
| SHL-10 | GREEN — removed-session lifecycle plus exactly-once restore race | Native loading/empty/error/success/reload/source-digest journey | ESCALATED |
| SHL-11 | GREEN — automatic recovery/CSV controller and integration coverage | Native status/CSV/share/cancel/failure/cleanup evidence | ESCALATED |
| SHL-12 | GREEN — automatic backup/privacy route coverage | Native policy/disconnect/delete/takeover/partial/privacy evidence | ESCALATED |
| SHL-13 | GREEN — encrypted backup/restore/merge integration coverage | Native exact confirmation/busy/failure/ready/rebuild evidence | ESCALATED |

## Executed commands and results

| Command | Result |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck` | PASS |
| `NODE_OPTIONS=--max-old-space-size=8192 npm run lint` | PASS; boundary check covered 323 files |
| `NODE_OPTIONS=--max-old-space-size=8192 npm run check:boundaries` | PASS; 323 files |
| `NODE_OPTIONS=--max-old-space-size=8192 npm run test:all` | PASS — 113 unit suites/1,959 tests; 52 component suites/653 tests; 25 SQLite-host suites/563 tests; 27 integration suites/420 tests; coverage gate 217 suites/3,595 tests |
| `NODE_OPTIONS=--max-old-space-size=8192 npm run test:components -- --runInBand` with the 24 mapped Phase 14 component paths | PASS — 24 suites/389 tests |
| `NODE_OPTIONS=--max-old-space-size=8192 npm run test:unit -- --runInBand` with the 4 mapped Phase 14 unit paths | PASS — 4 suites/10 tests |
| `NODE_OPTIONS=--max-old-space-size=8192 npm run test:integration -- --runInBand` with the 2 mapped Phase 14 integration paths | PASS — 2 suites/5 tests |
| `NODE_OPTIONS=--max-old-space-size=8192 node --test scripts/phase14-font-proof.test.mjs scripts/phase14-evidence-scripts.test.mjs scripts/phase14-native-matrix.test.mjs` | PASS — 16 tests; includes missing/forged screenshot-byte rejection |
| `NODE_OPTIONS=--max-old-space-size=8192 npm run test:evidence:phase14` | PASS — 16 tests |
| `NODE_OPTIONS=--max-old-space-size=8192 npm run check:boundaries` | PASS — 323 files |
| `NODE_OPTIONS=--max-old-space-size=8192 npm run verify:cng` | BLOCKER — `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must be configured` |
| `NODE_OPTIONS=--max-old-space-size=8192 node scripts/run-phase14-font-proof.mjs --manifest artifacts/native/phase14-font-proof/build.json --verify-existing` | BLOCKER — `phase14_font_manifest_stale` |
| `NODE_OPTIONS=--max-old-space-size=8192 npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --all` | BLOCKER — current rerun cannot spawn `adb` (`spawnSync adb ENOENT`); a prior verifier attempt also identified `phase14_manifest_stale` against the retained base head |
| `NODE_OPTIONS=--max-old-space-size=8192 npm run test:evidence:v12:shell` | WARNING — plan 14-11 names a package script that is absent; direct DEV-02 owner/deviation marker checks pass |

## Gaps found, resolved, and escalated

| Gap | Action/result | Classification |
|---|---|---|
| Rapid repeated `Restore workout` confirmation could submit more than once before resolution | Added a behavioral race test in `src/ui/__tests__/RemovedSessionsScreen.test.tsx`; passed and observed one `restoreSession` call plus busy state | FILLED |
| Screenshot byte binding was not explicitly tested for both evidence rows and matrix cells | Added missing and forged screenshot-byte tests in `scripts/phase14-evidence-scripts.test.mjs`; passed with `phase14_screenshot_stale` rejection | FILLED |
| Retained font proof is bound to an older source head | Existing-artifact verifier fails `phase14_font_manifest_stale`; implementation is read-only | ESCALATED — BLOCKER |
| Retained Phase 14 native evidence is not verifiable from this checkout/device environment | Current verifier fails at `adb` spawn; prior run detected stale manifest binding; no evidence or implementation weakening permitted | ESCALATED — BLOCKER |
| CNG reproducibility cannot run without the configured Google web client ID | `verify:cng` fails closed; no credential was invented or printed | ESCALATED — BLOCKER |
| Plan 14-11's named `test:evidence:v12:shell` automation command is not present in `package.json` | Direct owner/deviation checks were run; native evidence still remains required | WARNING / ESCALATED native blocker |

## Manual-only and intentional boundaries

- Native screenshots, geometry, focus traces, semantic trees, overlay bounds, APK identity, and visual/font overlay review are native/manual-only evidence classes; retained artifacts are not promoted to current-checkout PASS while identity verification is blocked.
- Phase 14 intentionally does not claim live TalkBack or switch-scanning acceptance; its required keyboard, D-pad, accessibility-action, semantic, IME, and focus-trap checks are represented by the native matrix contract and still require a valid current native run.
- GAR-16 Garmin observation remains outside Phase 14 and is owned by Phase 18; this is an intentional scope boundary, not an SHL gap.

## Nyquist disposition

Nyquist compliance is `false`. Every mapped task and SHL requirement has been audited, and the host behavioral gaps found by this audit are filled. The phase cannot be called Nyquist-compliant because the required current-checkout CNG/native identity gates are blocked and the DEV-02 blended-fill/font native proof has not been freshly accepted. No implementation files were changed.

## Canonical evidence ledger

| Evidence ID | Requirement | Primary task owner | Required evidence classes |
|---|---|---|---|
| `shell.four-roots` | SHL-01 | 14-03-T1, 14-10-T1 | component, native semantic, geometry, screenshot |
| `shell.root-state` | SHL-02 | 14-03-T1/T2, 14-10-T1 | component, native focus/navigation, retained-state trace |
| `shell.appearance` | SHL-03 | 14-02-T2, 14-06-T1, 14-10-T1 | store, component, live-System native screenshots for Phase 14 consumers; GAR-16 closes Garmin |
| `shell.tokens` | SHL-04 | 14-01-T1/T2, 14-02-T1/T2, 14-10-T1 | asset/hash, clean-tree Android font metrics/wrap, component, screenshots, deviation status |
| `shell.sheets` | SHL-05 | 14-04-T1/T2, 14-05-T1/T2/T3, 14-12-T1/T2, 14-10-T2 | component, exported-wrapper/source audit, focus/keyboard semantic trace, native geometry |
| `shell.toasts` | SHL-06 | 14-04-T3, 14-10-T2 | component, announcement/motion, native avoidance bounds |
| `shell.launch` | SHL-07 | 14-02-T3, 14-10-T2 | component/runtime, native cold launch/failure/retry |
| `shell.rest-alerts` | SHL-08 | 14-06-T2, 14-10-T2 | component/runtime, native permission/write rollback |
| `shell.settings-deep-links` | SHL-09 | 14-06-T1/T2, 14-10-T2 | route/component, native Back/focus journey |
| `shell.removed-sessions` | SHL-10 | 14-07-T1/T2, 14-10-T3 | component/domain, native state journey/source digest |
| `shell.data-recovery` | SHL-11 | 14-08-T1, 14-10-T3 | route/controller, native state journey/cleanup |
| `shell.automatic-backup` | SHL-12 | 14-08-T2, 14-10-T3 | route/facade, native confirmations/privacy/source digest |
| `shell.manual-backup` | SHL-13 | 14-08-T3, 14-10-T3 | route/controller/integration, native exact-confirm/rebuild proof |

## Wave and file-ownership validation

| Wave | Plans | Dependency reason | Same-wave overlap verdict |
|---|---|---|---|
| 1 | 14-01 | Font asset/oracle/harness authoring and atomic commit; no native build | one plan |
| 2 | 14-02 | Clean-tree exact-HEAD device proof first, then proven theme/DESIGN/startup migration | one plan |
| 3 | 14-03 | Requires stable theme/startup contracts | one plan |
| 4 | 14-04 | Mounts shared toast host in AppRootShell | one plan |
| 5 | 14-05, 14-06, 14-12 | Independent component sheets, Settings/AppRootShell content, and Library/completion screen owners | none |
| 6 | 14-07, 14-08 | Removed-history files versus backup/recovery route/controller files | none |
| 7 | 14-09 | Requires all implementation surfaces before freezing evidence ledger/flows | one plan |
| 8 | 14-10 | Executes the completed harness against the completed shell | one plan |
| 9 | 14-11 | Validate approved DEV-02, persist exact roles, and reconcile native evidence | automatic decision-record gate |

## Cohesion rationale for large manifests

Every task remains at five files or fewer. The following plans reach ten or more frontmatter files because the manifest is the union of multiple bounded tasks; the files stay together only where shared ownership or an execution gate makes further plan splitting counterproductive.

| Plan | Files | Cohesion rationale |
|---|---:|---|
| 14-01 | 10 | Two bounded tasks form one atomic source deliverable: official font/oracle, then the production-isolated route/runner/flow that consumes that oracle. The plan must commit before any native proof begins. |
| 14-02 | 12 | Three strictly ordered tasks share one fail-fast gate: clean-tree proof, proven theme/DESIGN adoption, then the explicitly assigned `shell.launch` owner 14-02-T3. A mismatch stops before T2, so no broad edit can outrun the proof. |
| 14-04 | 10 | BottomSheet, ConfirmationDialog, exported ConfirmationSheet/AppearanceSheet compatibility, and SemanticToast are one shared overlay ABI; splitting ownership would reintroduce parallel frame contracts. |
| 14-05 | 10 | Three <=4-file tasks migrate the direct Active/field/start-sheet Modal owners against the same shared frame while preserving each caller state machine. |
| 14-06 | 10 | AppSettingsContent is rendered by both AppRootShell and `/more/index`; RestAlertSettingsSheet and focus rows are the same navigation/persistence slice, so a split would duplicate or conflict on those owners. |
| 14-08 | 12 | Three <=5-file tasks preserve one Data and recovery corridor; `data-and-recovery.tsx` intentionally joins CSV and manual backup states, while automatic settings/privacy remain the sibling route slice. |
| 14-09 | 11 | Ledger, verifier, native flows and package commands must version together so the executable evidence IDs cannot drift from the commands that produce/validate them; each task remains <=5 files. |
| 14-10 | 13 | Mechanical-output exception: these are 13 generated canonical `shell.*.json` evidence rows, partitioned into 4/5/4 outputs. No production subsystem is implemented here; one verifier and one exact APK mechanically emit the set. |

## Goal-backward reachability

| Observable truth | Required artifact/path | Reachability proof |
|---|---|---|
| Four coherent roots at every width | `RootTabsLayout` -> `AppRootShell` -> `AppTabs` | Expo Tabs route keys remain mounted; native width matrix opens each tab and asserts bottom geometry. |
| Appearance synchronized across Phase 14 consumers | `AppearanceProvider` -> shared theme -> roots/deep routes/sheets/toasts | Store/component tests plus live OS switch while mounted; GAR-16 / Phase 18 owns Garmin observation. |
| Focus-safe overlays and truthful feedback | trigger ref -> BottomSheet/ConfirmationDialog/SemanticToast -> return/avoidance | Component key/focus tests plus native input/geometry traces. |
| Truthful startup | RootLayout font/preference readiness -> existing runtime SQLite trust -> StartupReadinessGate | Injected component/runtime failures and native cold retry. |
| Preserved Settings/recovery | root Settings trigger -> AppSettingsContent -> existing `/more/*` routes/controllers | Route tests and native journeys exercise every required row/state/action. |

## Multi-source coverage audit

| SOURCE | ID | Feature / constraint | Plan(s) | Status | Notes |
|---|---|---|---|---|---|
| GOAL | — | One coherent Revision 18 visual/navigation system across roots, deep routes, settings, recovery and appearance | 14-01..14-10 | COVERED | 14-11 preserves the open visual deviation decision. |
| REQ | SHL-01 | Exactly four bottom roots at all widths | 14-03, 14-09, 14-10 | HOST GREEN / NATIVE ESCALATED | No rail, two-row branch or fifth root; current native identity gate is unresolved. |
| REQ | SHL-02 | In-place root switching, selection, focus, deep exit, retained state | 14-03, 14-10 | HOST GREEN / NATIVE ESCALATED | State remains screen-owned; current native focus trace is unresolved. |
| REQ | SHL-03 | App Settings plus persisted live System/Light/Dark across Phase 14 consumers | 14-02, 14-06, 14-10 | HOST GREEN / NATIVE ESCALATED | One provider/content owner; live mounted-route native proof is unresolved. |
| REQ | SHL-04 | Exact tokens, Archivo, IBM Plex Mono, spacing/borders/density | 14-01, 14-02, 14-09, 14-10, 14-11 | HOST GREEN / NATIVE ESCALATED | Font manifest is stale and DEV-02 blended-fill proof remains pending. |
| REQ | SHL-05 | Focus/keyboard-safe contextual sheets/dialogs | 14-04, 14-05, 14-10 | HOST GREEN / NATIVE ESCALATED | Existing content state machines retained; native focus/IME proof is unresolved. |
| REQ | SHL-06 | Theme-aware accessible top toasts clear of docks | 14-04, 14-10 | HOST GREEN / NATIVE ESCALATED | Shared consumer contract passes; native avoidance evidence is unresolved. |
| REQ | SHL-07 | Loading/trusted/failure/retry/notification startup | 14-02, 14-10 | HOST GREEN / NATIVE ESCALATED | Existing SQLite trust remains gate; native cold/retry proof is unresolved. |
| REQ | SHL-08 | Device Rest sound/vibration/notification settings | 14-04, 14-06, 14-10 | HOST GREEN / NATIVE ESCALATED | Host rollback behavior passes; native permission/write proof is unresolved. |
| REQ | SHL-09 | Removed sessions and Data/recovery reachable | 14-06, 14-10 | HOST GREEN / NATIVE ESCALATED | Same settings content from sheet/route; native Back/focus proof is unresolved. |
| REQ | SHL-10 | Complete removed-history state/restore lifecycle | 14-07, 14-10 | HOST GREEN / NATIVE ESCALATED | Reload-before-toast and exactly-once host behavior pass; native journey is unresolved. |
| REQ | SHL-11 | Automatic status/recovery and CSV states | 14-08, 14-10 | HOST GREEN / NATIVE ESCALATED | Existing controller/facade passes; native lifecycle/cleanup proof is unresolved. |
| REQ | SHL-12 | Google connection/policy/takeover/deletion/new/privacy | 14-08, 14-10 | HOST GREEN / NATIVE ESCALATED | Exact DELETE retained; native privacy/takeover proof is unresolved. |
| REQ | SHL-13 | Encrypted export, restore/merge, retry/rebuild | 14-08, 14-10 | HOST GREEN / NATIVE ESCALATED | Exact REPLACE/MERGE and tokens pass host tests; native rebuild proof is unresolved. |
| CONTEXT | D14-01 | Exact Workout/Calendar/Library/Progress bottom shell | 14-03 | COVERED | Cited in task actions. |
| CONTEXT | D14-02 | Bundled Archivo/IBM Plex and exact tokens/System | 14-01, 14-02 | COVERED | Android proof precedes broad migration. |
| CONTEXT | D14-03 | Root state and deep-route/focus restoration | 14-03 | COVERED | Shell owns coordination, screens own view state. |
| CONTEXT | D14-04 | Shared focus-safe overlays and dock-safe toasts | 14-04, 14-05, 14-12 | COVERED | No parallel frame/host. |
| CONTEXT | D14-05 | Appearance-first Settings plus all shipped recovery | 14-06, 14-07, 14-08 | COVERED | Prototype omission does not remove native routes. |
| CONTEXT | D14-06 | Factual SQLite/font startup and notification flow | 14-02 | COVERED | Visual cache stays rebuildable. |
| CONTEXT | DEV-02 | Approved #9B470B Light title with #D97820 sport roles | 14-01, 14-02, 14-09, 14-10, 14-11 | COVERED | Automatic owner-record validation plus native blended-fill evidence. |
| RESEARCH | R14-01 | Commit deterministic Archivo harness, then prove exact HEAD on Android before theme migration | 14-01, 14-02 | COVERED | Device absence blocks proof execution, not source planning. |
| RESEARCH | R14-02 | No new UI/font npm package; official bytes/OFL/hash | 14-01, 14-02 | COVERED | Existing packages retained except obsolete Source Sans removal. |
| RESEARCH | R14-03 | Extend existing Expo Tabs, theme and runtime in place | 14-02, 14-03 | COVERED | No second router/provider/bootstrap. |
| RESEARCH | R14-04 | One App Settings content owner/two presentations | 14-06 | COVERED | Sheet versus direct route wrappers. |
| RESEARCH | R14-05 | One modal frame; exported wrappers and content owners retain public/business contracts | 14-04, 14-05, 14-06, 14-12, 14-09 | COVERED | Source audit rejects legacy sheet/dialog Modal ownership. |
| RESEARCH | R14-06 | Toast follows authoritative completion | 14-04, 14-07, 14-08 | COVERED | Failures remain inline. |
| RESEARCH | R14-07 | Preserve exact recovery controllers/confirmations | 14-07, 14-08 | COVERED | restore_history/DELETE/REPLACE/MERGE. |
| RESEARCH | R14-08 | Bound diagnostics and preserve dev-test isolation | 14-02, 14-09, 14-10 | COVERED | Threat mitigations and verifier checks. |
| RESEARCH | R14-09 | Fresh CNG/APK and exact identity-bound native proof | 14-09, 14-10 | COVERED | Browser/Jest never closes native geometry. |
| RESEARCH | R14-10 | No domain migration/repository/backup-format changes | all | COVERED | Task actions retain existing domain owners. |
| RESEARCH | R14-11 | Full theme/viewport/orientation/text/motion/input matrix | 14-09, 14-10 | COVERED | No silent sampling reduction. |
| RESEARCH | R14-12 | Keep repository design guidance aligned with shipped tokens/navigation/focus | 14-02 | COVERED | DESIGN.md changes with Archivo, exact editorial oracle, 3dp focus and all-width bottom navigation. |
| RESEARCH | R14-13 | Publish shared appearance/toast consumer contracts without claiming Garmin route closure | 14-02, 14-04, 14-09, 14-10 | COVERED | GAR-16 / Phase 18 owns observable Garmin adoption and native evidence. |

Exclusions are intentional and not gaps: feature-owned Workout/Calendar/Library/Garmin/Progress content belongs to Phases 15–19; Calendar DEV-01 geometry belongs to Phase 16; domain migration/policy belongs to Phase 13; release belongs after milestone owner authorization.

The installed decision-coverage query currently rejects the source's `D14-XX` identifier format before examining plan citations because it only parses `D-NN`. This validation therefore records the complete D14-01–D14-06 and DEV-02 audit explicitly above; the source artifact is not rewritten or renumbered by this planner.

## Pre-mortem controls

| Likely failure | Earliest detector | Planned mitigation |
|---|---|---|
| Archivo loads but does not render the condensed axis | 14-02-T1 clean-tree Android metric/wrap/screenshot gate | Stop before 14-02-T2 and report the measured technical blocker; do not choose an unplanned font branch. |
| Old rail/two-row/private modal variants survive | 14-03 width table; legacy-modal owners in 14-04/14-05/14-06/14-12; 14-09 source audit | Delete rail/two-row/private sheet-dialog ownership, make ConfirmationSheet/AppearanceSheet delegate to the shared frame, and reject surviving direct legacy Modal owners before native evidence. |
| Settings redesign drops recovery states or falsely reports success | existing route/controller regressions in 14-06–08 | Extract one content owner and preserve controllers/exact confirmation/authoritative reload. |
| Native evidence is stale, incomplete or privacy-unsafe | verifier mutation tests in 14-09 | Bind all identities, one-to-one IDs, and recursive sensitive-data rejection. |
| DEV-02 roles are conflated or closed without evidence | token/component/verifier checks from 14-02 onward | #9B470B title-only assertion, #D97820 sport-role assertion, unchanged Dark, and automatic 14-11 approval/evidence gate. |

## Final validation command sequence

The executor runs these under the pinned Node/npm toolchain and records outputs in Phase 14 evidence:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run check:boundaries`
4. `npm run test:all`
5. `node --test scripts/phase14-font-proof.test.mjs scripts/phase14-evidence-scripts.test.mjs scripts/phase14-native-matrix.test.mjs`
6. `npm run verify:cng`
7. `npm run android:devtest:fresh -- --suite phase14`
8. `npm run test:maestro:phase14 -- --manifest artifacts/native/phase14/build.json`
9. `npm run verify:phase14:evidence -- --manifest artifacts/native/phase14/build.json --all`

No build, emulator/device mutation, evidence capture, application edit, or release command is authorized by creating this validation document; these steps execute only after the milestone owner authorizes implementation.
