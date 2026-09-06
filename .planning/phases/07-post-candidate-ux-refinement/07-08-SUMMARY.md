---
phase: 07-post-candidate-ux-refinement
plan: 08
subsystem: assets
tags: [expo, android, cng, pngjs, launcher-icon, deterministic-generation]
requires:
  - phase: 07-post-candidate-ux-refinement
    provides: Expo SDK 57 CNG configuration and the owner-approved Concept G icon direction
provides:
  - Exact direct pngjs 7.0.0 dev encoder with recorded provenance and direct-resolution proof
  - One deterministic generator and fail-closed pixel contract for all Concept G image variants
  - Standard, adaptive foreground/background, monochrome, and splash Concept G PNGs
affects: [07-10-native-evidence, cng, android-build, launcher, splash]
actuals:
  tokens: 305746
  tasks: 2
  commits: 4
tech-stack:
  added: [pngjs@7.0.0]
  patterns:
    - One canonical geometric mark rasterized deterministically for every configured platform image
    - Pixel-level alpha, palette, geometry, safe-zone, and direct-dependency contract tests
key-files:
  created:
    - scripts/generate-concept-g-icons.mjs
    - scripts/concept-g-image-contract.test.mjs
  modified:
    - package.json
    - package-lock.json
    - assets/images/icon.png
    - assets/images/android-icon-background.png
    - assets/images/android-icon-foreground.png
    - assets/images/android-icon-monochrome.png
    - assets/images/splash-icon.png
key-decisions:
  - "Concept G is one canonical 256px ascending rounded-bar mark; each platform image is a scaled raster of that sole geometry."
  - "pngjs is a direct exact 7.0.0 devDependency; tests prove the generator resolves that root package, not Expo's nested pngjs 3.4.0."
  - "The existing Expo config paths and adaptive background remain stable; CNG alone generates Android resources."
patterns-established:
  - "Generated visual assets must expose a --check mode and compare checked-in bytes with a deterministic renderer."
  - "Adaptive/icon contracts must assert every pixel, transparent boundary, dimensions, and safe zones rather than only inspecting image metadata."
requirements-completed: [UX-22]
coverage:
  - id: D1
    description: Direct, exact, provenance-recorded pngjs encoder and deterministic Concept G renderer
    requirement: UX-22
    verification:
      - kind: unit
        ref: scripts/concept-g-image-contract.test.mjs#pins pngjs 7.0.0 as the generator's direct official dev dependency
        status: pass
      - kind: unit
        ref: scripts/concept-g-image-contract.test.mjs#renders the exact deterministic Concept G pixel contract from the sole generator
        status: pass
      - kind: other
        ref: npm ls pngjs and npm run typecheck
        status: pass
    human_judgment: false
  - id: D2
    description: Five configured standard, adaptive, monochrome, and splash PNGs with clean CNG ownership
    requirement: UX-22
    verification:
      - kind: unit
        ref: scripts/concept-g-image-contract.test.mjs#writes all configured app assets deterministically and retains stable Expo paths
        status: pass
      - kind: other
        ref: node scripts/generate-concept-g-icons.mjs --check and npm run verify:cng and git diff --check
        status: pass
    human_judgment: true
    rationale: Android launcher masks, themed tinting, and real splash rendering require exact-candidate device observation.
duration: 8min
completed: 2026-09-06
status: complete
---

# Phase 07 Plan 08: Concept G App Assets Summary

**A deterministic Concept G renderer now produces exact tri-tone ascending-bar launcher, adaptive, monochrome, and splash PNGs from one geometry source, protected by fail-closed pixel and CNG contracts.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-06T14:41:25Z
- **Completed:** 2026-09-06T14:50:00Z
- **Tasks:** 2/2
- **Files modified:** 9

## Accomplishments

- Added direct exact pngjs 7.0.0 as the reviewed MIT dev encoder, with its official repository, stability/adoption facts, no-postinstall status, lockfile integrity, and root-resolution boundary recorded in code and tested.
- Added the sole Concept G PNG writer plus a fail-closed Node contract that compares every output pixel for exact three-bar geometry, palette, transparency, dimensions, safe zones, deterministic bytes, and unchanged Expo asset paths.
- Generated and committed all five configured images: standard icon, adaptive background/foreground, monochrome silhouette, and splash icon. Clean CNG generated Android twice with matching results and removed generated native directories afterward.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Pin the legitimate encoder and define the Concept G contract** — d85fa91 (test)
2. **Task 1 GREEN: Add deterministic generator and exact direct encoder** — e0516a8 (feat)
3. **Task 2: Generate five assets and prove clean CNG ownership** — c762155 (feat)
4. **Task 1 security hardening: Record encoder supply-chain contract** — f52d3f0 (test)

## Files Created/Modified

- package.json and package-lock.json — direct exact pngjs 7.0.0 development dependency, root lockfile integrity, and nested Expo dependency separation.
- scripts/generate-concept-g-icons.mjs — sole canonical geometry, deterministic PNG rasterizer, generator, and --check drift gate.
- scripts/concept-g-image-contract.test.mjs — dependency provenance, direct resolution, exact-pixel, safe-zone, determinism, and config-path contract suite.
- assets/images/icon.png — opaque 1024px standard Concept G icon on #F6F8FB.
- assets/images/android-icon-background.png, assets/images/android-icon-foreground.png, and assets/images/android-icon-monochrome.png — adaptive background, transparent safe-zone tri-tone foreground, and transparent tintable silhouette.
- assets/images/splash-icon.png — transparent 228×213px rendering of the same mark.

## Decisions Made

- The shared base geometry is 256px wide: three 64px rounded bars with 32px gaps, a shared baseline, and increasing heights. Each required PNG is an exact scale/placement of that mark, with no independent hand-authored asset geometry.
- The standard icon uses only the approved pale background and the three approved blues; transparent variants preserve the same bar ordering, while monochrome is a single black tintable silhouette.
- The existing app.config.ts paths and #F6F8FB adaptive/splash background were intentionally unchanged. Generated Android files remain ignored and untracked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical supply-chain boundary] Added a direct-module resolution assertion for pngjs**

- **Found during:** Task 1 security review after the direct install.
- **Issue:** Expo's transitive dependency tree still contains pngjs 3.4.0; version checks alone did not prove the renderer imports the approved root pngjs 7.0.0 copy.
- **Fix:** Recorded the reviewed official provenance facts in the generator and made the contract assert the resolved module is node_modules/pngjs/lib/png.js at version 7.0.0 with no postinstall.
- **Files modified:** scripts/generate-concept-g-icons.mjs and scripts/concept-g-image-contract.test.mjs.
- **Verification:** All three asset-contract tests, npm ls pngjs, strict typecheck, deterministic --check, and CNG verification passed.
- **Committed in:** f52d3f0.

---

**Total deviations:** 1 auto-fixed (1 Rule 2 critical supply-chain boundary)
**Impact on plan:** The change implements the plan's explicit no-transitive-encoder threat mitigation; it adds no product scope or native configuration change.

## Issues Encountered

- The local shell reports Node 26.8.1/npm 11.19.0 while the repository pins Node 24.19.0/npm 11.17.0. npm emitted its existing engine warning during the approved direct installation, but all focused contract, typecheck, lockfile, and CNG verification completed successfully.
- Context7 CLI was not installed locally, so the documented CLI fallback could not retrieve package API documentation. The task brief supplied prior package-legitimacy evidence, and the installed package metadata/lockfile were independently verified before implementation.

## Verification

- node scripts/generate-concept-g-icons.mjs --check — passed; all five checked-in PNGs match the deterministic renderer.
- node --test scripts/concept-g-image-contract.test.mjs — passed; 3/3 tests validate direct dependency provenance, pixel contract, byte determinism, safe zones, and config paths.
- npm ls pngjs — passed; direct pngjs 7.0.0 is present, while Expo's independent nested pngjs 3.4.0 remains isolated below parse-png.
- npm run typecheck — passed.
- npm run verify:cng — passed; two clean development-test Android generations match exactly.
- git diff --check — passed; generated android and ios directories were cleaned and remain ignored/untracked.

## Known Stubs

None.

## Next Phase Readiness

- Plan 07-10 can bind exact candidate/device evidence to the deterministic source assets. Android launcher masks, themed monochrome tinting, splash rendering, and Samsung visual review remain device-evidence work, not source-test substitutes.
- UX-22 is shared with a later Phase 7 plan, so this isolated executor intentionally left requirement/state/roadmap ownership to the phase orchestrator.

---
*Phase: 07-post-candidate-ux-refinement*
*Completed: 2026-09-06*

## Self-Check: PASSED

- Created source files and all five generated PNGs exist in the isolated worktree.
- Task commits d85fa91, e0516a8, c762155, and f52d3f0 are present in repository history.
- The summary coverage manifest parses with D1 automated and D2 correctly routed to device judgment.
