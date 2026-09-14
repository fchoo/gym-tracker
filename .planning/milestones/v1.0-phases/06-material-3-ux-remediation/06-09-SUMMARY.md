---
phase: 06-material-3-ux-remediation
plan: 09
subsystem: release-evidence
tags: [maestro, android-emulator, evidence, material-3, personal-use]
requires:
  - phase: 06-02
    provides: Phase 6 native runner and Wave 0 emulator gesture smoke
  - phase: 06-04
    provides: Calendar/CalendarField swipe-button parity
  - phase: 06-05
    provides: accessible plan-day/exercise reordering
  - phase: 06-06
    provides: Library discovery, Favorite, pull-to-refresh, provenance
  - phase: 06-07
    provides: Progress load/Retry recovery and Progress Search
  - phase: 06-08
    provides: 200% root navigation and distinct Today History/data route
provides:
  - Exact-candidate Phase 6 automated evidence runner and consideration mapping
  - Observation-only Samsung checklist generator (retired as a release gate for personal-use)
affects: [release, personal-apk, milestone-delivery]
actuals:
  tokens: 0
  tasks: 3
  commits: 0
tech-stack:
  added: []
  patterns:
    - Every UI consideration maps to a named automated check plus an optional native backstop.
    - Personal-use delivery replaces the exact-candidate attended/promotion ceremony with the signed personal-APK build.
key-files:
  created: []
  modified:
    - scripts/run-phase6-maestro.mjs
    - scripts/phase6-evidence-scripts.test.mjs
    - scripts/generate-phase6-attended-checklist.mjs
    - maestro/phase6/progress-library.yaml
    - maestro/phase6/calendar-date-reorder.yaml
    - maestro/phase6/navigation-accessibility.yaml
key-decisions:
  - "Phase 6 UX-01..UX-10 are delivered through merged PRs #10-#25 on the app source; the automated consideration/native evidence tooling shipped with them."
  - "For personal-use v1, the exact-candidate attended matrix, owner approval, no-rebuild promotion, and Terminal Seal are retired (PR #29); optional Samsung N4 observation remains non-blocking."
patterns-established:
  - "Phase 6 evidence contracts fail closed on identity/privacy/release-authorization fields even though release authorization is now out of scope."
requirements-completed: [UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09, UX-10]
coverage:
  - id: D1
    description: All 11 Phase 6 UI considerations (C1-C11) have named automated owners in the runner and evidence contract test.
    requirement: UX-01..UX-10
    verification:
      - kind: automated_contract
        ref: "scripts/phase6-evidence-scripts.test.mjs (node --test) — 22 tests pass"
        status: pass
    human_judgment: false
  - id: D2
    description: Merged Phase 6 UX source changes pass the required PR contract suite and ship in the signed personal-use build.
    requirement: UX-01..UX-10
    verification:
      - kind: automated_full
        ref: "PR #10-#25 required checks green; delivered on origin/main"
        status: pass
    human_judgment: false
  - id: D3
    description: Samsung SM-S916B touch/OLED/200%/TalkBack observation.
    requirement: UX-01..UX-10
    verification:
      - kind: manual_procedural
        ref: "Optional owner confidence only; retired as a release gate for personal-use v1"
        status: waived
    human_judgment: true
    rationale: Personal-use delivery does not gate on attended device observation; retained tooling remains available.
duration: n/a
completed: 2026-09-14
status: complete
---

# Phase 06 Plan 09: Material 3 Evidence Closeout (personal-use reconciliation)

**Phase 6 UX remediation is delivered on `main` and shipped in the signed personal-use APK; the exact-candidate attended/promotion ceremony is retired.**

## Context

Phase 6 delivered the whole-app Material 3, accessibility, and Progress-runtime
remediation (UX-01 through UX-10). Plans 06-01 through 06-08 implemented the shared
Material 3 Search/filter-chip/refresh controls, the complete civil-date Calendar and
CalendarField grids with swipe/button parity, continuous accessible plan reordering,
Library discovery/Favorite/provenance composition, Progress load/Retry recovery, and
200%-text root navigation with a distinct Today History-and-data route. Plan 06-09
built the exact-candidate automated evidence runner, the C1-C11 consideration mapping,
and the observation-only Samsung checklist generator.

All Phase 6 UX source changes merged to `main` through PRs #10 through #25, each
passing the six required protected checks (bootstrap, required-suite contract,
typecheck-through-host-SQLite, clean generated Android contract, native SQLite +
Maestro + benchmark, and exact-byte round-trip). A green Phase 6 candidate existed
(`phase6-20260906-9cdecb8`).

## Personal-use reconciliation

This SUMMARY closes Plan 06-09 under the personal-use v1 delivery model:

- The C1-C11 consideration mapping and the N1-N3 emulator backstops remain encoded in
  `scripts/run-phase6-maestro.mjs` and `scripts/phase6-evidence-scripts.test.mjs`; the
  evidence-contract test passes (22 tests).
- The N4 Samsung SM-S916B attended matrix, the owner-approval token, no-rebuild GitHub
  Release promotion, and Terminal Seal are **retired for personal-use** and were removed
  from CI in PR #29. They are tracked as V2-05 for any future public distribution.
- Delivery is the signed APK/AAB built once by `personal-apk.yml`.

## Verification

- `node --test scripts/phase6-evidence-scripts.test.mjs` — 22 tests pass (consideration
  mapping, identity/privacy/screenshot fail-closed contracts).
- Merged Phase 6 UX changes are covered by the required PR contract suite on `main`.
- The signed personal-use APK/AAB is produced by `personal-apk.yml`
  (run `34746276143`, conclusion success) and is the v1 delivery artifact.

## Status

Phase 6 is complete for the personal-use milestone. See `06-VERIFICATION.md` for the
goal-level verdict.
