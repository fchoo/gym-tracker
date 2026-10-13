---
phase: 16
slug: calendar-parity
status: secured
verdict: SECURED
threats_open: 0
threats_open_non_blocking: 0
threats_closed: 30
threats_total: 30
asvs_level: 1
block_on: high
audited_commit: e7eea042779bf0c9b426924f672c494267cccb0f
created: 2026-10-13
updated: 2026-10-13
---

# Phase 16 — Calendar Parity Security Audit

## SECURED

**Phase:** 16 — Calendar Parity

**Threats Closed:** 30/30

**ASVS Level:** 1

**Blocking threshold:** high

All 29 declared mitigations are present in the current merged implementation at their declared boundaries. The one accepted low-severity risk remains documented. There are zero open blocking threats and zero open non-blocking threats.

The prior security audit, both review reports, the review-fix closure, all seven plan-time threat models, both summary threat-surface declarations, and current source were re-read. Review/fix documentation was used only to identify the surfaces requiring re-verification; closure below is based on current code and executable tests at the audited commit.

### Threat Verification

| Threat ID | Category | Severity | Disposition | Evidence |
|-----------|----------|----------|-------------|----------|
| T-16-01-01 | Tampering | high | mitigate | `src/ui/calendar/calendarTransitionController.ts:79-86,170-209,247-263` rejects non-finite geometry, centralizes the inclusive 25% decision, advances epochs on cancel/invalidate/reconfiguration, and ignores stale completions. `src/ui/__tests__/CalendarTransitions.test.tsx:299-368,446-451,492-515` covers the boundary and stale paths. |
| T-16-01-02 | Elevation of Privilege | high | mitigate | `src/ui/calendar/calendarPorts.ts:6-18` exposes only the two Phase 13 reads and the immutable Phase 15 presentation model. `src/bootstrap/calendarReadPorts.ts:7-34,36-73` freezes one-purpose production read ports; `src/bootstrap/calendarReadPorts.test.ts:15-63` proves mutation members are absent. |
| T-16-01-03 | Denial of Service | medium | mitigate | `src/ui/calendar/calendarTransitionController.ts:177-205,239-246` clamps displacement to one viewport and rejects input while non-idle. `src/ui/calendar/CalendarMonthViewport.tsx:395-420` closes the UI-thread settle latch before crossing to JS and bounds cancellation. |
| T-16-SC | Tampering | high | mitigate | `.github/workflows/pr.yml:56-62,144-145,199-200,233-234,343-344` hydrates from the committed lock with `npm ci`. `package-lock.json` is unchanged from the prior audited commit; the intervening `package.json` changes add scripts only and introduce no dependency. |
| T-16-02-01 | Tampering | high | mitigate | `src/platform/sqlite/repositories/trainingCalendarRepository.ts:92-96,295-415,489-497` parses civil bounds, parameterizes bounded reads, and uses a read snapshot. `src/ui/screens/CalendarScreen.tsx:287-358` publishes only the current request generation and retains/rolls back one coherent last-good state. |
| T-16-02-02 | Spoofing | high | mitigate | `src/platform/sqlite/repositories/trainingCalendarRepository.ts:209-292,420-469` derives frozen discriminated destinations from source IDs and pinned revisions. `app/(tabs)/calendar.tsx:97-126` switches only on that union and fixed route templates, never presentation fields. |
| T-16-02-03 | Elevation of Privilege | high | mitigate | `src/ui/screens/CalendarScreen.tsx:62-70` accepts one bounded range reader and typed navigation callback. `app/(tabs)/calendar.tsx:57-63,145-160` injects only `useCalendarRangeReadPort()`; no repository, kernel, SQL, or mutation capability crosses into Calendar. |
| T-16-02-04 | Information Disclosure | low | accept | Accepted risk `AR-16-01` below records the intended local-owner label display. Current evidence schemas remain synthetic and reject extra privacy-bearing fields and arbitrary path values. |
| T-16-03-01 | Spoofing | high | mitigate | `src/navigation/routeOrigin.ts:1-40`, `app/session/[sessionId].tsx:182-209`, and `app/calendar/plan/[occurrenceId].tsx:7-20` reject array/empty/unknown route values before exact reads. `src/ui/screens/PlannedWorkoutDetailScreen.tsx:92-121` generation-fences the read and requires the returned occurrence ID to match. |
| T-16-03-02 | Elevation of Privilege | high | mitigate | `app/session/[sessionId].tsx:202-216` selects the Calendar adapter before rendering the management component that acquires the broad runtime. `src/ui/calendar/CalendarRouteAdapters.tsx:38-105` and `src/ui/calendar/CalendarReadOnlyWorkout.tsx:15-26` expose facts plus Back only. |
| T-16-03-03 | Tampering | high | mitigate | `src/platform/sqlite/repositories/strengthOccurrenceSnapshot.ts:22-78,251-289` parses/deep-freezes an append-only occurrence snapshot and returns null for inactive or revision-mismatched provenance. `src/ui/screens/PlannedWorkoutDetailScreen.tsx:66-121` requires exact immutable target-bearing facts and exposes no Start/session/result command. |
| T-16-03-04 | Repudiation | medium | mitigate | `app/__tests__/session-route.test.tsx:68-80` asserts an unchanged source digest and every mutation mock untouched. `app/__tests__/calendar-cross-destination-route.test.tsx:375-505` repeats that ledger across every real destination arm. |
| T-16-04-01 | Tampering | high | mitigate | `src/ui/calendar/CalendarMonthViewport.tsx:228-285,287-323` cancels superseded animation, carries completion epochs, and de-duplicates completion. `src/ui/calendar/calendarTransitionController.ts:247-263` accepts only the current epoch. |
| T-16-04-02 | Denial of Service | medium | mitigate | `src/ui/calendar/CalendarMonthViewport.tsx:350-420` performs UI-thread intent arbitration, one-panel clamping, and a synchronous settle latch with bounded React bridge calls. `src/ui/calendar/calendarTransitionController.ts:187-205,239-246` rejects concurrent semantic transitions. |
| T-16-04-03 | Spoofing | medium | mitigate | `src/ui/calendar/CalendarMonthViewport.tsx:36-42,295-323` rejects geometry not tagged with the current layout generation. `src/ui/screens/CalendarScreen.tsx:380-417,561-598` clears measurements, increments generation on month/size/font/background invalidation, stores the generation, and waits to remeasure. `src/ui/__tests__/CalendarTransitions.test.tsx:65-70` proves stale rejection. |
| T-16-04-04 | Elevation of Privilege | high | mitigate | `src/ui/calendar/CalendarMonthViewport.tsx:173-191,350-420` receives semantic callbacks and immutable transition state only; worklets emit bounded preview/release/cancel intents and hold no repository, route, SQL, or mutation capability. |
| T-16-05-01 | Spoofing | high | mitigate | `app/(tabs)/calendar.tsx:35-54,97-126` validates/encodes durable IDs and exhaustively dispatches fixed routes. `app/library/running/[planId].tsx:52-76` and `app/garmin/activity/[activityId].tsx:193-239` validate scalar identity/origin and render explicit unavailable states without fallback substitution. |
| T-16-05-02 | Elevation of Privilege | high | mitigate | `src/ui/calendar/CalendarRouteAdapters.tsx:38-177` uses dedicated query-only ports for every Calendar destination. `app/__tests__/calendar-cross-destination-route.test.tsx:313-354,375-505` verifies real loaders, unchanged source digests, and zero mutation/lifecycle/matching command calls or broad runtime acquisition. |
| T-16-05-03 | Tampering | medium | mitigate | `src/ui/screens/CalendarScreen.tsx:490-544` consumes return state once, triggers a new authoritative request generation, and restores the event row only after exact event-ID/local-date membership in that fresh result; otherwise it focuses the retained date cell and announces removal. `src/ui/__tests__/CalendarScreen.test.tsx:503-542` covers the removed-event fallback. |
| T-16-05-04 | Denial of Service | medium | mitigate | `src/ui/calendar/CalendarAgenda.tsx:45-69,94-126` renders one full-row target and shares one `activeEventIdRef` latch across touch and keyboard. `app/__tests__/calendar-cross-destination-route.test.tsx:450-459` requires one push per accepted activation. |
| T-16-06-01 | Elevation of Privilege | high | mitigate | `app.config.ts:27-43,57-70,113-119` defaults to production identity and disables native contracts outside `development-test`. `src/bootstrap/phase16CalendarTestControls.ts:113-150,364-400` requires the exact package/profile/native-flag/suite/stage tuple; rejection cases are executable at `src/bootstrap/phase16CalendarTestControls.test.ts:19-35,74-119`. |
| T-16-06-02 | Tampering | high | mitigate | `scripts/v12-calendar-artifacts.mjs:52-105` validates every parent segment, rejects symlinks, and uses `O_EXCL|O_NOFOLLOW`. `scripts/compare-v12-calendar.mjs:258-299` creates exclusive run/comparison directories and individually hashed artifacts. `scripts/verify-v12-native-evidence.mjs:250-265,283-305` rehashes every retained byte and requires canonical embedded JSON. |
| T-16-06-03 | Repudiation | high | mitigate | `scripts/compare-v12-calendar.mjs:310-342` validates allowed case/record classifications and derives status from every required case and record. `scripts/verify-v12-native-evidence.mjs:142-206,239-247` requires dated deviation evidence and rejects aggregate PASS whenever any row is FAIL or REVIEW_REQUIRED. |
| T-16-06-04 | Information Disclosure | high | mitigate | `src/bootstrap/phase16CalendarTestControls.ts:42-80,298-361` emits bounded synthetic trace fields and aggregate diagnostics only. Exact-key/path-template validation is enforced at `scripts/verify-v12-native-evidence.mjs:44-58,109-139,209-240`; privacy-field/path attacks are rejected by `scripts/v12-evidence-scripts.test.mjs:468-519`. Phase 16 native capture is blocked at `scripts/run-v12-maestro.mjs:178-192`. |
| T-16-06-05 | Denial of Service | medium | mitigate | `scripts/v12-calendar-artifacts.mjs:108-207` defines a bounded stage registry, exclusive run/stage records, resumable pending-stage state, terminal COMPLETE/FAILED sealing, and overwrite refusal. `scripts/v12-calendar-comparison.test.mjs:216-242` proves resume, duplicate-stage rejection, and terminal-run rejection. |
| T-16-07-01 | Spoofing | high | mitigate | `app/(tabs)/calendar.tsx:97-126` preserves exact typed IDs into fixed destinations. `src/platform/sqlite/repositories/runningPlanRepository.ts:237-279` resolves the exact scheduled Running session revision, and `tests/sqlite-host/running-plans.test.ts:122-160` proves revision 1 remains exact after current membership advances to revision 2. Strength/activity routes likewise use exact query-only loaders and missing states. |
| T-16-07-02 | Elevation of Privilege | high | mitigate | `src/bootstrap/calendarReadPorts.ts:18-34,36-73` freezes range/session/occurrence/activity/Running read capabilities separately. `app/__tests__/calendar-cross-destination-route.test.tsx:375-505` executes all six source-backed routes and confirms no management runtime or mutation command is reached. |
| T-16-07-03 | Tampering | high | mitigate | `scripts/v12-calendar-case-registry.mjs:84-179` hashes the exact ordered 96-case registry/ledger. `scripts/verify-v12-native-evidence.mjs:160-240,250-265,283-389` binds reference-map, source, manifest, APK, device, report, required cases, comparisons, diagnostics, canonical retained JSON, and byte hashes. False-PASS, wrong-case, missing-artifact, stale-byte, unsafe-path, and symlink cases pass at `scripts/v12-evidence-scripts.test.mjs:300-321,324-446,468-565`. |
| T-16-07-04 | Repudiation | medium | mitigate | `scripts/benchmark-v12-interactions.mjs:84-175` requires at least 100 sequential source-backed queries and 100 complete non-empty interaction sequences, recomputes summaries, fixes `acceptance_owner` to Phase 20, and rejects `verdict`/`status`. `scripts/benchmark-v12-interactions.mjs:245-279` identity-checks and exclusively writes raw evidence. |
| T-16-07-05 | Information Disclosure | high | mitigate | `scripts/verify-v12-native-evidence.mjs:109-139,209-240` confines route evidence to exact schemas, digests, empty command ledgers, and fixed paths. `scripts/fixtures/v12-calendar-evidence/complete.json:1-9,36-45,57-68,194-219` is explicitly synthetic/`NOT_RUN`/`REVIEW_REQUIRED` with `all_pass: false`; `scripts/run-v12-maestro.mjs:144-156,178-192` assigns Phase 20 ownership and prevents Phase 16 native execution or verdict fabrication. |

### Open Threats

- Blocking (severity at or above `high`): none.
- Non-blocking (severity below `high`): none.

### Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-16-01 | T-16-02-04 | Calendar is a local single-owner surface, so displaying that owner's workout labels is intended functionality. Tests and audit fixtures use deterministic synthetic records, and Phase 16 evidence validators reject privacy-bearing metadata and arbitrary path values. | Phase 16 threat model owner | 2026-10-13 |

### Unregistered Flags

None. `16-02-SUMMARY.md` reports no new endpoint, authentication, filesystem, schema, or mutation surface, and `16-07-SUMMARY.md` reports no threat flags beyond the registered route-identity, capability, evidence-file, classification, privacy, and diagnostic boundaries.

## Phase 20 Deferred Native Evidence

Phase 20 still owns Android build/install, ADB/Maestro execution, screenshots, device focus/geometry evidence, and release/profile performance acceptance. This is not an open Phase 16 threat: Phase 16 cannot execute the native runner, the checked-in fixture remains `NOT_RUN` / `REVIEW_REQUIRED` / `all_pass: false`, and the final verifier cannot derive native PASS from host-only rows.

## Verification Run

Audited merged branch `fchoo/UX-revamp` at `e7eea042779bf0c9b426924f672c494267cccb0f`.

| Check | Result |
|-------|--------|
| Calendar transition, screen, planned detail, session route, plan route, and cross-destination component suites | PASS — 6 suites / 76 tests |
| Calendar ports and agenda component suites | PASS — 2 suites / 5 tests |
| Production Calendar read ports and diagnostic controls | PASS — 2 suites / 8 tests |
| SQLite Calendar projection, immutable Running revision, and history-only detail suites | PASS — 4 suites / 28 tests |
| Planned Strength occurrence integration | PASS — 1 suite / 20 tests |
| Evidence/comparison/coverage adversarial suites | PASS — 41 tests |
| Host-only final verifier | PASS as fail-closed contract validation — `REVIEW_REQUIRED`, `all_pass: false`, 9 native cases, 8 route journeys, 14 comparisons |
| TypeScript | PASS — `npm run typecheck` |
| Architecture boundaries | PASS — 429 files |
| Dependency drift since prior audited commit | PASS — no `package-lock.json` change; `package.json` changes are scripts only |

## Security Audit Trail

| Audit Date | Audited Commit | Threats Total | Closed | Open | Blocking Open | Non-blocking Open | Run By |
|------------|----------------|---------------|--------|------|---------------|-------------------|--------|
| 2026-10-13 | `8072135ce686ddaea1ad8149c7f5733902624076` | 30 | 27 | 3 | 0 | 3 | TRAE security auditor |
| 2026-10-13 | `e7eea042779bf0c9b426924f672c494267cccb0f` | 30 | 30 | 0 | 0 | 0 | TRAE security auditor (re-audit) |

## Sign-Off

- [x] All 30 threats have a declared disposition and an audit classification.
- [x] All 29 declared mitigations are present in current implementation code at the cited boundaries.
- [x] Accepted risk T-16-02-04 remains explicitly documented.
- [x] All prior blocking and non-blocking security gaps are closed.
- [x] Phase 20 native execution remains deferred without any fabricated native PASS.
- [x] No unregistered threat flag was reported.

**Approval:** `SECURED` — zero open blocking threats and zero open non-blocking threats.

**threats_open:** 0
