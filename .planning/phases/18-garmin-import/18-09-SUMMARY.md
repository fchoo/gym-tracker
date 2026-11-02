---
phase: 18-garmin-import
plan: 09
subsystem: running-activity-matching
tags: [garmin, running, sqlite, react-native, idempotency, tdd]
requires:
  - phase: 13-multi-plan-running-foundation
    provides: immutable imported activity facts, match ledger, receipts, and one-to-one current relation
  - phase: 17-library-running-plans
    provides: stable ordered Running slots, session revisions, plan-day anchors, schedules, and opportunities
  - phase: 18-07
    provides: accepted Garmin payload revisions and application-owned import runtime boundary
provides:
  - zero-write stable Running candidate query ordered by local date and slot ordinal
  - explicit confirm-only match command with accepted payload and complete source revision fences
  - audited replay-safe match, unmatch, and reassignment transitions with monotonic relation revisions
  - opaque-local-ID match route and accessible shared-appearance candidate screen
affects: [18-10, 18-11, 18-13, 19-progress, 20-native-acceptance]
actuals:
  tokens: 25719
  tasks: 3
  commits: 7
tech-stack:
  added: []
  patterns: [query-command separation, exact candidate envelope, replay-first serialized transaction, screen-local selection]
key-files:
  created:
    - app/garmin/match/[activityId].tsx
    - app/__tests__/garmin-match-route.test.tsx
    - src/ui/screens/ActivityMatchScreen.tsx
    - src/ui/__tests__/ActivityMatchScreen.test.tsx
  modified:
    - src/domains/running/activityMatchCommands.ts
    - src/platform/sqlite/repositories/runningActivityMatchRepository.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - tests/integration/running-activity-match.test.ts
key-decisions:
  - "Candidate reads return stable identities and display facts only; ranking, radio changes, Back, and Leave unmatched never call a writer."
  - "Confirm hashes and revalidates the accepted payload plus opportunity, schedule, plan-day, slot, session, and relation revisions inside one serialized transaction."
  - "The immutable event ledger owns monotonic relation history while running_activity_current_matches remains the one-to-one current projection."
  - "The route accepts only bounded opaque local activity IDs; screens receive typed candidates and never import platform or SQL modules."
patterns-established:
  - "Match retry pattern: retain one prepared request after a thrown acknowledgement failure, then replay the same canonical receipt envelope."
  - "Candidate ordering pattern: local date, stable slot ordinal, then opportunity ID; no similarity, FIT, title, distance, or digest fallback participates."
requirements-completed: [GAR-13, GAR-14]
coverage:
  - id: D18-09-CANDIDATES
    description: Stable same-day Running candidates are ordered and selectable without any match, event, or receipt write
    requirement: GAR-13
    verification:
      - kind: unit
        ref: src/domains/running/activityMatchCommands.test.ts#queries by one opaque local activity ID
        status: pass
      - kind: integration
        ref: tests/integration/running-activity-match.test.ts#reads stable same-day candidates in slot order without writing
        status: pass
      - kind: automated_ui
        ref: src/ui/__tests__/ActivityMatchScreen.test.tsx#keeps ranked and alternate selection local
        status: pass
    human_judgment: false
  - id: D18-09-CONFIRM
    description: Explicit Confirm commits exactly the selected accepted payload and stable Running occurrence once
    requirement: GAR-14
    verification:
      - kind: unit
        ref: src/domains/running/activityMatchCommands.test.ts#accepted payload and stable source revisions
        status: pass
      - kind: integration
        ref: tests/integration/running-activity-match.test.ts#confirmation replay stale fences and transition matrix
        status: pass
      - kind: automated_ui
        ref: app/__tests__/garmin-match-route.test.tsx#confirms the exact alternate stable candidate
        status: pass
    human_judgment: false
  - id: D18-09-ROUTE-ACCESSIBILITY
    description: The opaque-ID route and screen preserve shared appearance, Back priority, visible focus, 48dp targets, and compact or expanded reflow
    requirement: GAR-13
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/ActivityMatchScreen.test.tsx#appearance Back focus and reflow
        status: pass
      - kind: other
        ref: npm run typecheck && npm run check:boundaries
        status: pass
    human_judgment: false
duration: 21m 17s
completed: 2026-10-11
status: complete
---

# Phase 18 Plan 09: Stable Running Activity Matching Summary

**Explicit confirm-only Garmin matching now binds one accepted payload revision to one stable Running occurrence through a replay-safe serialized SQLite transaction and an opaque-ID accessible route.**

## Performance

- **Duration:** 21m 17s
- **Started:** 2026-10-11T09:57:12Z
- **Completed:** 2026-10-11T10:18:29Z
- **Tasks:** 3
- **Files modified:** 13
- **Commits:** 6 TDD commits plus this metadata commit

## Accomplishments

- Added a zero-write candidate query that exposes plan, session, date/time availability, target, stable slot order, accepted payload revision, and all source/relation fences without similarity or FIT/hash fallback matching.
- Added replay-first confirm, unmatch, and reassignment behavior that revalidates accepted payload, opportunity, schedule, plan-day, slot, session, and one-to-one relation state within one serialized transaction.
- Added an opaque-local-ID route and accessible match screen with exact alternate selection, duplicate-activation protection, shared Appearance, modal-first Back, visible focus, 48dp targets, and compact/expanded reflow.

## Task Commits

1. **18-09-01 RED — stable match confirmation:** `56814a90`
2. **18-09-01 GREEN — stable candidate query and explicit confirmation:** `656ece75`
3. **18-09-02 RED — transition safety matrix:** `ed638b58`
4. **18-09-02 GREEN — audited revision-fenced transitions:** `2120555a`
5. **18-09-03 RED — opaque route and accessibility:** `a4468bbb`
6. **18-09-03 GREEN — validated route and application runtime port:** `0f01f672`

## Files Created/Modified

- `src/domains/running/activityMatchCommands.ts` — typed candidate/read contracts, complete confirmation envelope validation, canonical request preparation, and transition identity guards.
- `src/platform/sqlite/repositories/runningActivityMatchRepository.ts` — zero-write candidate reads plus replay-first, source-fenced, one-to-one serialized writes.
- `src/ui/screens/ActivityMatchScreen.tsx` — local radio selection, confirm-only mutation, bounded recovery states, Appearance, Back priority, focus, and reflow.
- `app/garmin/match/[activityId].tsx` — validated opaque-local-ID route and application-runtime composition.
- `src/bootstrap/workoutAppRuntime.tsx` — sole-kernel match repository wiring and retained retry envelope for lost acknowledgement.
- `src/domains/running/activityMatchCommands.test.ts` — unit proof for complete fences, query delegation, canonical preparation, and transition identity validation.
- `src/ui/__tests__/ActivityMatchScreen.test.tsx` — selection, zero-write exits, duplicate activation, state, appearance, focus, target size, and reflow coverage.
- `app/__tests__/garmin-match-route.test.tsx` — route identity, exact candidate forwarding, and Back/Leave boundary coverage.
- `tests/integration/running-activity-match.test.ts` — real-SQLite candidate, commit, replay, stale/conflict, unmatch/reassign, immutability, and one-to-one proof.
- `src/testing/contracts/multiPlanRunning.contract.ts`, `tests/integration/garmin-envelope-import.test.ts`, `tests/integration/garmin-sync.test.ts`, and `tests/sqlite-host/restoreReconciliationRepository.test.ts` — compile-compatible complete match envelopes after the strengthened port type.

## Decisions Made

- Candidate order is deterministic source order: local date, stable slot ordinal, then opportunity ID. No inferred similarity participates.
- An opportunity is revision 1 because the source row is immutable; all mutable or append-only surrounding facts carry their own explicit revisions or stable revision IDs.
- Replays are checked before current-source validation so a lost acknowledgement can recover its committed result without rewriting current facts.
- Relation revision comes from the immutable event ledger, including after unmatch or invalidation, so a later match cannot reset or resurrect an older relation revision.

## TDD Gate Compliance

- Task 1: RED `56814a90` → GREEN `656ece75`.
- Task 2: RED `ed638b58` → GREEN `2120555a`.
- Task 3: RED `a4468bbb` → GREEN `0f01f672`.

## Verification

- `npm run test:unit -- --runInBand src/domains/running/activityMatchCommands.test.ts` — 6 passed.
- `npm run test:components -- --runInBand src/ui/__tests__/ActivityMatchScreen.test.tsx app/__tests__/garmin-match-route.test.tsx` — 17 passed.
- `npm run test:integration -- --runInBand tests/integration/running-activity-match.test.ts` — 9 passed against real SQLite.
- `npm run typecheck` — passed.
- `npm run check:boundaries` — passed across 390 files.

No full/global suite or coverage run, SQLite-host suite, APK/device/native/screenshot matrix, broad visual/accessibility/performance checkpoint, release, push, PR, publication, or deployment was performed. Those remain owned by Phase 20 or later delivery work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Extended the shared SQLite repository beyond the frontmatter file list**
- **Found during:** Task 18-09-01
- **Issue:** The existing repository ignored the accepted payload and opportunity revision and had no schedule, plan-day, stable slot, or session revision revalidation path, so the planned command could not satisfy D-18-10.
- **Fix:** Added zero-write candidate reads and revalidated every carried source fence plus the current relation inside the existing serialized write transaction.
- **Files modified:** `src/platform/sqlite/repositories/runningActivityMatchRepository.ts`
- **Verification:** Named unit and real-SQLite match suites passed.
- **Committed in:** `656ece75`, `2120555a`

**2. [Rule 2 - Missing critical functionality] Wired the route through the application-owned runtime**
- **Found during:** Task 18-09-03
- **Issue:** A thin route could not invoke the shared repository without either exposing SQL/platform ownership to the screen or adding an application port.
- **Fix:** Added query/confirm methods to the existing runtime, constructed the repository from the sole application kernel, and retained a prepared envelope only across thrown acknowledgement failures.
- **Files modified:** `src/bootstrap/workoutAppRuntime.tsx`
- **Verification:** Route/component tests, typecheck, and boundary checks passed.
- **Committed in:** `0f01f672`

**3. [Rule 3 - Blocking] Updated directly affected compatibility fixtures for the strengthened match port**
- **Found during:** Task 18-09-03 typecheck
- **Issue:** Four existing contract/test fixtures still constructed the pre-18-09 command shape and blocked strict compilation.
- **Fix:** Supplied only the newly mandatory accepted payload, plan, schedule, plan-day, slot, and session fences; the Phase 13 rematch fixture also now carries the monotonic post-invalidation relation revision.
- **Files modified:** `src/testing/contracts/multiPlanRunning.contract.ts`, `tests/integration/garmin-envelope-import.test.ts`, `tests/integration/garmin-sync.test.ts`, `tests/sqlite-host/restoreReconciliationRepository.test.ts`
- **Verification:** Strict typecheck passed; broader suites remained intentionally unrun under the targeted-checkpoint boundary.
- **Committed in:** `0f01f672`

**4. [Rule 1 - Bug] Removed an introduced cross-domain parser import**
- **Found during:** Task 18-09-03 boundary verification
- **Issue:** The first implementation imported an Activities-internal local-ID parser into the Running domain.
- **Fix:** Enforced the same bounded opaque-local-ID grammar locally at the Running boundary, leaving the route on the Activities parser and restoring domain isolation.
- **Files modified:** `src/domains/running/activityMatchCommands.ts`
- **Verification:** Boundary check passed across 390 files.
- **Committed in:** `0f01f672`

---

**Total deviations:** 4 auto-fixed (2 Rule 2, 1 Rule 3, 1 Rule 1).
**Impact on plan:** All changes were required to enforce the declared transaction, route, or compile boundary; no alternate architecture, schema change, provider fallback, or scope expansion was introduced.

## Issues Encountered

- The first strict boundary run detected the cross-domain parser import; it was removed before the Task 3 GREEN commit.
- Existing match fixtures required complete source fences after the port became intentionally stricter; only their command construction changed.

## Authentication Gates

None. No Garmin credentials, account calls, external provider requests, or secret-bearing inputs were used.

## Known Stubs

None. The modified files contain no TODO/FIXME, placeholder state, skipped tests, or unwired empty production data sources.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Later Phase 18 plans can consume the confirmed one-to-one relation and immutable event revision without re-resolving candidates.
- Phase 19 can derive factual Running progress from the accepted payload revision pinned by the match event.
- Phase 20 retains the comprehensive native/device/APK, visual, accessibility, performance, recovery, and global verification matrix.
- Dirty Phase 14 evidence files and untracked `14-VERIFICATION.md` remain untouched and unstaged.

## Self-Check: PASSED

Verified the four primary production artifacts exist, all six TDD commits are reachable, all required co-author trailers are present, and the final targeted checkpoint is green.

---
*Phase: 18-garmin-import*
*Completed: 2026-10-11*
