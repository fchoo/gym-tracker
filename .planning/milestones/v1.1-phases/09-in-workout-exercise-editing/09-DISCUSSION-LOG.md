# Phase 9: In-Workout Exercise Editing - Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md.

**Date:** 2026-09-15
**Phase:** 9-In-Workout Exercise Editing
**Areas discussed:** Write-back granularity (WORK-27)

---

## Write-back granularity (WORK-27)

| Option | Description | Selected |
|--------|-------------|----------|
| All-or-nothing apply | Save applies all session deltas (add/replace/remove/reorder) as one revision-checked plan edit, or none. | ✓ |
| Let owner pick which changes | Owner ticks individual changes to push; adds per-delta selection UI + edge cases. | |

**User's choice:** All-or-nothing apply (Recommended)
**Notes:** Matches default-No single-tap model; keeps edge cases bounded; a pick-which UI can layer on later without changing the domain contract.

## Carried from earlier owner decisions (REQUIREMENTS.md, not re-asked)

- Q4 single-select add; Q5 append-then-reorder; Q6 replace keeps original as skipped when completed sets exist; Q7 added exercises manual-only (null lineage); Q8 edited session consumes opportunity + modified-from-plan flag; Q9 write-back default No.

## Claude's Discretion

- New session-edit command names/shapes and file placement (extend setCommands vs new module); added-origin + skipped-original visual treatment.

## Deferred Ideas

- Per-delta cherry-pick write-back; multi-select add; supersets → backlog. Advanced timing on added exercise → Phase 10.
