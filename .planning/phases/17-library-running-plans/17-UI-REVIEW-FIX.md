---
phase: 17
phase_name: library-running-plans
review_path: .planning/phases/17-library-running-plans/17-UI-REVIEW.md
fixed_at: 2026-10-11T07:10:35+08:00
iteration: 5
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
verification_location: main checkout
---

# Phase 17 — UI Review Fix Report

## Fixed Issues

### Factual Running readback and units

**Commit:** `0befdb8a`

Detail now renders stored benchmark/provenance/date facts, weekly structure, and shared seven-kind readback with units.

### Local-date and benchmark validation

**Commit:** `6758311`

Benchmark recorded dates now use a calendar-valid local-date parser, including leap-year handling. Impossible values retain the draft and receive the exact benchmark validation error.

### Save failure recovery focus and announcement

**Commit:** `6758311`

Plan and session save failures now expose noun-specific semantic headings with stable native IDs (`running-plan-save-error-heading` and `running-session-save-error-heading`). After the async failure renders, focus moves to that heading through the native bridge, and the recovery announcement names the plan/session while retaining the draft and actionable retry.

### Complete session preview facts

**Commit:** `6758311`

Hills and structured Fartlek previews now include their persisted-style effort target and unit-bearing work/recovery context.

### Final public retry and reorder labels

**Commit:** `f75ace3`

Regression assertions now require `Retry loading Library`, `Retry refreshing Library`, and `Move earlier`/`Move later`; no obsolete public labels were restored.

### Session first-invalid focus and deletion recovery

**Commits:** `2b0eaef`, `2bfd7f7`

All seven session kinds retain stable first-invalid focus targets, and local deletion restores focus to the appropriate surviving row or Add-session action.

## Verification

All checks ran in the authorized main checkout (`workflow.use_worktrees=false`). No APK/native build, device run, push, PR, or deployment was performed.

- Focused Running UI components: 4 suites, 32 tests passed.
- Full component project: 71 suites, 684 tests passed (existing console warnings only).
- `npm run typecheck` — passed.
- `npm run lint` and `npm run check:boundaries` — passed (367 files).
- `git diff --check` — passed.

---

_Fixer: TRAE (gsd-code-fixer)_
