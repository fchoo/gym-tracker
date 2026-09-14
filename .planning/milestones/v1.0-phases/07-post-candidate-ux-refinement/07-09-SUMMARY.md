---
phase: 07-post-candidate-ux-refinement
plan: 09
subsystem: release-evidence
tags: [maestro, android, release-candidate, exact-byte, n4, github-actions]
requires:
  - phase: 07-post-candidate-ux-refinement
    provides: completed Phase 7 Settings, workout removal/audio, plan reorder, accessibility, and icon refinements
  - phase: 06-candidate-hardening
    provides: build-once candidate manifest and fail-closed Phase 6 evidence patterns
provides:
  - Candidate-bound Phase 7 Maestro flow runner covering all UX and UI evidence owners
  - SM-S916B N4 observation-only checklist bound to one exact candidate APK and manifest
  - Build-once release workflow gates that prove Phase 2 native contracts before production build and Phase 7 evidence after manifest verification
affects: [07-10-native-evidence, release-candidate, samsung-n4, promotion-gate]
actuals:
  tokens: 14969
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns:
    - Fail-closed candidate evidence binds package, APK, manifest, executed flow, report, and screenshot bytes
    - Observation-only physical review records evidence without approval, promotion, publication, tag, or Terminal Seal authority
    - Native Phase 2 contracts precede one production candidate build; candidate evidence follows its manifest verification
key-files:
  created:
    - maestro/phase7/today-settings.yaml
    - maestro/phase7/workout-removal-audio.yaml
    - maestro/phase7/plan-schedule-reorder.yaml
    - maestro/phase7/icon-navigation-accessibility.yaml
    - scripts/run-phase7-maestro.mjs
    - scripts/generate-phase7-attended-checklist.mjs
    - scripts/phase7-evidence-scripts.test.mjs
  modified:
    - package.json
    - .github/workflows/release-candidate.yml
    - scripts/release-candidate-contract.test.mjs
key-decisions:
  - "Phase 7 evidence accepts only the production package com.fchoo.gymtracker and hashes every candidate identity and executed flow artifact before recording success."
  - "The SM-S916B N4 checklist remains observation-only; its schema explicitly rejects approval, promotion, publication, tagging, and Terminal Seal fields."
  - "The release candidate workflow validates Phase 2 native contracts before building once, then runs Phase 7 Maestro only against the verified candidate manifest."
  - "Maestro selectors target source-defined semantic controls and routes: Settings, Removed sessions, Plan days, and the relaunched Today route before Rest sound."
patterns-established:
  - "Candidate evidence runners extend prior phase contracts but declare phase-specific flow, screenshot, and consideration matrices explicitly."
  - "Maestro interaction labels are regression-tested against source accessibility semantics instead of relying on visual headings or historical labels."
requirements-completed: [UX-11, UX-12, UX-13, UX-14, UX-15, UX-16, UX-17, UX-18, UX-19, UX-20, UX-21, UX-22]
coverage:
  - id: D1
    description: "Fail-closed Phase 7 runner and four Maestro flows bind the exact candidate package, APK, manifest, flow snapshots, reports, screenshots, and UX/UI evidence matrix."
    requirement: UX-11
    verification:
      - kind: automated_ui
        ref: "node --test scripts/phase7-evidence-scripts.test.mjs"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run lint && npm run check:boundaries"
        status: pass
    human_judgment: false
  - id: D2
    description: "Build-once candidate workflow runs clean Phase 2 native and SQLite device contracts before production build, verifies the candidate manifest, then runs Phase 7 evidence on those same bytes."
    requirement: UX-18
    verification:
      - kind: other
        ref: "npm run test:release-matrix && npm run test:evidence:release && git diff --check"
        status: pass
    human_judgment: false
  - id: D3
    description: "Samsung SM-S916B N4 observation-only review records five candidate-bound physical checks without release authority."
    requirement: UX-22
    verification:
      - kind: manual_procedural
        ref: "npm run prepare:attended:phase7 / record:attended:phase7 / verify:attended:phase7"
        status: unknown
    human_judgment: true
    rationale: "Exact candidate installation, Samsung rendering, audible cues, and operator observation cannot be proven by source contracts; the checklist intentionally cannot approve or promote a release."
duration: 8h 7m
completed: 2026-09-06
status: complete
---

# Phase 07 Plan 09: Candidate-Bound UX Evidence Summary

**Phase 7 now has a fail-closed, exact-candidate evidence chain: four source-aligned Maestro journeys, a Samsung N4 observation-only checklist, and a one-build workflow that proves native contracts before candidate evidence.**

## Performance

- **Duration:** 8h 7m
- **Started:** 2026-09-06T15:42:22+08:00
- **Completed:** 2026-09-06T23:49:57+08:00
- **Tasks:** 2/2
- **Files modified:** 10
- **Actual implementation diff:** 59,874 characters / 4 = 14,969 estimate tokens

## Accomplishments

- Added four Phase 7 Maestro journeys that cover Settings/History routing, active-workout removal and rest sound, plan day/schedule reordering, and Settings icon navigation/accessibility with named screenshots.
- Added an owned Phase 7 evidence runner that extends the proven Phase 6 contract and rejects stale or substituted candidate identity, package, manifest, APK, flow, report, screenshot, privacy, and release-authority inputs.
- Added the exact-byte SM-S916B N4 prepare/record/verify checklist with fixed N4-01 through N4-05 rows, canonical JSON, unique screenshot digests, and schema-rejected release authority.
- Added package-owned Phase 7 commands and wired the build-once release workflow to execute Phase 2 native/device SQLite contracts before the production build, then Phase 7 Maestro after exact manifest verification.
- Added source-aligned selector regression coverage for the accessible Settings control, Removed sessions route, Plan days day switcher, and the explicit Today relaunch before opening Rest sound settings.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build fail-closed Phase 7 flows runner and N4 checklist** — 319199a (feat)
2. **Task 2: Put native contracts and Phase 7 evidence into the build-once workflow** — 763d138 (feat)
3. **Task 1 follow-up: Align Phase 7 Maestro semantics with source accessibility contracts** — 44bb8df (fix)

**Plan metadata:** committed separately after this summary is self-checked.

## Files Created/Modified

- maestro/phase7/today-settings.yaml — selected Today/Settings and removed-session destination evidence journey.
- maestro/phase7/workout-removal-audio.yaml — workout-removal confirmation and post-relaunch rest-sound journey.
- maestro/phase7/plan-schedule-reorder.yaml — selected-plan-day and schedule reorder journey.
- maestro/phase7/icon-navigation-accessibility.yaml — Settings icon, back navigation, and accessibility screenshot journey.
- scripts/run-phase7-maestro.mjs — candidate-bound runner, consideration matrix, exact flow snapshots, and report validation.
- scripts/generate-phase7-attended-checklist.mjs — fixed Samsung N4 observation-only evidence recorder/verifier.
- scripts/phase7-evidence-scripts.test.mjs — runner, checklist, CLI, workflow ordering, and source-semantic flow regressions.
- package.json — owned Phase 7 Maestro and attended-checklist commands.
- .github/workflows/release-candidate.yml — Phase 2 native/device checks before the single production candidate and Phase 7 evidence after manifest verification.
- scripts/release-candidate-contract.test.mjs — exact release-runner command matrix updated for the Phase 7 evidence invocation.

## Decisions Made

- Bound Phase 7 executable evidence to exact production package, manifest, APK, flow, report, and screenshot bytes; a passing source test alone cannot claim candidate evidence.
- Kept physical Samsung N4 as a bounded observation gate: it records five checks but cannot approve, promote, publish, tag, or seal a release.
- Ordered release execution as source contracts → clean Phase 2 native build → Phase 2 device SQLite contracts → exactly one production candidate build → manifest verification → Phase 7 Maestro evidence.
- Tested Maestro semantics at their real accessibility boundary: Settings is the control label, Removed sessions is the navigable history destination, and Plan days is the selected-day label.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Compatibility bug] Updated the exact release-runner command contract for the required Phase 7 invocation**

- **Found during:** Task 2 release-evidence verification.
- **Issue:** scripts/release-candidate-contract.test.mjs still enumerated the previous exact emulator-runner command list, so npm run test:evidence:release rejected the workflow after the required Phase 7 evidence command was added.
- **Fix:** Added the Phase 7 runner command to the existing exact expected list without weakening its single-line, self-contained command contract.
- **Files modified:** scripts/release-candidate-contract.test.mjs.
- **Verification:** npm run test:evidence:release passed 20/20 tests.
- **Committed in:** 763d138.

**2. [Rule 1 - Semantic selector bug prevention] Corrected Maestro labels and route interactions to match the implemented accessible UI**

- **Found during:** Final semantic verification of the four Phase 7 flows.
- **Issue:** The initial flows targeted historical/non-interactive labels (Open Settings, History and data, and Selected day) and tried to open Settings from an active-workout header that has no Settings control.
- **Fix:** Targeted Settings, opened Removed sessions, asserted Plan days, and stopped/relaunched to Today before opening Rest sound; added a regression test for all corrected semantics.
- **Files modified:** maestro/phase7/today-settings.yaml, maestro/phase7/workout-removal-audio.yaml, maestro/phase7/plan-schedule-reorder.yaml, maestro/phase7/icon-navigation-accessibility.yaml, and scripts/phase7-evidence-scripts.test.mjs.
- **Verification:** node --test scripts/phase7-evidence-scripts.test.mjs passed 6/6; all planned static and release-contract gates passed.
- **Committed in:** 44bb8df.

---

**Total deviations:** 2 auto-fixed (2 Rule 1 correctness/compatibility fixes).
**Impact on plan:** Both fixes preserve the plan's fail-closed candidate-evidence contract and make the automation exercise real UI controls. No release authority, candidate-hash, privacy, or build-once boundary was relaxed.

## Issues Encountered

- npm run typecheck initially could not start because dependencies were absent (tsc: command not found). npm ci restored the lockfile-owned toolchain. The local Node/npm runtime reported v26.8.1/v11.19.0 while the repository pins v24.19.0/v11.17.0; installation completed and every required verification passed. Existing package audit/deprecation notices were not introduced by this plan.
- Context7 MCP was unavailable and the documented CLI fallback was not installed. The remaining selector correction required no version-sensitive external API decision; it was verified against the repository's implemented accessibility/copy contract.

## Verification

- node --test scripts/phase7-evidence-scripts.test.mjs — passed, 6/6 tests.
- npm run typecheck — passed.
- npm run lint — passed; boundary check covered 232 files.
- npm run check:boundaries — passed; boundary check covered 232 files.
- npm run test:release-matrix — passed; 16 required release checks present.
- npm run test:evidence:release — passed, 20/20 tests.
- git diff --check — passed.

## Known Stubs

None.

## Threat Flags

None. The plan adds evidence/workflow orchestration only within the existing candidate/artifact trust boundary. The runner and checklist strengthen the plan's T-07-EVIDENCE hash binding and T-07-RELEASE authority rejection; they add no endpoint, auth route, file-access trust boundary, or schema change.

## Next Phase Readiness

- Plan 07-10 can dispatch a fresh single-build production candidate, then use the owned Phase 7 runner and Samsung N4 checklist on that exact manifest/APK pair.
- Samsung SM-S916B N4 observation remains required for physical rendering, TalkBack/input, audible rest cues, adaptive/themed launcher and splash behavior. It must remain separate from owner approval, promotion, publication, tagging, and Terminal Seal actions.
- Per the executor handoff constraint, this plan intentionally leaves .planning/STATE.md and .planning/ROADMAP.md unchanged for the phase orchestrator.

---
*Phase: 07-post-candidate-ux-refinement*
*Completed: 2026-09-06*

## Self-Check: PASSED

- All ten implementation files and this summary exist in the isolated worktree.
- Task commits 319199a, 763d138, and 44bb8df are present in repository history.
- Summary frontmatter parses with all twelve UX requirements, two completed tasks, four commits (including this metadata commit), and the N4 human-judgment coverage boundary.
- STATE.md and ROADMAP.md remain unchanged by explicit handoff constraint.
