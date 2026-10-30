---
phase: 12-automatic-google-drive-sync
plan: 08
subsystem: recovery-validation
tags: [manifest, snapshot, sha256, recovery, future-schema]
dependency_graph:
  requires:
    - phase: 12-07
      provides: policy-aware production backup runtime
  provides:
    - exact canonical snapshot envelope validation
    - bounded unambiguous recovery lineage selection
    - latest, previous, and update-required runtime prompts
  affects: [12-09-deletion, recovery-ui]
tech-stack:
  added: []
  patterns:
    - complete-byte descriptor validation precedes logical graph parsing
    - future schema is a typed non-mutating result and never falls back
key-files:
  created: []
  modified:
    - src/domains/backup/automaticBackupContracts.ts
    - src/domains/backup/automaticBackupCoordinator.ts
    - src/bootstrap/productionAutomaticBackupRuntime.ts
key-decisions:
  - "Snapshot recovery requires canonical bytes, exact keys, byte length, object hash, payload hash, environment, package, namespace, epoch, generation, and schema checks."
  - "Recovery scans admit at most eight candidates and exactly one owner/writer lineage, ordered by verified generation rather than Drive time."
requirements-completed: [DATA-10]
actuals:
  tokens: 10573
  tasks: 3
  commits: 7
coverage:
  - id: D1
    description: Missing or corrupt manifests are reconstructed only from one bounded verified lineage.
    requirement: DATA-10
    verification:
      - kind: unit
        ref: src/domains/backup/automaticBackupCoordinator.test.ts#reconstructs a missing manifest only from one verified bounded lineage
        status: pass
    human_judgment: false
  - id: D2
    description: Snapshot bytes pass exact descriptor, envelope, digest, schema, and environment validation.
    requirement: DATA-10
    verification:
      - kind: unit
        ref: src/domains/backup/automaticBackupContracts.test.ts#validates exact canonical snapshot bytes against the complete descriptor
        status: pass
    human_judgment: false
  - id: D3
    description: Production publishes explicit latest, previous, and update-required recovery prompts.
    requirement: DATA-10
    verification:
      - kind: unit
        ref: src/domains/backup/automaticBackupCoordinator.test.ts#publishes future and previous recovery prompts without unsafe fallback
        status: pass
      - kind: unit
        ref: src/domains/backup/automaticBackupPresentation.test.ts#projects future schema recovery into a safe check-again state without provider details
        status: pass
    human_judgment: false
metrics:
  duration: "48m"
  completed_date: 2026-09-30
  tasks_completed: 3
  files_changed: 5
status: complete
---

# Phase 12 Plan 08: Bounded Recovery Discovery Summary

Canonical descriptor-bound snapshot validation, bounded lineage reconstruction, and explicit previous/future-schema recovery prompts now fail closed before local or cloud mutation.

## Delivered

- Added strict snapshot envelope parsing with exact outer/header keys, canonical-byte enforcement, complete object hash/length checks, inner digest verification, and typed future-schema classification.
- Added bounded recovery lineage selection that rejects empty, oversized, tied, cross-owner, and cross-writer candidate sets.
- Wired missing and corrupt manifest reconstruction through conditional create/update operations.
- Published owner-safe latest, previous, and update-required prompts from the production runtime.

## Verification

- Focused contracts, coordinator, production composition, and presentation suites: 52/52 passed.
- Focused integrity coverage: 100% statements, branches, functions, and lines for changed contracts/coordinator modules.
- `npm run typecheck` and `npm run lint`: passed.

## Task Commits

1. **Task 1: Recover a verified lineage** - `d4aa26e` (RED), `ade1eec` (selector), `6fb90bc` (RED), `53c19d1` and `81f1703` (production reconstruction)
2. **Task 2: Enforce descriptor and exact schema validation** - `a3568ce` (RED), `82e0861` (GREEN), `81f1703` (coverage)
3. **Task 3: Publish previous/future prompts** - `81f1703`

## Deviations from Plan

None - the recovery scan and prompt behavior followed the approved bounded fail-closed design.

## Known Stubs

None.

## Self-Check: PASSED

- Confirmed all Plan 12-08 commits and five modified files exist.
- Confirmed focused integrity coverage is exactly 100%.
- Confirmed future-schema paths never parse the payload as current data or select an older fallback.

---
*Phase: 12-automatic-google-drive-sync*
*Completed: 2026-09-30*
