---
phase: 03-calendar-and-history-integrity
plan: 01
subsystem: history-calendar
tags: [sqlite, migrations, calendar, local-date, effective-history, accessibility]
requires:
  - phase: 02-owned-library-and-planning
    provides: Versioned metric identities, owned schedules, and the trusted SQLite runtime boundary
provides:
  - Immutable original-history facts plus effective overlays and lifecycle/audit source schema
  - Civil-date Calendar repository/runtime reads with selected-date factual completion counts
  - Accessible Calendar destination with explicit state labels and factual session navigation
affects: [history-metrics, history-projections, session-corrections, progress]
actuals:
  tokens: 10200
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - Original session facts remain immutable while effective overlays supply corrected history reads
    - Calendar facts use validated stored civil LocalDate values rather than recomputed instants
key-files:
  created:
    - src/platform/sqlite/migrations/0013_history_integrity.ts
    - src/domains/history/contracts.ts
    - src/domains/history/calendar.ts
    - src/ui/screens/CalendarScreen.tsx
  modified:
    - src/platform/sqlite/repositories/historyRepository.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - app/(tabs)/calendar.tsx
key-decisions:
  - "Calendar reads resolve effective facts while retaining immutable original timestamps and creation offset."
  - "Voided lifecycle is represented in source schema now but ordinary Calendar reads exclude it by default."
patterns-established:
  - "History presentation crosses only typed runtime capabilities; routes and screens do not import SQLite repositories."
requirements-completed: [HIST-01, HIST-02, HIST-03]
coverage:
  - id: D1
    description: Additive history schema preserves original facts, creation offsets, audit immutability, and lifecycle constraints.
    requirement: HIST-03
    verification:
      - kind: integration
        ref: tests/sqlite-host/historyRepository.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Calendar reads expose civil-date states and factual selected-date completion counts from effective history facts.
    requirement: HIST-01
    verification:
      - kind: integration
        ref: tests/sqlite-host/historyRepository.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Calendar destination presents labelled state, loading, error, empty, and session-navigation surfaces.
    requirement: HIST-02
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/CalendarScreen.test.tsx
        status: pass
    human_judgment: false
duration: 1h 30m
completed: 2026-08-25
status: complete
---

# Phase 03 Plan 01: Immutable History Calendar Summary

**Effective-history Calendar reads preserve original facts and show reliable civil-date session state.**

## Accomplishments

- Added the forward-only history-integrity schema for immutable original facts, overlays, audit/lifecycle storage, subject revisions, and dedicated rebuild effects.
- Added one effective-history Calendar read path that retains stored local dates and displays actual exercise and working-set counts.
- Replaced the Calendar placeholder with an accessible month view that exposes state text and factual selected-date sessions.

## Task Commits

1. **Task 1: additive history-integrity schema and contracts** — `01a07fa`.
2. **Task 2: effective Calendar repository and runtime reads** — `294ab73`.
3. **Task 3: Calendar destination** — `799c56a`.

## Decisions Made

- Immutable source session facts are never updated for Calendar presentation; overlays are canonical effective replacements.
- Civil local dates and stored timezone/offset metadata are authoritative, preventing timezone reinterpretation.

## Deviations from Plan

None — the completed implementation follows the planned immutable-source/effective-overlay boundary.

## Verification

- History SQLite fixtures and Calendar component tests passed during implementation; the final Phase 3 source gate also passed typecheck, lint, boundaries, and history repository coverage.

## User Setup Required

None.

## Next Phase Readiness

Effective session facts and Calendar runtime capabilities are ready for metric-aware history and deterministic projections.

---
*Phase: 03-calendar-and-history-integrity*
*Completed: 2026-08-25*
