# Phase 18 — UI Review

**Audited:** 2026-10-12  
**Baseline:** `18-UI-SPEC.md`, owner decisions/brief, `v1.2-SOURCE-PRECEDENCE.md`, Revision 18 host source, and shared Phase 14 primitives  
**Evidence boundary:** Host source, component tests, and route tests only  
**Screenshots:** Not captured — no host dev server responded on ports 3000, 5173, or 8080; native screenshots and physical-device evidence are explicitly deferred to Phase 20 and are pending, not failed

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Actions and recovery copy are specific, but history and match rows omit required source-backed state copy. |
| 2. Visuals | 2/4 | The Garmin root is outside the persistent four-root shell despite using an inert Back placeholder; history hierarchy also drops match state. |
| 3. Color | 4/4 | Targeted production screens use shared semantic theme roles with zero hardcoded colors. |
| 4. Typography | 2/4 | Sizes and weights reuse Phase 14 roles, but dates, times, counts, distances, paces, and lap values incorrectly use Archivo instead of IBM Plex Mono. |
| 5. Spacing | 3/4 | Shared spacing tokens are used consistently, but fixed horizontal fact/candidate rows do not implement the required 200% text reflow. |
| 6. Experience Design | 1/4 | Date review, source-revision decisions, unmatch/reassign, and required focus/Back transitions are incomplete or unreachable. |

**Overall: 15/24**

**Release posture:** Not ready against the Phase 18 UI contract. Phase 20 native evidence remains pending, but it cannot close the host-source blockers below.

---

## Top 3 Priority Fixes

1. **Restore the four-root shell around Garmin** — The root shows an inert Back placeholder but is pushed as a sibling of `(tabs)`, so the approved Workout/Calendar/Library/Progress navigation is not visible and there is no touch-visible exit. Host Garmin inside the existing shell or render the existing `AppTabs` contract with the validated origin selected; do not add a Garmin tab.
2. **Finish import review workflows** — Ambiguous dates stop at non-actionable `Confirm the activity date` copy, while durable source-revision proposals stop at `Needs review` without factual differences or Use/Keep actions. Wire date confirmation through `prepareEnvelope`/`confirmPreparedDate`, and revision review through `listGarminRevisionReviews`/`resolveGarminRevision` with revision-fenced recovery.
3. **Complete match lifecycle and navigation semantics** — `Leave unmatched` only navigates Back, and no product path issues `unmatch` or `reassign`; Back can also leave while Confirm is still committing. Add explicit unmatch/reassign review states, block or safely reconcile Back during commit, and restore focus to the exact initiating control.

---

## Evidence Boundary and Phase 20 Pending Checks

The following are intentionally **pending Phase 20 evidence**, not Phase 18 failures in this review:

- Light, Dark, and live System screenshots on the installed app.
- Native captures at 360×800, 390×844, 600×960, 840×1080-equivalent, landscape, and 200% font scale.
- Physical 48dp target bounds, contrast/blended-fill measurements, clipping/overflow, keyboard/IME avoidance, and route rendering.
- Hardware Back, keyboard, D-pad, TalkBack/switch traversal, visible focus, exact trigger restoration, and reduced-motion behavior.
- Real Garmin login/MFA/session restart, account sync, and physical-device performance evidence.

Host tests establish deterministic component behavior only; they do not substitute for these Phase 20 checks.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **WARNING — Required row state copy is missing.** The runtime supplies `matchState` and `revisionState` for every activity (`src/bootstrap/workoutAppRuntime.tsx:2737`), but the row renders title, type/date, summary, and `Needs review` only (`src/ui/screens/GarminSyncScreen.tsx:220`). A user cannot see `Matched` versus `Unmatched`, despite `18-UI-SPEC.md:64` requiring match state. Render a concise non-color status line or badge and include it in the row's accessible name.
- **WARNING — Candidate current state is dropped.** Every candidate is typed with `state: "planned"` (`src/domains/running/activityMatchCommands.ts:36`), while candidate visual/accessibility copy omits it (`src/ui/screens/ActivityMatchScreen.tsx:56`). Add `Planned` or the authoritative current state to both visible and accessible copy.
- **PASS — Primary action and recovery labels are specific.** `Connect Garmin`, `Sync now`, `Disconnect Garmin`, `Retry Garmin sync`, `Retry activity details`, `Confirm match`, and `Leave unmatched` match the contract. The generic `Cancel` labels are permitted by the credential/MFA contract rather than generic-submit drift (`src/ui/screens/GarminSyncScreen.tsx:457`, `src/ui/screens/GarminSyncScreen.tsx:503`, `src/ui/screens/GarminSyncScreen.tsx:603`).
- **PASS — Classified failures are distinct.** Offline, sign-in-needed, access-denied, rate-limited, timeout, malformed-response, temporary failure, partial completion, and logout failure have distinct factual copy and retain-history language (`src/ui/screens/GarminSyncScreen.tsx:76`, `src/ui/screens/GarminSyncScreen.tsx:251`).

### Pillar 2: Visuals (2/4)

- **BLOCKER — Garmin root loses the approved persistent four-root composition.** Garmin is registered beside `(tabs)` in the top-level stack (`app/_layout.tsx:130`), whereas the four-item `AppTabs` exists only inside `(tabs)` (`app/(tabs)/_layout.tsx:167`). The Garmin root simultaneously renders an inert 48dp Back placeholder (`src/ui/screens/GarminSyncScreen.tsx:139`) and never renders `AppTabs`, unlike the Revision 18 source, which keeps the four-root bottom navigation below Garmin (`approved-hybrid.html:1937`). This is root/tab drift and leaves no visible touch control for returning to the app roots.
- **WARNING — Activity-list hierarchy omits the match signal.** The row has a strong title, metadata, summary, and optional review treatment (`src/ui/screens/GarminSyncScreen.tsx:229`), but ignores the supplied match state. Revision 18 uses a compact Garmin/import/match badge, and the reconciled spec requires match state. Add the state without turning the list into a card mosaic.
- **WARNING — Source activity identity is flattened to type.** The production history projection sets `title` to `projected.detail.activityType` and separately sets `activityType: "Running"` (`src/bootstrap/workoutAppRuntime.tsx:2737`). This produces repeated generic `Outdoor run`/`Treadmill run` identities rather than a factual source title plus type. Preserve an allowlisted source activity name in the accepted payload or deliberately label the fallback as type-only.
- **PASS — Detail hierarchy substantially matches the contract.** The screen orders identity/date, Distance, Elapsed, Moving/Timer, Average pace and basis, route, heart rate, Lap/Time/Pace, fidelity disclosure, and match action (`src/ui/screens/ImportedActivityDetailScreen.tsx:248`). Treadmill and unavailable-route states are explicit (`src/ui/screens/ImportedActivityDetailScreen.tsx:124`).
- **PASS — No generic/legacy visual namespace was introduced.** Targeted screens reuse `AdaptiveScreen`, `AppearanceSheet`, `FocusablePressable`, `ContentCard`, `InlineNotice`, `BottomSheet`, and `ConfirmationDialog`; the bespoke three-column headers implement the Phase 18 header contract rather than a second global design system.

### Pillar 3: Color (4/4)

- **PASS — Zero hardcoded color literals occur in the three production Garmin screens or their routes.** All foregrounds, surfaces, borders, selected states, focus, attention, destructive states, and route strokes come from `useAppTheme()` semantic roles (`src/ui/screens/GarminSyncScreen.tsx:388`, `src/ui/screens/ImportedActivityDetailScreen.tsx:124`, `src/ui/screens/ActivityMatchScreen.tsx:56`).
- **PASS — Accent roles remain semantic.** Blue is used for actions, Running selection, focus, and the factual route; yellow marks revision attention; destructive red is confined to error/disconnect presentation. Orange is not sprayed onto the Garmin feature merely for brand decoration.
- **PASS — Shared source tokens match Phase 14.** The Light/Dark paper, surface, ink, muted, action, attention, success, and destructive values are centrally defined in `src/ui/theme/index.ts:211` and consumed through aliases rather than private screen palettes.
- Native contrast, blended backgrounds, and physical appearance remain Phase 20 pending checks; they are not scored as failures here.

### Pillar 4: Typography (2/4)

- **WARNING — Numeric facts do not use the required IBM Plex Mono role.** Sync counts and ISO timestamps use `typeScale.secondary` (`src/ui/screens/GarminSyncScreen.tsx:303`), detail values use `typeScale.bodyStrong` (`src/ui/screens/ImportedActivityDetailScreen.tsx:90`), lap values use the same Archivo role (`src/ui/screens/ImportedActivityDetailScreen.tsx:173`), and match slot/date/time/timezone facts also use Archivo (`src/ui/screens/ActivityMatchScreen.tsx:56`). Phase 14 requires the numeric face for dates, times, counts, distances, pace, percentages, and ordinals. Add shared 14sp/16sp numeric roles or a `SemanticNumber` primitive and migrate every factual numeric value.
- **PASS — No screen-local font sizes or weights were introduced.** Targeted screens use the shared 14sp, 16sp, and 20sp roles with the approved 400/800 weights; the audit found no raw `fontSize`, `fontWeight`, or private font-family declarations in these screens.
- **Distribution:** targeted Garmin screens use shared `screenTitle`, `body`, `bodyStrong`, `secondary`, and `label` roles; these collapse to three actual sizes (20/16/14sp) and two interface weights (800/400). The score is reduced for family-role misuse, not size proliferation.

### Pillar 5: Spacing (3/4)

- **PASS — Reusable spacing follows the Phase 14 scale.** Targeted screens use only `space[1]`, `space[2]`, and `space[4]` for reusable gaps/padding (4/8/16dp). No arbitrary raw `gap`, `padding`, or `margin` values were found.
- **PASS — Fixed values are component geometry rather than stray spacing.** The 104dp symmetric header columns preserve the specified stable three-column title alignment; the 160dp route canvas and zero-width flex constraints are bounded component geometry (`src/ui/screens/GarminSyncScreen.tsx:637`, `src/ui/screens/ImportedActivityDetailScreen.tsx:383`).
- **WARNING — Two fixed horizontal rows lack 200% text reflow.** Average heart rate is always `flexDirection: "row"` with `space-between` and no wrap/stack branch (`src/ui/screens/ImportedActivityDetailScreen.tsx:429`). Candidate kind and slot are also forced into one row with no shrink/wrap behavior (`src/ui/screens/ActivityMatchScreen.tsx:202`). At 200% text, long labels can collide or overflow even though the lap table correctly stacks. Add font-scale/width-aware stacking and component assertions for full label/value visibility.
- Existing host layout tests assert width class and minimum target size, but do not measure text boxes, wrapping, clipping, or overlap (`src/ui/__tests__/GarminSyncScreen.test.tsx:512`, `src/ui/__tests__/ActivityMatchScreen.test.tsx:220`). Physical confirmation remains pending Phase 20 after the source-level reflow fix.

### Pillar 6: Experience Design (1/4)

- **BLOCKER — Ambiguous-date recovery is a dead end.** Production enforces source-date policy and can return `date_confirmation_required` (`src/bootstrap/garminImportRuntime.tsx:219`, `src/bootstrap/garminImportRuntime.tsx:386`). The screen renders `Confirm the activity date`, but its action logic offers neither Retry nor a date-confirmation flow for this non-retryable state (`src/ui/screens/GarminSyncScreen.tsx:251`, `src/ui/screens/GarminSyncScreen.tsx:354`). The affected activity can never complete import. Add a review sheet/route that collects the bounded local date/time/zone decision and calls `confirmPreparedDate`.
- **BLOCKER — Durable source-revision review has no product UI.** SQLite/domain code can list factual changed fields and commit `accept`/`keep` decisions (`src/platform/sqlite/repositories/importedActivityRepository.ts:42`, `src/domains/activities/importCommands.ts:96`), but the app runtime exposes neither operation to the route. The row only says `Needs review`, and opening it yields `Source revision needs review` plus `Retry activity details` (`src/ui/screens/ImportedActivityDetailScreen.tsx:330`). Retry cannot decide the revision. Show accepted/proposed factual differences and explicit Use updated facts / Keep current facts actions with stale/conflict recovery.
- **BLOCKER — Unmatch and reassignment are domain-only.** The command model supports `match | unmatch | reassign` (`src/domains/running/activityMatchCommands.ts:9`), but the runtime hardcodes `action: "match"` (`src/bootstrap/workoutAppRuntime.tsx:2817`) and the product route maps `Leave unmatched` directly to `router.back()` (`app/garmin/match/[activityId].tsx:58`). An already matched activity shows a notice but cannot be unlinked or reassigned. Add explicit reviewed unmatch/reassign commands and preserve the activity/relation on failure.
- **WARNING — Back can hide an in-flight match commit.** `confirm()` starts an asynchronous write and marks the screen busy (`src/ui/screens/ActivityMatchScreen.tsx:128`), but header/hardware Back remains active because `requestBack()` ignores `busy` (`src/ui/screens/ActivityMatchScreen.tsx:118`). A user can leave while the confirmed match commits off-screen. Block Back during the authoritative commit or keep a route-level operation owner that returns to a committed/recoverable result without hidden writes.
- **WARNING — Required heading entry and exact trigger restoration are not implemented.** Garmin/detail/match headings are accessible, but none receives imperative focus on route entry; detail and match title views have no focus ref/effect (`src/ui/screens/ImportedActivityDetailScreen.tsx:51`, `src/ui/screens/ActivityMatchScreen.tsx:37`). Root return-focus state is incremented before `router.push`, with no navigation-focus hook on return (`app/garmin/index.tsx:38`), and returning from match does not restore the Match action. Use route-focus hooks plus stable refs/native IDs to focus the destination heading and exact initiating row/action after Back.
- **PASS — Secret state is correctly bounded in the targeted host UI.** Password, MFA code, and continuation handle stay in refs rather than React state; password/MFA inputs use secure entry and are cleared on completion/cancel/unmount (`src/ui/garmin/useGarminConnectionController.ts:205`, `src/ui/screens/GarminSyncScreen.tsx:388`). Routes carry only validated origins, bounded return tokens, and opaque local activity IDs (`app/garmin/index.tsx:20`, `app/garmin/activity/[activityId].tsx:23`, `app/garmin/match/[activityId].tsx:15`). No account token/provider subject/external Garmin ID is rendered or routed.
- **PASS — Core state coverage is otherwise broad.** Host code covers loading, disconnected, credentials, MFA, connected, syncing, success/no-new, partial, classified failure, disconnect confirmation/failure, retained history, missing/projection/detail states, no candidates, stale match, and save failure. Focused host verification passed 116 component/route tests and 84 controller/adapter tests.

---

## Verification Performed

- Screenshot-safety gate: `.planning/ui-reviews/.gitignore` present with binary image exclusions.
- Dev-server probe: no response on localhost ports 3000, 5173, or 8080.
- Focused component/route verification: **8 suites, 116 tests passed**.
- Focused controller/adapter verification: **2 suites, 84 tests passed**.
- Registry check: `components.json` absent; shadcn/third-party registry audit is not applicable.
- Source scans: zero hardcoded colors in targeted screens/routes; shared typography-role and spacing-token distributions recorded above.

Passing tests do not waive the findings: current suites encode the implemented behavior but do not assert persistent tabs on Garmin, actionable date/revision review, unmatch/reassign, heading-entry focus, exact trigger return, or measured 200% text geometry.

---

## Files Audited

Planning and precedence:

- `.planning/phases/18-garmin-import/18-UI-SPEC.md`
- `.planning/phases/18-garmin-import/18-CONTEXT.md`
- `.planning/phases/18-garmin-import/18-01-PLAN.md` through `18-14-PLAN.md`
- `.planning/phases/18-garmin-import/18-01-SUMMARY.md` through `18-14-SUMMARY.md`
- `.planning/phases/18-garmin-import/18-REVIEW.md` (consulted for prior findings; current source re-verified independently)
- `.planning/phases/14-prototype-visual-shell/14-UI-SPEC.md`
- `.planning/phases/14-prototype-visual-shell/14-CONTEXT.md`
- `.planning/v1.2-OWNER-DECISIONS.md`
- `.planning/v1.2-OWNER-BRIEF.md`
- `.planning/design/v1.2-SOURCE-PRECEDENCE.md`
- `/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/approved.json`
- `/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/approved-hybrid.html`
- `/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/design-audit-revision18/design-audit-revision18.md`

Production routes and surfaces:

- `app/_layout.tsx`
- `app/(tabs)/_layout.tsx`
- `app/(tabs)/index.tsx`
- `app/garmin/index.tsx`
- `app/garmin/activity/[activityId].tsx`
- `app/garmin/match/[activityId].tsx`
- `app/library/running/[planId].tsx`
- `src/ui/screens/TodayScreen.tsx`
- `src/ui/screens/RunningPlanDetailScreen.tsx`
- `src/ui/screens/GarminSyncScreen.tsx`
- `src/ui/screens/ImportedActivityDetailScreen.tsx`
- `src/ui/screens/ActivityMatchScreen.tsx`
- `src/ui/garmin/useGarminConnectionController.ts`
- `src/ui/layout/AdaptiveScreen.tsx`
- `src/ui/components/index.ts`
- `src/ui/components/BottomSheet.tsx`
- `src/ui/components/ConfirmationDialog.tsx`
- `src/ui/theme/index.ts`
- `src/bootstrap/garminImportRuntime.tsx`
- `src/bootstrap/workoutAppRuntime.tsx`
- `src/platform/garmin/garminActivityAdapter.ts`
- `src/platform/garmin/garminSyncCoordinator.ts`
- `src/platform/garmin/normalizeGarminActivity.ts`
- `src/platform/sqlite/repositories/importedActivityRepository.ts`
- `src/platform/sqlite/repositories/garminSyncSummaryRepository.ts`
- `src/domains/activities/garminActivitySourcePort.ts`
- `src/domains/activities/activityDetails.ts`
- `src/domains/activities/importCommands.ts`
- `src/domains/running/activityMatchCommands.ts`

Focused tests:

- `src/ui/__tests__/GarminSyncScreen.test.tsx`
- `src/ui/__tests__/ImportedActivityDetailScreen.test.tsx`
- `src/ui/__tests__/ActivityMatchScreen.test.tsx`
- `src/ui/garmin/useGarminConnectionController.test.tsx`
- `src/platform/garmin/garminActivityAdapter.test.ts`
- `app/__tests__/garmin-index-route.test.tsx`
- `app/__tests__/garmin-activity-route.test.tsx`
- `app/__tests__/garmin-match-route.test.tsx`
- `app/__tests__/root-layout.test.tsx`
- `app/(tabs)/__tests__/_layout.test.tsx`
