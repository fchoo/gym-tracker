---
phase: 20
plan: "01"
subsystem: native-acceptance-evidence-contract
tags: [phase-20, v1.2, evidence, manifest, tdd, fail-closed]
dependency_graph:
  requires: [v1.2-prototype-parity-matrix, serial-walk, requirements-registry]
  provides: [canonical-evidence-ledger, immutable-run-manifest-contract]
  affects: [phase-20-native-acceptance]
tech_stack:
  added: [node:test, node:crypto]
  patterns: [strict-source-derivation, exact-key-validation, canonical-identity-binding, pure-manifest-validation]
key_files:
  created:
    - scripts/v12-evidence-contract.mjs
    - scripts/v12-evidence-contract.test.mjs
    - scripts/create-v12-run-manifest.mjs
    - scripts/create-v12-run-manifest.test.mjs
  modified: []
decisions:
  - "The 214 browser fixture entries derive 107 ordered Light/Dark occurrence pairs; repeated names retain separate BW IDs."
  - "Only validator-owned verdicts can change ledger status; producer output is retained as observations."
  - "A live Phase 20 manifest binds all source, prototype, fixture, APK, device, and configuration identity; incomplete identity is reserved for the explicit pre-build schema fixture."
metrics:
  duration: 3m
  completed_date: 2026-10-13
status: complete
actuals:
  tokens: 7287
  tasks: 2
  commits: 5
---

# Phase 20 Plan 01: Native Acceptance Evidence Contract Summary

Implemented a source-derived 172-row/107-occurrence/64-configuration evidence ledger and an immutable, fail-closed Phase 20 run-manifest schema without generating runtime evidence.

## Completed Tasks

1. Derived the canonical Phase 20 ledger from the parity matrix, requirements registry, and serial walk.
   - Cross-checks exact phase counts (17/13/36/23/36/16/18/13), unique ordered inventory/requirement rows, and source order.
   - Preserves all 107 ordered browser occurrences, including repeated state names, and provides all 64 required static configuration IDs.
   - Restricts verdicts to `NOT_RUN`, `PASS`, `FAIL`, `REVIEW_REQUIRED`, `ACCEPTED_EXCEPTION`, and `N_A_REVIEWED`.
   - Keeps producer results as observations; only validator input can assign verdicts.

2. Implemented the pure immutable run/build manifest contract.
   - Derives `phase20-<UTC>-<source-head-12>` run IDs and refuses existing IDs or output collisions.
   - Binds clean full source identity, planning/prototype/fixture hashes, retained and installed APK identity, signature/certificate, hashed device state, and configuration.
   - Enforces exact keys, bounded values, safe relative paths, strict hashes, and no raw device serials or private paths.
   - Allows missing APK/device fields only for an explicit `prebuild_schema_fixture`, never for a live run.

## Tests

- `node --test scripts/v12-evidence-contract.test.mjs` — 7 passed
- `node --test scripts/create-v12-run-manifest.test.mjs scripts/v12-evidence-contract.test.mjs` — 11 passed

## Decisions Made

- The 214-entry source walk is ordered as 107 Light/Dark pairs by offset, preserving all occurrence identity instead of deduplicating names.
- Evidence producers cannot self-author `PASS` or any other verdict; they emit observation records only.
- Live manifests are complete identity records, while the test-only pre-build schema fixture has an explicit separate mode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the source-derived repeated browser-state expectation**
- **Found during:** Task 1 tracer verification
- **Issue:** The initial RED assertion expected three `progress-settings` occurrences, but the canonical 107-state serial walk contains four distinct ordered occurrences.
- **Fix:** Updated the test to require all four occurrences, preserving the actual source order and no-collapse guarantee.
- **Files modified:** `scripts/v12-evidence-contract.test.mjs`
- **Commit:** `647e0cd8`

**2. [Rule 1 - Tracking correctness] Kept VER-01 pending**
- **Found during:** Final state updates
- **Issue:** The generic requirement tracker inferred completion from the plan frontmatter even though this contract plan deliberately creates no native run or recorded verification evidence.
- **Fix:** Restored the VER-01 checkbox and traceability row to Pending; later Phase 20 evidence plans own the actual requirement closure.
- **Files modified:** `.planning/REQUIREMENTS.md`

## Threat Surface Scan

No new network endpoints, authentication paths, file writes, runtime artifacts, or trust-boundary surfaces were introduced. The two implemented source/identity boundaries apply the plan's strict validation mitigations.

## Runtime Evidence Boundary

No build, APK, emulator/device action, Phase 20 run directory, runtime evidence, or evidence acceptance was created by this plan.

## Self-Check: PASSED

- All four declared source/test files exist.
- All five TDD task commits exist: `3ad08c5f`, `97591dff`, `647e0cd8`, `91942ed7`, and `e432cddb`.
- No stub markers were found in the declared Plan 20-01 source/test files.
