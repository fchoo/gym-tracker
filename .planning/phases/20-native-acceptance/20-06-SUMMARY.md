---
phase: 20-native-acceptance
plan: "06"
subsystem: native-evidence-authority
tags: [phase-20, native-evidence, maestro, manifest, validator, tdd, privacy]
dependency_graph:
  requires:
    - phase: 20-01
      provides: Immutable v1.2 run identity and evidence contract
    - phase: 20-02
      provides: SQLite and recovery observation-only shards
    - phase: 20-03
      provides: Garmin and Calendar observation contracts
    - phase: 20-04
      provides: Visual and accessibility source-owned evidence inputs
    - phase: 20-05
      provides: Performance observation-only shard
  provides:
    - Generic immutable v1.2 shard runner with restoration and identity binding
    - Backward-compatible acceptance build identity manifest extension
    - Sole 172-row final validator and explicit-only canonical evidence seal
    - Read-only parity ledger renderer
  affects: [20-07, 20-08, 20-11, 20-12, native-acceptance]
tech-stack:
  added: []
  patterns: [argument-array-runner, bounded-immutable-artifacts, rehash-before-verdict, separate-accepted-exceptions, explicit-final-mode]
key_files:
  created:
    - scripts/generate-v12-parity-report.mjs
  modified:
    - scripts/run-v12-maestro.mjs
    - scripts/verify-v12-native-evidence.mjs
    - scripts/v12-evidence-scripts.test.mjs
    - scripts/build-current-native-test-apk.sh
decisions:
  - "Observation producers cannot emit verdict, readiness, seal, or final-evidence authority; the sole validator derives every ledger verdict."
  - "The generic runner binds the live manifest's source, retained/installed APK, certificate, device, settings, and configuration identity before it writes one immutable shard."
  - "ACCEPTED_EXCEPTION is counted independently from PASS and can produce CONDITIONALLY_READY only with an explicit reviewed policy; release authorization remains false."
metrics:
  duration: "7m"
  completed: "2026-10-14"
status: complete
actuals:
  tokens: 8464
  tasks: 2
  commits: 5
---

# Phase 20 Plan 06: Generic Evidence Authority Summary

Implemented the generic immutable v1.2 shard runner, compatibility-preserving build identity branch, and sole 172-row final-evidence validator without collecting native evidence or invoking final mode.

## Accomplishments

- Added `--run --shard` execution for the generic runner. It validates the live run manifest and exact source/APK/certificate/device/settings/configuration identity, snapshots flow/source bytes before and after collection, always restores settings, rejects producer verdict authority, and publishes one bounded immutable shard path.
- Extended only the `v1.2-acceptance` branch of the current native build script with a versioned identity block for retained/installed APK equality, alignment/signature/certificate proof, and hashed device settings/restoration/configuration state. Historical suite manifest shapes remain unchanged.
- Added final-ledger authority that re-hashes every supplied safe-contained artifact before deriving the exact 172 requirement rows. It keeps all six verdicts distinct, validates exception metadata and reviewed policy, fails closed on stale identity, invalid schema/path/result/privacy/producer authority, and can write `ui-state-matrix.json` plus `final-evidence.json` only in explicit `final` mode.
- Added the read-only parity report renderer; it consumes an already-derived ledger and cannot collect observations, derive verdicts, seal evidence, or authorize release.

## TDD Gate Compliance

- Task 1 RED: `a04fedc5` — generic runner and versioned build-manifest specification failed before exports existed.
- Task 1 GREEN: `834ca083` — generic runner and v1.2-only build identity extension passed.
- Task 2 RED: `bf4b3fa5` — final-ledger and explicit-final-mode specification failed because the renderer did not exist.
- Task 2 GREEN: `2a0a3b99` — sole final validator and read-only report renderer passed.
- Rule 2 completion fix: `0c95a18c` — added the production immutable shard publisher and direct no-device coverage.

## Verification

- PASS — `node --test scripts/v12-evidence-scripts.test.mjs` (24 tests): legacy Calendar coverage and new generic runner, manifest, final-ledger, adversarial identity/path/schema/result/privacy/verdict/exception/readiness, and explicit-final-mode coverage.
- PASS — `sh -n scripts/build-current-native-test-apk.sh`.
- PASS — `git diff --check`.

No APK build or installation, Maestro invocation, native/device run, final seal invocation, release, deployment, or physical-device action occurred.

## Files Created/Modified

- `scripts/run-v12-maestro.mjs` — generic flow registry, identity-bound shard execution, restoration gate, verdict-authority rejection, and exclusive immutable JSON publishing alongside the retained Calendar runner.
- `scripts/build-current-native-test-apk.sh` — v1.2-only signature/certificate/settings identity extension.
- `scripts/verify-v12-native-evidence.mjs` — sole final ledger resolver, canonical artifact re-hash, privacy/path/schema gates, reviewed exception policy, and explicit final seal.
- `scripts/generate-v12-parity-report.mjs` — read-only ledger report renderer.
- `scripts/v12-evidence-scripts.test.mjs` — no-device TDD and adversarial validation coverage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added the runner's production immutable publisher**
- **Found during:** Task 20-06-02 completion review.
- **Issue:** The initial generic runner only wrote a shard when its test dependency supplied a writer, so its real CLI path could not publish the canonical shard.
- **Fix:** Added a bounded, exclusive JSON publisher for the run-scoped shard path and covered it with a temporary no-device filesystem fixture.
- **Files modified:** `scripts/run-v12-maestro.mjs`, `scripts/v12-evidence-scripts.test.mjs`.
- **Verification:** Focused evidence suite passes all 24 tests.
- **Commit:** `0c95a18c`.

**Total deviations:** 1 Rule 2 correction. The plan's runner output contract is now usable without test-only dependency injection.

## Known Stubs

None. Final sealing remains deliberately explicit and uninvoked, which is an authority boundary required by this plan rather than a missing implementation.

## Threat Surface Scan

No unplanned network endpoint, authentication path, product schema, or runtime execution surface was introduced. The planned file-output trust boundary is fail-closed with safe relative artifact paths, no symlinks through supplied paths, content hashing before verdict derivation, forbidden private-field scanning, and exclusive output publication.

## Next Phase Readiness

Later Phase 20 execution plans can supply identity-bound observation shards to this concern. Only the final owner may call explicit final mode after every required artifact is present and validated; this plan intentionally did not create a run, collect evidence, or perform that call.

## Self-Check: PASSED

- Confirmed all five plan-owned source/test files exist in this worktree.
- Confirmed task commits `a04fedc5`, `834ca083`, `bf4b3fa5`, `2a0a3b99`, and `0c95a18c` are reachable in Git history.
