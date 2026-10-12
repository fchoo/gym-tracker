---
phase: 16-calendar-parity
plan: 01
subsystem: ui
status: in_progress
---

# Phase 16 Plan 01: Calendar Transition Foundation Summary

## Approved Owner Contracts

### DEV-01 — adaptive Calendar inset

- **Decision source:** `.planning/v1.2-OWNER-DECISIONS.md` and `v1.2-owner-decisions.json`, recorded 2026-10-07.
- **Selection:** `adaptive-6-to-18dp`.
- **Implementation contract:** Calendar horizontal padding is `min(18, max(0, (safeWidth - 348) / 2))` dp: 6dp at 360dp and 18dp at 390dp, with 2dp cell gaps.
- **Technical status:** Owner approval is complete; native geometry, accessibility, and blended-fill measurements remain Phase 20-only acceptance evidence.

## Task Commits

1. **Task 1: Prove the upstream-to-semantic transition seam with one exact month drag** — `898e670a` (`feat`)
2. **Task 2: Validate and record approved DEV-01** — pending this documentation commit.
