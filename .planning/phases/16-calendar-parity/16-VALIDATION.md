---
phase: 16
slug: calendar-parity
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-06
requirements: [CAL-01, CAL-02, CAL-03, CAL-04, CAL-05, CAL-06, CAL-07, CAL-08, CAL-09, CAL-10, CAL-11, CAL-12, CAL-13, CAL-14, CAL-15, CAL-16, CAL-17, CAL-18, CAL-19, CAL-20, CAL-21, CAL-22, CAL-23]
automated_gaps: 0
manual_only: 2
validated_at: 2026-10-14
validated_head: 0932f7c87a189e72db3f3a39e691644efddd9821
source_implementation_head: 28f77d9e
---

# Phase 16 — Validation Strategy

> Execution-time Nyquist contract for Calendar parity and its read-only authority boundary. DEV-01/DEV-02 are approved in the owner record; no implementation test, build, native run, or evidence claim in this document was completed during planning.

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Jest 29.7 projects (`unit`, `components`, `sqlite-host`, `integration`), React Native Testing Library 14.0.1, Maestro 2.8.0, and Android frame/geometry traces |
| **Config files** | `jest.config.js`, `scripts/run-coverage-gate.mjs`, `maestro/v1.2/calendar.yaml` |
| **Quick unit command** | `npm run test:unit -- --runInBand src/domains/scheduling/localDate.test.ts src/domains/history/calendar.test.ts` |
| **Quick component command** | `npm run test:components -- --runInBand src/ui/__tests__/CalendarTransitions.test.tsx src/ui/__tests__/CalendarScreen.test.tsx src/ui/__tests__/SessionDetailScreen.test.tsx src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx` |
| **Upstream repository command** | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/trainingCalendarRepository.test.ts` |
| **Full host command** | `npm run typecheck && npm run lint && npm run check:boundaries && npm run test:all -- --runInBand` |
| **Native runner** | `npm run android:devtest:fresh -- --suite v1.2-calendar && npm run test:maestro:v12:calendar -- --manifest artifacts/native/v1.2-calendar/build.json` |
| **Diagnostic performance command** | `npm run diagnose:v12:calendar -- --manifest artifacts/native/v1.2-calendar/build.json --query-samples 100 --interaction-samples 100` (records raw values/p95 only; Phase 20 Plan 20-08 owns release/profile acceptance) |
| **Evidence command** | `npm run verify:v12:calendar -- --manifest artifacts/native/v1.2-calendar/build.json --automated-only` |
| **Feedback target** | Each focused task command completes in less than 60 seconds; native collection may run longer, while its artifact verifier remains the task's fast automated gate. |

## Sampling Rate

- **After every task commit:** Run the exact task `<automated>` command.
- **After Wave 1:** Confirm the Phase 13/15 compile-time dependency preflight, 100% integrity-critical controller coverage, and both approved owner values validated in `16-01-SUMMARY.md`.
- **After Wave 2:** Run month/civil/event and read-only route suites independently; plans 16-02 and 16-03 have no file overlap.
- **After Waves 3–4:** Run Calendar transition, root-route, history-detail, planned-preview, correction, and removed-session regressions together.
- **Before native collection:** Run full host/type/lint/boundary coverage and bind one fresh development-test APK/source manifest.
- **Phase gate:** Pass the exact NV-CAL-01..09 functional/geometry ledger, mapped reference/native/overlay/difference completeness, source digest equality, privacy checks, and real Phase 17/18 route journeys. Development-test query/frame diagnostics must be complete but carry no Phase 16 acceptance verdict; Phase 20 Plan 20-08 owns NV-PERF-07/NV-PERF-09 acceptance.
- **Watch mode:** Prohibited for acceptance evidence.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirements | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---:|---:|---|---|---|---|---|---|---|
| 16-01-01 | 01 | 1 | CAL-07, CAL-08, CAL-09, CAL-15 | T-16-01-01..03 | Exact narrow upstream ports; current-epoch transitions only | component + coverage | `npm run test:components -- --runInBand src/ui/calendar/calendarPorts.test.ts src/ui/__tests__/CalendarTransitions.test.tsx && npm run test:coverage:v12:calendar` | ✅ | green |
| 16-01-02 | 01 | 1 | CAL-01 trace | T-16-01-02 | DEV-01 approved value is validated before inset implementation | artifact + automated record gate | Owner JSON says `adaptive-6-to-18dp`; summary records choice/date | approval ✅; native evidence deferred to Phase 20 | green (host gate); manual deferred |
| 16-01-03 | 01 | 1 | CAL-03 trace | T-16-01-02 | DEV-02 approved value is validated before title-color implementation | artifact + automated record gate | Owner JSON says `accessible-9b470b`; summary records choice/date | approval ✅; native evidence deferred to Phase 20 | green (host gate); manual deferred |
| 16-02-01 | 02 | 2 | CAL-01, CAL-03, CAL-04, CAL-05 | T-16-02-01..03 | Real typed event reaches query-only root; owner branch recorded | component | `npm run test:components -- --runInBand src/ui/__tests__/CalendarScreen.test.tsx` | ✅ | green |
| 16-02-02 | 02 | 2 | CAL-01, CAL-04, CAL-05, CAL-06, CAL-10 | T-16-02-02 | Civil bounds and event identities never flatten or drift | unit | `npm run test:unit -- --runInBand src/domains/scheduling/localDate.test.ts src/domains/history/calendar.test.ts` | ✅ | green |
| 16-02-03 | 02 | 2 | CAL-01..06, CAL-10, CAL-11, CAL-21 | T-16-02-01..04 | Last-good generation guard; no invented data or mutation | component | `npm run test:components -- --runInBand src/ui/__tests__/CalendarScreen.test.tsx` | ✅ | green |
| 16-03-01 | 03 | 2 | CAL-18, CAL-20 | T-16-03-01, T-16-03-02 | Exact session read and structurally command-free Calendar branch | component + route | `npm run test:components -- --runInBand app/__tests__/session-route.test.tsx src/ui/__tests__/SessionDetailScreen.test.tsx` | ✅ | green |
| 16-03-02 | 03 | 2 | CAL-18, CAL-20, CAL-22, CAL-23 | T-16-03-02, T-16-03-04 | Calendar zero commands/digest unchanged; management actions preserved | component | `npm run test:components -- --runInBand app/__tests__/session-route.test.tsx src/ui/__tests__/SessionDetailScreen.test.tsx src/ui/__tests__/SessionCorrectionScreen.test.tsx src/ui/__tests__/RemovedSessionsScreen.test.tsx` | ✅ | green |
| 16-03-03 | 03 | 2 | CAL-19 | T-16-03-01, T-16-03-03 | Exact occurrence only; no fabricated session/result/effect | component + route | `npm run test:components -- --runInBand app/__tests__/calendar-plan-route.test.tsx src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx` | ✅ | green |
| 16-04-01 | 04 | 3 | CAL-07, CAL-08, CAL-09 | T-16-04-01, T-16-04-02 | UI-thread 1:1 motion; distance-only one-month settle | component/controller | `npm run test:components -- --runInBand src/ui/__tests__/CalendarTransitions.test.tsx` | ✅ | green (host); native deferred |
| 16-04-02 | 04 | 3 | CAL-07..11, CAL-15 | T-16-04-01..04 | Intent, cancellation and reduced-motion epochs prevent stale state | component | `npm run test:components -- --runInBand src/ui/__tests__/CalendarTransitions.test.tsx src/ui/__tests__/CalendarScreen.test.tsx` | ✅ | green (host); native deferred |
| 16-04-03 | 04 | 3 | CAL-12, CAL-13, CAL-14, CAL-15 | T-16-04-01, T-16-04-03 | Measured, revalidated geometry and ordered adjacent transition | component | `npm run test:components -- --runInBand src/ui/__tests__/CalendarTransitions.test.tsx src/ui/__tests__/CalendarScreen.test.tsx` | ✅ | green (host); native deferred |
| 16-05-01 | 05 | 4 | CAL-16 | T-16-05-01, T-16-05-02, T-16-05-04 | One target and one exact completed-Strength dispatch | component + route | `npm run test:components -- --runInBand src/ui/__tests__/CalendarScreen.test.tsx 'app/(tabs)/__tests__/calendar.test.tsx'` | ✅ | green |
| 16-05-02 | 05 | 4 | CAL-16, CAL-21 | T-16-05-01..04 | Exhaustive event union reaches boundary unchanged; no downstream completion claim | component | `npm run test:components -- --runInBand src/ui/__tests__/CalendarScreen.test.tsx` | ✅ | green |
| 16-05-03 | 05 | 4 | CAL-20, CAL-22, CAL-23 | T-16-05-02, T-16-05-03 | Return state/ref validated before focus; management remains separate | component + route | `npm run test:components -- --runInBand src/ui/__tests__/CalendarScreen.test.tsx 'app/(tabs)/__tests__/calendar.test.tsx' src/ui/__tests__/SessionDetailScreen.test.tsx` | ✅ | green |
| 16-06-01 | 06 | 5 | CAL-07, CAL-08, CAL-12 | T-16-06-01, T-16-06-05 | Test controls production-rejected; traces cannot authorize state | unit + component | `npm run test:unit -- --runInBand src/bootstrap/phase16CalendarTestControls.test.ts && npm run test:components -- --runInBand src/ui/__tests__/CalendarTransitions.test.tsx` | ✅ | green |
| 16-06-02 | 06 | 5 | CAL-01..16, CAL-18..21 | T-16-06-02..04 | Exact map and individual artifacts; blocked/unexplained results cannot pass | node test | `node --test scripts/v12-calendar-comparison.test.mjs` | ✅ | green |
| 16-06-03 | 06 | 5 | CAL-01..16, CAL-18..21 | T-16-06-02..05 | Complete pre-destination diagnostic matrix; no performance verdict | node comparator | `node --test scripts/v12-calendar-comparison.test.mjs && node scripts/compare-v12-calendar.mjs --fixture scripts/fixtures/v12-calendar-comparison/complete.json --verify` | ✅ | green; native status REVIEW_REQUIRED |
| 16-07-01 | 07 | 6 | CAL-17, CAL-20 | T-16-07-01, T-16-07-02 | Actual Phase 17 loader/route and exact Calendar return focus | real route integration | `npm run test:components -- --runInBand app/__tests__/calendar-cross-destination-route.test.tsx` | ✅ | green (host route); native deferred |
| 16-07-02 | 07 | 6 | CAL-17, CAL-20, CAL-22, CAL-23 | T-16-07-01, T-16-07-02 | Actual Phase 18 loader/route; all destinations zero-mutation | real route integration | `npm run test:components -- --runInBand app/__tests__/calendar-cross-destination-route.test.tsx src/ui/__tests__/SessionDetailScreen.test.tsx` | ✅ | green (host route); native deferred |
| 16-07-03 | 07 | 6 | CAL-03, CAL-07, CAL-08, CAL-12..15, CAL-17, CAL-20 | T-16-07-03..05 | Final functional/comparison evidence; diagnostics carry Phase 20 ownership | node verifier + diagnostics | `node --test scripts/v12-evidence-scripts.test.mjs scripts/v12-calendar-comparison.test.mjs && npm run verify:v12:calendar -- --fixture scripts/fixtures/v12-calendar-evidence/complete.json` | ✅ | green host verifier; native deferred |

## Wave 0 Requirements

- [ ] Run `npm ci` from the committed lockfile before the first Jest command; no package or manifest change is allowed during hydration.
- [ ] Confirm Phase 13 exports `TrainingFoundationRuntimePort`, its bounded typed Calendar range read, immutable event/destination union, `trainingCalendarRepository.ts`, and passing `trainingCalendarRepository.test.ts`. Also require exact `PlannedStrengthOccurrenceDetail` and `TrainingFoundationRuntimePort.loadPlannedStrengthOccurrence(occurrenceId: string): Promise<PlannedStrengthOccurrenceDetail | null>` backed by `createPlansWorkoutRepository(...).loadPlannedStrengthOccurrence`; stale/mismatched provenance must return null without current-activation fallback. Stop on any mismatch.
- [ ] Confirm Phase 15 Plan 15-01 exports `WorkoutSessionPresentation`, immutable `WorkoutPresentationModel`, and disclosure-only props with no mutation capability. If absent, stop instead of duplicating an Active-shaped presenter.
- [ ] Confirm Phase 14 exports the Revision 18 shared root header, Info/Settings actions, modal sheet, focusable pressable, notice, skeleton, bottom navigation, appearance/reduced-motion values, Archivo/IBM Plex Mono, and semantic tokens.
- [ ] Create RED-first scaffolds in their owning tasks: `calendarPorts.test.ts`, `CalendarTransitions.test.tsx`, route/detail and real cross-destination tests, planned preview tests, Phase 16 test controls, Maestro flow, `16-REFERENCE-MAP.json`, comparison/verifier adversarial tests, and diagnostic sampling cases.
- [ ] Validate DEV-01/DEV-02 from the owner records into `16-01-SUMMARY.md`; Plan 16-02 records the dated approvals in `v1.2-DEVIATIONS.md`. Incomplete evidence remains `REVIEW_REQUIRED`; failed evidence is `FAIL`; only complete passing evidence closes the approved adaptations.
- [ ] Restore Java 17, Android SDK/adb, Maestro 2.8.0, and one development-test emulator/device before Plan 16-06. Native absence cannot be replaced by Jest animation mocks or final screenshots.
- [ ] Before Plan 16-07, require real Phase 17 `17-08-SUMMARY.md` plus `app/library/running/[planId].tsx`/route tests, and real Phase 18 `18-08-SUMMARY.md`/`18-14-SUMMARY.md` plus `app/garmin/activity/[activityId].tsx`/Calendar-origin route tests. Mocked hrefs and fixture destinations cannot satisfy the precondition.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| DEV-01 approved 360dp inset | CAL-01 trace | Validate `adaptive-6-to-18dp` from the dated owner record. | Compare identical 360/390 fixtures and prove 6dp/18dp padding, 2dp gaps, and non-overlapping 48dp targets. |
| DEV-02 approved Light Strength title | CAL-03 trace | Validate `accessible-9b470b` from the dated owner record. | Compare identical Light complete/partial/planned chips and prove #9B470B title contrast with #D97820 sport-role retention. |

All resulting behavior remains machine-measured. Incomplete approved-branch evidence yields `REVIEW_REQUIRED` and failed evidence yields `FAIL`; both prevent an all-pass result. Approval does not substitute for tests or native evidence.

## Multi-Source Coverage Audit

| Source | ID | Feature / Constraint | Plan | Status | Notes |
|---|---|---|---|---|---|
| GOAL | — | Understand/navigate real Strength and Running intent/history through the approved spatial Calendar and inspect history without Calendar mutation authority | 02–07 | COVERED | Month, motion, detail, diagnostic comparison and real cross-destination closure form one dependency chain. |
| REQ | CAL-01 | Full-height Monday-first month and persistent controls | 02, 06 | COVERED | Exact geometry plus native matrix. |
| REQ | CAL-02 | Info-before-Settings Calendar key; no inline legend | 02, 06 | COVERED | Shared Phase 14 modal/focus contract. |
| REQ | CAL-03 | Sport colors separate from complete/partial/planned patterns | 02, 06, 07 | COVERED | DEV-02 approved value/evidence outcome is explicit and cannot default to PASS. |
| REQ | CAL-04 | Shared 28/36 date-event tracks and measured continuity | 02, 04, 06 | COVERED | Shared row and native coordinates. |
| REQ | CAL-05 | Two titled visual events plus complete semantic list | 02, 06 | COVERED | Identity/order retained. |
| REQ | CAL-06 | Selected/today/outside/rest/empty semantics | 02, 06 | COVERED | Component and native matrices. |
| REQ | CAL-07 | Three panels, 1:1 pointer, vertical scroll | 01, 04, 06 | COVERED | Pure decision, worklet execution, native trace. |
| REQ | CAL-08 | Inclusive 25%, retreat/cancel, fast short snap-back | 01, 04, 06 | COVERED | One predicate; no velocity. |
| REQ | CAL-09 | 240ms exact easing and stale-safe completion | 01, 04, 06 | COVERED | Epoch plus native timestamps. |
| REQ | CAL-10 | Previous/Next/Today in both modes with day clamp | 02, 04, 06 | COVERED | Civil unit plus input parity. |
| REQ | CAL-11 | Arrow activation, visible focus, non-gesture controls | 02, 04, 06 | COVERED | Shared focusable primitive and D-pad trace. |
| REQ | CAL-12 | Measured selected/following row expansion and agenda | 04, 06 | COVERED | Overlay geometry, not crossfade. |
| REQ | CAL-13 | Reverse collapse to measured positions and focus | 04, 06 | COVERED | Geometry/focus evidence. |
| REQ | CAL-14 | Collapse → select/focus → adjacent expand | 01, 04, 06 | COVERED | Ordered controller states and native trace. |
| REQ | CAL-15 | Reduced-motion semantic equivalence | 01, 04, 06 | COVERED | Runtime toggle included. |
| REQ | CAL-16 | One full-width compact agenda target | 05, 06 | COVERED | No nested actions. |
| REQ | CAL-17 | Exact Strength/planned Running/imported Running routing | 03, 05, 07 | COVERED | Plan 07 waits for and executes the real Phase 17/18 routes; no mocked href completion. |
| REQ | CAL-18 | Active-shaped completed/partial read-only detail | 03, 06 | COVERED | Phase 15 facts presenter plus query-only route. |
| REQ | CAL-19 | Planned Strength occurrence preview without session fabrication | 03, 06 | COVERED | Exact occurrence read/missing state. |
| REQ | CAL-20 | Calendar return state/focus and exercise disclosures | 03, 05, 07 | COVERED | Plan 07 verifies Back/focus through real downstream screens. |
| REQ | CAL-21 | Source-backed loading/empty/stale/error/retry | 02, 05, 06 | COVERED | Last-good generation guard. |
| REQ | CAL-22 | Correction/revision/save-retry remains management-only | 03, 05, 07 | COVERED | Existing management regressions plus real-route Calendar negative tests. |
| REQ | CAL-23 | Resume/removal remains management-only | 03, 05, 07 | COVERED | Explicit capability branches and real-route zero-command trace. |
| CONTEXT | D16-01 | Full-height Monday month, Info before Settings, key dialog | 02 | COVERED | Exact shared shell composition. |
| CONTEXT | D16-02 | Orange/blue sport and pattern/text status separation | 02, 06, 07 | COVERED | Approved DEV-02 roles and verdict retain sport/status independence. |
| CONTEXT | D16-03 | Shared fixed tracks/titles/semantics/measured height | 02, 04 | COVERED | One renderer and measured overlays. |
| CONTEXT | D16-04 | 1:1, exact 25%, reversal/cancel, fast snap-back, vertical intent | 01, 04, 06 | COVERED | Controller, worklet, native proof. |
| CONTEXT | D16-05 | Exact month timing and measured expand/collapse | 01, 04, 06 | COVERED | Timed commands and geometry traces. |
| CONTEXT | D16-06 | Ordered adjacent selection and reduced equivalence | 01, 04, 06 | COVERED | Same semantic controller. |
| CONTEXT | D16-07 | Compact agenda and destination table | 03, 05, 07 | COVERED | Exact route union plus real Strength/Running/Garmin destination loads. |
| CONTEXT | D16-08 | Management separation and Back restoration | 03, 05, 07 | COVERED | Structural capability split plus real-route focus/source evidence. |
| CONTEXT | DEV-01 | Approved 6→18dp adaptive inset with 2dp gaps | 01, 02, 06, 07 | COVERED | Automated approval gate plus fail-closed geometry evidence. |
| CONTEXT | DEV-02 | Approved #9B470B Light title with #D97820 sport roles | 01, 02, 06, 07 | COVERED | Automated approval gate plus fail-closed blended-fill evidence. |
| RESEARCH | R16-01 | Consume Phase 13 bounded typed event port; no N+1/status collapse | 01, 02 | COVERED | Hard dependency preflight and real port adapter. |
| RESEARCH | R16-02 | Pure semantic controller and monotonic epochs | 01, 04 | COVERED | Integrity-critical coverage. |
| RESEARCH | R16-03 | Manual 7dp/1.15 intent and UI-thread 1:1 worklet | 04, 06 | COVERED | Native scroll/gesture evidence. |
| RESEARCH | R16-04 | Measured overlays, null cancellation, layout invalidation | 04, 06 | COVERED | No fixed Y/crossfade. |
| RESEARCH | R16-05 | Retain last-good query state and exact request identity | 02, 05 | COVERED | Race/error/retry tests. |
| RESEARCH | R16-06 | Durable discriminated routing and Calendar-owned return state | 05, 07 | COVERED | Exact event/date refs plus real Phase 17/18 destinations. |
| RESEARCH | R16-07 | Consume Phase 15 facts-only presenter; no hidden commands | 01, 03, 06 | COVERED | Compile-time and runtime zero-capability proof. |
| RESEARCH | R16-08 | Existing pinned native stack only; no dependency additions | 01–07 | COVERED | `npm ci` only; package audit not triggered. |
| RESEARCH | R16-09 | Native intermediate geometry plus mapped overlays/differences, not Jest/final screenshots | 06, 07 | COVERED | Exact diagnostic captures and fail-closed final verifier. |
| RESEARCH | R16-10 | Query/frame diagnostics, exact artifact identity, privacy-safe evidence | 06, 07 | COVERED | Raw samples/hashes/source digest are retained; Phase 20 owns performance verdicts. |
| RESEARCH | R16-11 | Exact Phase 13 planned-Strength loader and null-on-stale provenance | 01, 03 | COVERED | Fail-fast preflight on `loadPlannedStrengthOccurrence` and `PlannedStrengthOccurrenceDetail`. |
| RESEARCH | R16-12 | Real Phase 17/18 destination integration is a prerequisite | 07 | COVERED | `17-08`, `18-08`, and `18-14` summaries/routes must exist before execution. |
| RESEARCH | R16-13 | Shared Phase 14 focus is 3dp with 4dp visual clearance | 02, 06, 07 | COVERED | UI, native matrix and real-route return focus use one token. |
| EXCLUDED | Deferred | Calendar correction controls | — | EXCLUDED | Explicitly deferred; correction remains separate management. |
| EXCLUDED | Deferred | Generic timeline redesign | — | EXCLUDED | Explicitly outside Phase 16. |
| EXCLUDED | Deferred | Automatic activity matching | — | EXCLUDED | Explicitly outside Phase 16. |

## Dependency and Wave Audit

| Wave | Plans | Independence / Gate |
|---:|---|---|
| 1 | 16-01 | Hard-preflights Phase 13 range/occurrence and Phase 15 presenter exports, proves semantic controller, then validates approved DEV-01 and DEV-02 records. |
| 2 | 16-02, 16-03 | Month/source-state files and detail/preview files are disjoint; both consume the completed dependency/gate summary. |
| 3 | 16-04 | Integrates controller and month surface into native motion/morph. |
| 4 | 16-05 | Integrates agenda and internal Strength destinations while preserving external destination identities without claiming href completion. |
| 5 | 16-06 | Captures diagnostic native geometry and mapped Revision 18 overlay/difference artifacts. |
| 6 | 16-07 | After real Phase 17/18 routes exist, executes those journeys and seals fail-closed evidence plus Phase 20 performance diagnostics. |

No same-wave plan shares a `files_modified` path. Cross-phase dependencies are explicit task preconditions because `depends_on` is phase-local.

## Rollback and Reversibility Audit

| Door | Rating | Gate / Recovery |
|---|---|---|
| DEV-01 approved inset | reversible | Automatic owner-record gate before styles; incomplete/failing geometry evidence blocks closure. |
| DEV-02 approved title color | reversible | Automatic owner-record gate before styles; incomplete/failing blended-fill evidence blocks closure. |
| Phase 13 event/Phase 15 presenter consumption | costly | Upstream shared contract; narrow through `calendarPorts.ts`, fail at compile time, and never fork the model/presenter. |
| Phase 17/18 real route integration | costly | Final plan hard-preflights exact summaries/files/loaders and runs real routes; no placeholder or mocked href can substitute. |
| Transition controller/worklet split | reversible | Stable semantic event/command interface isolates native execution changes. |
| Calendar route authority split | reversible | Explicit origin/capability branch; management path remains unchanged and regression-tested. |
| Evidence format | reversible | Versioned private automated artifact; verifier rejects incompatible/missing schema without changing product data. |

## Validation Sign-Off

- [ ] All 21 task IDs have an automated gate; DEV-01/DEV-02 use owner-record assertions rather than checkpoints.
- [ ] Every CAL requirement, D16 decision, approved DEV value, and in-scope research constraint maps to a plan.
- [ ] Phase 13 range/occurrence ports, Phase 14 shell, Phase 15 facts-only presenter, Phase 17 Running route, and Phase 18 Garmin route/registration preconditions pass before their consuming tasks.
- [ ] New behavior tests are RED before production edits and focused commands stay below the 60-second feedback target.
- [ ] `calendarTransitionController.ts` reaches 100% statements/branches/functions/lines.
- [ ] No same-wave file overlap, no package additions, no SQL in screens, and no Calendar mutation capability exist.
- [ ] NV-CAL-01..09 functional/geometry assertions, exact appearance/viewport/text/input matrix, mapped individual comparison artifacts, source digest, and privacy checks validate against one manifest.
- [ ] Phase 16 query/frame outputs contain complete raw diagnostics and computed p95 but no NV-PERF-07/NV-PERF-09 acceptance verdict; Phase 20 Plan 20-08 owns those gates.
- [ ] Incomplete DEV evidence remains REVIEW_REQUIRED; failed evidence remains FAIL; only complete passing evidence closes the approved adaptations.
- [ ] `nyquist_compliant: true` and `wave_0_complete: true` are set only after the execution-time validation audit.

**Approval:** DEV-01/DEV-02 finalized; host execution validated; native/attended evidence remains Phase 20-owned and deferred.

## Execution-Time Audit (2026-10-14)

This section supersedes the planning-time pending markers above. The audit was
run at `f6c8e9cf7efdf4330a132320920b370f61c81e3d`; the Phase 16 source
implementation is present through `d97ea569`. No implementation, review,
security, Phase 14 evidence, `.coverage`, or native-evidence file was changed.

### Requirement → task → behavioral test map

`COVERED` means the host-observable behavior has a passing behavioral test and
an executed command. `PARTIAL` means the host contract is green but the
native/device or attended portion is explicitly owned by Phase 20 and was not
claimed as PASS. There are no `MISSING` requirements and no new test files were
needed: every mapped gap was already covered by an executable behavioral test.

| Requirement | Task rows | Behavioral evidence and executed command | Status |
|---|---|---|---|
| CAL-01 | 16-01-02, 16-02-01..03, 16-06-02..03 | `CalendarScreen.test.tsx`; local-date/calendar unit tests; comparison/evidence suites; host verifier fixture | PARTIAL — native inset/geometry deferred |
| CAL-02 | 16-02-01, 16-02-03, 16-06-02 | `CalendarScreen.test.tsx`; `calendar.test.tsx`; component focused command | COVERED |
| CAL-03 | 16-01-03, 16-02-01, 16-06-02..03, 16-07-03 | Calendar screen state/color-pattern assertions; exact owner gate; evidence verifier | PARTIAL — native blended-fill/contrast deferred |
| CAL-04 | 16-02-01..03, 16-04-03, 16-06-02..03 | Calendar rendering and transition tests; comparison schema/geometry checks | PARTIAL — native continuity trace deferred |
| CAL-05 | 16-02-01..03, 16-06-02 | Calendar screen and repository projection tests; exact event registry | COVERED |
| CAL-06 | 16-02-02..03, 16-06-02 | local-date/calendar unit tests and Calendar screen matrix | COVERED |
| CAL-07 | 16-01-01, 16-04-01..02, 16-06-01..03, 16-07-03 | ports/transition tests; 100% control/evidence coverage; comparator/verifier | PARTIAL — native 1:1 gesture trace deferred |
| CAL-08 | 16-01-01, 16-04-01..02, 16-06-01..03, 16-07-03 | inclusive-threshold, retreat/cancel, and bounded-control tests | PARTIAL — attended/native trace deferred |
| CAL-09 | 16-01-01, 16-04-01..02, 16-06-01..03 | transition epoch/timing tests and fail-closed evidence validators | PARTIAL — native 240ms trace deferred |
| CAL-10 | 16-02-02..03, 16-04-02, 16-06-02 | local-date clamp and Calendar navigation tests | COVERED |
| CAL-11 | 16-02-03, 16-04-02, 16-06-02 | focus/activation assertions in Calendar screen and evidence contract | COVERED |
| CAL-12 | 16-04-03, 16-06-01..03, 16-07-03 | measured overlay/controller tests and evidence schema | PARTIAL — device geometry deferred |
| CAL-13 | 16-04-03, 16-06-01..03, 16-07-03 | reverse-collapse/focus tests and mapped comparison validation | PARTIAL — device geometry deferred |
| CAL-14 | 16-04-03, 16-06-02..03, 16-07-03 | adjacent-selection ordering tests and evidence validation | PARTIAL — native sequence deferred |
| CAL-15 | 16-01-01, 16-04-02..03, 16-06-02..03, 16-07-03 | reduced-motion semantic-equivalence tests and evidence contract | PARTIAL — native equivalence deferred |
| CAL-16 | 16-05-01..02, 16-06-02 | agenda target/union tests and Calendar route tests | COVERED |
| CAL-17 | 16-07-01..03 | real host cross-destination route suite; exact route identity and zero-mutation ledger | PARTIAL — Phase 20 native journey deferred |
| CAL-18 | 16-03-01..02, 16-06-02, 16-07-02 | session route/detail and read-only capability tests | COVERED |
| CAL-19 | 16-03-03, 16-06-02 | planned occurrence route/detail tests; exact missing/provenance behavior | COVERED |
| CAL-20 | 16-03-01..02, 16-05-03, 16-07-01..03 | return-state/focus, detail, and cross-destination host route tests | COVERED — native focus attendance deferred |
| CAL-21 | 16-02-03, 16-05-02, 16-06-02..03 | loading/empty/stale/error/retry and fail-closed evidence tests | COVERED |
| CAL-22 | 16-03-02, 16-05-03, 16-07-02 | correction/revision management regressions and zero-command route ledger | COVERED |
| CAL-23 | 16-03-02, 16-05-03, 16-07-02 | removal/resume management regressions and zero-command route ledger | COVERED |

### Executed results

| Area | Exact command | Result |
|---|---|---|
| Lockfile hydration | `npm ci` | PASS; 886 packages added, 0 vulnerabilities |
| Unit focus | `npm run test:unit -- --runInBand src/domains/scheduling/localDate.test.ts src/domains/history/calendar.test.ts src/bootstrap/phase16CalendarTestControls.test.ts src/bootstrap/calendarReadPorts.test.ts` | PASS — 4 suites / 71 tests |
| Component/route focus | `npm run test:components -- --runInBand` with the mapped Calendar, detail, route, agenda, and focus files | PASS — 10 suites / 104 tests |
| SQLite/data focus | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/trainingCalendarRepository.test.ts tests/sqlite-host/trainingCalendarRepository.real.test.ts tests/sqlite-host/running-plans.test.ts tests/sqlite-host/historyRepository.test.ts` | PASS — 4 suites / 27 tests |
| Evidence/control focus | `node --test scripts/v12-calendar-comparison.test.mjs scripts/v12-evidence-scripts.test.mjs scripts/v12-calendar-evidence-coverage.test.mjs` | PASS — 51/51 tests |
| Exact comparator | `node scripts/compare-v12-calendar.mjs --fixture scripts/fixtures/v12-calendar-comparison/complete.json --verify` | PASS as fail-closed host result: `REVIEW_REQUIRED`, `native_execution=NOT_RUN`, `host_only=true` |
| Exact verifier | `npm run verify:v12:calendar -- --fixture scripts/fixtures/v12-calendar-evidence/complete.json` | PASS as validator; `ok=true`, `status=REVIEW_REQUIRED`, `all_pass=false`, 9 native cases / 8 route journeys / 14 comparisons |
| Focused coverage | `npm run test:coverage:v12:calendar` | PASS — evidence scripts 100% statements/branches/functions/lines; controls 100% all four metrics |
| Static checks | `npm run typecheck && npm run check:boundaries` | PASS — TypeScript and 430-file boundary check |
| Full host projects | Unit, components, SQLite results from the prior host run plus `npm run test:integration -- --runInBand` closure rerun | PASS — unit 150 suites/2,526 tests, components 99 suites/975 tests, SQLite 29 suites/607 tests, integration 34 suites/514 tests; all host-automatable projects green |

### Native/manual boundary

Phase 20 owns Android/device/Maestro execution, attended focus and geometry,
native screenshots/overlays, and release/profile performance acceptance. The
checked-in evidence fixture remains truthful (`NOT_RUN` / `REVIEW_REQUIRED` /
`all_pass: false`). These are deferred inputs, not PASS claims. Host verifiers,
identity binding, exact 96-case coverage, privacy checks, source-digest checks,
zero-command ledgers, and fail-closed status derivation are automated and
green.

### Audit trail

| Audit item | Exact value |
|---|---|
| Gap inventory | 21 task rows audited; 0 automated gaps; 0 new test files; 0 escalations; 2 Phase 20 manual/deferred inputs |
| Requirement classification | 12 COVERED; 11 PARTIAL; 0 MISSING |
| Validated HEAD | `f6c8e9cf7efdf4330a132320920b370f61c81e3d` |
| Source implementation lineage | `d97ea569` (review/docs commits follow without source changes) |
| Tracked tree count | 1,854 files |
| Tracked test-file count | 375 files |
| Tracked source/app/test/script count | 960 files |
| Working-tree change | `16-VALIDATION.md` only before commit; implementation tree unchanged |

**Execution sign-off:** all host-automatable requirements are green; `nyquist_compliant: true` and `wave_0_complete: true`; `PARTIAL` applies only to the explicitly listed Phase 20 native/attended items, which remain deferred.

### Closure rerun

The previously interrupted integration project was rerun alone with the pinned
toolchain in this isolated worktree:

```text
npm run test:integration -- --runInBand
PASS — 34 suites, 514 tests, 128.2s, exit 0
```

No native, device, Maestro, screenshot, or performance command was rerun.

## Final Nyquist Refresh (2026-10-14)

This final read/refresh audit was run against the exact requested repository
HEAD `0932f7c87a189e72db3f3a39e691644efddd9821`. The latest Phase 16 source
change is `28f77d9e` (merged by `4a811baa`); later commits do not alter the
Calendar controller or its tests. Only this validation document was modified
by this audit.

### Previously missing same-month selection behavior

The gap is filled by real behavioral coverage, not source inspection alone:

- `src/ui/__tests__/CalendarTransitions.test.tsx` proves controller-owned
  same-month selection, civil-date validation, cross-month rejection,
  in-flight suppression, expand/collapse retention, and follow-on clamped
  navigation.
- `src/ui/__tests__/CalendarScreen.test.tsx` mounts the real screen, presses
  same-month Today, navigates to September, and asserts the clamped selected
  date (`2026-09-30`) remains selected.
- Command: `npm run test:components -- --runInBand src/ui/__tests__/CalendarTransitions.test.tsx src/ui/__tests__/CalendarScreen.test.tsx`
- Result: PASS — 2 suites, 58 tests, 0 failures.

### Final executed regression evidence

| Gate | Result |
|---|---|
| Phase 16 unit/data focus | PASS — 4 suites, 71 tests |
| Phase 16 component/route focus | PASS — 13 suites, 146 tests |
| Phase 16 SQLite focus | PASS — 4 suites, 27 tests |
| Phase 16 evidence/control focus | PASS — 51 tests, 0 failures, 0 skips |
| TypeScript and boundary checks | PASS — typecheck; boundary check twice, 430 files each |
| Full host gate (`npm run test:all -- --runInBand`) | PASS — 312 suites, 4,629 tests |
| Full gate coverage result | PASS — integrity gate returned `ok: true`, 158 files, all required metrics 100% |

All 23 CAL requirements and their task mappings were quick-regressed through
the focused unit, mounted component/route, SQLite, and evidence suites. No
automated gap, escalation, or skipped test remains. The known non-failing
React `act(...)` diagnostics in unrelated/full-suite tests do not change test
results and are not Phase 16 behavioral failures.

### Final audit trail

| Audit item | Exact value |
|---|---|
| Validated HEAD | `0932f7c87a189e72db3f3a39e691644efddd9821` |
| Source implementation HEAD | `28f77d9e` (`4a811baa` merge) |
| CAL requirements quick-regressed | 23/23 |
| Automated gaps | 0 |
| Escalations | 0 |
| Phase 20 native/attended inputs | Deferred/manual — Android/device/Maestro, screenshots/geometry/focus, attended Samsung review, release/profile performance |
| Nyquist compliant | `true` |
| Wave 0 complete | `true` |

The checked-in native fixture remains truthful (`NOT_RUN` /
`REVIEW_REQUIRED` / `all_pass: false`). Phase 20 native and attended work
remains manual/deferred; no native PASS is claimed here.
