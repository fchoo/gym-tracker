---
phase: 2
slug: owned-library-and-planning
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-17
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 multi-project + React Native Testing Library 14.0.1 + host SQLite + actual Expo SQLite + Maestro 2.8 |
| **Config file** | `jest.config.js`, `package.json`, `.github/workflows/pr.yml` |
| **Quick run command** | `npm run test:unit -- --runInBand` or one targeted Jest path |
| **Full suite command** | `npm run test:all` |
| **Estimated runtime** | Targeted task feedback under 30 seconds; host full suite measured during execution |

---

## Sampling Rate

- **After every task commit:** Run the narrowest affected pure/schema/command/component test, completing in under 30 seconds.
- **After every plan wave:** Run typecheck, lint, relevant unit/component/host/integration suites, and `npm run test:coverage`.
- **After migration, FTS, packaged asset, runtime, or workout-profile changes:** Run actual Expo SQLite contracts against the exact Phase 2 development-test APK.
- **Before `/gsd-verify-work`:** Full host suite, coverage gate, clean CNG generation/build, native SQLite/FTS, Phase 1 regression Maestro, Phase 2 Maestro, adaptive/input checks, performance evidence, and artifact round trip must be green.
- **Max feedback latency:** 30 seconds per task-level automated sample.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | LIB-02, LIB-10 | T-02-01, T-02-03 | Reject malformed/unpinned packs; preserve user-owned rows | generator/schema/migration | targeted content validator + retained migration fixtures | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | LIB-03, LIB-04 | T-02-02, T-02-06 | Bound FTS grammar/pages and keep relational parity | pure/host/native SQLite | targeted search rules + host FTS + native FTS contract | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 1 | LIB-11, LIB-12 | T-02-04, T-02-05 | Preserve legacy units/history and reject cross-profile inference | table unit/migration/component | metric registry, comparator, profile migration, SetRow suites | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 2 | LIB-01, LIB-03, LIB-05 | T-02-02, T-02-07 | Prepared queries, bounded diagnostics, ownership-safe commands | unit/integration/RNTL | Library shell, custom lifecycle, duplicate, favorite/recent suites | ❌ W0 | ⬜ pending |
| 02-05-01 | 05 | 2 | LIB-06, LIB-07 | T-02-01, T-02-03 | Validate references and clone immutable templates into fresh owned IDs | fixture/integration/native/E2E | starter validator, activation repository, native and Maestro flow | ❌ W0 | ⬜ pending |
| 02-06-01 | 06 | 2 | LIB-08 | T-02-03, T-02-04 | Aggregate atomic Save, expected revisions, no partial graph writes | unit/integration/RNTL | plan create/edit/duplicate/reorder/archive/replacement suites | ❌ W0 | ⬜ pending |
| 02-07-01 | 07 | 3 | LIB-09 | T-02-04, T-02-05 | No silent schedule rewrite; immutable consumed opportunities/overrides | fake-clock/integration/native/E2E | schedule tables, host/native repository, Maestro schedule flow | ❌ W0 | ⬜ pending |
| 02-07-02 | 07 | 3 | LIB-01..LIB-12 | T-02-01..T-02-07 | Exact artifact, no stale native proof, all prior contracts retained | full regression/artifact | `npm run test:all`, coverage gate, native contracts, Maestro, artifact verifier | existing harness + ❌ P2 breadth | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Threat References

| ID | Threat | Required Control |
|----|--------|------------------|
| T-02-01 | Malformed, unpinned, or tampered content pack | Pin revision/hash/license, strictly validate bounded complete assets and references before mutation |
| T-02-02 | Raw FTS grammar injection or denial of service | Deterministic normalization, fixed prepared query templates, bounded query/page/alias text, punctuation fixtures |
| T-02-03 | Bundled/user-owned authority confusion or partial graph update | Origin-scoped commands and predicates inside one serialized explicit transaction |
| T-02-04 | Stale target, plan, profile, or schedule mutation | Expected revisions, atomic aggregate Save, immutable snapshots/events, typed conflicts |
| T-02-05 | Silent metric reinterpretation or schedule advancement | Versioned contracts, legacy parser retention, explicit profile migration and schedule events |
| T-02-06 | FTS drift from authoritative relational rows | Same-transaction synchronization, stable-ID parity/integrity checks, deterministic rebuild |
| T-02-07 | Sensitive search, note, target, or observation leakage | Bounded safe diagnostics without raw text, SQL parameters, notes, targets, or observations |

---

## Wave 0 Requirements

- [ ] Content generator/validator/diff harness and pinned-source fixture.
- [ ] Approved 300+ exercise review overlay with exact source hashes, aliases, taxonomy, metric versions, license, and attribution.
- [ ] Starter review artifact with exact references, targets, substitutions, source notes, and interval comparator.
- [ ] Host FTS5 contract and packaged Expo SQLite FTS/trigram/parity/rebuild contract.
- [ ] Retained migration fixtures for user versions 2 and 3 plus every Phase 2 version and expected post-migration assertions.
- [ ] Nine-profile fixture factory, comparator/aggregate/tie/precision tables, and legacy timed-hold cases.
- [ ] Fake `LocalDate`/timezone/device-zone schedule harness including DST and midnight boundaries.
- [ ] Phase 2 native route/suite/result count and Maestro journeys.
- [ ] Coverage-gate enumeration for every new integrity-critical module.

---

## Required Test Tables

- Content: malformed/missing/duplicate relations, hash/license mismatch, deterministic rebuild, 299/300 rows, alias collisions, Phase 1 ID retention, bundled-only updates, unavailable sources.
- Search: punctuation (`-`, `/`, `(`, `)`, quotes, colon), operator words, diacritics, one/two/three code points, canonical/alias rank tiers, 29/30/31 rows, cursor invalidation, transaction rollback, parity, integrity, and rebuild.
- Metrics: every valid/invalid boundary, comparator direction, every tie, average population, presentation rounding, incomparable target dimensions, profile/contract/generation separation, legacy timed hold, profile migration rollback and immutable session bytes.
- Starters/plans: source reference and profile coverage, exact clone graph, existing-copy choice, fresh duplicate IDs, dirty leave, aggregate rollback, accessible reorder, archive/restore, affected-plan preview, replacement scope.
- Scheduling: local date/month/year/leap boundaries, DST spring/fall zones, device timezone choice, midnight crossover, effective edits, consumed override immutability, every rotation transition, missed weekdays, Train anyway.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Review and approve the 300+ visible catalog overlay and six exact starter fixtures | LIB-02, LIB-06 | Content quality, body-part focus, equipment priority, substitutions, source notes, and exercise appropriateness require owner review beyond schema validity | Compare generated diff/review artifact to pinned source and approved starter intent; approve exact IDs, aliases, taxonomy, targets, body-part day order, equipment choices, and substitutions before import closes |
| Compact/medium/expanded, landscape, 200% text, keyboard/D-pad, focus restoration, reduced motion, and non-color state review on the exact APK | LIB-01, LIB-03, LIB-05, LIB-08, LIB-09, LIB-12 | Physical rendering and input behavior need installed-app evidence | Run the approved adaptive/input matrix against the exact Phase 2 APK and retain screenshots/results tied to its manifest |

---

## Native Evidence Contract

Phase 1 native evidence is historical only. Phase 2 changes packaged assets, migrations, routes, runtime composition, and workout profile code. Build one source-digest-bound Phase 2 development-test APK and retain:

- implementation HEAD, source digest, and APK SHA-256;
- packaged SQLite version, `ENABLE_FTS5`, trigram creation/query, parity, rebuild, and migration results;
- all prior SQLite kernel contracts plus Phase 2 content/FTS/migration contracts;
- Phase 1 Maestro regressions plus Phase 2 Library, activation, editing, schedule, and cross-profile flows;
- adaptive/200% text/keyboard-D-pad/reduced-motion evidence;
- search-page and working-set commit performance samples;
- installed-byte and retained-artifact round-trip equality.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verification or Wave 0 dependencies.
- [ ] Sampling continuity: no three consecutive tasks without automated verification.
- [ ] Wave 0 covers all missing references before behavior depends on them.

---

## Phase 2 Physical-Review Amendment Ledger

The existing strategy above remains the broad validation baseline. The ledgers
below are the canonical amendment source for Plans 02-33/02-34 and the
consolidated Phase 5 Plan 05-07 gate. They
replace duplicated fixed totals with stable IDs, source references, and
derived counts. No remediation is closed by a host summary: the exact-HEAD
build/evidence and attended rows remain prerequisites.

<!-- phase2-ledger:v1 name=remediation-cases -->

Allowed remediation statuses are exactly
`implemented_host_verified_evidence_pending`,
`implemented_summary_pending_evidence_pending`, `planned`,
`deferred_phase_3`, and `failed`. The cases are sorted by stable `id`.
`implemented_host_verified_evidence_pending` means the named implementation
summary records passing focused host evidence, not that an installed build or
physical observation has closed the gap.

Columns are fixed in this exact order: `id`, `decision_ids`, `gap_ids`,
`implementation_summary`, `automated_evidence`, `native_or_device_flow`,
`attended_roles`, `status`. The exact delimiter for every multi-ID column is
`, ` (U+002C COMMA followed by U+0020 SPACE). `attended_roles` is an exact-ID
foreign-key list into `COVERAGE.md`'s `attended-rows` `role` column; values are
unique and use that ledger's role order.

| id | decision_ids | gap_ids | implementation_summary | automated_evidence | native_or_device_flow | attended_roles | status |
|---|---|---|---|---|---|---|---|
| RC-02-ACTIVE-CORRECTION | D-63 | G-02-08 | 02-27-SUMMARY.md; 02-28-SUMMARY.md | `tests/integration/complete-set.test.ts#Plan 02-27 completed working-set correction`; `src/ui/__tests__/ActiveWorkoutScreen.test.tsx#corrects a completed working set throughout the active workout without whole-session Undo` | 02-34 active-session correction flow | samsung-physical | implemented_host_verified_evidence_pending |
| RC-02-ALERT-BG-DELIVERY-NONAUTH | D-61 | G-02-07 | 02-30-SUMMARY.md; 02-31-SUMMARY.md | `tests/integration/rest-lifecycle.test.ts#Plan 01-09 durable notification replay`; `app/__notification-test-controls.test.tsx#development notification test controls` | 02-34 background/launch reconciliation flow | samsung-physical | implemented_host_verified_evidence_pending |
| RC-02-ALERT-FG-ATTEMPT-ONCE | D-61 | G-02-07 | 02-31-SUMMARY.md | `src/bootstrap/workoutLifecycle.test.ts#durable foreground feedback attempts`; `tests/sqlite-host/foreground-rest-feedback.test.ts#foreground rest feedback attempts` | 02-34 foreground expiry attempt flow | samsung-physical | implemented_host_verified_evidence_pending |
| RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH | D-61 | G-02-07 | 02-30-SUMMARY.md; 02-31-SUMMARY.md | `src/platform/notifications/expoRestNotificationAdapter.test.ts#Expo rest notification adapter`; `src/ui/__tests__/TodayScreen.test.tsx#rest-alert settings persistence and rejected-write rollback` | 02-34 preference/channel native probe | emulator-supplementary, samsung-physical | implemented_host_verified_evidence_pending |
| RC-02-CARDS | D-56 | G-02-03 | 02-25-SUMMARY.md; 02-26-SUMMARY.md | `src/ui/__tests__/LibraryScreen.test.tsx#groups active owned and starter plans into flat high-contrast content cards`; `src/ui/__tests__/foundation.test.tsx#renders a flat ContentCard and right-edge ActionCluster without allowing card nesting` | 02-34 cards/state native flow | emulator-supplementary, samsung-physical | implemented_host_verified_evidence_pending |
| RC-02-DATE-CALENDAR | D-57 | G-02-02 | 02-23-SUMMARY.md | `src/ui/components/CalendarField.test.tsx#CalendarField`; `src/ui/__tests__/ScheduleEditor.test.tsx#schedule editor tracer` | 02-34 calendar native flow | emulator-supplementary | implemented_host_verified_evidence_pending |
| RC-02-DURATION-NUMERIC | D-57 | G-02-02 | 02-24-SUMMARY.md | `src/ui/components/SemanticInputFields.test.tsx#SemanticNumberField and TimeDurationField`; `src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx` | 02-34 duration/numeric native flow | emulator-supplementary | implemented_host_verified_evidence_pending |
| RC-02-EXACT-HEAD-EVIDENCE | D-67 | G-02-09 | Plan 02-34 is the build/evidence owner | Plan 02-34 regenerates host, coverage, native, Maestro, benchmark, and round-trip results from one implementation HEAD | 02-34 exact-HEAD build evidence sequence | emulator-supplementary, samsung-physical | planned |
| RC-02-FINAL-COMMAND-ORDER | D-67 | G-02-09 | Phase 5 Plan 05-07 is the final command-order owner | Plan 05-07 checks all accumulated prerequisite rows before its physical-required verifier | 05-07 runs its verifier only after exact-candidate evidence and both attended roles are recorded | emulator-supplementary, samsung-physical | planned |
| RC-02-GLYPH-ACTION-GEOMETRY | D-58 | G-02-04 | 02-28-SUMMARY.md | `src/ui/__tests__/ActiveWorkoutScreen.test.tsx#renders cohesive compact warm-up and working-set rows`; `src/ui/__tests__/OwnedPlanEditor.test.tsx#reorders only the draft and persists ordinals with Save plan` | 02-34 glyph-action/right-edge geometry flow | emulator-supplementary, samsung-physical | implemented_host_verified_evidence_pending |
| RC-02-LATEST-SCHEMA-ADD-COPY | D-64 | G-02-05 | 02-27-SUMMARY.md | `tests/integration/complete-set.test.ts#Plan 01-08 warm-up commands and Plan 01-10 working-set structure commands` | 02-34 latest-schema add/copy native flow | samsung-physical | implemented_host_verified_evidence_pending |
| RC-02-NAV-LEFT-RAIL | D-66 | G-02-01 | 02-22-SUMMARY.md | `app/(tabs)/__tests__/_layout.test.tsx#RootTabsLayout adaptive navigator placement`; `app/(tabs)/__tests__/_layout.test.tsx#keeps one accessible route state through live resize and D-pad activation`; `src/ui/__tests__/foundation.test.tsx#uses the expanded loading-shell rail contract` | 02-34 expanded adaptive and loading-shell rail flow | emulator-supplementary, samsung-physical | implemented_host_verified_evidence_pending |
| RC-02-REST-DOCK | D-60 | G-02-06 | 02-29-SUMMARY.md | `src/ui/__tests__/RestDock.test.tsx#keeps running time visible when collapsed and expands ordered controls`; `src/ui/__tests__/ActiveWorkoutScreen.test.tsx#skips running rest once and transitions directly to the ready state` | 02-34 RestDock native flow | samsung-physical | implemented_host_verified_evidence_pending |
| RC-02-RETRY-FOCUS | D-64 | G-02-05 | 02-28-SUMMARY.md | `src/ui/__tests__/ActiveWorkoutScreen.test.tsx#keeps section mutations retryable without duplicate submissions and guards repeated add-working taps until the committed mutation settles` | 02-34 add/copy retry-and-focus native flow | emulator-supplementary, samsung-physical | implemented_host_verified_evidence_pending |
| RC-02-ROLE-SPLIT | D-67 | G-02-09 | Plan 02-34; Phase 5 Plan 05-07 | Plan 02-34 owns retained Phase 2 automation; Plan 05-07 owns final-candidate attended observation and ordering | 05-07 cross-role completion check | emulator-supplementary, samsung-physical | planned |
| RC-02-SET-STATUS | D-59 | G-02-04 | 02-28-SUMMARY.md | `src/ui/__tests__/ActiveWorkoutScreen.test.tsx#uses separate warm-up commands and excludes them from working progress`; `src/ui/__tests__/ActiveWorkoutScreen.test.tsx#adds, copies, and skips warm-ups through separate persisted commands`; `src/ui/__tests__/ActiveWorkoutScreen.test.tsx#adds and skips working sets with the same visible action pattern as warm-ups` | 02-34 completed/skipped status semantics and top-right glyph flow | emulator-supplementary, samsung-physical | implemented_host_verified_evidence_pending |
| RC-02-STICKY-IDENTITY | D-65 | G-02-08 | 02-28-SUMMARY.md | Pending: focused component evidence must prove the Active Workout identity header remains outside scrolling content, stays visible, and distinguishes current from reviewed exercise. | 02-34 sticky header scroll/keyboard/safe-area/200%-text/layout/landscape flow | emulator-supplementary, samsung-physical | implemented_summary_pending_evidence_pending |
| RC-02-TIME-OF-DAY-SCOPE | D-57 | G-02-02 | Plans 02-33/02-34 are the source-audit and evidence owners | Pending: source audit must classify every editable D-57 field as date, duration, numeric, or time-of-day and prove whether any editable time-of-day field exists. | 02-34 records the source-audit result and verifies every resulting time-of-day obligation, or the confirmed absence of that surface. | emulator-supplementary | planned |
| RC-02-TODAYS-PLAN | D-62 | G-02-08 | 02-28-SUMMARY.md | `src/ui/__tests__/ActiveWorkoutScreen.test.tsx#opens Today's plan without sending a workout mutation`; `src/ui/__tests__/ActiveWorkoutScreen.test.tsx#lists every workout exercise in order and reviews it without changing the active pointer` | 02-34 Today’s plan overview and non-mutating review flow | emulator-supplementary, samsung-physical | implemented_host_verified_evidence_pending |
| RC-02-WARMUP-EXCLUSION-COPY | D-59 | G-02-04 | 02-28-SUMMARY.md | `src/ui/__tests__/ActiveWorkoutScreen.test.tsx#uses separate warm-up commands and excludes them from working progress`; `src/ui/__tests__/ActiveWorkoutScreen.test.tsx#uses global card tokens while retaining editable set fields in Light appearance`; `src/ui/__tests__/ActiveWorkoutScreen.test.tsx#renders cohesive compact warm-up and working-set rows` | 02-34 warm-up domain exclusion and removed visible-copy flow | emulator-supplementary, samsung-physical | implemented_host_verified_evidence_pending |

`RC-02-ALERT-FG-ATTEMPT-ONCE` is intentionally named for a single durable
attempt, not as a physical-delivery guarantee. The durable claim is at most one
platform-feedback attempt per session/rest revision; a post-claim failure can
leave no audible or haptic result without changing authoritative workout truth.

### Decision and Gap Foreign-Key Map

Every amended source ID has one or more remediation-case foreign keys. Earlier
D-01 through D-55 decisions remain preserved in `02-CONTEXT.md`; this table
adds D-56 through D-67 without renumbering or replacing those accepted
decisions. Summary ownership is exact, while device evidence is deliberately
future-owned by Plan 02-34 and Phase 5 Plan 05-07.

| source_id | remediation_cases | implementation_summary_or_owner | automated evidence owner | future exact-HEAD / attended owner |
|---|---|---|---|---|
| D-56 | RC-02-CARDS | 02-25-SUMMARY.md; 02-26-SUMMARY.md | Plans 02-25/02-26 card tests | 02-34 cards flow; emulator-supplementary then samsung-physical |
| D-57 | RC-02-DATE-CALENDAR, RC-02-DURATION-NUMERIC, RC-02-TIME-OF-DAY-SCOPE | 02-23-SUMMARY.md; 02-24-SUMMARY.md; Plans 02-33/02-34 own the pending time-of-day source audit | Plans 02-23/02-24 input tests; Plan 02-34 source audit | 02-34 calendar and duration/numeric flows plus time-of-day scope result; emulator-supplementary |
| D-58 | RC-02-GLYPH-ACTION-GEOMETRY | 02-28-SUMMARY.md | Plan 02-28 action-geometry tests | 02-34 glyph-action geometry flow; emulator-supplementary then samsung-physical |
| D-59 | RC-02-SET-STATUS, RC-02-WARMUP-EXCLUSION-COPY | 02-28-SUMMARY.md | Plan 02-28 completed/skipped and warm-up-exclusion tests | 02-34 status and warm-up-copy flow; emulator-supplementary then samsung-physical |
| D-60 | RC-02-REST-DOCK | 02-29-SUMMARY.md | Plan 02-29 RestDock tests | 02-34 RestDock flow; samsung-physical |
| D-61 | RC-02-ALERT-BG-DELIVERY-NONAUTH, RC-02-ALERT-FG-ATTEMPT-ONCE, RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH | 02-30-SUMMARY.md; 02-31-SUMMARY.md | Plans 02-30/02-31 preference, channel, lifecycle, and control tests | 02-34 native alert flow; 05-07 samsung-physical sound/vibration observation |
| D-62 | RC-02-TODAYS-PLAN | 02-28-SUMMARY.md | Plan 02-28 Today’s plan tests | 02-34 overview flow; emulator-supplementary then samsung-physical |
| D-63 | RC-02-ACTIVE-CORRECTION | 02-27-SUMMARY.md; 02-28-SUMMARY.md | Plans 02-27/02-28 correction tests | 02-34 correction flow; samsung-physical |
| D-64 | RC-02-LATEST-SCHEMA-ADD-COPY, RC-02-RETRY-FOCUS | 02-27-SUMMARY.md; 02-28-SUMMARY.md | Plans 02-27/02-28 schema and UI mutation tests | 02-34 add/copy flow; emulator-supplementary for retry/focus and samsung-physical for mutation/correction |
| D-65 | RC-02-STICKY-IDENTITY | 02-28-SUMMARY.md | Plan 02-34 focused sticky layout-hierarchy evidence (pending) | 02-34 sticky-header scroll/keyboard/safe-area/200%-text/layout/landscape flow; emulator-supplementary then samsung-physical |
| D-66 | RC-02-NAV-LEFT-RAIL | 02-22-SUMMARY.md | Plan 02-22 root-navigation tests | 02-34 adaptive flow; emulator-supplementary then samsung-physical |
| D-67 | RC-02-EXACT-HEAD-EVIDENCE, RC-02-FINAL-COMMAND-ORDER, RC-02-ROLE-SPLIT | Plan 02-34; Phase 5 Plan 05-07 | 02-34 generated automated evidence | 05-07 attended role check and final command order |
| G-02-01 | RC-02-NAV-LEFT-RAIL | 02-22-SUMMARY.md | Plan 02-22 root-navigation tests | 02-34 adaptive flow; emulator-supplementary then samsung-physical |
| G-02-02 | RC-02-DATE-CALENDAR, RC-02-DURATION-NUMERIC, RC-02-TIME-OF-DAY-SCOPE | 02-23-SUMMARY.md; 02-24-SUMMARY.md; Plans 02-33/02-34 own the pending time-of-day source audit | Plans 02-23/02-24 input tests; Plan 02-34 source audit | 02-34 input flows and time-of-day scope result; emulator-supplementary |
| G-02-03 | RC-02-CARDS | 02-25-SUMMARY.md; 02-26-SUMMARY.md | Plans 02-25/02-26 card tests | 02-34 cards flow; emulator-supplementary then samsung-physical |
| G-02-04 | RC-02-GLYPH-ACTION-GEOMETRY, RC-02-SET-STATUS, RC-02-WARMUP-EXCLUSION-COPY | 02-28-SUMMARY.md | Plan 02-28 geometry/status tests | 02-34 glyph, status, and warm-up-copy flow; emulator-supplementary then samsung-physical |
| G-02-05 | RC-02-LATEST-SCHEMA-ADD-COPY, RC-02-RETRY-FOCUS | 02-27-SUMMARY.md; 02-28-SUMMARY.md | Plans 02-27/02-28 mutation tests | 02-34 add/copy flow; emulator-supplementary for retry/focus and samsung-physical for mutation/correction |
| G-02-06 | RC-02-REST-DOCK | 02-29-SUMMARY.md | Plan 02-29 RestDock tests | 02-34 RestDock flow; samsung-physical |
| G-02-07 | RC-02-ALERT-BG-DELIVERY-NONAUTH, RC-02-ALERT-FG-ATTEMPT-ONCE, RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH | 02-30-SUMMARY.md; 02-31-SUMMARY.md | Plans 02-30/02-31 alert tests | 02-34 native alert flow; 05-07 samsung-physical observation |
| G-02-08 | RC-02-ACTIVE-CORRECTION, RC-02-STICKY-IDENTITY, RC-02-TODAYS-PLAN | 02-27-SUMMARY.md; 02-28-SUMMARY.md | Plans 02-27/02-28 active-workout tests | 02-34 active-workout flow; emulator-supplementary then samsung-physical |
| G-02-09 | RC-02-EXACT-HEAD-EVIDENCE, RC-02-FINAL-COMMAND-ORDER, RC-02-ROLE-SPLIT | Plan 02-34; Phase 5 Plan 05-07 | 02-34 generated automated evidence | 05-07 attended role check and final command order |

### Requirement Traceability Ledger

<!-- phase2-ledger:v1 name=requirement-traceability -->

Columns are fixed in this exact order: `requirement_id`,
`implementation_summaries`, `remediation_cases`, `evidence_owners`. Rows are
sorted by numeric `requirement_id` and must equal the complete Phase 2 `LIB-*`
set parsed from `.planning/REQUIREMENTS.md`. The exact delimiter for every
multi-ID column is `, ` (U+002C COMMA followed by U+0020 SPACE). Every
`implementation_summaries` value must resolve to an existing committed Phase 2
summary; every `remediation_cases` value is an exact-ID foreign key into the
remediation-cases ledger above; and every `evidence_owners` value must resolve
to the named `PLAN.md`. Values within a cell are unique and source ordered. A
row names only remediation cases that directly affect the literal requirement;
`RC-02-EXACT-HEAD-EVIDENCE` is the fallback case for requirements whose core
behavior has no direct D-56 through D-66 amendment. Plan 02-34 still regenerates
the exact-HEAD package evidence for every row.

| requirement_id | implementation_summaries | remediation_cases | evidence_owners |
|---|---|---|---|
| LIB-01 | 02-12-SUMMARY.md, 02-25-SUMMARY.md | RC-02-CARDS | 02-34-PLAN.md, ../05-recovery-distribution-and-release/05-07-PLAN.md |
| LIB-02 | 02-01-SUMMARY.md, 02-04-SUMMARY.md, 02-25-SUMMARY.md | RC-02-CARDS | 02-34-PLAN.md, ../05-recovery-distribution-and-release/05-07-PLAN.md |
| LIB-03 | 02-09-SUMMARY.md, 02-12-SUMMARY.md, 02-25-SUMMARY.md | RC-02-CARDS | 02-34-PLAN.md, ../05-recovery-distribution-and-release/05-07-PLAN.md |
| LIB-04 | 02-06-SUMMARY.md, 02-09-SUMMARY.md, 02-20-SUMMARY.md | RC-02-EXACT-HEAD-EVIDENCE | 02-34-PLAN.md |
| LIB-05 | 02-13-SUMMARY.md, 02-17-SUMMARY.md, 02-24-SUMMARY.md, 02-25-SUMMARY.md, 02-26-SUMMARY.md | RC-02-CARDS, RC-02-DURATION-NUMERIC | 02-34-PLAN.md, ../05-recovery-distribution-and-release/05-07-PLAN.md |
| LIB-06 | 02-05-SUMMARY.md, 02-14-SUMMARY.md, 02-25-SUMMARY.md, 02-26-SUMMARY.md | RC-02-CARDS | 02-34-PLAN.md, ../05-recovery-distribution-and-release/05-07-PLAN.md |
| LIB-07 | 02-08-SUMMARY.md, 02-14-SUMMARY.md, 02-20-SUMMARY.md | RC-02-EXACT-HEAD-EVIDENCE | 02-34-PLAN.md |
| LIB-08 | 02-11-SUMMARY.md, 02-15-SUMMARY.md, 02-18-SUMMARY.md, 02-23-SUMMARY.md, 02-24-SUMMARY.md, 02-26-SUMMARY.md, 02-28-SUMMARY.md | RC-02-CARDS, RC-02-DATE-CALENDAR, RC-02-DURATION-NUMERIC, RC-02-GLYPH-ACTION-GEOMETRY | 02-34-PLAN.md, ../05-recovery-distribution-and-release/05-07-PLAN.md |
| LIB-09 | 02-03-SUMMARY.md, 02-08-SUMMARY.md, 02-16-SUMMARY.md, 02-19-SUMMARY.md, 02-23-SUMMARY.md | RC-02-DATE-CALENDAR, RC-02-TIME-OF-DAY-SCOPE | 02-33-PLAN.md, 02-34-PLAN.md, ../05-recovery-distribution-and-release/05-07-PLAN.md |
| LIB-10 | 02-01-SUMMARY.md, 02-04-SUMMARY.md, 02-25-SUMMARY.md | RC-02-CARDS | 02-34-PLAN.md, ../05-recovery-distribution-and-release/05-07-PLAN.md |
| LIB-11 | 02-02-SUMMARY.md, 02-07-SUMMARY.md, 02-10-SUMMARY.md, 02-24-SUMMARY.md | RC-02-DURATION-NUMERIC | 02-34-PLAN.md, ../05-recovery-distribution-and-release/05-07-PLAN.md |
| LIB-12 | 02-02-SUMMARY.md, 02-10-SUMMARY.md, 02-24-SUMMARY.md, 02-27-SUMMARY.md, 02-28-SUMMARY.md | RC-02-ACTIVE-CORRECTION, RC-02-DURATION-NUMERIC, RC-02-LATEST-SCHEMA-ADD-COPY, RC-02-RETRY-FOCUS, RC-02-SET-STATUS, RC-02-WARMUP-EXCLUSION-COPY | 02-34-PLAN.md, ../05-recovery-distribution-and-release/05-07-PLAN.md |

### Coverage-Consumer Contract

`COVERAGE.md` owns the complete surface/truth cross-product, attended roles,
and prohibitions. This file owns remediation-case, decision/gap, and
requirement traceability. Consumers must join every requirement row to the
canonical `LIB-*` source, existing summary and plan files, and this ledger's
remediation `id` column. They must also join `COVERAGE.md`'s
`remediation_cases` to that `id` column and each remediation row's
`attended_roles` to `COVERAGE.md`'s `attended-rows` `role` column. Consumers
must reject dangling or duplicate row IDs, duplicate values within a
comma-space-delimited foreign-key list, and any coverage route that names an
attended role absent from any linked remediation case. The remediation status
vocabulary here controls evidence state: host-verified rows remain
evidence-pending until the exact-HEAD and attended ledgers validate them.
- [ ] No watch-mode flags.
- [ ] Task feedback latency remains under 30 seconds.
- [ ] Every new integrity-critical module is in the explicit 100% all-metrics gate.
- [ ] New exact-HEAD native evidence replaces stale Phase 1 runtime proof.
- [ ] `nyquist_compliant: true` is set only after validation audit.

**Approval:** pending execution and `/gsd-validate-phase`
