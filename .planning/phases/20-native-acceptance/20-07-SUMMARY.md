---
phase: 20-native-acceptance
plan: "07"
subsystem: testing
tags: [node, native-acceptance, samsung, evidence, rollback, readiness]
requires:
  - phase: 20-06
    provides: Final-validator authority and v1.2 evidence contracts
provides:
  - Samsung-only observation contract with exact identity, privacy, and authority boundaries
  - Read-only readiness and rollback handoff preserving all non-PASS evidence
  - Phase 20 host-only package entrypoints
affects: [20-08, native-acceptance, release-readiness]
actuals:
  tokens: 7714
  tasks: 2
  commits: 5
tech-stack:
  added: []
  patterns: [canonical observation contracts, exact-key handoff validation, fail-closed readiness]
key-files:
  created:
    - scripts/generate-v12-attended-checklist.mjs
    - scripts/generate-v12-attended-checklist.test.mjs
    - scripts/create-v12-readiness-handoff.mjs
    - scripts/create-v12-readiness-handoff.test.mjs
  modified:
    - package.json
key-decisions:
  - "Samsung observations are separately identity-bound, observation-only, and reject N4/release-authority inheritance."
  - "Readiness preserves all non-PASS verdicts and permits CONDITIONALLY_READY only with reviewed, fully evidenced accepted exceptions."
  - "Rollback requires a compatible archive restore or forward fix after a newer schema commit; old APK/new-schema compatibility is never promised."
requirements-completed: [VER-12, VER-13]
coverage:
  - id: D1
    description: Samsung attended-observation contract rejects identity, privacy, N4-inheritance, and authority violations.
    requirement: VER-12
    verification:
      - kind: unit
        ref: node --test scripts/generate-v12-attended-checklist.test.mjs
        status: pass
    human_judgment: false
  - id: D2
    description: Readiness and rollback handoff preserves verdicts and prevents unauthorized release meaning.
    requirement: VER-13
    verification:
      - kind: unit
        ref: node --test scripts/create-v12-readiness-handoff.test.mjs
        status: pass
    human_judgment: false
duration: 6m
completed: 2026-10-14
status: complete
---

# Phase 20 Plan 07: Attended Observation and Readiness Contracts Summary

**Fail-closed Samsung observation, conditional-readiness, and schema-safe rollback contracts that cannot grant release authority.**

## Performance

- **Duration:** 6m
- **Started:** 2026-10-13T22:25:46Z
- **Completed:** 2026-10-13T22:31:10Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Added a seven-row Samsung-only observation checklist covering legibility, one-handed dock, Calendar feel, keyboard/D-pad/3dp focus, F200, themes, and device-owned sound/haptics.
- Bound completed observations to exact source, APK, signature, installed-byte, hashed-device, and configuration identities with a unique PNG hash per row.
- Added a read-only readiness handoff that preserves every verdict, gate, and accepted-exception record and never authorizes release.
- Registered the five required Phase 20 commands without adding dependencies or executing native, device, or release work.

## Task Commits

1. **Task 1: Implement and adversarially validate the fresh Samsung observation contract**
   - `bd44e8ba` `test(20-07): define Samsung observation contract`
   - `023a8f5c` `feat(20-07): add Samsung observation contract`
   - `c2edb62e` `fix(20-07): expose attended validation modes`
2. **Task 2: Implement conditional readiness/rollback generation and register every command**
   - `649963ef` `test(20-07): define readiness and rollback contract`
   - `fa8e351e` `feat(20-07): add readiness rollback handoff`

## Files Created/Modified

- `scripts/generate-v12-attended-checklist.mjs` — prepares, records, and validates observation-only Samsung evidence without device connection logic.
- `scripts/generate-v12-attended-checklist.test.mjs` — adversarial identity, duplicate PNG, N4, authority, and privacy coverage.
- `scripts/create-v12-readiness-handoff.mjs` — validates verdict preservation, accepted exceptions, policy-bound readiness, and safe rollback boundaries.
- `scripts/create-v12-readiness-handoff.test.mjs` — negative coverage for gates, exceptions, rollback, authorization, and command registration.
- `package.json` — host-only v1.2 evidence, Maestro, interaction benchmark, attended verification, and final evidence verification entrypoints.

## Decisions Made

- A v1.2 attended observation can state only `passed` or `failed`; it cannot reuse N4 status or attach release/promotion/approval meaning.
- `CONDITIONALLY_READY` is derived only when reviewed policy is present and accepted exceptions are the only non-PASS rows.
- A readiness handoff is deliberately read-only: `release_authorized` is always false, and no generated release command is accepted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added the attended-contract CLI modes**
- **Found during:** Task 2 command registration
- **Issue:** The newly registered `verify:attended:v12` entrypoint required a fail-closed `verify` mode, while the initial module exposed only library helpers.
- **Fix:** Added strict `prepare`, `record`, and `verify` CLI parsing with create-new output semantics; no mode was executed.
- **Files modified:** `scripts/generate-v12-attended-checklist.mjs`
- **Verification:** `node --test scripts/create-v12-readiness-handoff.test.mjs scripts/generate-v12-attended-checklist.test.mjs scripts/v12-evidence-scripts.test.mjs`
- **Committed in:** `c2edb62e`

**Total deviations:** 1 auto-fixed (Rule 2)

## Issues Encountered

- The first implementation patch targeted an older package-script formatting shape and was rejected without changing files. It was retargeted to the repository's comma-leading script format.

## User Setup Required

None — this plan intentionally does not require device connection, credentials, native builds, or release authorization.

## Next Phase Readiness

Plan 20-08 is next. It may consume these contracts for its host/freeze/build gate; it remains responsible for precondition checks and must not treat this host-only plan as final evidence, device observation, or release authorization.

## Verification

- `node --test scripts/create-v12-readiness-handoff.test.mjs scripts/generate-v12-attended-checklist.test.mjs scripts/v12-evidence-scripts.test.mjs` — passed (33 tests).
- `node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8')); console.log('package.json: valid')"` — passed.
- Stub scan over all five plan-owned files — no known stubs found.

## Self-Check: PASSED

- All five plan-owned files and the summary exist.
- All five implementation commits exist in git history.

