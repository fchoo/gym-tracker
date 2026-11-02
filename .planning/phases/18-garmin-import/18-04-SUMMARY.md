---
phase: 18-garmin-import
plan: 04
subsystem: garmin-normalization
tags: [garmin, canonical-json, sha256, provenance, fidelity, tdd]
requires:
  - phase: 13-multi-plan-running-foundation
    provides: GarminSourceEnvelope and shared prepareGarminImport digest boundary
  - phase: 18-03
    provides: Guarded Garmin host proof contracts with native evidence deferred to Phase 20
provides:
  - Bounded deterministic plain-JSON canonicalization with component and semantic SHA-256 identities
  - Reviewed Garmin summary, lap, detail-sample, and route normalization into GarminSourceEnvelope
  - Explicit source-summary/source-lap/sampled fidelity and exact-effort eligibility
  - Focused 100% integrity coverage gate for the two normalization modules
affects: [18-05, 18-07, 18-08, 19-progress, garmin-import]
actuals:
  tokens: 13717
  tasks: 2
  commits: 5
tech-stack:
  added: []
  patterns: [allowlist projection before hashing, descriptor-keyed positional samples, injected digest seam, focused integrity coverage]
key-files:
  created:
    - src/platform/garmin/canonicalGarminPayload.ts
    - src/platform/garmin/canonicalGarminPayload.test.ts
    - src/platform/garmin/normalizeGarminActivity.ts
    - src/platform/garmin/normalizeGarminActivity.test.ts
    - tests/integration/garmin-envelope-import.test.ts
  modified:
    - scripts/run-coverage-gate.mjs
key-decisions:
  - "Raw component hashes cover only reviewed allowlisted projections, so operational fetch metadata cannot alter source or semantic identity."
  - "Exact efforts require matching source summary or source lap distance plus a present source time basis; sampled evidence always remains ineligible."
  - "Plan 18-04 verification uses the owner-required focused integrity gate; the comprehensive repository matrix remains Phase 20-only."
patterns-established:
  - "Provider JSON is validated as bounded plain data before any reviewed field is projected or hashed."
  - "Descriptor key/index metadata selects detail channels; positional values without reviewed descriptors fail closed."
requirements-completed: [GAR-08, GAR-09, GAR-10, GAR-11, GAR-12]
coverage:
  - id: D18-04-CANONICAL
    description: Deterministic bounded canonical JSON and versioned component/semantic identities
    requirement: GAR-08
    verification:
      - kind: unit
        ref: src/platform/garmin/canonicalGarminPayload.test.ts
        status: pass
      - kind: other
        ref: npm run test:coverage -- --runInBand --focus-integrity=src/platform/garmin/canonicalGarminPayload.ts,src/platform/garmin/normalizeGarminActivity.ts --focus-project=unit src/platform/garmin/canonicalGarminPayload.test.ts src/platform/garmin/normalizeGarminActivity.test.ts
        status: pass
    human_judgment: false
  - id: D18-04-NORMALIZATION
    description: Truthful duration, missing-channel, lap, sample, route, and effort-fidelity normalization
    requirement: GAR-09
    verification:
      - kind: unit
        ref: src/platform/garmin/normalizeGarminActivity.test.ts
        status: pass
      - kind: other
        ref: npm run typecheck -- --pretty false
        status: pass
      - kind: other
        ref: npm run check:boundaries
        status: pass
    human_judgment: false
  - id: D18-04-SHARED-IMPORT
    description: One normalized account activity crosses the shared Phase 13 prepareGarminImport boundary
    requirement: GAR-08
    verification:
      - kind: integration
        ref: tests/integration/garmin-envelope-import.test.ts
        status: pass
    human_judgment: false
duration: 18m
completed: 2026-10-11
status: complete
---

# Phase 18 Plan 04: Canonical Garmin Payload Summary

**Bounded deterministic Garmin JSON now becomes a fidelity-aware shared source envelope with versioned SHA-256 identity and no provider-specific persistence.**

## Performance

- **Duration:** 18m
- **Started:** 2026-10-11T07:58:10Z
- **Completed:** 2026-10-11T08:16:10Z
- **Tasks:** 2
- **Files modified:** 6
- **Commits:** 4 TDD commits plus this metadata commit

## Accomplishments

- Added strict canonical plain-JSON validation with binary code-unit key ordering, preserved arrays, finite safe numbers, and explicit nesting/node/key/string/array/byte bounds.
- Normalized reviewed Running summary, source-lap, descriptor-selected sample, and outdoor-route facts while preserving elapsed, timer, moving, missing-versus-zero, treadmill, and sample-fidelity semantics.
- Proved the exact shared `prepareGarminImport` handoff and registered both modules under a focused integrity gate at 100% statements, branches, functions, and lines.

## Task Commits

1. **18-04-01 RED — canonical normalization tracer:** `10facea2`
2. **18-04-01 GREEN — deterministic envelope implementation:** `553dc7b6`
3. **18-04-02 RED — integrity and fidelity matrices:** `c6a8c291`
4. **18-04-02 GREEN — semantic gates and focused coverage:** `0e0097f6`

## Files Created/Modified

- `src/platform/garmin/canonicalGarminPayload.ts` — bounded canonical JSON and injected SHA-256 seam.
- `src/platform/garmin/canonicalGarminPayload.test.ts` — deterministic ordering, unsafe-shape, and exact boundary matrices.
- `src/platform/garmin/normalizeGarminActivity.ts` — allowlist projection into the exact shared Garmin source envelope.
- `src/platform/garmin/normalizeGarminActivity.test.ts` — duration, fidelity, descriptors, route, laps, missing-channel, and exact-effort matrices.
- `tests/integration/garmin-envelope-import.test.ts` — one envelope-to-`prepareGarminImport` tracer.
- `scripts/run-coverage-gate.mjs` — registered integrity files plus explicit focused project/file selection.

## Decisions Made

- Operational and unreviewed response fields are excluded before raw component hashing; component changes in reviewed data remain visible while fetch-time/key-order changes do not alter identity.
- Detail samples are interpreted only through `metricDescriptors` key/index pairs. Undescribed positional samples are rejected, not guessed.
- Sample-derived distance remains `sampled` and cannot support an exact effort. Matching source summary or source-lap evidence also requires a source time basis.
- The shared SQLite/import boundary remains authoritative. This plan added no provider-specific table, repository, command, or fallback transport.

## Verification

- Focused canonical/normalization unit tests — 60 passed.
- `tests/integration/garmin-envelope-import.test.ts` — 1 passed.
- Focused integrity coverage — 100% statements, branches, functions, and lines for both new modules.
- TypeScript compilation — passed.
- Import boundary check — passed across 380 files.

No full repository/global coverage or test matrix, APK/AAB build, adb/device action, live Garmin account call, native evidence run, visual/accessibility/performance suite, publication, deployment, PR, or push was performed.

## Deviations from Plan

None - the plan was executed exactly within the owner-authorized Plan 18-04 scope. The generic global coverage command was replaced by the explicitly required focused integrity invocation and still proved exact 100% coverage for both new modules.

## Issues Encountered

- The first focused coverage pass exposed uncovered validation branches. The matrices were completed and unreachable branches were simplified before the final exact 100% gate.
- TypeScript exact-optional-property checks required an explicit optional-duration helper contract; the focused type check passed after correction.

## Authentication Gates

None. No Garmin credentials, MFA, account access, or external provider call was requested or performed.

## Known Stubs

None.

## Threat Flags

None. The only new trust surface is the provider-JSON canonicalization boundary already registered by T-18-04-01 through T-18-04-03; bounds, hashes, allowlists, and fidelity gates are covered by focused tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 18-05 can consume deterministic envelopes and the explicit exact-effort gate while keeping the shared import path authoritative.
- Native/account/device evidence remains deferred to the single Phase 20 checkpoint exactly as established by Plan 18-03.
- Dirty Phase 14 evidence files and untracked `14-VERIFICATION.md` remain untouched and unstaged.

## Self-Check: PASSED

Verified all six declared plan files and this summary exist, all four TDD commits are reachable with the required co-author trailer, and all three coverage deliverables classify as automatically proven by passing evidence.

---
*Phase: 18-garmin-import*
*Completed: 2026-10-11*
