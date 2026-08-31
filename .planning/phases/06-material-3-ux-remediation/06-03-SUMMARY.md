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
  - Full-current-migration host fixture for Progress runtime-compatibility behavior
  - Integrity boundary separating external candidate evidence from repository-executable causal proof
  - Explicit storage-safe repair boundary retained by Plan 06-07
affects: [06-07, ProgressScreen, progressRepository, Hermes compatibility]
actuals:
  tokens: 2670
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns:
    - Host fixtures model missing runtime capabilities while retaining the complete SQLite migration manifest
    - Candidate observations require immutable identity plus independently captured measurements
key-files:
  created:
    - .planning/phases/06-material-3-ux-remediation/06-PROGRESS-DIAGNOSIS.md
  modified:
    - tests/sqlite-host/progressRepository.test.ts
key-decisions:
  - The removed CLI could not establish an observed candidate failure because callers supplied its identity inputs and it emitted a fixed classification.
  - The full-migration fixture remains the repository-executable causal proof; future candidate claims require immutable identity and independent redacted measurement capture.
patterns-established:
  - A full migration fixture must prove the same baseline before and after a capability model, rather than substituting mock UI rejection.
  - Repository scripts must not convert caller-provided identity values into claims of external measurement.
requirements-completed: [UX-10]
coverage:
  - id: D1
    description: Full-current-migration host SQLite fixture proves the factual Progress baseline remains available when the runtime lacks toSorted and when normal capabilities are restored
    requirement: UX-10
    verification:
      - kind: integration
        ref: tests/sqlite-host/progressRepository.test.ts#returns the factual current baseline when the candidate lacks toSorted
        status: pass
    human_judgment: false
duration: 10 min
completed: 2026-08-31
status: complete
---

# Phase 06 Plan 03: Progress Compatibility Evidence Summary

**Independent full-migration SQLite evidence for Progress runtime compatibility, with self-attesting candidate-diagnostic tooling removed.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-31T13:30:24Z
- **Completed:** 2026-08-31T13:40:19Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Removed the executable that accepted caller-supplied hashes and emitted a fixed Progress classification, because it could fabricate evidence rather than observe an immutable candidate.
- Retained the complete-migration host fixture as the repository-executable causal proof that Progress returns the factual current baseline when `toSorted` is absent and after normal capabilities are restored.
- Recorded the evidence boundary: future candidate observations require an immutable manifest, a recomputed installed APK hash, and an independently captured redacted measurement.

## Task Commits

1. **Task 1: Remove the self-attesting Progress diagnostic path**
   - Pre-landing integrity correction — deletes the synthetic CLI and its synthetic test.
2. **Task 2: Retain the independently executable full-migration fixture**
   - `9a63cab` (`test`) — original host compatibility fixture; superseded repair coverage is in Plan 06-07.

## Files Created/Modified

- `.planning/phases/06-material-3-ux-remediation/06-PROGRESS-DIAGNOSIS.md` — integrity boundary, independently executable evidence scope, and Plan 06-07 repair boundary.
- `tests/sqlite-host/progressRepository.test.ts` — complete migration fixture for missing-capability baseline behavior and recovery.
- `scripts/diagnose-phase6-progress.mjs` — removed because it could not independently measure a candidate.
- `scripts/phase6-progress-diagnostic.test.mjs` — removed with the synthetic CLI contract.

## Decisions Made

- The removed diagnostic command cannot support a candidate observation claim, even when its caller supplies matching hashes.
- The full-migration host fixture independently demonstrates the repository’s compatibility behavior without exposing or asserting candidate-device data.
- No production Progress, runtime, repository, migration, projection, effect, or UI file changed in this integrity correction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made the capability-model fixture valid under strict TypeScript**
- **Found during:** Task 2
- **Issue:** Strict TypeScript rejected `delete Array.prototype.toSorted` because the built-in property is non-optional in its type declaration.
- **Fix:** Used a local optional-property test view solely to model the missing candidate capability and restored the original descriptor in `finally`.
- **Files modified:** `tests/sqlite-host/progressRepository.test.ts`
- **Verification:** focused host fixture, typecheck, lint, boundaries, and diff check passed.
- **Committed in:** `9a63cab`

---

**Total deviations:** 1 retained historical blocking test-environment type issue.
**Impact on plan:** The synthetic diagnostic path is removed; the independently executable fixture remains the sole repository proof.

## Issues Encountered

- The removed diagnostic CLI accepted caller-supplied identity inputs and emitted a fixed classification. It was an integrity risk, not independent evidence.
- The host fixture does not observe a device or APK; it proves only the repository behavior it actually executes.

## Known Stubs

None. The remaining fixture runs the actual migration manifest and repository read; no placeholder candidate observation remains.

## Threat Review

- T-06-01 is mitigated: no repository command now accepts caller-supplied identity and turns it into a candidate-observation claim. Future candidate evidence must be independently captured and redacted.
- T-06-02 is mitigated: the full-migration fixture remains the repository-side causal proof while Plan 06-07 retains its bounded production repair.
- No new network endpoint, authentication path, schema, file-access pattern, or trust-boundary surface was introduced.

## Verification

- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressRepository.test.ts` — passed (13/13).
- `npm run test:components -- --runInBand src/ui/components/M3FilterChip.test.tsx` — passed (6/6) as part of the combined pre-landing review gate.
- `npm run typecheck` and `git diff --check` — passed after the integrity correction.

## User Setup Required

None.

## Next Phase Readiness

- Plan 06-07 has completed the bounded repository repair and retains the full-migration regression fixture.
- Any future candidate observation must be recorded outside this repository through immutable candidate/install identity and independently captured redacted measurement.
- No approval, promotion, publication, tag, or Terminal Seal action was performed.

## Self-Check: PASSED

- Confirmed the two synthetic diagnostic files are removed.
- Confirmed the full-migration host fixture remains in `tests/sqlite-host/progressRepository.test.ts`.

---
*Phase: 06-material-3-ux-remediation*
*Plan: 03*
*Completed: 2026-08-31*
