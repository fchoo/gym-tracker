---
phase: 17-library-running-plans
plan: "10"
subsystem: running-session-authoring
tags: [react-native, running, sqlite, revisions, idempotency, accessibility]
requires:
  - phase: 17-09
    provides: revision-fenced session routes, stable runtime identity allocation, and SQLite readback
provides:
  - Complete Tempo, Intervals, Hills, and Fartlek create/edit form branches with selected-field-only payloads.
  - Strict unit-bearing Tempo-repeat and bounded unstructured-Fartlek source contracts.
  - Real-SQLite round-trip proof for all remaining session structures and same-day slot ordering.
affects: [17-11, running-detail, running-portability, garmin-matching]
actuals:
  tokens: 10768
  tasks: 3
  commits: 8
tech-stack:
  added: []
  patterns: [discriminated contextual drafts, selected-branch serialization, receipt-safe runtime readback, same-day slot ordering]
key-files:
  created: []
  modified:
    - src/domains/running/contracts.ts
    - src/ui/components/RunningSessionFields.tsx
    - src/ui/screens/RunningSessionEditorScreen.tsx
    - tests/integration/running-plan-authoring.test.ts
key-decisions:
  - "Tempo Continuous persists only work plus intensity, while Tempo repeats additionally persists positive repetitions and recovery."
  - "Structured Fartlek persists typed quantities; Unstructured Fartlek persists bounded cues and no hidden quantity branch."
  - "The authoritative repository permits one root per session kind per plan, so the two Fartlek styles are round-tripped in separate inactive plans."
patterns-established:
  - "Session type switches retain screen-local drafts but commands construct exactly one selected contextual branch."
  - "SQLite proof asserts source readback, inactive lifecycle, and stable same-day slot order without activation coupling."
requirements-completed: [LIB-27, LIB-31, LIB-32, LIB-33, LIB-34]
coverage:
  - id: D1
    description: "Tempo and Intervals expose exact unit-bearing fields, validate selected branches, and serialize only the active contextual payload."
    requirement: LIB-31
    verification:
      - kind: automated_ui
        ref: src/ui/components/RunningSessionFields.test.tsx
        status: pass
      - kind: unit
        ref: src/ui/__tests__/RunningSessionEditorScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D2
    description: "Hills preserves independently labelled uphill and return-recovery facts through editor serialization and reload."
    requirement: LIB-32
    verification:
      - kind: automated_ui
        ref: src/ui/components/RunningSessionFields.test.tsx
        status: pass
      - kind: unit
        ref: src/ui/__tests__/RunningSessionEditorScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: "Structured and Unstructured Fartlek retain exclusive quantity or bounded-cue shapes across source parsing, edit serialization, and SQLite readback."
    requirement: LIB-33
    verification:
      - kind: unit
        ref: src/domains/running/contracts.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/running-plan-authoring.test.ts
        status: pass
    human_judgment: false
  - id: D4
    description: "All session branches retain stable runtime identities, revision-fenced commands, readback, retry drafts, and inactive lifecycle behavior."
    requirement: LIB-34
    verification:
      - kind: integration
        ref: tests/integration/running-plan-authoring.test.ts
        status: pass
      - kind: other
        ref: npm run check:boundaries
        status: pass
    human_judgment: false
duration: 10m
completed: 2026-10-10
status: complete
---

# Phase 17 Plan 10: Typed Running Session Routes Summary

**Tempo, Intervals, Hills, and both Fartlek styles now use exact unit-aware, selected-branch session forms that commit through the revisioned SQLite runtime and reopen authoritative source facts.**

## Performance

- **Duration:** 10m
- **Started:** 2026-10-10T19:40:24Z
- **Completed:** 2026-10-10T19:50:29Z
- **Tasks:** 3/3
- **Files modified:** 9

## Accomplishments

- Added complete deep-route form branches for Tempo, Intervals, Hills, and Fartlek with persistent screen-local drafts, contextual validation, previews, and Phase 14-compatible labels/actions.
- Extended the strict source union so Continuous Tempo and Tempo repeats preserve their distinct shapes, while Unstructured Fartlek stores bounded cues instead of a hidden quantity payload.
- Preserved runtime-owned session/slot identity, revisions, request receipts, failure/retry drafts, post-commit readback, inactive lifecycle, zero-or-many behavior, and stable same-day slot ordering.
- Added a real-SQLite readback suite for every newly completed type and both Fartlek styles; no cadence or cluster authoring surface was introduced.

## Task Commits

1. **Task 1: Prove committed Tempo and Intervals route editing** — `6cfd4f6a` (`test`), `3933686d` (`feat`)
2. **Task 2: Prove committed Hills route editing** — `57456dba` (`test`), `63748a05` (`feat`)
3. **Task 3: Prove committed editing for both Fartlek styles** — `85733ba2` (`test`), `b15e89f1` (`feat`)
4. **Correctness and SQLite proof** — `0aeec0f3` (`fix`), `97d01b50` (`test`)

## Files Created/Modified

- `src/domains/running/contracts.ts` — strict Tempo and Fartlek contextual source shapes, including bounded unstructured cues.
- `src/ui/components/RunningSessionFields.tsx` — visible selected-type fields, unit controls, validation, and previews for all seven variants.
- `src/ui/screens/RunningSessionEditorScreen.tsx` — exact contextual command creation, authoritative edit draft reconstruction, and type-accurate retry feedback.
- `src/domains/running/contracts.test.ts` — strict rejection coverage for cross-branch or oversized cue input.
- `src/ui/components/RunningSessionFields.test.tsx`, `src/ui/__tests__/RunningSessionEditorScreen.test.tsx`, and `src/ui/running/runningFormDraft.test.ts` — component, serializer, and fixed-discriminant coverage.
- `tests/integration/running-plan-authoring.test.ts` — real-SQLite inactive readback for Tempo, Intervals, Hills, and both Fartlek styles.

## Decisions Made

- Continuous Tempo omits repetitions and recovery entirely; only Tempo repeats owns those fields.
- Fartlek uses mutually exclusive persisted shapes: structured quantities or unstructured bounded cues. No free-form notes field is used as a substitute.
- The existing one-root-per-kind repository invariant remains authoritative. The proof covers both Fartlek styles as separate inactive plans, avoiding an invalid duplicate root inside one plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Extended the persistent source union for exact Tempo and Fartlek semantics.**
- **Found during:** Tasks 1 and 3
- **Issue:** The landed union could not retain Tempo repeats/recovery or Unstructured Fartlek cues without dropping facts or flattening them into a generic payload.
- **Fix:** Added strict selected-branch schemas, bounded cue validation, and source readback coverage.
- **Files modified:** `src/domains/running/contracts.ts`, `src/domains/running/contracts.test.ts`, `src/ui/screens/RunningSessionEditorScreen.tsx`
- **Verification:** Targeted unit, component, and real-SQLite integration suites passed.
- **Committed in:** `3933686d`, `b15e89f1`, `97d01b50`

**2. [Rule 1 - Bug] Corrected failure/retry feedback for newly supported session kinds.**
- **Found during:** Final task review
- **Issue:** The existing failure message named unknown new types as Progression, making retained-draft retry feedback misleading.
- **Fix:** Added a single exhaustive session-kind label helper and test coverage for Tempo, Intervals, Hills, and Fartlek.
- **Files modified:** `src/ui/screens/RunningSessionEditorScreen.tsx`, `src/ui/__tests__/RunningSessionEditorScreen.test.tsx`
- **Verification:** Targeted component tests passed.
- **Committed in:** `0aeec0f3`

**3. [Rule 3 - Blocking] Used the configured UI test project for `runningFormDraft.test.ts`.**
- **Found during:** Task 3 verification
- **Issue:** `npm run test:unit` excludes `src/ui/**`, so it could not discover the plan-listed UI-local draft test.
- **Fix:** Ran the same test via `npm run test:components`, which includes `src/ui/**`.
- **Verification:** `src/ui/running/runningFormDraft.test.ts` passed in the component project.

**Total deviations:** 3 auto-fixed (1 Rule 1, 1 Rule 2, 1 Rule 3).
**Impact on plan:** All changes preserve the planned source-authoritative route architecture; no activation, native, APK, or global build behavior was added.

## Issues Encountered

- The first all-variants SQLite fixture tried to persist two Fartlek roots in one plan and correctly hit the existing unique `(plan_id, session_kind)` invariant. The corrected proof uses two inactive plans, one for each Fartlek style.

## Known Stubs

None.

## User Setup Required

None — no external configuration is required.

## Next Phase Readiness

- Plan 17-11 can build session deletion/reorder behavior over complete typed session structures and source readback.
- Running portability and future matching consumers can parse all final session variants without cadence/cluster compatibility paths.

## Verification

- `npm run typecheck` — passed.
- `npm run lint` and `npm run check:boundaries` — passed.
- `npm run test:unit -- --runInBand src/domains/running/contracts.test.ts` — passed (11 tests).
- `npm run test:components -- --runInBand src/ui/running/runningFormDraft.test.ts src/ui/components/RunningSessionFields.test.tsx src/ui/__tests__/RunningSessionEditorScreen.test.tsx` — passed (15 tests).
- `npm run test:integration -- --runInBand tests/integration/running-plan-authoring.test.ts` — passed (4 real-SQLite tests).

## Self-Check: PASSED

- All listed source, component, and real-SQLite test files exist.
- Task commits `6cfd4f6a`, `3933686d`, `57456dba`, `63748a05`, `85733ba2`, `b15e89f1`, `0aeec0f3`, and `97d01b50` exist on `fchoo/UX-revamp`.

---
*Phase: 17-library-running-plans*
*Completed: 2026-10-10*
