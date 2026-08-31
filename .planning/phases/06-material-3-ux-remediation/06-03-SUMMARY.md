---
phase: 06-material-3-ux-remediation
plan: 03
subsystem: testing
tags: [progress, hermes, sqlite, diagnostics, tdd, privacy]
requires:
  - phase: 05-recovery-distribution-and-release
    provides: Exact production-candidate identity and bounded runtime evidence
  - phase: 04-overall-progress-and-complete-progression
    provides: Source-backed Progress repository and current-baseline projection behavior
provides:
  - Candidate-bound, fail-closed redacted Progress diagnosis
  - Full-current-migration host fixture for the observed Progress runtime capability rejection
  - Explicit storage-safe repair boundary for Plan 06-07
affects: [06-07, ProgressScreen, progressRepository, Hermes compatibility]
actuals:
  tokens: 2670
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns:
    - Candidate diagnostics accept only allowlisted identity and classification fields
    - Host fixtures model missing runtime capabilities while retaining the complete SQLite migration manifest
key-files:
  created:
    - scripts/diagnose-phase6-progress.mjs
    - scripts/phase6-progress-diagnostic.test.mjs
    - .planning/phases/06-material-3-ux-remediation/06-PROGRESS-DIAGNOSIS.md
  modified:
    - tests/sqlite-host/progressRepository.test.ts
key-decisions:
  - The observed Progress failure is a `toSorted` runtime-capability rejection after current freshness, not a SQLite source, migration, freshness, queue, parser, or malformed-row failure.
  - Plan 06-07 alone may choose the minimal production compatibility repair after preserving the full-migration regression fixture.
patterns-established:
  - Diagnostics fail closed on package/SHA mismatch and expose only bounded fields, never raw device or SQLite data.
  - A full migration fixture must prove the same baseline before and after a capability model, rather than substituting mock UI rejection.
requirements-completed: [UX-10]
coverage:
  - id: D1
    description: Candidate-bound Progress diagnostic emits only the confirmed bounded runtime signature and rejects identity/private-field violations
    requirement: UX-10
    verification:
      - kind: unit
        ref: scripts/phase6-progress-diagnostic.test.mjs
        status: pass
    human_judgment: false
  - id: D2
    description: Full-current-migration host SQLite fixture reproduces the Progress TypeError only when the candidate runtime capability is absent and returns a current baseline after restoration
    requirement: UX-10
    verification:
      - kind: integration
        ref: tests/sqlite-host/progressRepository.test.ts#reproduces the candidate runtime rejection from a full-migration current baseline
        status: pass
    human_judgment: false
duration: 10 min
completed: 2026-08-31
status: complete
---

# Phase 06 Plan 03: Progress Runtime Diagnosis Summary

**Candidate-bound diagnosis proving a Hermes `toSorted` capability gap in Progress’s current baseline path, with a privacy-safe host SQLite reproducer.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-31T13:30:24Z
- **Completed:** 2026-08-31T13:40:19Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Captured the exact bounded rejecting branch as `progress_repository_load` / `TypeError` / `runtime_array_to_sorted_unavailable`, after current freshness and before a Progress snapshot could return.
- Ruled out an SQLite migration, schema, query, freshness, source-row, queue, or parser cause by running the authoritative effective-history queries against the candidate’s full-current-schema database.
- Added a complete-migration host fixture that recreates the clean current baseline, models the missing `toSorted` capability, and proves recovery to the factual baseline after restoring the capability.

## Task Commits

1. **Task 1: Capture one candidate-bound redacted Progress failure signature**
   - `77d8b90` (`test`) — RED contract for candidate-bound redacted diagnosis.
   - `b934a1a` (`feat`) — fail-closed diagnostic module and evidence-led repair boundary.
2. **Task 2: Reproduce the diagnosed branch in the complete migration fixture**
   - `9a63cab` (`test`) — full-migration runtime-capability fixture and recovery assertion.

## Files Created/Modified

- `scripts/diagnose-phase6-progress.mjs` — allowlisted candidate identity validation and bounded observed classification.
- `scripts/phase6-progress-diagnostic.test.mjs` — diagnostic contract, mismatch, and privacy-rejection coverage.
- `.planning/phases/06-material-3-ux-remediation/06-PROGRESS-DIAGNOSIS.md` — observed branch, evidence chain, fixture scope, and Plan 06-07 repair boundary.
- `tests/sqlite-host/progressRepository.test.ts` — complete migration fixture for the candidate capability model and baseline recovery.

## Decisions Made

- The candidate’s full-current SQLite database resolves the authoritative effective-history SQL and reaches the factual current baseline; SQLite is not the causal seam.
- The APK bundle references `toSorted`, while its embedded Hermes runtime lacks that capability. Modeling only that missing capability reproduces the bounded `TypeError`.
- No production Progress, runtime, repository, migration, projection, effect, or UI file was changed. Plan 06-07 owns any minimal compatibility repair.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the diagnostic CLI serialization syntax**
- **Found during:** Task 1
- **Issue:** The first diagnostic implementation had an unbalanced template expression, preventing its Node contract from importing.
- **Fix:** Corrected the CLI JSON output expression.
- **Files modified:** `scripts/diagnose-phase6-progress.mjs`
- **Verification:** `node --test scripts/phase6-progress-diagnostic.test.mjs` passed.
- **Committed in:** `b934a1a`

**2. [Rule 3 - Blocking] Made the capability-model fixture valid under strict TypeScript**
- **Found during:** Task 2
- **Issue:** Strict TypeScript rejected `delete Array.prototype.toSorted` because the built-in property is non-optional in its type declaration.
- **Fix:** Used a local optional-property test view solely to model the missing candidate capability and restored the original descriptor in `finally`.
- **Files modified:** `tests/sqlite-host/progressRepository.test.ts`
- **Verification:** focused host fixture, typecheck, lint, boundaries, and diff check passed.
- **Committed in:** `9a63cab`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking test-environment type issue)
**Impact on plan:** Both fixes were limited to the planned diagnostic and fixture files; no production behavior or repair scope was introduced.

## Issues Encountered

- A preliminary hand-written SQL approximation falsely suggested a missing column. The exact repository SQL resolved successfully, so that approximation was discarded rather than recorded.
- Host compilation initially lacked repository dependency resolution outside the worktree. The final evidence uses the actual repository test runner and a temporary candidate copy only; no candidate database data was retained.

## Known Stubs

None. The diagnostic has one confirmed signature rather than placeholder data, and the host fixture uses the actual migration manifest and repository read.

## Threat Review

- T-06-01 is mitigated: the diagnostic accepts exact package/SHA identity and returns only read stage, branch, error class/code, freshness, and recoverability. It rejects device serials, raw rows, messages, paths, JSON, and backup contents.
- T-06-02 is mitigated: no production repair file was selected or changed; the full-migration fixture identifies the compatibility seam before Plan 06-07 may modify behavior.
- No new network endpoint, authentication path, schema, file-access pattern, or trust-boundary surface was introduced.

## Verification

- `node --test scripts/phase6-progress-diagnostic.test.mjs` — passed (3/3).
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressRepository.test.ts` — passed (13/13).
- `npm run typecheck` — passed.
- `npm run lint` — passed (boundary check, 226 files).
- `npm run check:boundaries` — passed (226 files).
- `git diff --check` — passed.
- All three task commits end with exactly one final required TRAE CLI co-author trailer.

## User Setup Required

None.

## Next Phase Readiness

- Plan 06-07 can implement and verify the smallest runtime-compatible repair at the now-proven Progress seam.
- It must retain the safe `unavailable`/`updating` freshness early returns, source-backed baseline semantics, and the new full-migration regression fixture.
- No approval, promotion, publication, tag, or Terminal Seal action was performed.

## Self-Check: PASSED

- Confirmed all four planned diagnostic, documentation, and host-fixture files exist.
- Confirmed task commits `77d8b90`, `b934a1a`, and `9a63cab` exist and each ends with exactly one required TRAE CLI co-author trailer.

---
*Phase: 06-material-3-ux-remediation*
*Plan: 03*
*Completed: 2026-08-31*
