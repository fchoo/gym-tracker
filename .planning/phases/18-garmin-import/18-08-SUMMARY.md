---
phase: 18-garmin-import
plan: 08
subsystem: imported-activity-detail
tags: [garmin, react-native, expo-router, accessibility, factual-projection, tdd]
requires:
  - phase: 18-07
    provides: Accepted local imported-activity revisions and application-owned SQLite runtime
  - phase: 14-prototype-visual-shell
    provides: Shared Appearance, adaptive screen, focus, Back, and 48dp action primitives
provides:
  - Accepted-revision-only outdoor and treadmill activity detail projection
  - Accessible factual route, HR, lap, duration, pace-basis, and fidelity presentation
  - Validated opaque-local-ID detail route with bounded Calendar return context
affects: [18-09, 16-calendar-parity, 19-progress-parity, imported-activity-history]
actuals:
  tokens: 13754
  tasks: 3
  commits: 7
tech-stack:
  added: []
  patterns: [accepted-digest projection gate, source-present optional facts, bounded local route identity, semantic stacked lap rows]
key-files:
  created:
    - src/domains/activities/activityDetails.ts
    - src/domains/activities/activityDetails.test.ts
    - src/ui/screens/ImportedActivityDetailScreen.tsx
    - src/ui/__tests__/ImportedActivityDetailScreen.test.tsx
    - app/garmin/activity/[activityId].tsx
    - app/__tests__/garmin-activity-route.test.tsx
  modified:
    - src/bootstrap/workoutAppRuntime.tsx
key-decisions:
  - "Detail projection requires the current accepted digest and exposes no account namespace, external activity ID, raw response, or provider fallback."
  - "Average pace uses the first positive source-present basis in Moving, Timer, Elapsed order while every displayed duration keeps its own label."
  - "The detail route accepts only prefixed local activity IDs; Calendar context is a bounded non-navigational token and Back always uses the route stack."
patterns-established:
  - "Accepted imported facts cross one pure projection before UI; malformed or digest-mismatched aggregates fail closed."
  - "Lap rows preserve source order and table semantics, then stack label/value cells at compact width or 200% font scale."
requirements-completed: [GAR-10, GAR-11, GAR-12, GAR-15, GAR-16]
coverage:
  - id: D18-08-ACCEPTED-DETAIL
    description: Accepted outdoor detail shows only source-present summary, duration, route, HR, lap, and fidelity facts
    requirement: GAR-10
    verification:
      - kind: unit
        ref: src/domains/activities/activityDetails.test.ts#projectImportedActivityDetail accepted outdoor facts
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/ImportedActivityDetailScreen.test.tsx#accepted outdoor activity
        status: pass
    human_judgment: false
  - id: D18-08-TRUTHFUL-MATRIX
    description: Treadmill, outdoor missing channels, zero distance, lap gaps, large lists, fidelity, and 200% reflow remain truthful and accessible
    requirement: GAR-11
    verification:
      - kind: unit
        ref: src/domains/activities/activityDetails.test.ts#truthfulness matrix
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/ImportedActivityDetailScreen.test.tsx#missing-channel and reflow matrix
        status: pass
    human_judgment: false
  - id: D18-08-LOCAL-ROUTE
    description: Local detail route rejects provider identities and renders loading, recovery, Appearance, Back, and match navigation without mutation authority
    requirement: GAR-15
    verification:
      - kind: automated_ui
        ref: app/__tests__/garmin-activity-route.test.tsx#local identity boundary
        status: pass
      - kind: other
        ref: npm run typecheck && npm run check:boundaries
        status: pass
    human_judgment: false
duration: 19m 47s
completed: 2026-10-11
status: complete
---

# Phase 18 Plan 08: Truthful Imported Activity Detail Summary

**Accepted local Garmin revisions now render as factual read-only outdoor or treadmill detail with distinct time bases, accessible laps, explicit fidelity, and a validated local-only route.**

## Performance

- **Duration:** 19m 47s
- **Started:** 2026-10-11T09:33:59Z
- **Completed:** 2026-10-11T09:53:46Z
- **Tasks:** 3
- **Files modified:** 7
- **Commits:** 6 TDD commits plus this metadata commit

## Accomplishments

- Added a fail-closed accepted-revision projection that keeps elapsed, timer, and moving evidence distinct; derives pace only from positive source-present distance/time; filters route positions; and never exposes account, external, raw-response, or provider identity.
- Added read-only outdoor/treadmill presentation with explicit `No route` and `Route unavailable`, optional HR, exact `Lap`, `Time`, `Pace` headers, truthful unavailable cells, source-order preservation, sampled-data disclosure, and compact/200% semantic row stacking.
- Added the real `/garmin/activity/[activityId]` destination with prefixed local-ID validation, a bounded `origin=calendar` return-token producer, stack Back, shared Appearance/focus restoration, retry-safe failure states, and local-only match navigation.

## Task Commits

1. **18-08-01 RED — accepted outdoor detail tests:** `59b66339`
2. **18-08-01 GREEN — accepted outdoor projection and screen:** `96a0db85`
3. **18-08-02 RED — truthfulness and reflow matrix:** `539b2463`
4. **18-08-02 GREEN — treadmill/missing/lap states:** `160429d2`
5. **18-08-03 RED — local route and recovery states:** `f2ba6235`
6. **18-08-03 GREEN — validated runtime-backed detail route:** `3625948a`

## Files Created/Modified

- `src/domains/activities/activityDetails.ts` — accepted aggregate validation, factual display projection, route filtering, pace basis, fidelity, and local-ID parsing.
- `src/domains/activities/activityDetails.test.ts` — accepted outdoor, treadmill, missing-channel, zero-distance, lap-order/gap/scale, digest, and fidelity tests.
- `src/ui/screens/ImportedActivityDetailScreen.tsx` — adaptive read-only detail, shared header/Appearance/Back, route alternative, HR, semantic laps, fidelity, and bounded recovery states.
- `src/ui/__tests__/ImportedActivityDetailScreen.test.tsx` — factual, accessibility, unavailable-state, reflow, Appearance, Back, and 48dp component matrix.
- `app/garmin/activity/[activityId].tsx` — local-only route loader, retry, match navigation, and Calendar producer contract.
- `app/__tests__/garmin-activity-route.test.tsx` — route identity, fallback rejection, retry, Back, match, and bounded-return-token tests.
- `src/bootstrap/workoutAppRuntime.tsx` — narrow read-only accepted activity query exposed through the application runtime.

## Decisions Made

- Source subtype is rendered only from the accepted canonical payload; provider identity is never used as a title fallback.
- Moving time is preferred for pace only when positive and present, then Timer, then Elapsed. Missing or zero-invalid pace evidence produces no pace claim.
- Treadmill route facts are always suppressed even if stray positions appear; outdoor routes require at least one validated two-point segment.
- Source revision review renders a bounded no-detail state. It does not display proposed/raw facts or add use/keep mutation controls in this read-only plan.

## Verification

- `npm run test:unit -- --runInBand src/domains/activities/activityDetails.test.ts` — 10 passed.
- `npm run test:components -- --runInBand src/ui/__tests__/ImportedActivityDetailScreen.test.tsx app/__tests__/garmin-activity-route.test.tsx` — 25 passed.
- `npm run typecheck` — passed.
- `npm run check:boundaries` — passed across 388 files.

Per the targeted checkpoint, no full/global suite or coverage run, APK/device/native/screenshot matrix, broad visual/accessibility/performance checkpoint, release, push, PR, publication, or deployment was performed. Phase 20 retains comprehensive acceptance ownership.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added the application-owned accepted activity detail read capability**
- **Found during:** Task 18-08-03
- **Issue:** The planned route had no existing runtime read method and could not load SQLite-authoritative accepted detail without importing platform SQL into the route.
- **Fix:** Added a narrow `loadImportedActivityDetail` runtime method that selects only local ID, accepted digest/revision, lifecycle, and aggregate, then delegates to the pure domain projection.
- **Files modified:** `src/bootstrap/workoutAppRuntime.tsx`, `src/domains/activities/activityDetails.ts`
- **Verification:** Route component tests, strict type check, and boundary check passed; privacy scan found no logging or provider/raw identity projection.
- **Committed in:** `3625948a`

---

**Total deviations:** 1 auto-fixed (1 Rule 2).
**Impact on plan:** Required production wiring was added without a new persistence model, service layer, schema, mutation path, or provider fallback.

## Issues Encountered

- The strict type gate found exact-optional fixture assignments and readonly Jest table typing that component execution does not surface. The fixtures/tables were corrected to the existing TypeScript contract before Task 3 completion.

## Authentication Gates

None. No Garmin credentials, MFA, account request, external provider call, or secret-bearing input was used.

## Known Stubs

None. Stub/privacy scans found no production placeholder, TODO/FIXME, empty UI data source, personal-fact logging, raw payload logging, identifier logging, SQL-parameter logging, filename logging, credential/token logging, or mutation placeholder.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 18-09 can link imported activity rows to this local-only detail destination and build explicit owner-confirmed matching without re-projecting provider payloads.
- Phase 16 can consume `createImportedActivityDetailHref` with `origin=calendar` and a bounded return token, without Phase 18 importing Calendar code.
- Phase 19 can consume accepted source summary/lap fidelity while sampled arbitrary-distance claims remain unavailable.
- Dirty Phase 14 evidence files and untracked `14-VERIFICATION.md` remain untouched and unstaged.

## Self-Check: PASSED

Verified all seven changed implementation/test files and this summary exist; all six TDD commits are reachable with the required TRAE co-author trailer; all three coverage deliverables classify as automatically proven; and the final targeted unit/component/route/type/boundary gates pass.

---
*Phase: 18-garmin-import*
*Completed: 2026-10-11*
