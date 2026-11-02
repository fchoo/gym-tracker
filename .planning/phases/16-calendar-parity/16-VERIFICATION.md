---
phase: 16-calendar-parity
verified: 2026-10-14T00:00:00Z
status: passed
score: 28/30 must-haves verified; 28/28 host-verifiable
roadmap_score: 5/5 host-observable truths verified
requirements_score: 23/23 host requirements satisfied
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 27/30 plan must-haves verified
  gaps_closed:
    - "Authoritative SQLite lifecycle, effective-history, corrected-date, rest, inactive-schedule, and immutable snapshot projection"
    - "Full-height/scrollable Calendar composition and horizontal Info-before-Settings header actions"
    - "Sport/status encodings, factual agenda result/target summaries, and measured overlay/focus behavior"
    - "Controller-owned same-month date/Today selection with mounted navigation regression"
  gaps_remaining:
    []
  regressions: []
deferred:
  - truth: "Development-test native traces diagnose real Calendar gesture, geometry, focus, reduced-motion, and Back behavior."
    addressed_in: "Phase 20 Native Acceptance"
    evidence: "Phase 20 owns Android/device execution, native Calendar traces, physical D-pad/focus, and screenshot/geometry proof; current fixture is host_only_fixture=true, native_execution=NOT_RUN, status REVIEW_REQUIRED."
  - truth: "Every required Calendar capture has an individual Revision 18 reference/native/overlay/difference/mask record with hashes."
    addressed_in: "Phase 20 Native Acceptance"
    evidence: "The reference map and fail-closed comparison machinery exist, but native capture artifacts are Phase 20-owned and intentionally absent."
  - truth: "DEV-01/DEV-02 native geometry, accessibility, blended-fill/contrast, and device-matrix proof is complete."
    addressed_in: "Phase 20 Native Acceptance"
    evidence: "Exact approved branches are implemented; incomplete evidence remains REVIEW_REQUIRED/all_pass=false."
  - truth: "NV-PERF-07/NV-PERF-09 release/profile acceptance and attended Samsung review are complete."
    addressed_in: "Phase 20 Native Acceptance"
    evidence: "Phase 16 retains diagnostic source only; Phase 20 owns native performance and attended review."
---

# Phase 16: Calendar Parity Verification Report

**Phase Goal:** The owner can understand and navigate real Strength and Running intent/history through the approved spatial Calendar, then inspect workout history without Calendar gaining mutation authority.

**Verified:** 2026-10-14 against branch fchoo/UX-revamp, HEAD 933b7d84 (source implementation head d97ea569).

**Status:** passed

**Re-verification:** Yes. SUMMARY, review, validation, and security files were used only as location hints. The verdict below is based on current source, tests, and fail-closed tooling.

## Scope and evidence policy

Android build/install, Expo SQLite device execution, ADB, Maestro, screenshots, physical D-pad/200% text, attended Samsung review, and release/profile performance were not run. They are explicitly Phase 20-owned and are recorded as deferred, never fabricated as native PASS and never emitted as current human-needed items.

## Goal achievement

### Roadmap observable truths

| # | Truth | Status | Evidence |
|---:|---|---|---|
| 1 | Monday-first full-height month, stable tracks, two titled events, persistent controls, Info-before-Settings key, and non-color status semantics. | VERIFIED (host) | Monday-first civil grid, flex rows, shared 28dp/36dp tracks, two-event presentation, rest/empty semantics, sport/status encodings, accessible labels, horizontal header actions, and CalendarScreen tests. Native geometry is Phase 20 deferred. |
| 2 | Three panels follow horizontal input 1:1, switch title at inclusive 25%, cancel/retreat and short-fast drags snap back, and vertical intent scrolls. | VERIFIED (host) | Controller/worklet clamp one panel, use abs(dx) >= width * 0.25, ignore velocity for commit, restore title on cancel/retreat, and yield vertical intent to nested ScrollView; named transition tests pass. |
| 3 | Measured selected/following morph, reverse collapse, adjacent collapse/select/focus/expand, and reduced-motion semantic equivalence. | VERIFIED (host) | Current viewport measures both rows, places agenda between overlays, and controller phases update destination before remeasurement; mounted Calendar and transition tests pass, including same-month date/Today selection before expand/collapse/navigation. |
| 4 | One accessible full-width event target routes by real identity to read-only Strength history/preview, Running plan, or Garmin detail. | VERIFIED | CalendarAgenda has one focusable target per event; route dispatch preserves session, occurrence, plan/session revision, and activity IDs; cross-destination tests pass with zero mutation commands. |
| 5 | Back restores Calendar context/focus; source states remain truthful; correction/resume/revision/removal remain management-only. | VERIFIED (host) | Return snapshot restores month/date/mode/agenda offset/event focus after source refresh. SQLite projects lifecycle/effective overlays/corrected dates/rest/empty/voided states. Calendar route adapters are read-only while management routes retain mutation capabilities. |

Roadmap score: 5/5 host-observable truths verified. Native proof is deferred by contract.

### Plan must-have resolution

| Plan | Truth | Status | Evidence |
|---|---|---|---|
| 16-01.1 | Reuse Phase 13 range and Phase 15 facts contracts. | VERIFIED | Narrow aliases and runtime delegation use existing read ports/presenter. |
| 16-01.2 | Exact immutable/null-on-stale planned Strength loader. | VERIFIED | Exact occurrence loader contract and route tests pass. |
| 16-01.3 | One controller owns month/date/focus decisions for all paths. | VERIFIED | The select-date controller event validates civil dates and updates selectedLocalDate; CalendarScreen routes same-month date and Today selection through it. Mounted tests cover selection followed by expand/collapse and clamped navigation. |
| 16-01.4 | Inclusive 25%, cancel/retreat, velocity-independent snapback. | VERIFIED | Controller and exact-boundary transition tests pass. |
| 16-01.5 | DEV-01/DEV-02 approved branches represented. | VERIFIED | Adaptive inset and exact #9B470B/#D97820 role tokens are present; native proof deferred. |
| 16-02.1 | Monday-first full-height month and controls/header actions. | VERIFIED | Flex rows, nested vertical scroll, controls, and horizontal action group are implemented/tested. |
| 16-02.2 | Independent sport/status encoding and semantic description. | VERIFIED | Sport-colored borders/rails, tinted complete, dotted half-fill partial, dashed transparent planned, and accessibility labels are tested. |
| 16-02.3 | Shared tracks and selected/today/outside/rest/empty semantics. | VERIFIED | Shared row renderer, day projection, 28/36 tracks, rest dash, and agenda empty/rest states. |
| 16-02.4 | Loading/refresh/empty/stale/retry never invents a workout. | VERIFIED | Lifecycle state plus authoritative SQLite projection and real-SQLite inactive/rest/corrected/voided tests. |
| 16-02.5 | Incomplete native DEV evidence cannot all-pass. | VERIFIED | Fixture/verifier preserve NOT_RUN, REVIEW_REQUIRED, all_pass=false; evidence tests pass. |
| 16-03.1 | Immutable Active-shaped completed/partial Strength detail. | VERIFIED | Facts-only presentation/disclosure route and detail tests pass. |
| 16-03.2 | Calendar-origin history/preview has no mutation capability. | VERIFIED | Query-only branches and source-digest/zero-command tests pass. |
| 16-03.3 | Planned Strength uses occurrence identity and invents no result/session. | VERIFIED | Immutable occurrence target loader and route preserve identity. |
| 16-03.4 | Management correction/revision/retry/Resume/removal remain separate. | VERIFIED | Explicit origin branches preserve management routes. |
| 16-04.1 | Three panels are 1:1 and settle at inclusive 25%. | VERIFIED | Worklet/controller and named boundary tests pass. |
| 16-04.2 | Vertical intent, cancellation, retreat, and stale completion are safe. | VERIFIED | Nested ScrollView, intent gate, epoch guards, and tests. Native gesture proof deferred. |
| 16-04.3 | Selected/following rows use measured positions with agenda between them. | VERIFIED | Measured overlays and FocusedAgenda composition plus mounted layout tests. |
| 16-04.4 | Adjacent and reduced-motion semantics are ordered identically. | VERIFIED | Controller updates destination during collapse before remeasurement; tests pass. |
| 16-05.1 | Agenda has factual title, result/target, sport/status, source, chevron. | VERIFIED | displaySummary comes from Strength set facts, planned snapshots, and Running/Garmin facts; agenda tests reject hardcoded category copy. |
| 16-05.2 | Four destination discriminants and durable IDs survive. | VERIFIED | Session, occurrence, Running plan/session revision, and activity route tests. |
| 16-05.3 | Back restores month/date/week/agenda scroll/invoking focus. | VERIFIED (host) | Return snapshot/refocus code and mounted return tests; native traversal deferred. |
| 16-05.4 | No nested or management mutation action. | VERIFIED | One target, no management props, and zero-command assertions. |
| 16-06.1 | Native traces diagnose real gesture/geometry/focus/reduced motion/Back. | DEFERRED | Phase 20 owns native execution; no native PASS claimed. |
| 16-06.2 | Captures map to immutable Revision 18 evidence and retain all hashes. | DEFERRED | Map and comparison machinery exist; native artifacts are Phase 20-owned. |
| 16-06.3 | Missing/stale/mismatched/unsafe evidence fails closed. | VERIFIED | Adversarial evidence/comparison tests pass, including privacy-safe path/source/hash validation. |
| 16-06.4 | Incomplete DEV evidence remains REVIEW_REQUIRED/FAIL. | VERIFIED | Host-only fixture is NOT_RUN/REVIEW_REQUIRED/all_pass=false; verifier tests pass. |
| 16-07.1 | Real Running/Garmin routes and identities. | VERIFIED | Real route components and exact IDs are mounted/asserted. |
| 16-07.2 | Destination Back restores Calendar and remains read-only. | VERIFIED (host) | Stack Back plus Calendar in-memory snapshot/refocus; source digest and mutation mocks unchanged. Garmin needs no separate token because Calendar owns the mounted snapshot. |
| 16-07.3 | Final verifier rejects incomplete evidence. | VERIFIED | Verifier and adversarial tests reject missing/unexplained/incomplete evidence. |
| 16-07.4 | Raw diagnostics retained without Phase 16 release verdict. | VERIFIED (host contract) | Producer/schema/validator preserve diagnostics and defer NV-PERF-07/09 to Phase 20. |

Plan score: 28/30 verified; 28/28 host-verifiable; 2 explicitly deferred to Phase 20.

## Required artifacts and data flow

| Area | Status | Evidence |
|---|---|---|
| Ports, civil arithmetic, shared rows, screen, agenda, viewport, controller | VERIFIED | Substantive source is imported by the route/screen and exercised by focused tests. |
| SQLite authoritative reads | VERIFIED | Repository queries lifecycle, effective overlays/corrected dates, immutable planned snapshots, current match projections, and real Strength/Running/Garmin facts into CalendarRange. Real SQLite suite passed 2 suites/10 tests. |
| Strength planned/history destinations | VERIFIED | Durable occurrence/session IDs flow from projection through Calendar dispatch to query-only adapters. |
| Running/Garmin destinations | VERIFIED | Real plan/session/activity IDs flow to Phase 17/18 route components; no fixture href closes the route. |
| Evidence/privacy/source binding | VERIFIED | Verifier checks case/route/comparison identities, hashes, classifications, and privacy-safe paths; fixture is deliberately host-only/fail-closed. |

## Key links

| From | To | Status | Evidence |
|---|---|---|---|
| Calendar route | Calendar read ports | WIRED | loadCalendarRange is passed to CalendarScreen. |
| Calendar repository | SQLite authority | WIRED | Production query reads SQLite lifecycle, overlays, snapshots, matches, and source facts. |
| Calendar screen | row/viewport/controller | WIRED | Shared CalendarWeekRow, gesture dispatch to transitionCalendar, nested vertical scroll. |
| Agenda | route dispatcher | WIRED | One unchanged typed destination reaches the tab route; all destination kinds tested. |
| Calendar origins | detail adapters | WIRED | Read-only Calendar branches are selected before management commands. |
| Evidence verifier | comparison artifacts | WIRED | Exact mappings, hashes, classifications, DEV dispositions, and privacy/path rules are validated. |

## Behavioral spot-checks

| Command | Result |
|---|---|
| npm run test:unit -- --runInBand [five named Phase 16 unit files] | PASS — 3 suites, 69 tests. |
| npm run test:components -- --runInBand [eight named Phase 16 component/route files] | PASS — 8 suites, 126 tests. One non-failing React act warning in Garmin route test. |
| npm run test:sqlite:host -- --runInBand trainingCalendarRepository.test.ts trainingCalendarRepository.real.test.ts | PASS — 2 suites, 10 tests. |
| npm run test:evidence:v12:calendar | PASS — 51 tests, 0 failures, 0 skips. |
| npm run typecheck && npm run check:boundaries | PASS — TypeScript and boundary checks; 430 files. |

Named tests cover threshold, snapback, cancellation, epoch suppression, adjacent sequencing, reduced motion, focus restoration, source states, real route identity, zero mutation commands, SQLite projections, and fail-closed evidence. No linked Phase 16 test has a disabled/skip pattern or circular test-write pattern.

## Decision coverage

| Decision | Status | Evidence |
|---|---|---|
| D16-01 | COVERED | Header order, key sheet, Monday-first/full-height tests. |
| D16-02 | COVERED | Sport/status visual and accessible encoding tests. |
| D16-03 | COVERED | Shared tracks, two-event capacity, selected/today/outside/rest/empty tests. |
| D16-04 | COVERED | Exact threshold, retreat/cancel, vertical intent, velocity-independent tests. |
| D16-05 | COVERED | 240ms month settle and measured collapse/expand tests. |
| D16-06 | COVERED | Adjacent sequence and reduced-motion tests. |
| D16-07 | COVERED | One-target agenda and four real destinations. |
| D16-08 | COVERED | Read-only boundary, management preservation, Back/focus tests. |

The generic decision-coverage query returned non-blocking could-not-parse for the Markdown decisions block. The 8/8 result above is manual mapping to the explicit D16-01..D16-08 block and named tests, not parser output.

## Requirements coverage

| Requirements | Status | Evidence |
|---|---|---|
| CAL-01..CAL-06 | SATISFIED (host) | Grid/full-height, key, encodings, tracks, titles, selected/today/outside/rest/empty, SQLite tests. |
| CAL-07..CAL-15 | SATISFIED (host) | 1:1 gesture, exact 25%, settle/cancel, controls, focus, morph, adjacent, reduced-motion, scroll tests; native device proof deferred. |
| CAL-16..CAL-21 | SATISFIED (host) | One target, factual summaries, real routes, read-only detail, occurrence identity, return/source-state tests. |
| CAL-22..CAL-23 | SATISFIED | Management-origin correction/revision/retry/Resume/remove remains outside Calendar; zero-command tests pass. |

No CAL requirement is orphaned: CAL-01 through CAL-23 are all mapped to Phase 16. Native technical adjuncts remain Phase 20 deferred.

## Anti-patterns, prohibitions, and probes

No debt markers, placeholder copy, empty production implementation, static calendar return, or hardcoded-empty rendered data was found in the inspected Phase 16 source/evidence files. No PLAN prohibition block was declared. Calendar-origin routes were independently checked for no correction, revision-save, resume, remove, rest, completion, or match commands; route tests assert unchanged source digests and untouched mutation mocks.

No scripts/*/tests/probe-*.sh exists and no Phase 16 plan/summary documents a probe path. Probe execution: SKIPPED — no probes declared or discoverable.

## Final assessment

The prior blocking truth is closed. Same-month date and Today selection now enter the semantic controller, the controller validates and owns selectedLocalDate, and the mounted regression suite proves the selected date remains the source for expand/collapse and clamped month navigation. No regression was found in the previously passed roadmap truths, plan truths, decision coverage, test-quality checks, read-only prohibitions, SQLite authority, destination identity routing, or evidence fail-closed behavior.

The two unexecuted plan truths and all other unexecuted work are explicitly Phase 20-owned: native/device execution, physical D-pad and 200% device proof, Revision 18 native comparison artifacts, attended Samsung review, and release/profile performance acceptance. No native PASS is claimed and no current human-verification item is emitted for those deferred obligations.

---

Verified: 2026-10-14
Verifier: Claude (gsd-verifier)
