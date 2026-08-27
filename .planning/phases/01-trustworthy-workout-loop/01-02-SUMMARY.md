---
phase: 01-trustworthy-workout-loop
plan: 02
subsystem: ui
tags: [react-native, expo-router, accessibility, adaptive-layout, theme, tdd]

requires:
  - 01-01 native prerequisite and locked Expo SDK 57 package set
  - 01-03 Jest component project and architecture boundary tooling
provides:
  - Approved precision-instrument design tokens and repository design source
  - Accessible System, Light, and Dark appearance provider with an injected Phase 1 process-memory store
  - Compact, medium, and expanded safe-area layout primitives
  - Four-destination root shell with exact Phase 1 empty destinations
  - Focused Active Workout route outside root navigation
  - RNTL proof for appearance, dimensions, semantics, large text, reduced motion, and route behavior
affects: [01-07-today, 01-08-active-workout, 01-09-rest, 01-10-completion, phase-02-library, phase-03-calendar, phase-04-progress]

tech-stack:
  added: []
  patterns:
    - Repository-owned React Native tokens and primitives with Lucide 2dp icons
    - Injected AppearanceStore with a process-memory Phase 1 adapter and future SQLite replacement seam
    - Route-only Expo Router adapters with UI composition under src/ui
    - RED component contract commits preceding every behavior implementation

key-files:
  created:
    - DESIGN.md
    - app/(tabs)/_layout.tsx
    - app/(tabs)/index.tsx
    - app/(tabs)/calendar.tsx
    - app/(tabs)/library.tsx
    - app/(tabs)/progress.tsx
    - app/workout/[sessionId].tsx
    - src/ui/theme/index.ts
    - src/ui/layout/AdaptiveScreen.tsx
    - src/ui/components/index.ts
    - src/ui/screens/RootScreens.tsx
    - src/ui/__tests__/foundation.test.tsx
  modified:
    - app/_layout.tsx
    - package.json

key-decisions:
  - "Appearance persistence uses an injected store and a process-memory Phase 1 adapter; it deliberately avoids AsyncStorage and is replaced by the later authoritative SQLite settings repository."
  - "The root shell renders structured Today placeholders and disabled navigation immediately while fonts or launch data are untrusted."
  - "Trusted Today and the focused Active Workout remain structural skeletons until their source-backed feature slices land; no later-phase explanatory UI is exposed."
  - "Expo Router route files remain adapters only; shared UI owns semantics, appearance, adaptive layout, and intentional empty destinations."

requirements-completed: [FOUND-02, FOUND-07, FOUND-08, FOUND-09]

coverage:
  - id: FOUND-02
    description: "The app uses the exact approved Source Sans 3, IBM Plex Mono, spacing, radius, sizing, color, and motion vocabulary."
    requirement: FOUND-02
    verification:
      - kind: automated_ui
        ref: "npm run test:components -- foundation --runInBand"
        status: pass
      - kind: other
        ref: "DESIGN.md and src/ui/theme/index.ts"
        status: pass
    human_judgment: false
  - id: FOUND-07
    description: "System, Light, and Dark validate preferences, expose selected semantics, preserve provider state, and use the documented process-memory seam."
    requirement: FOUND-07
    verification:
      - kind: automated_ui
        ref: "appearance preference, malformed fallback, and process-store remount tests"
        status: pass
    human_judgment: false
  - id: FOUND-08
    description: "Compact, medium, expanded, safe-area, 200% text, minimum target, focus, semantic, non-color, and reduced-motion contracts are shared primitives."
    requirement: FOUND-08
    verification:
      - kind: automated_ui
        ref: "adaptive width, target dimension, semantic notice, skeleton, and reduced-motion tests"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run lint"
        status: pass
    human_judgment: false
  - id: FOUND-09
    description: "Today, Calendar, Library, and Progress are ordered root destinations; Active Workout hides root navigation; exact Phase 1 empty states are navigable."
    requirement: FOUND-09
    verification:
      - kind: automated_ui
        ref: "root order, disabled boot shell, exact empty copy, focused route, and Back history tests"
        status: pass
    human_judgment: false

duration: 27 min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 2: Accessible UI Foundation and Root Shell Summary

**Exact precision-instrument tokens, adaptive accessible primitives, and a four-root Expo Router shell with immediate structured loading and intentional Phase 1 destinations**

## Performance

- **Duration:** 27 min
- **Started:** 2026-08-16T00:56:36Z
- **Completed:** 2026-08-16T01:23:18Z
- **Tasks:** 2
- **Files changed:** 14
- **Component tests:** 31 passed

## Accomplishments

- Extracted the approved Phase 1 visual, voice, accessibility, motion, focus, safe-area, large-text, and adaptive rules into `DESIGN.md` and executable theme/layout primitives.
- Implemented validated `System`, `Light`, and `Dark` appearance selection with selected radio semantics, malformed-value fallback, focus restoration, and a narrow injected process-memory persistence seam.
- Built the locked `Today`, `Calendar`, `Library`, `Progress` root shell, immediate structured boot surface, disabled untrusted navigation, exact intentional empty destinations, and history Back behavior.
- Kept `Active Workout` outside the tab group with no root navigation at compact, medium, or expanded widths.
- Preserved the phase boundary: no SQL, platform adapters, AsyncStorage, native generation, package installation, fake workout data, or later-phase Calendar/Library/Progress controls.

## Task Commits

### Task 1: Encode the design system and adaptive accessibility primitives

- **RED:** `d54dbe1` — component contracts failed because the Plan 01-02 UI modules did not exist.
- **GREEN:** `fb366e2` — tokens, appearance, adaptive layout, shared components, and `DESIGN.md`.

### Task 2: Build the route-only shell and intentional Phase 1 destinations

- **RED:** `48d3cd7` — route-shell contracts failed because `RootScreens` did not exist.
- **GREEN:** `3792434` — provider composition, four roots, exact empty destinations, focused workout route, and history Back behavior.

### Review Regressions

- **RED:** `c002c12` — proved font loading must render an immediate shell and malformed preference values must select `System`.
- **GREEN:** `ed1cc5a` — replaced the blank font-loading return with structured Today placeholders and four disabled roots.
- **REFACTOR:** `c3a8a7b` — deleted the duplicate commented component draft with all behavior still green.
- **RED:** `951e80c` — rejected future-slice explanatory copy and proved process-memory remount/reset boundaries.
- **GREEN:** `b1a1eb8` — replaced trusted Today and Active Workout explanatory content with neutral structural skeletons.

## Files Created/Modified

- `DESIGN.md` — repository-owned visual, adaptive, motion, focus, accessibility, voice, and appearance contract.
- `src/ui/theme/index.ts` — fonts, tokens, color schemes, motion, validated appearance preferences, and injected store.
- `src/ui/layout/AdaptiveScreen.tsx` — compact/medium/expanded safe-area screen with active-work/dock adjacency.
- `src/ui/components/index.ts` — shared actions, headers, tabs, notices, states, sheets, plan/exercise rows, and skeletons.
- `src/ui/screens/RootScreens.tsx` — launch state, immediate loading shell, Today structure, exact intentional empty roots, and focused workout placeholder.
- `app/_layout.tsx` — fonts, safe areas, appearance, launch state, root stack, and immediate font-loading shell.
- `app/(tabs)/*` — locked four-root tab composition and thin route adapters.
- `app/workout/[sessionId].tsx` — thin focused-workout route outside root navigation.
- `src/ui/__tests__/foundation.test.tsx` — 23 component contracts.
- `package.json` — replaced only the explicit `test:components` missing-suite command with the existing Jest `components` project.

## Decisions Made

- The appearance store interface is the durable boundary. The Phase 1 implementation persists only in process memory and intentionally resets with a fresh store/process. No AsyncStorage dependency or hidden storage path was added.
- Invalid or stale appearance values parse as `System`; the rendered scheme then follows Android, falling back to Light when the platform returns no scheme.
- Root navigation remains visible but disabled until fonts and launch state are trusted. Loading content contains shapes only, never stale serialized workout facts.
- `Today` and `Active Workout` use neutral, accessibility-hidden structure where source-backed feature UI belongs later, rather than user-facing “coming later” copy or fake data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored immediate shell rendering during font loading**
- **Found during:** Early review after Task 2
- **Issue:** `app/_layout.tsx` returned `null` while approved fonts loaded, violating the shell-immediate and structured-placeholder contract.
- **Fix:** Added `AppLoadingShell` with Today structure and four disabled root destinations.
- **Files modified:** `app/_layout.tsx`, `src/ui/screens/RootScreens.tsx`, `src/ui/__tests__/foundation.test.tsx`
- **Verification:** `renders an immediate structured shell while fonts load`
- **Committed in:** `c002c12`, `ed1cc5a`

**2. [Rule 1 - Bug] Removed committed duplicate commented implementation**
- **Found during:** Early review after Task 2
- **Issue:** The locked `.ts` component index retained a large commented JSX draft after conversion to `React.createElement`.
- **Fix:** Deleted 1,064 lines of dead commented code; retained only the verified live implementation.
- **Files modified:** `src/ui/components/index.ts`
- **Verification:** No `/*` or `*/` remains; component, typecheck, and lint gates pass.
- **Committed in:** `c3a8a7b`

**3. [Rule 2 - Missing Critical] Removed future-phase explanatory placeholder UI**
- **Found during:** Plan-level stub and phase-boundary scan
- **Issue:** Trusted Today and Active Workout showed slice-specific explanatory copy not approved by the UI contract.
- **Fix:** Replaced the text with neutral structural skeletons and added regressions rejecting future-phase copy.
- **Files modified:** `src/ui/screens/RootScreens.tsx`, `src/ui/__tests__/foundation.test.tsx`
- **Verification:** `keeps trusted Today structural without unapproved future-phase copy` and focused-route loop.
- **Committed in:** `951e80c`, `b1a1eb8`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical phase-boundary safeguard).
**Impact on plan:** All fixes strengthen the specified shell, accessibility, and phase boundary without adding product scope or dependencies.

## Authentication Gates

None.

## Known Stubs

| Stub | File | Reason |
|---|---|---|
| Structured Today skeleton slots | `src/ui/screens/RootScreens.tsx` | Intentional Plan 01-02 shell contract; source-backed Today content lands in Plan 01-07. |
| Focused workout skeleton slots | `src/ui/screens/RootScreens.tsx` | Intentional Plan 01-02 route placeholder; working-set UI lands in Plan 01-08. |
| Process-memory appearance store | `src/ui/theme/index.ts` | Explicit user-approved Phase 1 seam; authoritative SQLite settings repository lands later. |

These stubs do not block the Plan 01-02 goal: they preserve layout, accessibility, route focus, and phase boundaries without presenting fake source facts or future controls.

## Threat Flags

None. The plan introduced navigation and local appearance UI only; no network endpoint, auth path, file access, schema change, SQL boundary, or native trust surface was added. Threat mitigations for semantic spoofing, large-text denial of service, malformed appearance values, and npm supply-chain scope are covered by component tests and the no-install execution record.

## Verification

- `npm run test:components -- foundation --runInBand` — PASS, 31/31 tests.
- `npm run typecheck` — PASS.
- `npm run lint` — PASS, boundary check over 20 application files.
- Exact root order scan — PASS: Today, Calendar, Library, Progress.
- Exact empty-state copy scan — PASS for Calendar, Library, Progress, and `Go to Today`.
- Later-phase control/copy scan — PASS.
- Route/UI SQL and platform-import scan — PASS.
- AsyncStorage/install/native-command scan — PASS.
- Owned-file diff check — PASS; no Plan 01-03 or global bookkeeping files changed.
- Commit trailer check — PASS; every Plan 01-02 commit contains the required trailer exactly once.
- No Expo prebuild, Gradle, package installation, or native build was run.

## Self-Check: PASSED

- All 13 declared Plan 01-02 implementation/test artifacts exist.
- All nine pre-summary Plan 01-02 commits exist.
- No tracked file deletion occurred.
- The only remaining untracked path is orchestrator-owned `.planning/current-agent-id.txt`, intentionally untouched.
- `STATE.md`, `ROADMAP.md`, and `REQUIREMENTS.md` were not modified, per orchestrator ownership.

---
*Phase: 01-trustworthy-workout-loop*
*Completed: 2026-08-16*
