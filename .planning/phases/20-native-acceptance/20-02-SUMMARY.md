---
phase: 20-native-acceptance
plan: "02"
subsystem: native-acceptance-contracts
tags: [expo-sqlite, recovery, tim-01, evidence, tdd, privacy]
requires:
  - phase: 20-01
    provides: immutable v1.2 evidence and identity contract
  - phase: 13-19
    provides: source-owned migration, portability, lifecycle, Garmin, and Progress registries
provides:
  - source-derived v1.2 aggregate SQLite contract route
  - fail-closed SQLite and recovery observation producers
  - deferred-only TIM-01 lifecycle fixture flow
affects: [20-08-native-build-freeze, VER-07, VER-08]
tech-stack:
  added: []
  patterns: [ordered-source-case-allowlists, observation-only-shards, identity-and-privacy-rejection]
key-files:
  created:
    - src/testing/contracts/v12Acceptance.contract.ts
    - scripts/v12-sqlite-shard.mjs
    - src/testing/contracts/v12Recovery.contract.ts
    - scripts/v12-recovery-shard.mjs
    - maestro/v1.2/recovery.yaml
  modified:
    - app/__native-contracts.tsx
    - scripts/run-native-sqlite-contracts.mjs
key-decisions:
  - "The schema-27 retained fixture is dispatched only through an explicit v1.2 development-test allowlist."
  - "SQLite and recovery producers emit bounded observations only; they cannot create evidence verdicts."
  - "TIM-01 remains a settled gate input: every recovery cut is recorded, but no producer can reclassify its owner decision."
actuals:
  tokens: 7104
  tasks: 3
  commits: 7
requirements-completed: [VER-07, VER-08]
duration: 4m
completed: 2026-10-14
status: complete
---

# Phase 20 Plan 02: SQLite and Recovery Contracts Summary

Source-derived aggregate SQLite dispatch plus fail-closed, privacy-safe SQLite and TIM-01 recovery observation contracts, ready for the later frozen native-artifact gate.

## Accomplishments

- Added the `v1.2-acceptance` development-test route with the ordered schema-27 mixed migration, portability, and multi-plan-running slice; it derives case inventory from landed source registries and has zero-skip result semantics.
- Added a strict SQLite observation producer covering fresh/schema-27/supported-legacy migration, failure/reopen, backup, restore, merge, no-op replay, rebuild, and immutable history. It requires exact identity/digest shape, rejects false evidence and raw facts, and only writes migration, portability, and history observations.
- Added all eight TIM-01 recovery groups and each lifecycle cut, with a strict recovery shard that rejects missing cuts, stale digest claims, duplicate IDs, ownership leakage, and private payloads. The Maestro source flow is explicitly deferred to Plan 20-08 and was not run.

## Verification

- `npm run test:unit -- --runInBand src/testing/contracts/v12Acceptance.contract.test.ts src/testing/contracts/v12Recovery.contract.test.ts` — passed (2 tests).
- `node --test scripts/v12-sqlite-shard.test.mjs scripts/v12-recovery-shard.test.mjs` — passed (5 tests).
- `npm run typecheck` — passed.
- No native suite, device/emulator action, build, APK, evidence run directory, or final evidence verdict was created.

## Task Commits

1. **Task 1: Wire one schema-27 mixed upgrade case through the aggregate native suite** — `fa4aae02` (RED), `20ba26da` (GREEN)
2. **Task 2: Implement the complete fail-closed SQLite observation shard** — `1fd2e133` (RED), `3dd72822` (GREEN)
3. **Task 3: Implement every offline/process-death and TIM-01 recovery path** — `65d285b5` (RED), `34d08299` (GREEN)

## Decisions Made

- The aggregate native route is limited to `v1.2-acceptance` and only becomes selectable when the matching development-test suite is configured.
- All producer output is bounded to codes, counts, and SHA-256 digests. Raw source facts, rows, payloads, account identifiers, and verdict fields are rejected.
- The temporary worktree `node_modules` symlink was removed after host verification; no dependency tree or lockfile was changed.

## Deviations from Plan

None - plan executed as specified. The temporary source syntax correction was completed before the first GREEN verification and introduced no scope change.

## Threat Surface Scan

No network endpoint, authentication path, runtime artifact, or product behavior was added. The plan's T-20-02-01 through T-20-02-04 mitigations are applied through exact case ordering, digest/identity validation, zero-skip enforcement, and recursive privacy rejection.

## Known Stubs

None.

## Next Phase Readiness

Plan 20-08 can use the aggregate route and observation schemas only after it freezes the single native artifact. This plan intentionally leaves all native and attended evidence `NOT_RUN`.

## Self-Check: PASSED

- Confirmed all five created deliverables and the aggregate route/runner modifications exist.
- Confirmed all six RED/GREEN task commits exist in history.
- Confirmed the disposable `node_modules` symlink was removed before handoff.

