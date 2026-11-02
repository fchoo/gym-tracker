---
phase: 20-native-acceptance
plan: "03"
subsystem: native-acceptance-testing
tags: [garmin, calendar, maestro, acceptance, privacy, tdd, source-freeze]
requires:
  - phase: 18-garmin-import
    provides: Bundled Chaquopy transport, canonical synthetic Garmin fixture registry, encrypted-session boundary, and Phase 18 source flow
  - phase: 16-calendar-parity
    provides: Calendar diagnostic controls, threshold-stage flow, semantic probe fields, and approved DEV-01/DEV-02 baselines
provides:
  - Standalone Garmin packaging/authentication/JSON-sync/dedupe/match observation registry and fail-closed shard
  - NV-CAL-01 through NV-CAL-09 intermediate Calendar trace registry and fail-closed shard
  - Deferred native Maestro source flows that cannot assign a final acceptance PASS
affects: [20-native-acceptance, VER-06, VER-09, VER-10, source-freeze]
actuals:
  tokens: 8125
  tasks: 2
  commits: 6
tech-stack:
  added: []
  patterns: [observation-only native acceptance, fail-closed shard validation, source-derived trace identity, deferred native verdict]
key-files:
  created:
    - src/testing/contracts/v12GarminAcceptance.contract.ts
    - scripts/v12-garmin-shard.mjs
    - maestro/v1.2/garmin-progress.yaml
    - src/testing/contracts/v12CalendarAcceptance.contract.ts
    - scripts/v12-calendar-shard.mjs
  modified:
    - maestro/v1.2/calendar.yaml
    - src/testing/contracts/v12GarminAcceptance.contract.test.ts
    - scripts/v12-garmin-shard.test.mjs
    - src/testing/contracts/v12CalendarAcceptance.contract.test.ts
    - scripts/v12-calendar-shard.test.mjs
key-decisions:
  - "Phase 20 source-freeze tooling can validate only NOT_RUN, REVIEW_REQUIRED, or FAIL; it rejects any PASS or final verdict field."
  - "Garmin proof preserves the selected bundled Python/Chaquopy transport and records only bounded digests/counts rather than credential, account, route, or payload data."
  - "Calendar acceptance requires at least two monotonic intermediate samples with measured one-to-one translation, exact 25 percent evidence, generation, callback, focus, and motion fields."
patterns-established:
  - "Shard producers validate a bounded observation object before returning an inert NOT_RUN envelope."
  - "Native screenshot output is supplemental evidence; source traces and their digest remain the acceptance authority."
requirements-completed: []
requirements-advanced: [VER-06, VER-09, VER-10]
coverage:
  - id: D20-03-GARMIN
    description: Garmin packaging through matching source-observation tooling is privacy-safe, fail-closed, and cannot manufacture native PASS.
    requirement: VER-06
    verification:
      - kind: unit
        ref: npm run test:unit -- --runInBand src/testing/contracts/v12GarminAcceptance.contract.test.ts
        status: pass
      - kind: other
        ref: node --test scripts/v12-garmin-shard.test.mjs
        status: pass
    human_judgment: true
    rationale: Real-account ARM64 APK proof remains intentionally deferred to the attended native evidence phase.
  - id: D20-03-CALENDAR
    description: Calendar intermediate geometry and semantic source-observation tooling rejects final-only, stale, malformed, and verdict-bearing traces.
    requirement: VER-09
    verification:
      - kind: unit
        ref: npm run test:unit -- --runInBand src/testing/contracts/v12CalendarAcceptance.contract.test.ts
        status: pass
      - kind: other
        ref: node --test scripts/v12-calendar-shard.test.mjs
        status: pass
    human_judgment: true
    rationale: Exact device gesture, geometry, focus, and reduced-motion proof remains intentionally deferred to native collection.
  - id: D20-03-PRIVACY
    description: Garmin and Calendar source validators prevent final verdict manufacture and reject private or mutation-prone evidence fields.
    requirement: VER-10
    verification:
      - kind: unit
        ref: npm run test:unit -- --runInBand src/testing/contracts/v12GarminAcceptance.contract.test.ts src/testing/contracts/v12CalendarAcceptance.contract.test.ts
        status: pass
      - kind: other
        ref: npm run typecheck -- --pretty false
        status: pass
    human_judgment: false
duration: 4m 23s
completed: 2026-10-14
status: complete
---

# Phase 20 Plan 03: Garmin and Calendar Observation Contracts Summary

**Privacy-safe Garmin and Calendar native-acceptance contracts now preserve source-derived observations and fail closed before the final device-evidence run.**

## Performance

- **Duration:** 4m 23s
- **Started:** 2026-10-13T21:30:53Z
- **Completed:** 2026-10-13T21:35:16Z
- **Tasks:** 2/2
- **Files modified:** 10

## Accomplishments

- Added a twelve-case Garmin registry covering bundled Chaquopy packaging, allowlisted bridge methods, canonical JSON summaries, replay/dedupe, explicit matching, deferred account lifecycle/recovery, process boundary, visibility, and privacy.
- Added four canonical Garmin shard observation shapes that require bounded hashes/counts, reject private fields and alternate transports, and always retain source-freeze output as `NOT_RUN`.
- Added the nine-case Calendar registry and trace validator requiring monotonic intermediate samples, measured 1:1 translation within 2dp, exact 25% threshold evidence, semantic/focus/callback generation fields, and normal/reduced-motion identity.
- Retained the Phase 16 Maestro Calendar journey as a Phase 20 observation input and added a deferred Garmin/Progress Maestro journey; neither native flow was executed.

## Task Commits

1. **Task 1 RED — Garmin contract tests:** `29651d80` (`test`)
2. **Task 1 GREEN — Garmin contract, shard, and flow:** `5d088b3d` (`feat`)
3. **Task 2 RED — Calendar contract tests:** `556e58c8` (`test`)
4. **Task 2 GREEN — Calendar contract, shard, and flow:** `f5d0ebb3` (`feat`)
5. **Rule 1 verification fix — strict Calendar test fixtures:** `4bdf37cf` (`fix`)

## Files Created/Modified

- `src/testing/contracts/v12GarminAcceptance.contract.ts` — ordered Garmin acceptance matrix with strict privacy, transport, digest, and native-status rules.
- `scripts/v12-garmin-shard.mjs` — standalone Garmin observation producer/validator that cannot emit final PASS.
- `maestro/v1.2/garmin-progress.yaml` — deferred selected-transport login, sync, match, restart, and logout path.
- `src/testing/contracts/v12CalendarAcceptance.contract.ts` — NV-CAL-01..09 registry and intermediate source-trace contract.
- `scripts/v12-calendar-shard.mjs` — Calendar trace validator for geometry, semantic, callback, focus, and motion evidence.
- `maestro/v1.2/calendar.yaml` — retained Phase 16 journey explicitly labeled as supplemental Phase 20 evidence.

## Decisions Made

- Source tooling has no authority to produce a final PASS. Only later exact native evidence can close the deferred Garmin or Calendar outcomes.
- The selected bundled Python 3.13/Chaquopy transport remains exclusive; no subprocess, local server, downloaded code, separately installed Python, or fallback transport is accepted.
- Calendar acceptance binds the full trace rather than a final screenshot, and retains approved DEV-01/DEV-02 as baselines that still require fresh native proof.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected strict TypeScript adversarial Calendar test fixtures**
- **Found during:** Task 2 verification
- **Issue:** The intentional final-only and invalid-PASS fixtures were rejected by TypeScript before reaching the runtime validator.
- **Fix:** Guarded the indexed trace sample and explicitly cast the deliberate invalid runtime value through `unknown`.
- **Files modified:** `src/testing/contracts/v12CalendarAcceptance.contract.test.ts`
- **Verification:** Both focused unit suites, both shard suites, and `npm run typecheck -- --pretty false` passed.
- **Committed in:** `4bdf37cf`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 verification bug).
**Impact on plan:** The fix is test-only and keeps the required malformed-input coverage executable under strict TypeScript; no acceptance scope changed.

## Issues Encountered

- The worktree intentionally had no local `node_modules`. A disposable symlink to the existing UX workspace dependency cache was used only for host verification and removed immediately afterward; no package was installed or committed.

## Native Evidence Boundary

- No APK build, installation, device/emulator operation, Maestro run, real-account login, credential entry, screenshot capture, evidence verdict derivation, push, publication, or deployment occurred.
- Garmin real account/session proof and Calendar native gesture/DEV-01/DEV-02 proof remain deferred to their Phase 20 evidence owners.

## State Update Boundary

Per the parallel-worktree instruction, this executor did not modify `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, or `.planning/WINDOWS.md`; the orchestrator owns shared planning state.

## Next Phase Readiness

- The frozen Garmin and Calendar producers can now be consumed by the shared native evidence runner without product-source changes.
- Final verification still requires exact ARM64 APK/device identities and owner-attended Garmin authentication where applicable; missing proof remains `NOT_RUN` or `REVIEW_REQUIRED`.

## Self-Check: PASSED

- Confirmed all ten planned source, test, shard, and Maestro files exist in this worktree.
- Confirmed all five implementation/TDD commits are present in the repository history.

---
*Phase: 20-native-acceptance*
*Completed: 2026-10-14*
