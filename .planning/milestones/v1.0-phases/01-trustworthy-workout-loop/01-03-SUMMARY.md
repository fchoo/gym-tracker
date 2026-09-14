---
phase: 01-trustworthy-workout-loop
plan: 03
subsystem: testing
tags: [zod, typed-errors, diagnostics, fake-clock, jest, node-sqlite, architecture-boundaries, github-actions]

requires:
  - phase: 01-01
    provides: Pinned Expo SDK 57, Node 24, npm lockfile, and full-SHA PR workflow scaffold
provides:
  - Versioned Zod boundary contracts with typed validation and unsupported-version failures
  - Typed application errors, bounded redacted diagnostics, injectable clocks, and explicit dependency composition
  - Jest unit/component/host-SQLite projects, reviewed coverage thresholds, and a Node 24 sqlite contract scaffold
  - Static route/UI/domain/writer/exclusive-helper boundary enforcement and explicit future-suite failures
affects: [01-04-sqlite-kernel, phase-01-domain-slices, ci, diagnostics, testing]

actuals:
  tokens: 10885
  tasks: 2
  commits: 6

tech-stack:
  added: []
  patterns:
    - Parse unknown persistence and platform data once with strict versioned Zod schemas before domain use
    - Translate raw failures into typed safe metadata and retain only allowlisted bounded diagnostics
    - Run shared SQLite contracts against Node 24 node:sqlite before the production Expo adapter exists
    - Fail unavailable required suites explicitly until their owning plans implement them

key-files:
  created:
    - src/domains/shared/contracts.ts
    - src/domains/shared/errors.ts
    - src/domains/shared/clock.ts
    - src/domains/shared/diagnostics.ts
    - src/bootstrap/appContainer.ts
    - src/testing/contracts/sqliteKernel.contract.ts
    - tests/sqlite-host/sqliteKernel.host.test.ts
    - jest.config.js
    - eslint.config.js
    - scripts/check-boundaries.mjs
  modified:
    - package.json
    - .github/workflows/pr.yml

key-decisions:
  - "Keep Zod at persistence/platform boundaries and export already validated branded values through the shared public index."
  - "Represent application failures as stable kind/code/retryability/correlation metadata; raw platform messages and causes do not cross the adapter boundary."
  - "Use the declared boundary scanner as the locked-package lint gate because the approved lockfile contains no ESLint package and new installs are prohibited."
  - "Encode later component, integration, native SQLite, and Maestro suites as explicit failing commands until their owning slices replace them."

patterns-established:
  - "Boundary parse: unknown value -> strict version check -> typed validated value or BoundaryValidationError."
  - "Diagnostics allowlist: timestamp, operation, category, code, correlation, revision, duration, and attempt only."
  - "Clock injection: wall and monotonic time share a deterministic FakeClock for expiry, leases, retries, and performance."
  - "Architecture scan: routes cannot import platform/SQLite or execute SQL; UI cannot import platform; domains cannot import another domain's internals or raw writer seams."

requirements-completed: [FOUND-06]

coverage:
  - id: D1
    description: "Unknown persistence/platform values are parsed by strict versioned Zod contracts into validated values or typed validation and unsupported-version errors."
    requirement: FOUND-06
    verification:
      - kind: unit
        ref: "src/domains/shared/contracts.test.ts#versioned boundary contracts"
        status: pass
      - kind: unit
        ref: "npm run test:unit -- contracts errors diagnostics clock --runInBand"
        status: pass
    human_judgment: false
  - id: D2
    description: "Application errors expose stable recovery metadata while bounded diagnostics exclude raw SQL parameters, workout payloads, notes, passwords, keys, plaintext, and platform messages."
    requirement: FOUND-06
    verification:
      - kind: unit
        ref: "src/domains/shared/errors.test.ts#typed application errors"
        status: pass
      - kind: unit
        ref: "src/domains/shared/diagnostics.test.ts#bounded diagnostics"
        status: pass
      - kind: unit
        ref: "npm run test:coverage -- --runInBand (100% statements/branches/functions/lines)"
        status: pass
    human_judgment: false
  - id: D3
    description: "FakeClock deterministically controls wall and monotonic time, and appContainer explicitly composes injectable shared dependencies."
    requirement: FOUND-06
    verification:
      - kind: unit
        ref: "src/domains/shared/clock.test.ts#Clock"
        status: pass
      - kind: unit
        ref: "src/domains/shared/appContainer.test.ts#application container"
        status: pass
    human_judgment: false
  - id: D4
    description: "Host tests use Node 24 node:sqlite, architecture violations fail static checks, and PR commands preserve the reviewed host-to-native-to-smoke order with full-SHA actions."
    requirement: FOUND-06
    verification:
      - kind: integration
        ref: "npm run test:sqlite:host -- --runInBand"
        status: pass
      - kind: integration
        ref: "npm run lint && npm run check:boundaries"
        status: pass
      - kind: unit
        ref: "src/domains/shared/tooling.test.ts#Plan 01-03 test and boundary tooling"
        status: pass
    human_judgment: false

duration: 19m
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 3: Contracts and Test Foundations Summary

**Strict Zod boundaries, privacy-safe typed diagnostics, deterministic clocks, and Node 24/Jest architecture gates with complete shared-module coverage**

## Performance

- **Duration:** 19 min
- **Started:** 2026-08-16T00:29:53Z
- **Completed:** 2026-08-16T00:48:46Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments

- Added strict versioned boundary schemas, branded stable IDs/timestamps, typed validation errors, safe application error metadata, bounded redacted diagnostics, deterministic wall/monotonic clocks, and an explicit composition root.
- Established Jest unit/component/host-SQLite projects, Node 24 `node:sqlite` proof, reviewed global and integrity-critical coverage thresholds, and package commands for every planned test layer.
- Enforced route SQL/platform, UI platform, cross-domain internal, raw writer, and prohibited Expo exclusive-helper boundaries; retained the existing full-SHA PR order and made unavailable later suites fail explicitly.

## Task Commits

Each behavior-adding task followed strict RED-before-GREEN TDD:

1. **Task 1 RED: Define shared boundary behavior** - `e4cbb3f` (test)
2. **Task 1 GREEN: Implement contracts, errors, diagnostics, clocks, and container** - `dc790ae` (feat)
3. **Task 2 RED: Specify host SQLite, scripts, coverage, and boundaries** - `1191ab7` (test)
4. **Task 2 RED: Specify required PR suite order and full-SHA actions** - `95a08dd` (test)
5. **Task 2 GREEN: Implement test, coverage, boundary, and CI gates** - `44a839a` (feat)
6. **Task 2 scope correction: Keep suite guard in declared ownership** - `25037c0` (fix)

## Files Created/Modified

- `src/domains/shared/contracts.ts` - Strict versioned Zod boundary schemas and branded validated values.
- `src/domains/shared/errors.ts` - Typed application error taxonomy and raw-error translation boundary.
- `src/domains/shared/diagnostics.ts` - Allowlisted, bounded, JSON-safe local diagnostics.
- `src/domains/shared/clock.ts` - Wall/monotonic `Clock`, `SystemClock`, and deterministic `FakeClock`.
- `src/domains/shared/index.ts` - Single shared-domain public API.
- `src/bootstrap/appContainer.ts` - Explicit shared dependency construction with injectable ports.
- `src/domains/shared/*.test.ts` - Table-driven boundary, error, redaction, clock, container, coverage, package, and architecture tests.
- `src/testing/contracts/sqliteKernel.contract.ts` - Narrow bound-parameter SQLite kernel port and versioned contract descriptor for Plan 01-04.
- `tests/sqlite-host/sqliteKernel.host.test.ts` - Real Node 24 `node:sqlite` host proof without mocked Expo modules.
- `jest.config.js` - Unit/component/host projects and reviewed 90/85 global plus 100% integrity-critical thresholds.
- `eslint.config.js` - Locked-package flat lint policy marker pointing to the architecture checker.
- `scripts/check-boundaries.mjs` - Static architecture scanner and explicit unavailable-suite failure mode.
- `package.json` - Runnable test, coverage, boundary, aggregate, and PR commands without dependency changes.
- `.github/workflows/pr.yml` - Required command contract expanded while preserving full-SHA actions and reviewed order.

## Decisions Made

- Zod remains outside pure domain rules; only boundary modules parse unknown values, and downstream code receives validated branded values.
- Correlation codes use a bounded `GT-` format, while raw errors are deliberately discarded during mapping so SQL parameters and platform messages cannot leak.
- The approved package lock contains no ESLint runtime, and the plan forbids new packages. Therefore `npm run lint` invokes the declared static boundary scanner; `eslint.config.js` documents the same owned rule surface for later locked-tool adoption.
- Component, integration, native SQLite, and Maestro commands exist now but fail with `Missing suite: <name>` until Plans 01-02, 01-04, and 01-10 replace them. No unavailable suite silently passes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Scope bug] Removed an undeclared missing-suite helper**
- **Found during:** Task 2 pre-commit ownership audit.
- **Issue:** The first implementation introduced `scripts/missing-suite.mjs`, which was not in Plan 01-03's declared files or the user's allowed ownership set.
- **Fix:** Moved explicit future-suite failure behavior into the declared `scripts/check-boundaries.mjs` and removed the helper.
- **Files modified:** `package.json`, `scripts/check-boundaries.mjs`; deleted `scripts/missing-suite.mjs`.
- **Verification:** Unit, host SQLite, typecheck, boundary, explicit missing-suite, and 100% coverage gates all passed afterward.
- **Committed in:** `25037c0`

---

**Total deviations:** 1 auto-fixed (1 scope bug).
**Impact on plan:** The correction reduced scope and preserved all planned behavior; no extra runtime or dependency was added.

## Issues Encountered

- Coverage initially failed at 93.5% statements and 78.84% branches for integrity-critical shared code. Focused defensive-branch tests brought statements, branches, functions, and lines to 100% without lowering thresholds.
- Expo's approved lockfile does not include ESLint itself. Installing it was prohibited, so the runnable lint command uses the no-dependency architecture scanner and the flat config records that policy for later tooling convergence.

## Known Stubs

- `test:components`, `test:integration`, `test:sqlite:device`, and `test:maestro:phase1` intentionally fail with explicit `Missing suite` messages. Their implementation belongs to Plans 01-02, 01-04, and 01-10; they do not block this plan's host-only FOUND-06 goal.

## User Setup Required

None - no external service configuration or package installation required.

## Next Phase Readiness

- Plan 01-04 can expand `src/testing/contracts/sqliteKernel.contract.ts` from the two-case scaffold into the reviewed ten-case contract and run the same shape against the production Expo SQLite adapter.
- Later domain slices have validated shared values, safe errors, diagnostics, clocks, explicit dependency composition, and CI-failing architecture boundaries.
- No native prebuild or Gradle command was run, and `package-lock.json` remains unchanged.

## Self-Check: PASSED

- All declared production, test, harness, config, script, workflow, and summary files exist.
- Commits `e4cbb3f`, `dc790ae`, `1191ab7`, `95a08dd`, `44a839a`, and `25037c0` exist and each carries exactly one required TRAE CLI trailer.
- GSD coverage classification found four deliverables, all automatically covered with no schema errors.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md` remain unchanged as required by the orchestrator-owned bookkeeping boundary.

---
*Phase: 01-trustworthy-workout-loop*
*Completed: 2026-08-16*
