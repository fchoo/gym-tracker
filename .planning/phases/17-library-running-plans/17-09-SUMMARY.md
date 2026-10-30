---
phase: 17-library-running-plans
plan: "09"
subsystem: running-session-authoring
tags: [react-native, running, sqlite, revisions, idempotency, accessibility]
requires:
  - phase: 17-01
    provides: SQLite-authoritative inactive Running aggregate readback and local form drafts
provides:
  - Deep-linkable create and exact-identity edit routes for committed Running sessions.
  - Revision-fenced receipt-backed session save with authoritative aggregate readback.
  - Structured Recovery, Long run, and Progression forms with selected-variant-only payloads.
affects: [17-08, 17-10, 17-11, running-detail, running-portability]
actuals:
  tokens: 13468
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns: [screen-local typed drafts, runtime-owned ID allocation, receipt-stable retry commands, source-table readback]
key-files:
  created:
    - app/library/running/[planId]/session/new.tsx
    - app/library/running/[planId]/session/[sessionId].tsx
    - src/ui/screens/RunningSessionEditorScreen.tsx
    - src/ui/components/RunningSessionFields.test.tsx
    - src/ui/__tests__/RunningSessionEditorScreen.test.tsx
  modified:
    - src/bootstrap/runningPlanRuntime.tsx
    - src/domains/running/contracts.ts
    - src/ui/components/RunningSessionFields.tsx
    - tests/integration/running-plan-authoring.test.ts
key-decisions:
  - "Running-session IDs, revisions, slots, and idempotency hashes are allocated and retained by the runtime writer boundary, never by a create route or a UI draft."
  - "Only the active discriminated Recovery, Long run, or Progression branch is constructed for a save command; inactive form fields remain screen-local."
  - "Route success follows authoritative SQLite aggregate readback and keeps all draft fields available on conflict or failure."
patterns-established:
  - "Session form: preserve common Day/Warm-up/Cool-down and a per-type in-memory draft while changing Workout type."
  - "Runtime session mutation: reuse a request-keyed immutable command on retry, then return only source readback."
requirements-completed: [LIB-27, LIB-28, LIB-29, LIB-30]
coverage:
  - id: D1
    description: Recovery session routes commit only through the revision-fenced runtime, then reopen authoritative SQLite source facts.
    requirement: LIB-27
    verification:
      - kind: unit
        ref: src/bootstrap/runningPlanRuntime.test.tsx
        status: pass
      - kind: integration
        ref: tests/integration/running-plan-authoring.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Recovery, Long run, and Progression show only their typed fields, validate semantic units, preview locally, and serialize only their selected branch.
    requirement: LIB-28
    verification:
      - kind: unit
        ref: src/domains/running/contracts.test.ts
        status: pass
      - kind: unit
        ref: src/ui/components/RunningSessionFields.test.tsx
        status: pass
      - kind: unit
        ref: src/ui/__tests__/RunningSessionEditorScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: Failed session saves retain drafts and expose a bounded retry while no route performs direct SQL.
    requirement: LIB-29
    verification:
      - kind: unit
        ref: src/ui/__tests__/RunningSessionEditorScreen.test.tsx
        status: pass
      - kind: other
        ref: npm run check:boundaries
        status: pass
    human_judgment: false
duration: 2h 7m
completed: 2026-10-10
status: complete
---

# Phase 17 Plan 09: Committed Running Session Routes Summary

**Deep-linkable Running session creation and editing now commit exact Recovery, Long run, and Progression definitions through receipt-backed SQLite revisions, retain failed drafts, and reopen only authoritative source facts.**

## Performance

- **Duration:** 2h 7m
- **Started:** 2026-10-10T17:00:00Z
- **Completed:** 2026-10-10T19:07:05Z
- **Tasks:** 2/2
- **Files modified:** 14

## Accomplishments

- Added normalized `new` and `[sessionId]` Running-session routes over a thin runtime port; the create route has no persisted session identity before the command commits.
- Added structured Recovery, Long run, and Progression controls with exact Volume/target/stage/finish units, selected-variant preview grammar, visible-field validation, and preservation of Day/Warm-up/Cool-down across Workout-type changes.
- Added receipt-stable runtime mutation/readback and real-SQLite proof for inactive Recovery, Long run, Progression, zero-or-many sessions, and two ordered same-day slots.
- Retained draft values and supplied focused retry, discard confirmation, Back, accessible labels, header, and alert behavior; routes pass the Phase 14 boundary guard with no direct SQL.

## Task Commits

1. **Task 1: Add and reopen one typed Recovery session** — `e202b37e` (`feat`)
2. **Task 2: Prove committed Long run and Progression route editing** — `c2e12351` (`feat`)

## Files Created/Modified

- `app/library/running/[planId]/session/new.tsx` — UI-only create route forwarding only to the runtime port.
- `app/library/running/[planId]/session/[sessionId].tsx` — normalized stable-identity edit route.
- `src/ui/screens/RunningSessionEditorScreen.tsx` — load, typed drafts, validation, failure/retry, discard confirmation, and command construction.
- `src/ui/components/RunningSessionFields.tsx` — discriminated Recovery/Long run/Progression controls and preview grammar.
- `src/bootstrap/runningPlanRuntime.tsx` — revision-fenced, request-stable source-graph save followed by aggregate readback.
- `src/domains/running/contracts.ts` — strict Long run finish and Progression start/finish target source shapes.
- `tests/integration/running-plan-authoring.test.ts` — real SQLite typed-session and ordered-slot readback proof.

## Decisions Made

- The session writer creates stable root/revision/slot identities only within the runtime command. A route owns route parsing and navigation; it never directly allocates persistence identity or accesses SQLite.
- A retry reuses the same immutable request command, including its request hash, preserving receipt idempotency rather than creating a second session revision.
- Recovery and Long run use one advisory target; Progression stores distinct Start target and Finish target in its contextual discriminated branch. Hidden inactive-variant data never reaches a command.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added the post-create session command/readback boundary.**
- **Found during:** Task 1
- **Issue:** The repaired aggregate runtime exposed only create/read operations, so a screen-only implementation would have used fixture state or could not satisfy committed create/edit/retry/readback requirements.
- **Fix:** Added a narrow receipt-backed `saveSession` runtime method that fences plan/session/slot revisions, allocates identities inside the writer boundary, saves through the authoritative source graph, and returns SQLite readback.
- **Files modified:** `src/bootstrap/runningPlanRuntime.tsx`, `src/bootstrap/runningPlanRuntime.test.tsx`, `tests/integration/running-plan-authoring.test.ts`
- **Verification:** Targeted runtime unit and real-SQLite integration tests passed.
- **Committed in:** `e202b37e`

**2. [Rule 2 - Missing critical functionality] Made Long run and Progression source branches strictly typed.**
- **Found during:** Tasks 1–2
- **Issue:** Long run had an empty contextual source shape and Progression used generic stage records, which could not preserve the approved finish or separately-labelled start/finish target semantics.
- **Fix:** Added strict Long run finish and Progression stages/start-target/finish-target schemas, selected-branch form serialization, and integration readback proof.
- **Files modified:** `src/domains/running/contracts.ts`, `src/ui/components/RunningSessionFields.tsx`, `src/ui/screens/RunningSessionEditorScreen.tsx`, associated tests
- **Verification:** Contract, component, editor, and SQLite integration tests passed.
- **Committed in:** `e202b37e`, `c2e12351`

**Total deviations:** 2 auto-fixed (Rule 2 correctness boundaries).

## Issues Encountered

- The no-SQL route guard initially matched the helper name `runningSessionPayloadFromDraft` as a SQL-like `run*` invocation. Renaming it to `makeRunningSessionSpec` preserved the same behavior while keeping the route-boundary lint meaningful; no guard was weakened.

## Known Stubs

None.

## User Setup Required

None — no external configuration is required.

## Next Phase Readiness

- Plan 17-08 can reuse the committed session deep routes from a source-backed Running detail screen.
- Plans 17-10 and 17-11 can extend the same discriminated field and runtime patterns for the remaining session kinds and broader prospective delete/reorder/portability cases.

## Verification

- `npm run test:unit -- --runInBand src/bootstrap/runningPlanRuntime.test.tsx src/domains/running/contracts.test.ts src/domains/running/commands.test.ts` — passed (3 suites, 15 tests).
- `npm run test:components -- --runInBand src/ui/components/RunningSessionFields.test.tsx src/ui/__tests__/RunningSessionEditorScreen.test.tsx` — passed (2 suites, 5 tests).
- `npm run test:integration -- --runInBand tests/integration/running-plan-authoring.test.ts` — passed (2 tests, real SQLite).
- `npm run typecheck`, `npm run lint`, and `npm run check:boundaries` — passed.

## Self-Check: PASSED

- All listed route, field, editor, runtime, and integration test files exist.
- Task commits `e202b37e` and `c2e12351` exist on `fchoo/UX-revamp`.
