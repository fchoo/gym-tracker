---
phase: 16-calendar-parity
plan: "06"
subsystem: ui-evidence
tags: [calendar, react-native, maestro, revision-18, diagnostics, privacy, fail-closed]
requires:
  - phase: 16-calendar-parity
    provides: Calendar spatial transition controller, measured month/focused-week geometry, and agenda routing from Plans 16-01 through 16-05.
  - phase: 14-prototype-visual-shell
    provides: Revision 18 source manifest and approved Light/Dark accessibility treatment.
provides:
  - Development-test-only Calendar diagnostic control contracts with bounded synthetic trace samples.
  - Immutable Revision 18 reference map and host-side fail-closed individual comparison artifact generator.
  - Complete pre-destination Calendar Maestro stage registry and a Phase 20-only native runner boundary.
affects: [phase-16-plan-07, phase-20-native-acceptance, calendar-parity]
actuals:
  tokens: 14419
  tasks: 3
  commits: 8
tech-stack:
  added: [pngjs comparison artifacts, Maestro diagnostic source contract]
  patterns:
    - Exact development-test package/profile/suite gating for non-authoritative synthetic diagnostics.
    - Semantic-first fail-closed comparison validation before overlay and pixel-difference artifacts.
    - Native producers remain NOT_RUN/REVIEW_REQUIRED until the Phase 20 authority executes an identity-bound run.
key-files:
  created:
    - .planning/phases/16-calendar-parity/16-REFERENCE-MAP.json
    - src/bootstrap/phase16CalendarTestControls.ts
    - src/bootstrap/phase16CalendarTestControls.test.ts
    - maestro/v1.2/calendar.yaml
    - scripts/run-v12-maestro.mjs
    - scripts/compare-v12-calendar.mjs
    - scripts/v12-calendar-comparison.test.mjs
    - scripts/fixtures/v12-calendar-comparison/complete.json
  modified:
    - src/ui/calendar/CalendarMonthViewport.tsx
    - app/(tabs)/calendar.tsx
key-decisions:
  - "The owner-authorized host-only adaptation implements evidence and diagnostic contracts but never creates native output, invokes Maestro, or assigns a native PASS."
  - "Comparison records remain REVIEW_REQUIRED when native execution is NOT_RUN; a producer cannot promote itself through matching bytes or pixel metrics."
  - "Phase 20 exclusively owns execution against an installed identity-bound artifact and any native/release-performance verdict."
patterns-established:
  - "Calendar diagnostics are bounded, timestamp-monotonic synthetic samples and are unreachable unless package, build profile, native contract flag, suite, and stage all match."
  - "Reference maps hash every Revision 18 PNG, retain Light/Dark/System/accessibility/reduced-motion case ledger entries, and reject path, hash, geometry, semantics, authority, classification, and privacy corruption."
requirements-completed: [CAL-01, CAL-02, CAL-03, CAL-04, CAL-05, CAL-06, CAL-07, CAL-08, CAL-09, CAL-10, CAL-11, CAL-12, CAL-13, CAL-14, CAL-15, CAL-16, CAL-18, CAL-19, CAL-20, CAL-21]
coverage:
  - id: D1
    description: Development-test-only Calendar control gate records bounded synthetic threshold/release/cancel/focus diagnostics and rejects production or unknown identity.
    requirement: CAL-07
    verification:
      - kind: unit
        ref: npm run test:unit -- --runInBand phase16CalendarTestControls.test.ts
        status: pass
      - kind: unit
        ref: node node_modules/jest/bin/jest.js --config jest.config.js --selectProjects unit --runInBand phase16CalendarTestControls.test.ts --coverage --collectCoverageFrom=src/bootstrap/phase16CalendarTestControls.ts --coverageDirectory=<temporary-directory>
        status: pass
    human_judgment: false
  - id: D2
    description: Revision 18 map and comparison generator retain individual references/native/overlay/difference/mask records and fail closed on stale, unsafe, mismatched, semantic, threshold, owner-gate, or privacy corruption.
    requirement: CAL-04
    verification:
      - kind: other
        ref: node --test scripts/v12-calendar-comparison.test.mjs
        status: pass
      - kind: other
        ref: node scripts/compare-v12-calendar.mjs --fixture scripts/fixtures/v12-calendar-comparison/complete.json --verify
        status: pass
    human_judgment: false
  - id: D3
    description: Complete pre-destination Calendar diagnostic stage source covers gesture boundary, interruption, focus, accessibility, rotation/background, and reduced-motion contracts.
    requirement: CAL-15
    verification:
      - kind: automated_ui
        ref: maestro/v1.2/calendar.yaml and scripts/run-v12-maestro.mjs source contract
        status: unknown
    human_judgment: true
    rationale: Native source execution is explicitly NOT_RUN and Phase 20-deferred; this plan did not build, install, run ADB, invoke Maestro, or inspect an emulator/device.
duration: 1h 06m
completed: 2026-10-13
status: complete
---

# Phase 16 Plan 06: Calendar Diagnostic Evidence Contracts Summary

**Revision 18-bound Calendar diagnostics and fail-closed visual-comparison contracts are ready for Phase 20 native collection without generating or claiming native evidence.**

## Performance

- **Duration:** 1h 06m
- **Tasks:** 3/3 under the owner-authorized host-only execution boundary
- **Files modified:** 10 implementation/test/map files plus this summary
- **Native execution:** `NOT_RUN` — explicitly deferred to Phase 20

## Accomplishments

- Added exact package/profile/suite/stage-gated Calendar controls that record bounded synthetic drag threshold, release, cancellation, row geometry, and 3dp/4dp focus diagnostics without Calendar mutation or navigation authority.
- Added an immutable Revision 18 Calendar reference map, source-manifest hash validation, individual reference/native/overlay/difference/mask artifact generation, and semantic-first rejection of stale, unsafe, mismatched, unexplained, or privacy-unsafe evidence.
- Added the complete pre-destination diagnostic stage registry and a runner that validates identity and source bytes but refuses to execute native collection outside Phase 20.

## Task Commits

1. **Task 1: Capture one real Android 25% drag, 3dp focus, and measured week expansion**
   - `51be1205` — RED test control contract
   - `042081cf` — gated Calendar diagnostic hooks
   - `9ba80197` — rejection-path coverage test completion
   - Coverage closure correction — committed atomically with this summary correction
2. **Task 2: Map Revision 18 references and generate individual overlay/difference artifacts**
   - `3b795e51` — RED fail-closed comparison contract
   - `ad85ed31` — Revision 18 map and comparison generator
3. **Task 3: Expand diagnostic capture across the complete pre-destination Calendar matrix**
   - `271054f3` — complete Maestro diagnostic stage and Phase 20-only runner contract

## Verification

- `node --test scripts/v12-calendar-comparison.test.mjs` — passed (5 tests)
- `node scripts/compare-v12-calendar.mjs --fixture scripts/fixtures/v12-calendar-comparison/complete.json --verify` — passed; output remains `REVIEW_REQUIRED`, `NOT_RUN`, host-only
- `npm run test:unit -- --runInBand phase16CalendarTestControls.test.ts` — passed (3 tests)
- `npm run test:components -- --runInBand src/ui/__tests__/CalendarTransitions.test.tsx` — passed (9 tests)
- `npm run typecheck` — passed
- `npm run check:boundaries` — passed
- Direct focused Jest coverage — passed: 100% statements (44/44), branches (27/27), functions (17/17), and lines (39/39)

## Execution Boundary

Per the owner's explicit correction, this plan was executed as a host-only adaptation without editing `16-06-PLAN.md`. No Android doctor check, Gradle/APK build, ADB, emulator/device access, Maestro execution, screenshot capture, native report, or preseeded native evidence occurred. The runner is source-only and throws before native collection; Phase 20 owns the installed-artifact execution, comparison population, and any native PASS/FAIL/release-performance verdict.

## Decisions Made

- Test controls use only deterministic synthetic geometry/month facts and cannot authorize runtime state, navigation, or source mutations.
- The host fixture is temporary input to test the generator and is labeled host-only synthetic; it is not a native capture or evidence record.
- Matching images do not qualify as PASS: all host-generated comparison results remain `REVIEW_REQUIRED` until Phase 20 supplies valid native evidence.

## Deviations from Plan

### Scoped Execution Boundary

**Owner-authorized host-only adaptation**
- **Found during:** Task 1 precondition gate
- **Issue:** The original task precondition requires an installable development-test build and native tooling, while this execution was expressly prohibited from running Android/ADB/Maestro/build actions.
- **Resolution:** Implemented all source contracts and host tests without altering the plan; recorded native collection as `NOT_RUN` and Phase 20-deferred.
- **Impact:** No native or physical-device claim was made. Phase 20 remains the sole execution/verdict authority.

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced an invalid synthetic PNG byte fixture**
- **Found during:** Task 2 host comparison test
- **Issue:** The initial one-pixel fixture could not be decoded by PNGJS, preventing the generator from validating image geometry.
- **Fix:** Replaced it with a PNGJS-generated valid one-pixel byte fixture.
- **Files modified:** `scripts/v12-calendar-comparison.test.mjs`, `scripts/fixtures/v12-calendar-comparison/complete.json`
- **Verification:** Comparison adversarial suite and fixture CLI verification pass.
- **Committed in:** `ad85ed31`

**2. [Rule 1 - Bug] Separated timestamp validation from bounded geometry validation**
- **Found during:** Task 1 control test
- **Issue:** The geometry numeric guard rejected real monotonic epoch timestamps.
- **Fix:** Added a dedicated safe timestamp guard while retaining strict bounded geometry values.
- **Files modified:** `src/bootstrap/phase16CalendarTestControls.ts`
- **Verification:** Unit tests and focused strict coverage pass.
- **Committed in:** `042081cf`

## Issues Encountered

- A stray untracked duplicate test appeared in the orchestrator checkout during the interrupted execution. It was reported by the owner and deliberately not modified, deleted, or reconciled here; all authoritative plan work and commits remain only in the isolated worktree.

## Known Stubs

None. The host-only synthetic fixture is explicitly test input and cannot flow to UI or native evidence; native evidence remains absent by design rather than stubbed.

## Next Phase Readiness

- Phase 20 can execute the registered diagnostic stages only after it has a fresh development-test build manifest with matching source/APK/device identity.
- The Phase 20 collector must populate actual reference/native/overlay/difference/mask records and preserve the existing fail-closed validators. Until then, the Calendar native evidence status remains `NOT_RUN` / `REVIEW_REQUIRED`.
- `src/bootstrap/phase16CalendarTestControls.ts` is not yet registered in `scripts/run-coverage-gate.mjs`, so its standard `--focus-integrity` path cannot target the module. Plan 16-07/final phase coverage ownership must register it there; this correction proves closure now with the direct Jest command above without modifying Plan 16-07-owned files.

## Self-Check: PASSED

- All ten scoped implementation/test/map files exist in the isolated worktree.
- All six task commits above exist on `agent-phase16-01`.
- No shared STATE, ROADMAP, REQUIREMENTS, WINDOWS, Phase 14 evidence, or Phase 19 file was modified.

---
*Phase: 16-calendar-parity*
*Completed: 2026-10-13*
