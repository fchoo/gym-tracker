---
phase: 16
slug: calendar-parity
status: open_threats
verdict: OPEN_THREATS
threats_open: 0
threats_open_non_blocking: 3
threats_closed: 27
threats_total: 30
asvs_level: 1
block_on: high
audited_commit: 8072135ce686ddaea1ad8149c7f5733902624076
created: 2026-10-13
---

# Phase 16 — Calendar Parity Security Audit

## OPEN_THREATS

**Phase:** 16 — Calendar Parity

**Closed:** 27/30 | **Open:** 3/30

**ASVS Level:** 1

**Blocking threshold:** high

All high-severity mitigations are present at the declared boundaries. Three medium-severity controls are incomplete and remain open below the configured `high` blocking threshold. Therefore the phase security gate field remains `threats_open: 0`, but the audit verdict is `OPEN_THREATS` rather than `SECURED`.

### Closed

| Threat ID | Category | Severity | Disposition | Evidence |
|-----------|----------|----------|-------------|----------|
| T-16-01-01 | Tampering | high | mitigate | `src/ui/calendar/calendarTransitionController.ts:78-80,169-178,206-230` rejects non-finite geometry, centralizes the inclusive 25% predicate, increments epochs on cancel/invalidate, and rejects stale completions. `src/ui/__tests__/CalendarTransitions.test.tsx:29-78,81-105,136-146` exercises the exact boundary, invalid geometry, cancellation, and stale epoch. |
| T-16-01-02 | Elevation of Privilege | high | mitigate | `src/ui/calendar/calendarPorts.ts:1-17` defines `CalendarReadPort` as a `Pick` of only `loadCalendarRange` and `loadPlannedStrengthOccurrence` and aliases the immutable presentation model. `src/ui/calendar/calendarPorts.test.ts:14-47` verifies the narrow read seam, stale-null behavior, frozen destination, and facts presenter. |
| T-16-01-03 | Denial of Service | medium | mitigate | `src/ui/calendar/calendarTransitionController.ts:175-179,187-228` clamps drag to one viewport and ignores drag/release/move input while a transition is not idle/dragging. The superseded-transition matrix is covered at `src/ui/__tests__/CalendarTransitions.test.tsx:179-221`. |
| T-16-SC | Tampering | high | mitigate | `.github/workflows/pr.yml:56-62,144-145,199-200,233-234,343-344` installs the pinned npm version and hydrates with `npm ci`. Audit diff `475581604fed32d3a16395655217112e4ab38022..8072135ce686ddaea1ad8149c7f5733902624076` changes only Phase 16 package scripts; `package-lock.json` and dependency declarations are unchanged. |
| T-16-02-01 | Tampering | high | mitigate | `src/platform/sqlite/repositories/trainingCalendarRepository.ts:51-55,124-189,230-238` parses civil bounds, rejects inverted ranges, parameterizes all range queries, and uses a read snapshot. `src/ui/screens/CalendarScreen.tsx:136-166,300-305` fences publication by request generation and retains the last-good month/date during refresh or error. |
| T-16-02-02 | Spoofing | high | mitigate | `src/platform/sqlite/repositories/trainingCalendarRepository.ts:28-32,86-120,195-227` constructs the discriminated destination union directly from durable source IDs and freezes every event/destination. `app/(tabs)/calendar.tsx:58-87` dispatches only on that discriminant, never title, color, status, or date. |
| T-16-02-03 | Elevation of Privilege | high | mitigate | `src/ui/screens/CalendarScreen.tsx:48-59` accepts only the range-read function and typed navigation callback. `app/(tabs)/calendar.tsx:110-126` injects `runtime.loadCalendarRange` and navigation, with no repository, kernel, SQL handle, or command prop crossing into the screen. |
| T-16-02-04 | Information Disclosure | low | accept | Accepted risk `AR-16-01` below documents the local-owner label exposure and synthetic-test/log constraint. |
| T-16-03-01 | Spoofing | high | mitigate | `app/session/[sessionId].tsx:33-41,89-100` accepts one non-empty scalar ID, calls the exact detail read, and renders an explicit unavailable state. `app/calendar/plan/[occurrenceId].tsx:7-20` rejects array/missing IDs, while `src/ui/screens/PlannedWorkoutDetailScreen.tsx:58-78` requires the returned occurrence ID to equal the requested ID. Route rejection tests are at `app/__tests__/session-route.test.tsx:61-80` and `app/__tests__/calendar-plan-route.test.tsx:31-43`. |
| T-16-03-02 | Elevation of Privilege | high | mitigate | `app/session/[sessionId].tsx:97-100` returns the Calendar query-only branch before management callbacks are constructed at lines 102-195. `src/ui/calendar/CalendarReadOnlyWorkout.tsx:15-26` accepts only immutable detail facts and Back. `app/__tests__/session-route.test.tsx:61-72` enumerates mutation mocks and confirms none are called. |
| T-16-03-03 | Tampering | high | mitigate | `src/ui/screens/PlannedWorkoutDetailScreen.tsx:11-15,37-41,58-78,92-116` requires a deeply frozen, exact-ID, target-bearing occurrence and exposes no Start/session/result/completion/rest command. `src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx:16-37` proves read-only targets and exact retry identity. |
| T-16-03-04 | Repudiation | medium | mitigate | `app/__tests__/session-route.test.tsx:61-72` compares the source digest before/after disclosure and asserts every mutation command untouched. `app/__tests__/calendar-cross-destination-route.test.tsx:351-478` repeats the digest and zero-command ledger across all real destination arms. |
| T-16-04-01 | Tampering | high | mitigate | `src/ui/calendar/CalendarMonthViewport.tsx:128-191,193-275` cancels old shared-value animations, carries completion epochs, and publishes only matching completions. `src/ui/calendar/calendarTransitionController.ts:206-230` advances invalidation/reconfiguration epochs and rejects mismatched callbacks. |
| T-16-04-02 | Denial of Service | medium | mitigate | `src/ui/calendar/CalendarMonthViewport.tsx:193-261` uses manual intent arbitration, a one-panel clamp, and a release latch; per-frame work stays on the UI thread. `src/ui/calendar/calendarTransitionController.ts:187-228` rejects second semantic transitions while settling. |
| T-16-04-04 | Elevation of Privilege | high | mitigate | `src/ui/calendar/CalendarMonthViewport.tsx:83-109,193-261` receives only semantic callbacks and transition state; worklets publish preview/release/cancel/completion intents through `scheduleOnRN` and have no repository, route, SQL, or mutation capability. |
| T-16-05-01 | Spoofing | high | mitigate | `app/(tabs)/calendar.tsx:29-38,58-87` exhaustively switches the typed destination union, validates/encodes durable IDs, and uses fixed route templates. Real Running and Garmin routes validate scalar IDs and render missing/removed states at `app/library/running/[planId].tsx:7-33` and `app/garmin/activity/[activityId].tsx:43-99,108-131`. |
| T-16-05-02 | Elevation of Privilege | high | mitigate | `src/ui/screens/CalendarScreen.tsx:48-59,521-538` passes navigation intent only. `app/(tabs)/__tests__/calendar.test.tsx:72-98`, `app/__tests__/session-route.test.tsx:61-72`, and `app/__tests__/calendar-cross-destination-route.test.tsx:351-478` verify route identities and zero Calendar-origin mutation, lifecycle, matching, correction, removal, resume, completion, or rest commands. |
| T-16-05-04 | Denial of Service | medium | mitigate | `src/ui/calendar/CalendarAgenda.tsx:54-77,98-125` renders one full-row target per source event and uses `activeEventIdRef` as an activation latch shared by touch and Enter/Space. `app/__tests__/calendar-cross-destination-route.test.tsx:426-435` requires exactly one push for each accepted activation. |
| T-16-06-01 | Elevation of Privilege | high | mitigate | `app.config.ts:27-43,66-70,113-116` defaults to production, uses the production package, disables native contracts, and removes the suite outside `development-test`. `src/bootstrap/phase16CalendarTestControls.ts:65-99,109-159` additionally requires the exact dev-test package/profile/native flag/suite/stage tuple. Production and unknown-identity rejection is tested at `src/bootstrap/phase16CalendarTestControls.test.ts:21-26,48-71`. |
| T-16-06-02 | Tampering | high | mitigate | `scripts/compare-v12-calendar.mjs:18-29,55-75,100-129` validates in-root non-symlink files, reference/native hashes, geometry, source-manifest identity, exact capture sets, and individually hashed artifacts. `scripts/verify-v12-native-evidence.mjs:230-251` canonicalizes the root, rejects every symlink path segment, rehashes bytes, rejects duplicates, and checks optional sizes. Adversarial path/symlink/replaced-byte tests are at `scripts/v12-evidence-scripts.test.mjs:166-194`; the checked-in source manifest and all 14 references are rehashed at `scripts/v12-calendar-comparison.test.mjs:127-132`. |
| T-16-06-03 | Repudiation | high | mitigate | `scripts/verify-v12-native-evidence.mjs:144-195,219-227` permits only declared classifications, requires explained differences and complete dated deviation evidence, derives aggregate status, and prevents `all_pass` over `FAIL` or `REVIEW_REQUIRED`. Adversarial classification tests are at `scripts/v12-evidence-scripts.test.mjs:137-164`. |
| T-16-06-04 | Information Disclosure | high | mitigate | Phase 16 cannot execute native capture: `scripts/run-v12-maestro.mjs:53-63` validates identity/flow and then throws `v12_calendar_native_execution_phase20_only`. Host controls and fixtures are explicitly synthetic at `src/bootstrap/phase16CalendarTestControls.ts:42-63,118-150`; recursive metadata privacy validation is at `scripts/compare-v12-calendar.mjs:30-34` and `scripts/verify-v12-native-evidence.mjs:65-79,218`. No screenshot/trace/native result is claimed by Phase 16. |
| T-16-07-01 | Spoofing | high | mitigate | `app/(tabs)/calendar.tsx:58-87` uses fixed route identities; `app/library/running/[planId].tsx:7-33` and `app/garmin/activity/[activityId].tsx:43-99` validate scalar durable IDs and invoke the real loaders/screens. Exact encoded route identity, stale Running, and removed Garmin behavior are exercised at `app/__tests__/calendar-cross-destination-route.test.tsx:292-349,458-490`. |
| T-16-07-02 | Elevation of Privilege | high | mitigate | `app/__tests__/calendar-cross-destination-route.test.tsx:223-248,351-478` executes all six source-backed destination paths through real route components, asserts every command/lifecycle mock untouched, and requires an unchanged SHA-256 source digest. Calendar-mode branches omit management props at `app/library/running/[planId].tsx:24-33` and `app/garmin/activity/[activityId].tsx:187-209`. |
| T-16-07-03 | Tampering | high | mitigate | `scripts/verify-v12-native-evidence.mjs:82-183,185-227,230-251` cross-checks manifest/source/APK/device/report identities, exact case/journey/comparison sets, classifications, deviations, aggregate status, canonical paths, and byte hashes. `scripts/v12-evidence-scripts.test.mjs:117-194` proves stale, duplicate, mutating, weak-focus, false-PASS, unsafe-path, symlink, and replaced-byte rejection. |
| T-16-07-04 | Repudiation | medium | mitigate | `scripts/benchmark-v12-interactions.mjs:85-167` requires 100 source-backed query samples and 100 complete non-synthetic/non-fabricated interaction sequences, recomputes p95/missed-frame/refresh-rate/overhead summaries, fixes `acceptance_owner` to `phase20`, and rejects `verdict`/`status`. Output uses exclusive creation at lines 201-225. Tests at `scripts/v12-evidence-scripts.test.mjs:196-227` reject deferred, fabricated, incomplete, recomputed-summary, privacy-bearing, and verdict-bearing data. |
| T-16-07-05 | Information Disclosure | high | mitigate | The only Phase 16 evidence is an explicitly host-only synthetic fixture; `scripts/verify-v12-native-evidence.mjs:198-218` requires fixture/native-execution consistency, Phase 20 ownership, no verdict, and recursive privacy validation. `scripts/run-v12-maestro.mjs:53-63` blocks native route evidence creation in Phase 16, so no physical-device data is captured or promoted. |

### Open (blocking — severity >= high threshold)

None.

### Open (non-blocking — severity below high threshold)

| Threat ID | Category | Severity | Mitigation Expected | Files Searched |
|-----------|----------|----------|---------------------|----------------|
| T-16-04-03 | Spoofing | medium | Increment layout generation whenever rotation/font/background invalidates geometry; reject measurements whose generation is not current and remeasure before animation. The code stores `generation: layoutGeneration.current` but never increments `layoutGeneration` and never checks the stored generation before using it. | `src/ui/screens/CalendarScreen.tsx:112-114,289-318`; `src/ui/calendar/CalendarMonthViewport.tsx:32,152-178,263-276`; `src/ui/__tests__/CalendarTransitions.test.tsx`; `src/ui/__tests__/CalendarScreen.test.tsx` |
| T-16-05-03 | Tampering | medium | Verify the retained event is a member of the refreshed current snapshot before restoring row focus; otherwise fall back safely. Current code starts refresh but restores focus on the next animation frame from the old row-ref map, before the asynchronous refresh can confirm membership. | `src/ui/screens/CalendarScreen.tsx:255-287,300-318,357-369`; `src/ui/calendar/CalendarAgenda.tsx:122-125`; `src/ui/__tests__/CalendarScreen.test.tsx:191-265` |
| T-16-06-05 | Denial of Service | medium | Implement resumable immutable stage/run state and refuse overwrite of completed or failed comparison runs. The stage/sample registries are bounded, but the comparison writer uses ordinary `writeFileSync` into recursively reused output directories and has no resume or terminal-run-state check. The diagnostics writer's `wx` protection does not cover comparison stages. | `src/bootstrap/phase16CalendarTestControls.ts:1-31,67-69,118-150`; `scripts/compare-v12-calendar.mjs:77-79,100-129`; `scripts/run-v12-maestro.mjs:15-24,40-63`; `scripts/benchmark-v12-interactions.mjs:222-225` |

*Only blocking-open threats count toward `threats_open` in SECURITY.md frontmatter.*

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-16-01 | T-16-02-04 | Calendar is a local single-owner surface, so displaying that owner's workout labels is intended functionality. Tests and audit fixtures use deterministic synthetic records, and Phase 16 evidence validators reject privacy-bearing metadata. | Phase 16 threat model owner | 2026-10-13 |

## Unregistered Flags

None. `16-07-SUMMARY.md` reports no threat flags beyond the registered route-identity, read-only capability, evidence-file, classification, privacy, and diagnostic boundaries. The `16-02-SUMMARY.md` threat-surface scan also reports no additional endpoint, authentication, filesystem, schema, or mutation surface.

## Phase 20 Deferred Native Evidence

Native execution, Android build/install, ADB/Maestro collection, screenshots, device evidence, and release/profile performance acceptance are not Phase 16 findings. The Phase 16 runner deliberately refuses execution, the checked-in fixture remains `NOT_RUN` / `REVIEW_REQUIRED`, and the verifier returns `all_pass: false`. No native or physical-device evidence is fabricated or promoted.

## Verification Run

Audited branch `fchoo/UX-revamp` at `8072135ce686ddaea1ad8149c7f5733902624076`.

| Check | Result |
|-------|--------|
| Phase 16 diagnostic controls and narrow Calendar ports | PASS — 6 tests |
| Calendar transitions, surface, session/planned details, route dispatch, and real cross-destination journeys | PASS — 8 suites / 30 tests |
| SQLite Calendar range identity, bounds, snapshot, and malformed-source handling | PASS — 4 tests |
| Evidence/comparison adversarial suites | PASS — 12 tests |
| Host-only final verifier | PASS as contract validation — `REVIEW_REQUIRED`, `all_pass: false`, 9 native cases, 8 route journeys, 14 comparisons |
| TypeScript | PASS — `npm run typecheck` |
| Architecture boundaries | PASS — 422 files |

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Blocking Open | Run By |
|------------|---------------|--------|------|---------------|--------|
| 2026-10-13 | 30 | 27 | 3 | 0 | TRAE security auditor |

## Sign-Off

- [x] All 30 threats have a declared disposition and an audit classification.
- [x] Accepted risk T-16-02-04 is documented.
- [x] All high-severity declared mitigations are verified in current code/tests.
- [x] `threats_open: 0` reflects the configured high blocking threshold.
- [ ] Three medium non-blocking mitigations remain open and should be implemented before this audit can become `SECURED`.

**Approval:** `OPEN_THREATS` — high-severity gate clear; three medium threats remain tracked.

**threats_open:** 0
