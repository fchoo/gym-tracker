---
phase: 09
slug: in-workout-exercise-editing
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-01
audited: 2026-10-01
requirements: [WORK-20, WORK-21, WORK-22, WORK-23, WORK-24, WORK-25, WORK-27]
automated_gaps: 0
manual_only: 0
---

# Phase 09 - Validation Strategy

> Retrospective Nyquist audit of in-workout editing, immutable history, scheduling/progression semantics, and optional plan write-back.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest unit/component/SQLite-host/integration projects, Expo SQLite device contracts, and Maestro |
| **Config file** | `jest.config.js`, `scripts/run-coverage-gate.mjs`, Phase 9 native runners |
| **Quick run command** | `npm run test:integration -- --runInBand tests/integration/session-exercise-editing.test.ts` |
| **Full suite command** | `npm run test:coverage -- --runInBand` |
| **Native evidence** | Final Phase 9 edit/relaunch/write-back matrix passed with zero skips |

## Sampling Rate

- Run focused repository and component tests after each edit-command change.
- Run schedule/progression and plan-impact integration tests after lineage changes.
- Run full exact coverage plus native persistence/UI evidence before phase close.

## Per-Plan Verification Map

| Plan | Requirement | Behavior | Automated Evidence | Status |
|------|-------------|----------|--------------------|--------|
| 09-01..03 | WORK-20, WORK-24 | Add exercise, immutable snapshots, receipts, real SQLite | Unit, integration, and device contracts | green |
| 09-04..05 | WORK-21, WORK-22, WORK-24 | History-safe replace/remove and relaunch | Repository, integration, and native UI suites | green |
| 09-06 | WORK-23, WORK-24 | Presentation-only reorder and durable receipt | Integration and native relaunch suites | green |
| 09-07 | WORK-24, WORK-25 | Modified-from-plan, schedule consumption, lineage-safe progression | `load-reps` and `today-schedule-workout` integration suites | green |
| 09-08..09 | WORK-24, WORK-27 | Atomic previewed write-back and default-No completion UI | Plan-impact integration and completion component/native suites | green |
| 09-10 | WORK-20..25, WORK-27 | Final source/native evidence closure | Phase verification 15/15 | green |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

## Manual-Only Verifications

All phase behaviors have automated or manifest-bound native verification.

## Validation Audit 2026-10-01

| Metric | Count |
|--------|-------|
| Requirements covered | 7/7 |
| Automated gaps | 0 |
| Manual-only gaps | 0 |

## Validation Sign-Off

- [x] Every plan has automated verification.
- [x] Persistence changes have host and/or device SQLite coverage.
- [x] Edit, relaunch, and write-back UI behaviors have native evidence.
- [x] No watch-mode command is used.
- [x] `nyquist_compliant: true` is set.

**Approval:** validated 2026-10-01
