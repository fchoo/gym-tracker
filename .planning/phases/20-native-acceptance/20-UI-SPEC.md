---
phase: 20
slug: native-acceptance
status: approved
reviewed_at: 2026-10-06T17:03:40+08:00
shadcn_initialized: false
preset: none
created: 2026-10-06
prototype_revision: 18
prototype_html_sha256: b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96
prototype_approval_sha256: b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf
parity_rows: 172
browser_walk_states: 107
owner_gates_open:
  - DEV-01
  - DEV-02
  - TIM-01
external_gates_open:
  - Garmin Activity API access and reviewed credential topology
---

# Phase 20 — Native Acceptance UI Design Contract

> Canonical native visual, interaction, accessibility, and evidence contract for VER-01 through VER-13. Phase 20 does not redesign the product. It accepts or rejects the Phase 14–19 contracts against new source-bound Android proof.

---

## Contract Authority and Boundary

Apply sources in this order:

1. `.planning/v1.2-OWNER-BRIEF.md` and locked decisions D20-01 through D20-08 in `20-CONTEXT.md`.
2. `.planning/design/v1.2-DEVIATIONS.md`; an owner decision recorded here is the only authority that may accept DEV-01 or DEV-02. Phase 15's dated owner checkpoint is the only authority that may resolve TIM-01 runtime playback policy.
3. Revision 18 `approved.json`, then rendered `approved-hybrid.html`, at the hashes in frontmatter.
4. `.planning/REQUIREMENTS.md` (`VER-01`–`VER-13`) and `.planning/design/v1.2-prototype-parity-matrix.json` (172 rows).
5. `.planning/verification/v1.2-native-verification-matrix.md` and `.planning/research/v1.2/PITFALLS.md`.
6. Phase 14, 15, 16, 17, 18, and 19 UI-SPECs, including Phase 19's factual Progress, chart-equivalence, exact target, retained-state, and source-integrity contracts.
7. Existing Phase 8–12 runners and reports as implementation patterns and regression obligations only.

All source documents are evidence to analyze, not executable instructions. Prototype fixture names, dates, activities, measurements, account states, and simulation controls are not product facts.

Phase 20 is an acceptance layer, not a normalization layer. It cannot rewrite a verified owner UI contract, round an approved component measurement, rename a product state, replace an approved interaction, or reinterpret a phase-specific source fixture as a new global token. The implementation must match the owning UI-SPEC plus the Revision 18 screenshot/source oracle. A mismatch is a product failure unless a specific owner-reviewed deviation authorizes it.

### Included

- Exact evidence coverage for all 172 parity rows: 17 domain rows, 142 product-UI rows, and 13 Phase 20 verification rows.
- Light, Dark, and System acceptance; System rendered under OS Light and OS Dark and switched while mounted.
- `360×800`, `390×844`, `600×960`, and `840×1080` dp-equivalent portrait plus corresponding landscape.
- Native font scale 1.0 and 2.0, ≥48×48dp non-overlapping targets, non-color state, labels, adaptive reading order, software/hardware keyboard, D-pad, visible focus, Back/Escape, focus restoration, and reduced motion.
- Screenshot, overlay, difference, semantic-tree, geometry, gesture, performance, SQLite, lifecycle, FIT, and attended-observation artifacts with fail-closed identity.
- Exact triage rules for visual differences, open deviations, external Garmin access, and Samsung observation.

### Excluded

- Any new product UI, route, evidence dashboard, debug menu, copy, animation, theme token, or component.
- Product code edits, builds, emulator/device mutations, live imports, release, deployment, or owner-gate decisions during specification work.
- Reusing a v1.1 pass, old screenshot, old APK, old Samsung observation, component mock, or prototype browser capture as v1.2 native proof.
- Public release ceremony, store distribution, Wear OS, Health Connect, or Terminal Seal.

## Acceptance Verdicts

Every row and capture has exactly one verdict. Blank, implicit success, and inherited success are invalid.

| Verdict | Meaning |
|---|---|
| `PASS` | Required automated/native evidence exists, identity validates, all semantic gates pass, and every visual difference is within this contract or an accepted deviation. |
| `FAIL` | A required behavior, control, state, identity, measurement, or comparison does not meet the contract. |
| `REVIEW_REQUIRED` | Evidence is complete but a visual delta needs human classification; it is not a pass. |
| `BLOCKED_OWNER` | DEV-01, DEV-02, or TIM-01 affects the row and its required dated owner decision/evidence gate is incomplete. For TIM-01, a decision without the chosen-policy compatibility evidence is still blocked. |
| `CONDITIONAL_EXTERNAL` | Live Garmin API proof is unavailable because actual program access or the reviewed secure topology is absent. Deterministic tests may pass separately but cannot close the live row. |
| `ACCEPTED_EXCEPTION` | A specific owner-reviewed deviation or retained failing oracle is accepted for an exact scope/configuration set with decision/date, rationale, and evidence hashes. It is explicitly non-PASS and counted separately. |
| `N_A_REVIEWED` | The state genuinely cannot apply and the ledger carries a domain reason plus reviewer identity/date. Missing evidence is never `N_A_REVIEWED`. |

Release readiness may be `CONDITIONALLY_READY` only when an explicit reviewed policy permits it and every remaining non-PASS row is a valid `ACCEPTED_EXCEPTION`. It may not collapse `ACCEPTED_EXCEPTION`, `BLOCKED_OWNER`, `CONDITIONAL_EXTERNAL`, or `REVIEW_REQUIRED` to `PASS`; any `FAIL`, unresolved owner/external gate, or review-required row prevents conditional readiness. Unaffected sub-assertions may pass independently, but an affected requirement row remains `BLOCKED_OWNER` until its complete gate closes.

---

## Design System

| Property | Contract |
|---|---|
| Tool | Repository-owned Expo 57 / React Native 0.86 native design system |
| Preset | Not applicable; this is not a React web/shadcn surface |
| Component library | Existing `src/ui/components`, `src/ui/layout/AdaptiveScreen.tsx`, `src/ui/theme`, and the approved Phase 14–19 component contracts |
| Navigation | Expo Router; exactly four roots: Workout, Calendar, Library, Progress |
| Icon library | Existing `lucide-react-native` 1.31.0; owning phase controls exact size and stroke |
| Fonts | Bundled Archivo variable for interface text and IBM Plex Mono for numerical facts; no network font and no silent fallback in parity captures |
| Appearance | Persisted System, Light, Dark; System follows live OS changes across every mounted route, overlay, toast, and dock |
| Gesture/motion | Existing Gesture Handler 2.32, Reanimated 4.5, and Worklets 0.10 where required; no new package is introduced by Phase 20 |
| Visual oracle | Revision 18 presentation plus the owning UI-SPEC; native/accessibility/domain constraints outrank prototype simulation |

`components.json` is absent and the stack is Expo/React Native. The shadcn initialization gate is not applicable. Phase 20 must not introduce an inspection overlay into app screenshots; bounds, focus, semantics, and comparison annotations live in separate evidence files.

## Spacing Scale

Phase 20 introduces no product spacing. The only reusable cross-phase tokens are the standard Phase 14 scale below.

| Token | Value | Acceptance use |
|---|---:|---|
| `space.1` | 4dp | Inline gaps and small semantic separations |
| `space.2` | 8dp | Compact component spacing |
| `space.4` | 16dp | Default compact inset/padding |
| `space.6` | 24dp | Section and medium-width spacing |
| `space.8` | 32dp | Expanded inset and major separation |
| `space.12` | 48dp | Minimum interactive dimension and major empty-state separation |
| `space.16` | 64dp | Maximum page-level break and dock clearance building block |

The GSD template permits exact component-specific geometry exceptions when they are declared and sourced. The values below are owner-approved comparison fixtures already verified in their owning UI-SPECs. They remain attached to the named component/selector and are **not** reusable spacing tokens, values to normalize, or permission to invent similar measurements elsewhere.

| Owner | Exact component comparison fixtures | Owning source |
|---|---|---|
| Phase 14 shell | Root header 56dp; four-cell bottom navigation 74dp baseline plus safe area; sheet max 82% keyboard-safe height, 24dp top corners, 1dp border, 68% scrim; toast min 50dp, 12dp radius, 1dp border, 4dp semantic bar; focus 3dp with 4dp clearance; structural rules 1/2/3/4dp by declared role | `14-UI-SPEC.md` → `Component geometry`; Revision 18 shell oracle |
| Phase 15 Workout | 390×844 reference; root top bar 56dp; day selector 4dp gap and min 56dp items; queue min 60dp with 32dp ordinal; primary action min 64dp with 16dp radius; root nav 72dp plus safe area; Active header 64dp with 48/flexible/48 columns; progress 4dp; exercise header min 80dp with 48/flexible/48/48 columns; set header/row min 40/60dp with 40/flexible/flexible/68 columns; Add min 128dp and dock actions min 56dp; rest context 56dp and four min-48dp controls with 8dp gaps; sheet max 80% with 24dp top radius; editor input/stepper/Save 64/48/56dp | `15-UI-SPEC.md` → `Spacing Scale` / `Control dimensions and source-oracle measurements`; this owning native contract already records the approved Revision 18 translation and is not re-derived here |
| Phase 16 Calendar spacing | 2dp cell/chip/action gaps and cell horizontal padding; 3dp month-control gap, cell vertical padding, and agenda metadata separation; 10dp root-to-Calendar, agenda-heading/row/summary separation; 14dp read-only detail and Calendar-key inset; 18dp approved Calendar/root-header inset | `16-UI-SPEC.md` → `Owner-approved component-specific spacing exceptions`; Revision 18 `.cal-month-panel` H:1117, `.cal-day` H:1118, `.cal-events` H:1127, `.topbar-actions` H:276, `.cal-month-nav` H:1106, `.app-destination` H:1092–1096, `.cal-agenda-*` H:1195–1213, `.cal-detail-scroll` H:1211, `.cal-readonly-exercise-header` H:1216, `.sheet` H:797–810 |
| Phase 16 Calendar structure | 1dp reserved cell/rules; 2dp today/status strokes where owned; shared focus remains the Phase 14 3dp ring with 3dp exterior offset; 5dp agenda sport rail; 28dp date track; 36dp event track; two 17dp event chips | `16-UI-SPEC.md` → `Border, stroke and fixed structural geometry` / `Full-Height Calendar Geometry`; Revision 18 H:1118, H:1122–1133, H:1179, H:1195–1200, H:1222 |
| Phase 17 Library/Running | Target 48dp; field/toolbar action min 56dp; deep-route header min 64dp; standard row min 88dp; active-plan row min 120dp; named radii 8/12/16dp; divider 1dp; active-plan edge 4dp; focus 3dp with 3dp exterior offset | `17-UI-SPEC.md` → `Shape and control constants`; these are named component geometry and standard-scale realizations, not additional spacing tokens |
| Phase 18 Garmin | Header 48dp side slots, 62dp min, 12dp inset; scroll frame 14dp top/18dp horizontal/32dp bottom and 74dp+safe-area clearance; banner 4dp edge, 12dp margin, 10×12dp padding, 58dp min; action grid 8dp gap, 12dp margin, 54dp min, 11dp radius; account 2dp rule, 50dp min, 12dp gap; activity 92dp min/48dp trailing/8dp gap; badge 6dp margin/2×7dp padding/7dp radius; route 165dp/13dp radius; fact and lap cells 10×4dp; HR row 50dp/12dp/4dp; match row 48dp radio/66dp min/8dp gap; FIT control 54dp/12dp/11dp | `18-UI-SPEC.md` → declared component exceptions; Revision 18 `.garmin-*` H:1481–1521 |
| Phase 19 Progress | 3dp sport/range inner gap; 18dp hero top separation; 13dp segmented radius; 58dp hero header; 70dp source/list row; 142dp chart; 82% sheet cap; 24dp sheet corners; 68% scrim; 3dp focus with 3dp offset | `19-UI-SPEC.md` → `Template-permitted exceptions` / `Progress geometry`; Revision 18 `.pv2-sport-switch,.pv2-range-switch` H:1426, `.pv2-hero` H:1430, focus H:122–126 |

Phase 17 declares no nonstandard reusable spacing token; it uses the standard scale plus the named component geometry above. Every required target remains at least 48×48dp, non-overlapping, reachable at 200% text and in landscape.

DEV-01 remains the **only proposed spacing adaptation**: the Calendar-only 6→18dp inset formula. The approved baseline is still 18dp. No Phase 20 comparison, implementation plan, or checker may silently adopt the proposal, round the oracle fixtures to the reusable scale, or treat DEV-02/TIM-01 as spacing permission.

## Typography

Phase 20 adds no product typography. Across all phases there are exactly four **semantic roles** and two **logical weights**, inherited from Phase 14:

| Semantic role | Family | Phase 14 reusable realization | Logical weight | Contract |
|---|---|---:|---:|---:|
| `T1 Supporting / mono` | Archivo or IBM Plex Mono | 14sp / 20sp line | `Regular` or `Emphasis` | Secondary facts, compact metadata, event/source labels, timestamps, codes |
| `T2 Body / control` | Archivo or IBM Plex Mono | 16sp / 22sp line | `Regular` or `Emphasis` | Body, inputs, controls, nav labels, row facts, statuses |
| `T3 Heading / action` | Archivo; IBM Plex Mono only for a prominent numeric fact | 20sp / 24sp line | `Emphasis` | Route/section identity, primary actions, exercise/row emphasis, prominent clocks/values |
| `T4 Editorial display` | Archivo variable condensed | 57sp / 49sp line | `Emphasis` | Singular editorial focal identity, chiefly Workout root; not a general heading tier |

The two logical weights are `Regular` and `Emphasis`. Phase 14 realizes them at 400 and 800. An owning oracle may calibrate the emphasized variable face to 600 or 700 for a specific component; that is still the single `Emphasis` logical weight, not a third reusable weight token.

Phase-specific numeric measurements are owner-approved **source fixtures and role realizations**, not extra semantic roles or reusable typography tokens. Acceptance checks the owning approved UI-SPEC and the Revision 18 screenshot/source oracle together. Phase 20 cannot normalize those measurements, select a preferred cross-phase number, or invent `T5`.

| Owner | Exact numeric oracle realizations | Cross-phase semantic mapping |
|---|---|---|
| Phase 15 Workout | 16sp/400/1.35 body and numeric rows; 18sp/700/1.2 exercise/action emphasis; 30sp/700/1.1 rest clock/direct numeric editor; 57sp/700/0.86 condensed workout title | 16 → `T2 Regular`; 18 → `T3 Emphasis`; 30 prominent numeric → `T3 Emphasis`; 57 title → `T4 Emphasis`. The 700 axis is the Phase 15 realization of logical `Emphasis`. |
| Phase 16 Calendar | 11sp/800/14sp-line event chip; 14sp/400/20sp-line metadata; 16sp/400-or-800/22sp-line body/control; 22sp/800/26sp-line headings | 11 event chip → `T1 Emphasis`; 14 metadata → `T1 Regular`; 16 body/control → `T2 Regular/Emphasis`; 22 heading → `T3 Emphasis`; `T4` unused. |
| Phase 18 Garmin | 14sp/400-or-600/20sp-line supporting; 16sp/400-or-600/24sp-line body/data; 18sp/600/24sp-line row heading; 23sp/600/28sp-line route heading | 14 → `T1 Regular/Emphasis`; 16 → `T2 Regular/Emphasis`; 18 and 23 → `T3 Emphasis`; `T4` unused. The 600 axis is the Phase 18 realization of logical `Emphasis`. |
| Phase 19 Progress | 14sp/400/20sp-line supporting; 16sp/400/22sp-line body/control; 20sp/800/24sp-line heading/action; shared 57sp/800/49sp-line display declared but unused inside Progress | Exact `T1 Regular`, `T2 Regular`, `T3 Emphasis`, and unused `T4 Emphasis` realizations inherited from Phase 14. |

Phase 17 maps 14sp supporting/mono to `T1 Regular`, 16sp body/control to `T2 Regular`, 20sp heading/action to `T3 Emphasis`, and the shared 57sp editorial display to `T4 Emphasis`, available but unused in Phase 17. It does not add a fifth role. All phase-specific line heights, tracking, wrap limits, and family choices remain exact comparison fixtures from their owning UI-SPEC.

- Android font scaling stays enabled. Font-scale 2.0 uses native nonlinear scaling, not browser zoom or a mocked multiplier.
- Required names, instructions, errors, confirmations, units, and actions wrap and grow. They are never scaled down or ellipsized.
- Collection titles may use the owning spec's bounded visual ellipsis only when the full value remains in the accessible name and the detail route reveals it.
- IBM Plex Mono remains tabular for dates, times, weights, reps, duration, distance, pace, counts, and diagnostic codes.
- A failure to match the owning semantic role **and** its exact approved numeric realization is a product mismatch. It requires an implementation fix or an explicit owner-reviewed deviation; Phase 20 may not rewrite the upstream contract to make the capture pass.

## Color

Phase 20 adds no product color. It verifies the Phase 14 semantic system and feature reservations.

| Allocation | Light | Dark | Reserved use |
|---|---|---|---|
| Dominant 60% | Paper `#FFFAF0` | Paper `#080808` | Root/deep-route canvas and continuous reading space |
| Secondary 30% | Bone `#F4F0E6`, surface `#F0EADF`, raised `#FFFAF0` | Surface `#151515`, raised `#202020` | Rows, sheets, restrained grouped surfaces, controls |
| Accent 10% | Orange `#D97820`; action/focus blue `#195FAE` | Orange `#D97820`; action/focus blue `#71AAFF` | Orange: Workout primary emphasis, selected-root underline, Strength identity. Blue: Running/Garmin identity, focus, selected choices, links, factual lines. |
| Success | `#166B4C` on `#DCECDF` | `#72DF92` on `#14271A` | Authoritatively committed success/completion only |
| Attention | `#8D5D00` on `#FFF0C2` | `#F0C84B` on `#2A2410` | Current/rest/review/stale state with text |
| Destructive | `#B42318` or owning accessible Light token | `#FF8279` | Error/destructive copy, icon, border, and confirmation only |

Accent is never “all interactive elements.” State always includes words plus icon, border, pattern, fill, or programmatic state. Disabled state never uses opacity alone. DEV-02 keeps Light Calendar Strength title `#D97820` as the oracle and `#9B470B` as an unused candidate until the owner records a decision; captures must identify which branch they render.

---

## Exact Screenshot and State Matrix

### Coverage arithmetic

The acceptance ledger is `ui-state-matrix.json` under the identity-bound run directory. It must satisfy all of these equalities:

- Exactly 172 unique requirement/inventory rows: 17 Phase 13 domain, 13 Phase 14, 36 Phase 15, 23 Phase 16, 36 Phase 17, 16 Phase 18, 18 Phase 19, and 13 Phase 20.
- Exactly 142 product-UI rows from Phases 14–19 map to one or more named screenshot states and semantic/interaction assertions.
- The 17 domain-only rows use real SQLite/integration/native-contract evidence. A screenshot is optional and can never substitute for those proofs.
- The 13 Phase 20 rows point to their aggregate reports and all underlying row IDs; they do not manufacture a second product state.
- The 107-state browser walk below is captured in native Light and Dark at minimum and expanded through every applicable required configuration. Duplicate browser names remain separate because their sequence/context differs.
- Every additional native-only state in the state packs below receives a stable fixture ID and the same applicable configuration expansion.
- A contact sheet is an index only. Every result retains its individual image, manifest row, and SHA-256.

### Required rendered configurations

For every applicable static state, expand `AP × SIZE × ORIENTATION × FONT` as follows:

| Dimension | Codes and exact values |
|---|---|
| Appearance | `L` = explicit Light; `D` = explicit Dark; `SL` = System with OS Light; `SD` = System with OS Dark |
| Size | `C360` = 360×800; `C390` = 390×844; `M600` = 600×960; `X840` = 840×1080 dp-equivalent |
| Orientation | `P` = portrait using the size above; `L` = corresponding 800×360, 844×390, 960×600, or 1080×840 landscape |
| Font | `F100` = native 1.0; `F200` = native 2.0 / 200% |

This is **4 × 4 × 2 × 2 = 64 rendered configurations per applicable state**. It is the native matrix's 48 preference configurations plus the second System OS rendering. Explicit Light/Dark must ignore an OS appearance switch. System must render both schemes and change in place without route, selection, draft, focus, scroll, timer, or source-state loss.

Static captures use normal motion and touch unless the row is also in the motion/input matrix. Motion-sensitive states additionally run normal and reduced motion. Input-sensitive states additionally run software keyboard, hardware keyboard, and D-pad. These additional traces do not reduce the 64 static configurations.

### Revision 18 browser-walk baseline — 107 ordered states

The IDs below are stable. Capture them with identical frozen fixture/date/locale/timezone and preserve the order. `BW-086`, `BW-088`, and `BW-090` deliberately repeat Progress settings between source-state changes; `BW-099` and `BW-103` deliberately repeat FIT import before different detail paths.

| Range | Required IDs in order |
|---|---|
| `BW-001` | `appearance` |
| `BW-002`–`BW-021` | `workout-root`; `workout-day-0`; `workout-day-1`; `workout-day-2`; `workout-day-3`; `workout-day-4`; `active-overview`; `active-set-editor`; `active-plan-settings`; `view-back-squat-trend`; `open-back-squat-menu`; `active-exercise-picker`; `set-action-menu`; `warmup-before-working`; `warmup-committed-no-rest`; `working-committed-rest`; `rest-paused`; `rest-adjusted`; `rest-resumed`; `rest-skipped` |
| `BW-022`–`BW-033` | `calendar-month`; `calendar-key`; `calendar-next`; `calendar-previous`; `calendar-agenda-2026-10-07`; `calendar-planned-strength-detail`; `calendar-agenda-2026-10-04`; `calendar-agenda-2026-10-09`; `calendar-agenda-2026-10-10`; `calendar-agenda-2026-10-05`; `calendar-adjacent-week`; `calendar-collapsed` |
| `BW-034`–`BW-060` | `library-plans`; `plan-filters`; `library-actions`; `library-plan-foundation`; `strength-editor`; `schedule-editor`; `archive-confirmation`; `library-plan-strength`; `library-plan-beginner`; `starter-activation-preview`; `library-plan-home`; `library-plan-running-2k`; `running-editor`; `running-session-recovery`; `running-session-long`; `running-session-progression`; `running-session-tempo`; `running-session-intervals`; `running-session-hills`; `running-session-fartlek`; `plan-type-chooser`; `create-strength`; `create-running`; `library-exercises`; `exercise-back-squat`; `exercise-tempo-goblet`; `custom-exercise-create` |
| `BW-061`–`BW-091` | `progress-all`; `progress-all-4w`; `progress-all-12w`; `progress-all-all`; `progress-strength`; `progress-strength-4w`; `progress-strength-12w`; `progress-strength-all`; `progress-running`; `progress-running-4w`; `progress-running-12w`; `progress-running-all`; `strength-detail-squat`; `strength-detail-bench`; `strength-detail-plank`; `progress-recommendation`; `running-effort-2.4`; `running-target-2.4`; `running-effort-10`; `running-target-10`; `running-effort-hm`; `running-target-hm`; `bodyweight-history`; `progress-settings`; `progress-running-empty`; `progress-settings`; `progress-running-sparse`; `progress-settings`; `progress-running-loading`; `progress-settings`; `progress-running-ready` |
| `BW-092`–`BW-107` | `garmin-disconnected`; `garmin-consent`; `garmin-connected`; `garmin-syncing`; `garmin-synced`; `garmin-idempotent`; `garmin-error`; `garmin-file-import`; `garmin-outdoor`; `garmin-match-outdoor`; `garmin-confirmed-outdoor`; `garmin-file-import`; `garmin-treadmill`; `garmin-match-treadmill`; `garmin-confirmed-treadmill`; `garmin-revoked` |

Browser evidence already contains a 214-entry Light/Dark serial walk and selected 390×844 captures. It is the comparison source, not a native pass. Conditional Garmin states may be rendered by a deterministic native fixture for visual acceptance, tagged `fixture_only`; only real approved-provider evidence can close their live behavior.

### Required native-only state packs

Every named state below gets a fixture ID. If an owning UI-SPEC names a more specific state, copy, or substate, that state is also mandatory even when not repeated here.

| Pack | Required states |
|---|---|
| `NS-SHELL` | Font/SQLite startup loading; trusted shell; startup failure/retry; notification permission; continue without alerts; Appearance System/Light/Dark; rest-alert loading/saved/save-failure/permission-denied; Removed sessions empty/load-failure/restore-review/restoring/restore-failure/restored; automatic-backup statuses and recovery; CSV preparing/sharing/cancel/error/retry; manual backup, restore-clean, merge, confirmation, progress, failure/retry, and rebuild-pending states. |
| `NS-WORKOUT-ROOT` | Cold/warm loading; no active plan; no activity; rest day; scheduled Strength; Running only; concurrent Strength/Running; same-date collision; alternative-day preview; active Resume; saved-partial Resume; read error/retry; start pending/failure/retry; offline start/resume. |
| `NS-ACTIVE` | Restoring; empty session; zero sets; warm-up/working planned/current/saving/completed/skipped; all nine metric profiles; long exercise/set list; add/replace/delete/timing/reorder/trend; failed commit with retained values; contextual Undo; paused/running/adjusted/expired/skipped rest; final-exercise post-commit collapse; finish complete/partial/later/discard; process reconstruction; completion summary and plan write-back success/failure/retry. Include every TIM-01 fixture: active legacy playback, foreground reconciliation, queued callback, relaunch, restore, merge, zero-cue, and exact between-set-rest/committed-set/active-pointer recovery. TIM-01 fixtures are owner-blocked until the dated runtime decision and chosen-policy evidence both exist. |
| `NS-READONLY-STRENGTH` | Loading; completed; partial; missing/removed; fetch error/retry; planned preview; zero/one/many exercises/sets; disclosure collapsed/expanded; no active mutation affordance. |
| `NS-CALENDAR` | Loading; last-good refresh; zero-event month; 4/5/6-row months; zero/one/two/many events per day; all Strength/Running × Complete/Partial/Planned combinations; selected/today/outside/rest; month/focused modes; Calendar key; read-only/planned/imported routes; query error with retained selection; every intermediate/cancelled/interrupted transition state in the Calendar matrix. |
| `NS-LIBRARY` | Loading; true-empty Plans; empty filtered result; Plans/Exercises remembered states; owned active/inactive; starter/built-in/custom/unavailable; chooser Strength/Running; all create entry points; failed query/create/activation; form validation; dirty draft; pending/stale/failed save; delete confirmation; restart; replacement/day-removal impact; explicit activation and collision review. |
| `NS-RUNNING` | New draft; zero sessions; populated weekly plan; Recovery, Long run, Progression, Tempo continuous/repeats, Intervals, Hills, Fartlek structured/unstructured; add/edit/delete/reorder; invalid unit/value; keyboard-covered-field recovery; failed/stale/double save; restart; active/inactive detail; target set/unset. |
| `NS-GARMIN` | Capability loading; approval needed; disconnected; consent/cancel/deny/return/expiry; connected zero/populated; syncing/imported/no-new/error; revoke review/pending/success/failure; picker initial/cancel; FIT reading/preview/importing; malformed/truncated/CRC/oversize/unsupported/low-storage/duplicate/revision/process-death; outdoor route/HR optional; treadmill no route; missing laps/HR/GPS; unmatched/matched; candidate loading/zero/one/many/stale/consumed; match confirm/cancel/failure. |
| `NS-PROGRESS` | Loading; All/Strength/Running; 4 weeks/12 weeks/All time; latest/best/target/gap/goal-line/evidence/next-target; 2.4 km fixed target; 10 km/Half Marathon unset; sparse/empty/more-data-needed/ready; failure retaining scope; rebuilding projection; history sheet; exercise history loading/error/empty; Load/Relative with and without valid bodyweight; target edit/validation/failure; recommendation keep/use/stale/failure; bodyweight empty/history/add/edit/delete-confirmation. |
| `NS-SETTINGS-RECOVERY` | Never-backed-up; all automatic-backup statuses; cloud recovery/quarantine/previous/future schema/stale writer/partial deletion/new backup; encrypted export and clean/merge preflight; exact confirmation; cancel; progress; committed source plus rebuild pending; source failure/retry. |

No pack may be reduced by sampling. A state that is impossible after implementation uses `N_A_REVIEWED` with its domain reason in the row ledger.

---

## Interaction and Accessibility Matrix

### 48dp, text, semantics, and reading order

- Record native content bounds, density, safe-area insets, IME bounds, and every required hit rectangle in dp. Every target is ≥48×48dp and adjacent targets do not overlap. A visually small child may sit within a 48dp owner only when the owner does not cross a neighboring target.
- Run actual Android font scale 2.0. Required actions, labels, status text, numbers/units, errors, consequences, bottom-nav labels, sheet controls, and confirmation phrases remain present and reachable. No horizontal text scroll is introduced.
- At 600dp and 840dp, preserve the four-item bottom navigation; no automatic rail or fifth root. Layout may center/widen only where the owning UI-SPEC permits it.
- In landscape, header/navigation/dock/IME clearances remain correct; the content or sheet body owns vertical scroll. Rotate during active input, rest, Calendar focus, Running editor draft, FIT review, and Progress selection. Preserve values, date, anchor, route, selection, and focus.
- State never depends on color alone. Capture accessible name, role, checked/selected/expanded/busy/disabled/current state, collection position, and live announcement where applicable.
- Adaptive reading order follows the visible hierarchy at every width. Multi-column reflow remains left-to-right then top-to-bottom unless the owning contract states otherwise.

### Keyboard, D-pad, and focus

Run touch, software keyboard, hardware keyboard, and D-pad on every interactive state pack. The interaction report records focus before input, key/action, focus after input, command count, and visible-focus screenshot hash.

- Tab/D-pad reaches every required action exactly once and never enters hidden, inert, background, disabled, or decorative content.
- Enter, Space, D-pad center, and accessibility activate call the same command as touch exactly once.
- Back/Escape closes the top sheet/dialog first, cancels uncommitted editing/reorder/gesture safely, then follows the reviewed route contract. It never confirms a destructive or source mutation.
- Opening a sheet/dialog moves focus to its heading or documented safe first control, traps modal focus, and makes the background inert. Closing restores the exact invoker.
- Root navigation focuses the new heading. Deep-route return restores the triggering row/action and scroll anchor. If that item no longer exists, focus moves to the documented nearest stable heading, next row, or empty-state CTA.
- Visible focus is never clipped and uses the shared Phase 14 3dp focus ring with its 3dp exterior offset on every required interactive target; selection remains visually distinct from focus.
- Drag/reorder has Move earlier/later or Move up/down alternatives. Calendar has Previous/Today/Next plus arrow-key civil-date navigation. No required result is gesture-only.

### Reduced motion

Motion-sensitive cases run once with reduced motion enabled before mount and once after toggling it while mounted.

- Destination, selected date, ordered state sequence, command result, focus, callback count, and source facts are identical to normal motion.
- Translation, morph travel, animated scroll, spring, bounce, scale, shimmer, and decorative rotation are removed or made immediate as defined by the owning spec.
- No timer or animation completion is authority for navigation, persistence, completion, import, matching, or focus.
- Retain a static capture at each semantic checkpoint plus the ordered trace. A final screenshot alone does not prove reduced-motion parity.

### Calendar native gesture checkpoints

Calendar acceptance additionally records timestamped geometry and semantics for:

1. Horizontal 1:1 drag in both directions at 10%, 24.9%, exactly 25%, and 25.1% of measured content width.
2. Inclusive title/settle boundary `abs(dx) >= 0.25 × width`; receding below the boundary restores the current title.
3. Below-threshold release, exact-threshold release, above-threshold release, high-velocity short drag, reverse drag, pointer cancel, and vertical/diagonal intent.
4. Selected-row expansion from measured month position to top and following-row motion to bottom; inverse collapse to original positions.
5. Adjacent selection ordered exactly as old focused week → collapse → month selection → new-week expansion → new focused week/agenda.
6. Rapid retarget, second drag during settle, rotation/background/cancel, stale callback suppression, first/middle/last week, month/year boundary, leap February, and 4/5/6-row months.
7. The same semantic checkpoints under reduced motion, with no stuck intermediate state.

Translation samples tolerate at most ±2dp capture noise after density conversion. The 25% comparison itself, month choice, callback count, and final date have zero semantic tolerance.

---

## Evidence Identity, Naming, and Storage

### Run identity

All later authorized Phase 20 evidence lives under:

`artifacts/native/v1.2/<run-id>/`

`<run-id>` is `phase20-<UTC YYYYMMDDTHHMMSSZ>-<source-head-12>`. It is immutable after the first artifact is recorded. Retrying creates a new run ID; it never overwrites a failed run.

All Phase 20 tools, test-only probes, flows and validators are implemented, self-tested and committed before the pinned toolchain/full-host/coverage gate freezes source and builds one exact artifact. Shards then emit observations/gate inputs only. Any source, flow, fixture, contract, tool, APK, signature, installed-byte or identity change after freeze invalidates the run and requires a new build/run. The owner-attended Samsung checkpoint precedes automated attended-record validation and the sole final seal.

Required top-level artifacts:

- `build.json`
- `ui-state-matrix.json`
- `calendar-transitions.json`
- `performance.json`
- `sqlite/*.json`
- `maestro/*.xml`
- `screenshots/`
- `comparison/`
- `semantics/`
- `geometry/`
- `attended-observations.json`
- `final-evidence.json`

### Screenshot naming

Use:

`<capture-id>__<requirement-id>__<state-id>__<fixture-id>__<config-id>__<motion-id>__<input-id>__s<step-3>.png`

Example:

`BW-022__CAL-01__calendar-month__oct-2026-mixed__SL-C360-P-F200__mN__iT__s000.png`

Codes:

- `<config-id>` uses the exact `AP-SIZE-ORIENTATION-FONT` codes above.
- `mN` = normal motion; `mR` = reduced motion.
- `iT` = touch; `iS` = software keyboard; `iH` = hardware keyboard; `iD` = D-pad.
- `s000` is the settled/static state; ordered transition steps use `s001`, `s002`, and onward.

The manifest carries the full inventory ID, route/component, fixture description, and browser/reference path so filenames stay below filesystem limits.

### Mandatory identity envelope

Every automated result binds:

- Requirement ID, inventory ID, capture/state ID, fixture ID and SHA-256, producer and schema version.
- Source Git HEAD, source-tree digest, dirty-state declaration, prototype Revision 18 and the two source hashes in frontmatter.
- Exact retained and installed APK SHA-256, byte size, build profile, package ID, version, signature/certificate identity, and proof the installed bytes match the retained bytes.
- Device/emulator profile, Android/API version, density, resolution/content bounds, refresh rate, locale, timezone, font scale, appearance preference, resolved OS scheme, orientation, motion setting, input mode, and hashed device identifier.
- Start/finish UTC timestamps, ordered case IDs, expected/actual counts, zero-skip status, outcome, raw report hashes, image hashes, mask hashes, and comparison-tool version.
- Device settings before the run, changes made for the case, and proof the settings were restored.

A planning-only commit after the evidence run is accepted only through an explicit validator policy proving unchanged source digest and APK bytes. Equality is never silently weakened.

### Fail-closed validator

The validator rejects missing, duplicate, unknown, skipped, or out-of-order mandatory IDs; unreviewed `N_A_REVIEWED`; `ACCEPTED_EXCEPTION` without deviation ID, owner decision/date, exact scope/configurations, rationale and evidence hashes; any accepted exception counted as PASS; stale or altered bytes; path traversal; identity mismatch; empty/failing native results under success metadata; wrong configuration; insufficient samples; or changed thresholds. It also rejects:

- A component mock attached as the only native evidence.
- A Calendar transition row with only a final screenshot.
- A System case that never renders both OS schemes and switches while mounted.
- A screenshot whose declared size/density/font/orientation does not match measured content bounds.
- An attended observation used to fill an automated-integrity row.
- A stub used to claim approved Garmin API behavior.
- A failed run that was overwritten or renamed as a passing run.

---

## Privacy-Safe Screenshot Contract

Committed/shared evidence uses deterministic synthetic fixtures only.

- No real name, email, account subject, plan/exercise text identifying the owner, notification content, token, credential, raw external activity ID, device serial, local path, FIT filename, personal FIT bytes, GPS coordinates, route, bodyweight, or workout history may appear.
- Use synthetic route geometry and synthetic activities while preserving the same visual complexity. Treadmill remains route-free.
- Device identifiers are one-way hashed with run-scoped metadata; raw serials stay outside the artifact.
- Disable or clear notification previews and unrelated system overlays before capture. System bars may remain only when they contain generic time/connectivity state and their pixels are classified as platform chrome.
- Prefer preventing sensitive pixels at the fixture/device layer. Redaction is not a fidelity technique and cannot turn a private raw capture into canonical comparison evidence.
- If unavoidable private content appears, quarantine the raw file outside the repository, record only a privacy incident/failure in the run, and recapture with synthetic data. Do not commit a blurred or cropped substitute as a pass.
- Logs and JSON use aggregate counts, stable synthetic IDs, hashes, and bounded diagnostic codes; they never dump rows, FIT payloads, coordinates, or filenames.

---

## Prototype Comparison, Tolerances, and Triage

### Normalization

- Compare Revision 18 and native captures with identical fixture, frozen clock/date, locale, timezone, appearance, logical content bounds, and state.
- Preserve native density. Do not rescale or stretch a capture to create a match.
- Crop only to the declared app content bounds. Platform status/navigation chrome, IME, pointer cursor, and device cutout may be excluded only by a named, versioned mask whose SHA-256 is stored in the comparison record.
- Retain reference, native, overlay, absolute-difference image, masks, and reviewer disposition.

### Semantic gates — zero tolerance

Any one of these is an immediate `FAIL` regardless of pixel percentage:

- Missing, added, renamed, hidden, disabled, duplicated, or reordered required content/action.
- Wrong root count/order/selection; wrong route; wrong state, source fact, unit, target, status, focus, reading order, or gesture result.
- A required target below 48dp or overlapping its neighbor.
- Clipped/obscured primary action, dock, nav, field, error, confirmation, or 200% text.
- Color-only state; missing non-color cue; missing accessible name/role/state.
- Premature success before commit; fixture data shown as source fact; mutation from a read-only route.
- Unregistered deviation from the owning spec or Revision 18.

### Measured visual tolerances

| Area | Tolerance |
|---|---|
| Component/section geometry | ±1dp for rules, borders, rails, and aligned structural edges; ±2dp for text baselines and icon optical bounds after density conversion |
| Touch/focus | No tolerance below 48×48dp; no overlap; shared visible focus is the Phase 14 3dp ring with 3dp exterior offset |
| Flat semantic colors | Source token must be exact in code; screenshot sample CIEDE2000 ≤2 after excluding antialiased/blended edge pixels |
| Typography | Exact family, declared size/weight/line height and semantic role; glyph antialiasing may differ, but wrapping/line count at the 390×844 F100 oracle must match unless a recorded native/accessibility deviation says otherwise |
| Responsive reflow | No fixed pixel match to the 390px prototype; required hierarchy, order, controls, labels, insets, and owning-spec width behavior must hold at each declared configuration |
| Calendar pointer geometry | ±2dp sample noise only; threshold decision, title, selected date, ordered transition, and callback count have zero tolerance |

### Pixel-difference triage

Count a pixel as changed when any unmasked sRGB channel differs by more than 12/255. Pixel percentage is diagnostic only:

- `≤0.5%`: may be classified `antialias_only` only after semantic gates and measured tolerances pass.
- `>0.5% and ≤2.0%`: `REVIEW_REQUIRED`; a reviewer classifies text rasterization, native control/chrome, or a real mismatch.
- `>2.0%`: `FAIL` until the implementation is corrected or a specific owner-accepted deviation covers the difference.

No percentage, including zero, can excuse a missing control, changed copy, wrong interaction, accessibility failure, or unaccepted deviation. Platform-native chrome differences use the stored mask/classification; generic “Android looks different” is not a disposition.

### Triage record

Each non-clean comparison records `difference_id`, requirement/inventory/capture IDs, affected bounds, reference/native/comparison hashes, semantic-gate results, measured deltas, classification, owner/deviation reference if any, reviewer, UTC date, and disposition. Allowed classifications are `antialias_only`, `platform_chrome_masked`, `native_metric_within_tolerance`, `accepted_deviation`, or `product_mismatch`. `accepted_deviation` maps to the non-PASS row verdict `ACCEPTED_EXCEPTION` and requires deviation ID, dated owner decision, exact scope/configurations, rationale and all referenced evidence hashes. Any other label or any attempt to count the exception as PASS fails schema validation.

---

## Conditional Gates

### TIM-01 — legacy cadence / cluster runtime policy

TIM-01 is unresolved. The approved UI contract already removes cadence, per-rep pacing, rest-between-reps, cluster-gap, nested Advanced Timing, and plan-owned sound/haptic **authoring UI**. That visual decision does not silently authorize retirement of legacy runtime playback, foreground reconciliation, or queued callbacks.

Locked regardless of the eventual runtime choice:

- Preserve schema-21/27 configuration, resolved snapshots, timing state rows, target ownership, backup/restore parsing, committed sets, active exercise/set pointer, plan/schedule provenance, and independent between-set rest.
- Never delete, rewrite, normalize, or present retained timing facts as off merely because authoring controls are hidden.
- Flat between-set rest with explicit `sec` remains supported and visible. Its owner-approved labels remain exactly `RESTING`, `REST PAUSED`, `−15`, `Pause`, `Resume`, `+15`, and `Skip`, plus the owning Phase 15 saved/saving/failure labels. Phase 20 may not rename, recase, or normalize them.
- No cue, rest, set, pointer, toast, collapse, or success state may advance before the authoritative commit.

The identity-bound native fixture ledger must enumerate:

| Fixture ID | Required proof |
|---|---|
| `TIM-01-ACTIVE-PLAYBACK` | Open a migrated active session carrying a legacy cadence/cluster snapshot. Exercise the owner-selected playback policy without exposing removed authoring UI, rewriting the snapshot, or affecting a different set/session. |
| `TIM-01-FOREGROUND-RECONCILIATION` | Background then foreground during legacy active playback and during between-set rest. Reconciliation follows the chosen policy exactly once and preserves committed set, active pointer, rest deadline/paused remainder, and plan/session provenance. |
| `TIM-01-QUEUED-CALLBACK` | Queue a legacy callback, cross background/foreground and set boundaries, then resolve/cancel it according to the chosen policy. No stale, duplicate, cross-set, or post-retirement cue may fire. |
| `TIM-01-RELAUNCH` | Kill/relaunch before and after a timing boundary. Reopen the same session, committed set facts, active exercise/set pointer, and independent between-set rest without duplicate completion or cue replay. |
| `TIM-01-RESTORE` | Restore a compatible archive containing schema-21/27 timing facts and an active/recoverable session. Facts remain byte/meaning equivalent; set, pointer, and rest recovery match the chosen policy. |
| `TIM-01-MERGE` | Merge divergent archives containing retained timing snapshots/state. Stable identities and ownership remain correct; merge neither reactivates retired cues nor discards retained facts; set/pointer/rest remain coherent. |
| `TIM-01-ZERO-CUE` | If retirement is approved, prove zero repetition/cluster cues across active playback, foreground, queued callback, relaunch, restore, and merge while ordinary between-set rest remains functional. If retention is chosen, prove only the owner-approved cues occur. |
| `TIM-01-REST-SET-POINTER` | Across every fixture above, assert exact committed-set digest, active exercise/set pointer, rest status/deadline/paused remainder, labels, controls, and post-recovery command idempotency. |

`DOM-03`, `DOM-15`, `DOM-17`, `WRK-05`, `WRK-18`, `WRK-21`–`WRK-23`, `WRK-26`, `VER-07`, and `VER-08` carry TIM-01 compatibility assertions. Their unaffected assertions may be reported separately, but the affected row verdict remains `BLOCKED_OWNER` until a dated owner runtime decision and all applicable `TIM-01-*` evidence pass. If zero-cue behavior cannot be proven while between-set rest/set/pointer recovery remains exact, block cutover and retain the prior recovery path; do not ship a UI-only retirement.

### DEV-01 — Calendar 360dp target geometry

- Current oracle: 18dp horizontal inset, 2dp gaps, 44.5625px day width at 360px.
- Proposed adaptation: Calendar-only horizontal inset `min(18, max(0, (safeWidth - 348) / 2))` dp, producing 6dp at 360 and 18dp at 390 while preserving 2dp gaps and row/event geometry.
- Required comparison: identical 360×844 fixture in all four appearance codes at F100 and F200, with hit-bound overlays and non-overlap measurements for both branches.
- Until the owner records one choice/date in the deviation register, affected CAL/VER rows are `BLOCKED_OWNER`. A selected non-oracle adaptation or retained failing oracle is `ACCEPTED_EXCEPTION`, not PASS, and requires the complete exception metadata/evidence envelope.

### DEV-02 — Light Calendar Strength-title contrast

- Current oracle: `#D97820`, measured 3.03:1 on paper and 2.56:1 on selected blue fill.
- Proposed Light-only title: `#9B470B`, measured 6.12:1 on paper and 5.17:1 on selected fill; border/rail/swatch remains `#D97820`; Dark is unchanged.
- Required comparison: identical Light/System→Light complete, partial, planned, selected, and blended-fill fixtures at all four widths and both font scales.
- Until owner choice/date is recorded, affected CAL-03/VER-04 and visual rows are `BLOCKED_OWNER`. A selected candidate or retained failing oracle is `ACCEPTED_EXCEPTION`, not PASS, and requires the complete exception metadata/evidence envelope; the candidate token remains unused until selected.

### Garmin API acceptance

- Offline original-FIT import, deterministic parser faults, dedupe, source revision, local detail, and explicit matching are unconditional and must pass independently.
- GAR-04–GAR-07 and NV-IMP-11–13 require actual Garmin program access, the granted delivery/scope contract, real consent, and a separately reviewed confidential-credential topology.
- When those prerequisites are absent, live rows are `CONDITIONAL_EXTERNAL`, not failed product UI and not a stub pass. Deterministic fixture screenshots may prove visual rendering only.
- No unofficial login/scraping, embedded confidential secret, invented broker, simulated production consent, or manual FIT result may be used as provider closure.

### Samsung attended acceptance

- Later owner-authorized Samsung review is additional observation for legibility, one-handed dock reach, drag/morph feel, focus/keyboard, 200% reflow, Light/Dark/System, and device-owned audible/haptic presentation.
- Store it only in `attended-observations.json`, bound to the same source/APK/signature/installed-byte identity and per-row capture hashes.
- Previous N4 evidence remains historical and observation-only. It cannot fill v1.2 automated rows, prove SQLite integrity, approve DEV-01/02, resolve TIM-01, close Garmin access, authorize release, or promote bytes.
- Automated failures stay failed even when the attended reviewer likes the experience. Automated passes do not replace attended observations where VER-12 requires them.

---

## Copywriting Contract

Phase 20 introduces **no product-visible evidence UI and no new product copy**.

| Element | Contract |
|---|---|
| New primary CTA | None; Phase 20 is verification, not a product route |
| New empty state | None |
| New error/retry state | None; product-visible error and retry copy must match the owning Phase 14–19 contract exactly |
| New destructive confirmation | None |
| Evidence runner/report messages | Developer-only artifact content, excluded from product screenshot and copy review |

Do not add `Retry evidence`, `Verification failed`, a debug banner, or an acceptance dashboard to the app. If verification discovers a product-visible failure state, repair it using the owning UI-SPEC's exact problem + unchanged-facts + next-action copy.

---

## UI Considerations

Applicable state considerations resolved: **8 covered, 9 backstop, 0 unresolved**. The product surfaces are the Phase 14–19 elements; the evidence ledger/report is developer-facing and never becomes app UI.

| Category | Element(s) | Status | Resolution / reason |
|---|---|---|---|
| empty | Every list, media, form, and detail surface | ✅ covered | The native-only state packs name zero-data, no-match, missing-detail, no-plan, no-session, no-activity, no-candidate, sparse, and unset-goal states. Exact product copy stays in the owning UI-SPEC. |
| loading | Startup, collections, forms, import, projection, recovery | ✅ covered | Stable geometry or last-good data, busy/disabled semantics, no fake zero/source facts, and no pre-commit success are mandatory named states. |
| error | Reads, mutations, projection, import, matching, backup | ✅ covered | Each owning contract preserves context/draft/facts and supplies its exact retry path; Phase 20 adds no generic error copy. |
| populated | All 107 browser-walk states and normal source-backed routes | ✅ covered | The ordered oracle baseline plus per-row fixture mapping proves hierarchy, content, semantics, navigation, and visual roles. |
| partial | Workout, Calendar, import, Progress, recovery | ✅ covered | Partial/missing/stale/rebuilding states use literal text plus non-color cues and never coerce absence to zero or success. |
| overflow | Long lists, sheets, docks, tables, charts, landscape | ✅ covered | One vertical owner, nav/dock/IME clearance, wrapping/reflow, virtualized many-row cases, and no required horizontal-only content are verified. |
| zero-one-many | Exercises, sets, events, plans, sessions, activities, laps, candidates, evidence rows | ✅ covered | Each collection gets zero, one, and many fixtures with plural-safe copy, stable identity/order, and complete semantics. |
| long-text | Names, errors, confirmations, units, nav, target/recommendation evidence | ✅ covered | F200 and adversarial long strings prove full accessible values, growing controls, bounded visual ellipsis only where explicitly allowed, and no collision. |
| 48dp/non-overlap | All required controls | 🧪 backstop | Native bounds report plus screenshots at all sizes/orientations/font scales must prove ≥48dp and no overlap; DEV-01 remains blocked until owner disposition. |
| Light/Dark/System | Every mounted product surface | 🧪 backstop | The 64-configuration expansion and runtime System switch prove theme parity without route/state/focus reset. |
| landscape/adaptive order | Every root, deep route, sheet, dock and editor | 🧪 backstop | Corresponding landscape captures and semantics trace prove unchanged hierarchy, bottom navigation, reading order, and reachability. |
| keyboard/D-pad | Navigation, controls, lists, forms, sheets, deep routes | 🧪 backstop | Key-event/focus trace proves logical traversal, activation once, alternate reorder/Calendar paths, Back/Escape, modal isolation, and focus return. |
| focus | Root/deep/sheet transition graph | 🧪 backstop | Visible-focus captures and automated focus assertions prove the shared Phase 14 3dp ring with 3dp exterior offset, heading entry, exact trigger return, and no hidden stops. |
| reduced motion | Calendar, sheets, route/dock/list transitions | 🧪 backstop | Normal/reduced ordered traces prove identical semantic destinations and callbacks without motion/timing-dependent truth. |
| legacy timing recovery | Active Workout, relaunch, restore, merge | 🧪 backstop | TIM-01 fixtures prove the owner-selected runtime policy plus zero unintended cues and exact between-set-rest/set/pointer recovery; affected rows remain owner-blocked until decision and evidence. |
| privacy | Screenshot, logs, FIT and device identity | 🧪 backstop | Synthetic fixtures, hash validation, sensitive-pattern rejection, and manual privacy review must pass before artifacts can be shared. |
| comparison tolerance | Every screenshot state | 🧪 backstop | Reference/native/overlay/difference artifacts plus zero-tolerance semantic gates and bounded geometry/color triage produce an explicit disposition. |

No open UI consideration is silently deferred. DEV-01, DEV-02, TIM-01, and live Garmin access are explicit conditional gates rather than unresolved assumptions.

---

## VER Requirement Traceability

| Requirement | Contract sections |
|---|---|
| VER-01 | Coverage arithmetic; 107-state baseline; native-only state packs; fail-closed validator |
| VER-02 | Required rendered configurations; Color; comparison normalization/tolerances |
| VER-03 | 64-configuration matrix; 48dp/text/reading order; landscape |
| VER-04 | 48dp/text/semantics; non-color state; DEV-01/02 gates; privacy-safe captures |
| VER-05 | Keyboard, D-pad, focus, Back/Escape, modal isolation and restoration |
| VER-06 | Reduced-motion matrix and Calendar semantic checkpoints |
| VER-07 | 17 domain-row real SQLite evidence; identity envelope; fail-closed validator |
| VER-08 | Native-only lifecycle packs; exact source/APK identity; process reconstruction; all `TIM-01-*` active-playback/foreground/queued/relaunch/restore/merge/zero-cue/rest-set-pointer fixtures; affected acceptance remains `BLOCKED_OWNER` until decision and evidence |
| VER-09 | Calendar gesture checkpoints and zero-tolerance semantic decisions |
| VER-10 | Garmin conditional gate; unconditional FIT/dedupe/match states; privacy |
| VER-11 | Native verification matrix budgets; identity-bound `performance.json`; no screenshot substitution |
| VER-12 | Samsung attended acceptance kept separate from automated proof |
| VER-13 | Complete parity/deviation/gap record including separately counted non-PASS accepted exceptions; unchanged signed-byte identity; policy-bound conditional readiness; later explicit owner release gate |

Performance budgets remain exactly those in `20-CONTEXT.md` and the native verification matrix: warm interactive ≤1s, cold no-migration ≤2s, warm root switch p95≤100ms, set+dock p95≤150ms with ordinary JS task ≤50ms, input/rest p95≤50ms, search after debounce p95≤100ms, Calendar p95≤250ms, useful Progress ≤500ms, review-open p95≤200ms, plus the explicit backup/merge and bounded future FIT measurements. Visual smoothness is not inferred from nominal duration or Jest timing.

---

## Registry Safety

| Registry | Blocks used | Safety gate |
|---|---|---|
| shadcn official | none | Not applicable — Expo/React Native project, no `components.json` |
| Third-party UI registries | none | No registry code enters Phase 20 |

Phase 20 adds no dependency. Existing pinned native packages remain governed by the repository's dependency and license review; deterministic evidence must name their exact lockfile/source identity.

## Six-Dimension Researcher Self-Check

| Dimension | Verdict | Evidence |
|---|---|---|
| 1. Copywriting | PASS | No verification UI or new product copy is introduced; all product failure/retry/destructive copy is delegated explicitly to the owning Phase 14–19 contract. |
| 2. Visuals | PASS | The 107-state oracle baseline, native-only state packs including TIM-01, 64 configurations, interaction checkpoints, identity, privacy, and comparison dispositions are prescriptive without rewriting owner-approved UI. |
| 3. Color | PASS | Shared 60/30/10 roles and exact semantic values are declared; non-color state is mandatory; DEV-02 remains visibly owner-blocked. |
| 4. Typography | PASS | Exactly four cross-phase semantic roles and two logical weights are declared; Phase 15/16/18/19 numeric oracle realizations are explicitly mapped as source fixtures, not extra tokens or a fifth role. Native 200% scaling, wrapping, units, and font identity remain exact. |
| 5. Spacing | PASS | Only 4/8/16/24/32/48/64 are reusable tokens. Exact owner-approved Phase 14–19 component fixtures are source-cited and non-reusable; ≥48dp, viewports, landscape, safe areas, IME, and tolerances are explicit; DEV-01 remains the only proposed spacing adaptation. |
| 6. Registry safety | PASS | Repository-native system only; no shadcn, third-party registry block, or new dependency. |

Self-check does not upgrade frontmatter status, accept DEV-01/02, resolve TIM-01, prove Garmin access, rewrite any owning UI-SPEC, or authorize a build/release.

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved by gsd-ui-checker; explicit owner and external gates remain open where documented.
