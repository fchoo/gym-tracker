# Phase 8: Session Overview & Navigation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-15
**Phase:** 8-Session Overview & Navigation
**Areas discussed:** List density, Auto-scroll behavior, Focus/review mode fate, Set editing model

---

## List density (completed/earlier exercises)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-collapse done, tap to expand | Completed/earlier exercises collapse to one-line summary; active + upcoming expanded; tap re-expands. Hevy/Strong-like on long sessions. | ✓ |
| Always fully expanded | Every exercise always shows all set rows; max detail, longer scroll, no collapse logic. | |

**User's choice:** Auto-collapse done, tap to expand (Recommended)
**Notes:** Keeps scroll length manageable on long sessions; matches industry-norm apps.

---

## Auto-scroll behavior (after completing active set)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-scroll to next active set | List gently scrolls newly-active set into view; respects reduced-motion (jump not animate). | ✓ |
| Hold scroll position | List stays put after completion; user scrolls manually. | |

**User's choice:** Auto-scroll to next active set (Recommended)
**Notes:** Preserves the one-tap rhythm; reuse existing reduceMotion + AdaptiveScreen scrollTo pattern.

---

## Focus/review mode fate

| Option | Description | Selected |
|--------|-------------|----------|
| Retire it — single overview only | Drop the Focused vs Reviewing distinction + return-to-current banner; overview is the only surface; remove redundant v1.0 state. | ✓ |
| Keep a focus toggle | Overview default but keep optional single-exercise focus mode; two modes to maintain. | |

**User's choice:** Retire it — single overview only (Recommended)
**Notes:** Everything visible at once makes reviewExerciseId/return-banner redundant; costly-reversibility recorded (touches screen props + runtime + fixtures).

---

## Set editing model

| Option | Description | Selected |
|--------|-------------|----------|
| Active set inline; others expand-on-tap | Active set shows full inline editor; other rows compact, expand editor on tap. Light + fast on long sessions. | ✓ |
| Every set always shows its editor | All rows mount full editors always; immediately editable but heavier. | |

**User's choice:** Active set inline; others expand-on-tap (Recommended)
**Notes:** Keeps the active-set one-tap fast path while controlling render cost.

---

## Claude's Discretion

- Exact collapsed-summary stat, section header styling, drag-handle placement.
- Whether the pinned Add-exercise button is disabled vs Phase-9-stubbed in this phase.
- `SectionList` vs memoized `ScrollView` of sections (implementation choice), provided auto-scroll / auto-collapse / reduced-motion / lifecycle tests hold.

## Deferred Ideas

- Exercise add/replace/remove/reorder actions → Phase 9 (WORK-20..25, 27); Phase 8 only lays out entry points.
- Per-exercise advanced-timing indicator/config → Phase 10 (WORK-26).
- Superset grouping + per-exercise rest overrides → roadmap backlog.
- Sync-status indicator on Today/Settings → Phases 11–12 (DATA-08/09/10).
