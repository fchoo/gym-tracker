---
phase: 14-prototype-visual-shell
plan: "01"
subsystem: ui-testing
tags: [archivo, expo-font, android, maestro, font-axis, native-contracts]
requires:
  - phase: 13-multi-plan-running-foundation
    provides: Passing verified foundation and the development-test native contract boundary.
provides:
  - Official Archivo variable font bytes and SIL OFL provenance pinned by SHA-256.
  - Revision 18 editorial typography oracle with source-owned cases and tolerance.
  - Development-only Android font capture route, proof runner, and Maestro flow.
affects: [14-02, shared-theme, native-verification]
actuals:
  tokens: 94165
  tasks: 2
  commits: 4
tech-stack:
  added: [Archivo variable TTF, SIL OFL 1.1 asset]
  patterns: [source-owned native proof oracle, exact-source APK/report identity validation]
key-files:
  created:
    - assets/fonts/Archivo-VariableFont_wdth,wght.ttf
    - assets/fonts/OFL-Archivo.txt
    - src/testing/phase14FontProof.ts
    - scripts/run-phase14-font-proof.mjs
    - maestro/phase14/font-axis.yaml
  modified:
    - src/ui/theme/index.ts
    - app/__phase2-attended-preview.tsx
    - src/testing/phase14FontProof.test.ts
    - app/__tests__/phase2-attended-preview.test.tsx
    - scripts/phase14-font-proof.test.mjs
key-decisions:
  - "ArchivoVariable remains proof-only until Plan 14-02 records a clean-tree Android font-axis verdict."
  - "The runner derives required capture IDs from the source-owned proof registry and rejects stale, skipped, or mismatched evidence."
patterns-established:
  - "Native proof routes stay behind nativeContractsEnabled and redirect in production builds."
  - "Source tree, APK, package, build profile, proof source, case order, and screenshot overlays bind a font proof."
requirements-completed: [SHL-04]
coverage:
  - id: D1
    description: Official Archivo asset provenance and deterministic Revision 18 typography oracle.
    requirement: SHL-04
    verification:
      - kind: unit
        ref: src/testing/phase14FontProof.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Development-only font capture route and exact-source evidence verifier.
    requirement: SHL-04
    verification:
      - kind: automated_ui
        ref: app/__tests__/phase2-attended-preview.test.tsx
        status: pass
      - kind: unit
        ref: scripts/phase14-font-proof.test.mjs
        status: pass
    human_judgment: false
duration: 9min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 01: Official Archivo and Font Proof Harness Summary

**Official Archivo variable bytes, Revision 18's 57px condensed wght-890 oracle, and an isolated identity-bound Android capture harness are ready for the separate native proof.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-08T14:03:35Z
- **Completed:** 2026-10-08T14:12:24Z
- **Tasks:** 2/2
- **Files modified:** 10

## Accomplishments

- Vendored the official Google Fonts Archivo variable TTF and SIL OFL 1.1 notice, with upstream URLs and SHA-256 contracts verified in unit tests.
- Added the sole Revision 18 oracle for local family identity, 57px size, condensed stretch, wght 890, -0.07em tracking, fixed wraps, line boxes, and one-normalized-pixel tolerance.
- Added a development-test-only preview route, raw native layout observation hooks, a source/APK/report-bound verifier, and a Maestro screenshot capture flow. Production builds continue to redirect away from the route.

## Task Commits

Each TDD task was committed atomically:

1. **Task 1: Commit official Archivo and the deterministic Revision 18 font oracle** — `60b4037` (RED test), `41fbb97` (GREEN implementation)
2. **Task 2: Author the isolated development-test font proof harness** — `e58f934` (RED test), `a75e8e3` (GREEN implementation)

## Files Created/Modified

- `assets/fonts/Archivo-VariableFont_wdth,wght.ttf` — official Google Fonts Archivo variable asset.
- `assets/fonts/OFL-Archivo.txt` — the upstream SIL OFL 1.1 license notice.
- `src/testing/phase14FontProof.ts` — source-owned Revision 18 proof contract and validation rules.
- `src/ui/theme/index.ts` — proof-only local Archivo mapping; production typography is unchanged.
- `app/__phase2-attended-preview.tsx` — gated font measurement, wrap, family, overlay-input, crop/overflow capture hooks.
- `scripts/run-phase14-font-proof.mjs` — validates manifest, source tree, APK, package/profile, proof source, reports, cases, and overlay hashes.
- `maestro/phase14/font-axis.yaml` — development-test capture entry point for each external font-scale run.

## Decisions Made

- Kept `ArchivoVariable` proof-only. Plan 14-02 owns the clean-tree Android proof before the app changes its production typography.
- Used an exact local source registry for capture cases, so the Node verifier cannot silently accept an alternate or skipped scale scenario.
- Exposed raw measurements and screenshot-overlay inputs without user facts, paths, tokens, or account data.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 1 - Bug] Corrected test and type compatibility around the proof-only variable font**
   - **Found during:** Tasks 1 and 2
   - **Issue:** The new Jest test lacked explicit globals for project typechecking, and React Native 0.86's `TextStyle` type excludes the valid variable-axis weight `890` required by the approved oracle.
   - **Fix:** Imported Jest globals explicitly and confined an `unknown as TextStyle` bridge to the development-only proof style, preserving the exact `890` value instead of rounding to `800`.
   - **Files modified:** `src/testing/phase14FontProof.test.ts`, `app/__phase2-attended-preview.tsx`
   - **Verification:** focused unit/component tests and `npm run typecheck`
   - **Committed in:** `41fbb97`, `a75e8e3`

2. **[Rule 1 - Bug] Made capture-case identity unambiguous for the report verifier**
   - **Found during:** Task 2
   - **Issue:** Parsing repeated case literals could conflate the type declaration with capture data and invalidate an otherwise correct native report.
   - **Fix:** Added one explicit `PHASE14_FONT_PROOF_CASE_IDS` registry in the source oracle and validate report order against that registry.
   - **Files modified:** `src/testing/phase14FontProof.ts`, `scripts/run-phase14-font-proof.mjs`, `scripts/phase14-font-proof.test.mjs`
   - **Verification:** `node --test scripts/phase14-font-proof.test.mjs`
   - **Committed in:** `a75e8e3`

**Total deviations:** 2 auto-fixed Rule 1 issues. Both preserve the approved 890-axis contract and fail-closed evidence path without expanding product scope.

## Issues Encountered

None remaining. The source plan intentionally does not make a native fidelity claim or run CNG, an APK build, an install, or a device action.

## User Setup Required

None for this source-authoring plan. Plan 14-02 requires exactly one ready Android device/emulator and a clean exact HEAD for its attended/native proof.

## Next Phase Readiness

Plan 14-02 can build the `phase14-font-proof` development-test APK from this committed source and validate the retained source/APK/report identity before judging font fidelity. A native mismatch must remain a measured technical blocker; it must not switch typography or map 890 to 800.

## Self-Check: PASSED

- All ten planned source, test, runner, asset, and Maestro files exist.
- All four TDD commits (`60b4037`, `41fbb97`, `e58f934`, `a75e8e3`) exist in git history.
- Focused unit, component, runner, typecheck, and boundary verification passed on the committed implementation.

---
*Phase: 14-prototype-visual-shell*
*Completed: 2026-10-08*
