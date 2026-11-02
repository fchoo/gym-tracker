---
phase: 11-portable-history-merge-restore
plan: 02
subsystem: portability, sqlite, conflict-engine, encrypted-backup, merge
tags: [portable-merge, conflict-engine, atomic-merge, expo-sqlite, coverage-gate]

requires:
  - phase: 11-portable-history-merge-restore
    plan: 01
    provides: schema-22 portable identities, GTBK v2, authenticated session merge tracer, and D-02/D-04 boundaries
provides:
  - complete D-01 merge planner for sessions/history, settings, custom exercises, and owned plans
  - deterministic physical-ID remapping for colliding archive roots and child graphs
  - full-plan secure preflight token bound to the exact computed plan
  - one private-writer transaction for settings, custom exercises, sessions, and owned plans
  - strict 100% integrity-critical coverage for all registered modules
  - host and manifest-bound Expo SQLite proof for twelve full-plan portable-merge cases
affects: [11-03-data-recovery-ui, 11-04-portability-verification, phase-12-sync]

actuals:
  tasks: 3
  commits: 40+

tech-stack:
  added: []
  patterns:
    - Build one deterministic full merge plan before writing; secure commit consumes the one-time token and writes that exact plan.
    - Validate FK-closed aggregate graphs before writer access, then recheck live local facts and fingerprint inside the transaction.
    - Treat SQLite source facts as authoritative and rebuild projections/search/recommendations as derivatives after source success.

key-files:
  created: []
  modified:
    - src/domains/portability/mergePlan.ts
    - src/domains/portability/mergePlan.test.ts
    - src/domains/portability/mergeCommands.ts
    - src/domains/portability/mergeCommands.test.ts
    - src/platform/sqlite/repositories/logicalMergeRepository.ts
    - src/testing/contracts/portableMerge.contract.ts
    - src/testing/contracts/portableMerge.contract.test.ts
    - tests/sqlite-host/logicalMergeRepository.test.ts
    - tests/integration/portable-merge.test.ts

key-decisions:
  - "D-01 is implemented as fixed per-class policy: sessions/history newest-wins, settings local-wins, custom exercises and owned plans identity-dedup with keep-both for distinct identities."
  - "D-02 remains the only duplicate boundary. Names, content, timestamps, and physical IDs never decide custom exercise or owned-plan dedup."
  - "D-04 remains one precomputed plan plus one private transaction; every injected write, verification, commit, stale-preview, and unmappable-graph failure preserves canonical source state."

patterns-established:
  - "Use source-derived contract case lists for native portable-merge evidence so stale APKs fail closed on case-count drift."
  - "Expose only read-only validation seams for coverage; no test seam obtains SqliteKernel or writer authority."
  - "Device proof must bind source digest, retained APK hash, installed APK hash, manifest, and contract case IDs."

requirements-completed: [DATA-08, DATA-09]

coverage:
  - id: D1
    description: "Complete per-class merge policy is implemented and proven for sessions/history, settings, custom exercises, and owned plans."
    requirement: DATA-08
    verification:
      - kind: unit
        ref: src/domains/portability/mergePlan.test.ts
        status: pass
      - kind: sqlite-host
        ref: tests/sqlite-host/logicalMergeRepository.test.ts
        status: pass
      - kind: e2e
        ref: artifacts/native/phase11/result.json portable-merge 12/12
        status: pass
    human_judgment: false
  - id: D2
    description: "Stable owner-scoped identities drive dedup and deterministic physical-ID remapping, including same-name keep-both and same-identity remap."
    requirement: DATA-09
    verification:
      - kind: unit
        ref: src/testing/contracts/portableMerge.contract.test.ts
        status: pass
      - kind: e2e
        ref: artifacts/native/phase11/result.json portable-merge same-name and same-identity cases
        status: pass
    human_judgment: false
  - id: D3
    description: "Merge remains fail-closed: stale preview, unmappable graph, insert, replace, verification, and commit rollback preserve canonical authoritative state."
    requirement: DATA-08
    verification:
      - kind: sqlite-host
        ref: tests/sqlite-host/logicalMergeRepository.test.ts
        status: pass
      - kind: e2e
        ref: artifacts/native/phase11/result.json portable-merge rollback cases
        status: pass
    human_judgment: false
  - id: D4
    description: "Integrity-critical coverage gate enforces 100% statements, branches, functions, and lines for all registered modules."
    requirement: DATA-08
    verification:
      - kind: other
        ref: npm run test:coverage -- --runInBand
        status: pass
    human_judgment: false

duration: multi-session
completed: 2026-09-21
status: complete
---

# Phase 11 Plan 02: Conflict Engine Summary

**The portable merge engine now reconciles the full locked D-01 class matrix below the UI, with deterministic planning, one atomic writer transaction, strict integrity coverage, and fresh Expo SQLite proof.**

## Performance

- **Duration:** Multi-session execution
- **Completed:** 2026-09-21
- **Tasks:** 3 implementation tasks plus coverage and device-proof closure
- **Files modified:** Portability planner/commands, logical merge repository, host/integration/shared contracts, native runner route, coverage gate registration, and planning state

## Accomplishments

- Expanded the session tracer into a deterministic full-plan builder for every locked source class:
  sessions plus history corrections/void state use newest-wins; settings preserve local existing values; custom exercises and owned plans dedup only by stable owner-scoped identity and keep both for distinct identities.
- Implemented deterministic root and child physical-ID remapping so archive records with colliding local physical IDs import under collision-free IDs, with every child FK rewritten before writing.
- Bound secure merge preflight to the exact computed `PortableMergePlan`; commit consumes the one-use token and writes only that precomputed plan.
- Extended the private SQLite writer to apply settings, custom exercises, archive-wins or inserted session aggregates, and owned-plan aggregates inside one `kernel.write` transaction.
- Added strict readback verification, trigger preservation, foreign-key checks, rebuild-pending state update, and canonical rollback tests for injected faults at every meaningful writer boundary.
- Closed the exact integrity gate: `npm run test:coverage -- --runInBand` passes all 159 suites and 3,061 tests, and all 97 integrity-critical files report 100% statements, branches, functions, and lines.
- Replaced the old three-case portable-merge device contract with twelve source-derived cases and built a fresh Phase 11 development-test APK bound to `c97b14a7b5b2c518f0188dee5f759fcfb8c37f98`.

## Task Commits

Key implementation and verification commits include:

1. **Planner and identity mapping expansion** — `9a4edb4`, `3466346`, `76d0f48`, `4ec1225`, `00c3a59`
2. **Full writer expansion** — `555d61a`, `5d96180`, `6853837`, `befa437`, `8501a42`
3. **Secure full-plan token binding** — `9347818`, `2a4bba1`
4. **Coverage closure** — `9674351`, `07a8307`, `27cb614`, `719077d`, `08a8747`, `96c5933`, `8ee6d3d`
5. **Shared/native full-plan contract** — `5e32f9d`, `4a0a48f`

## Files Created/Modified

- `src/domains/portability/mergePlan.ts` — pure full-plan classifier, comparator, identity map, remap, aggregate builder, preview counts, and fail-closed graph validation.
- `src/domains/portability/mergeCommands.ts` — authenticated full-plan preflight and one-time plan token lifecycle.
- `src/platform/sqlite/repositories/logicalMergeRepository.ts` — all-class private writer, validation seams, rollback/readback/trigger/foreign-key/rebuild-pending checks.
- `src/testing/contracts/portableMerge.contract.ts` — shared host/Expo 12-case full-plan contract.
- `tests/sqlite-host/logicalMergeRepository.test.ts` — full aggregate graph, rollback, readback, stale, legacy, and fail-closed coverage.
- `scripts/run-coverage-gate.mjs` — retains strict integrity-critical module enforcement.

## Verification

- `npm run typecheck` — pass.
- `npm run check:boundaries` / `npm run lint` — pass.
- `npm run test:unit -- --runInBand src/domains/portability/mergePlan.test.ts src/domains/portability/mergeCommands.test.ts src/testing/contracts/portableMerge.contract.test.ts` — pass.
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalMergeRepository.test.ts` — 95/95 pass.
- `npm run test:coverage -- --runInBand` — pass; all 97 integrity-critical files at 100% statements, branches, functions, and lines.
- `npm run android:devtest:fresh -- --suite phase11 --serial emulator-5554` — pass; retained and installed APK SHA-256 `bd00496a3ff8cc4cdca434fd3b493bfde38dda709a46e90e4c7c5a3203d724a1`.
- `npm run test:sqlite:device -- --suite portable-merge --manifest artifacts/native/phase11/build.json` — pass; 12/12 cases.

## Native Evidence

Fresh Phase 11 development-test manifest:

- `base_head`: `c97b14a7b5b2c518f0188dee5f759fcfb8c37f98`
- `source_tree_sha256`: `75f1cc758c4c9848b4ea0a37591a82c5985903043c4b2ee48d1d0098d1265d3c`
- APK SHA-256: `bd00496a3ff8cc4cdca434fd3b493bfde38dda709a46e90e4c7c5a3203d724a1`
- Device: `emulator-5554`, API 36, arm64-v8a
- Contract: `portable-merge`, 12 total, 12 passed, 0 failed, 0 skipped

## Deviations from Plan

### Auto-fixed Issues

**1. [Coverage blocker] Planner/repository branch coverage remained below the strict gate**

- **Found during:** Final Plan 11-02 verification.
- **Issue:** The full suite passed, but the integrity gate correctly rejected uncovered fail-closed branches in `mergeCommands.ts` and `logicalMergeRepository.ts`.
- **Fix:** Added focused tests for malformed local facts, optional child-table paths, remapped owned-plan/session aggregates, live-local fallthroughs, transaction preconditions, verification readbacks, state updates, and commit rollback. Simplified unreachable `workout_sessions ?? []` fallbacks after the canonical reader guarantees table presence.
- **Verification:** `npm run test:coverage -- --runInBand` passed with all 97 integrity-critical files at 100%.
- **Committed in:** `8ee6d3d`.

**2. [Stale native artifact boundary] Existing Phase 11 APK contained only the old three-case contract**

- **Found during:** Shared contract expansion.
- **Issue:** The retained `b3c0df8` APK could not honestly prove the new twelve-case matrix.
- **Fix:** Built a new exact-source Phase 11 development-test APK after explicit approval and reran the manifest-bound `portable-merge` suite.
- **Verification:** `artifacts/native/phase11/result.json` passed 12/12 with retained/installed APK hash match.
- **Committed in:** `4a0a48f` planning handoff.

---

**Total deviations:** 2 auto-fixed verification-boundary issues.
**Impact on plan:** Both strengthened the intended safety contract; no Phase 12 transport or sync scope was introduced.

## Issues Encountered

- The shell defaulted to Node 26 and lacked Android SDK paths. The pinned environment is Node 24.19.0, npm 11.17.0, Temurin 17.0.20+8, Android API 36, build-tools 36.0.0, NDK 27.1.12297006, and Maestro 2.8.0.
- Generated coverage-debug output blocked exact source-tree digest until the generated directories were removed.
- Gradle emitted dependency deprecation and SDK XML warnings, but the build, install, retained/installed hash check, and contract run all passed.

## User Setup Required

None.

## Next Phase Readiness

Plan 11-03 can now expose this proven engine in Settings -> Data & recovery. It should reference Plan 11-02 for byte-level SQLite atomicity and focus its own proof on lifecycle-visible UI behavior: separate Restore clean and Import / merge backup actions, bounded preview, exact confirmation, cancellation/token cleanup, metadata, accessibility, and manifest-bound Maestro evidence. Do not add Drive, sign-in, or sync behavior.

---
*Phase: 11-portable-history-merge-restore*
*Plan: 11-02*
*Completed: 2026-09-21*
