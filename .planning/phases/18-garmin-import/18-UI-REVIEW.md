# Phase 18 — UI Review

**Audited:** 2026-10-12  
**Baseline:** Targeted re-audit against [`18-UI-SPEC.md`](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/.planning/phases/18-garmin-import/18-UI-SPEC.md) and the prior `18-UI-REVIEW.md` blocker/warning set on integrated `HEAD 1fc767fc`  
**Evidence boundary:** Host source plus focused Garmin route/screen/controller tests on integrated HEAD  
**Screenshots:** Not captured — no host dev server responded on ports 3000, 5173, or 8080; native screenshots and physical-device checks remain Phase 20 pending

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Status and review copy are now specific, but activity rows still expose a literal `Type-only title` fallback instead of source-backed identity copy. |
| 2. Visuals | 3/4 | The persistent four-root shell is restored, but history rows still flatten activity identity into a generic type-only presentation. |
| 3. Color | 4/4 | Targeted Garmin routes keep using shared semantic tokens with no hardcoded screen-local colors. |
| 4. Typography | 4/4 | Numeric facts now consistently use the IBM Plex Mono numeric role across sync, detail, and match surfaces. |
| 5. Spacing | 4/4 | The prior 200% reflow issues are resolved in the audited host layouts and covered by focused component tests. |
| 6. Experience Design | 2/4 | Date review, revision review, and safe match commit improved substantially, but unmatch/reassign UI is still missing and focus/Back handling is not fully closed. |

**Overall: 20/24**

**Release posture:** Improved materially versus the prior audit, but still not contract-complete for shipping because corrective match flows and some focus/Back semantics remain incomplete. Phase 20 native evidence is still pending and was not audited here.

---

## Top 3 Priority Fixes

1. **Implement explicit unmatch and reassignment UI for already-matched activities** — users cannot correct a wrong existing match from product UI — extend the match route/runtime to issue `unmatch` and `reassign` commands with the current relation fence and explicit recovery states.
2. **Replace the `Type-only title` fallback with real source-backed activity identity** — history rows currently read like implementation placeholders rather than factual activity summaries — carry the accepted allowlisted source title into the list projection, or rewrite the fallback copy so it is truthful and user-facing.
3. **Finish safe Back and exact focus restoration on deep Garmin flows** — async review decisions can still continue after the sheet or route is dismissed, and the match route does not restore the exact initiating trigger — block Back during in-flight review commits, focus the match heading on entry, and restore the Match trigger on return.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **WARNING — Activity identity copy still leaks a placeholder concept instead of product-ready language.** Garmin history rows literally announce and render `Type-only title` (`[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:229)`, `[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:248)`). This is clearer than the previous silent omission, but it is still not contract-grade copy for a shipped row.
- **PASS — Status copy/title review work is largely implemented.** Rows now expose `Matched`/`Unmatched` and `Needs review`/`Accepted source facts` in both visible and accessible copy (`[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:230)`, `[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:261)`).
- **PASS — Date and revision review language is now explicit and task-oriented.** The root exposes `Review activity date` and `Use activity date`, while the detail route exposes `Use updated facts` and `Keep current facts` with stale/failure recovery copy (`[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:412)`, `[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:843)`, `[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:434)`, `[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:446)`).

### Pillar 2: Visuals (3/4)

- **PASS — The persistent four-root shell is restored.** Garmin routes now render inside `GarminRouteShell`, which composes `AppRootShell` plus the existing four-root `AppTabs` contract instead of isolating Garmin outside the shell (`[src/ui/garmin/GarminRouteShell.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/garmin/GarminRouteShell.tsx:23)`).
- **WARNING — Activity rows still present generic type identity instead of a distinct factual title.** The runtime projects `title: projected.detail.activityType`, hardcodes `activityType: "Running"`, and the screen renders a companion `Type-only title` label (`[src/bootstrap/workoutAppRuntime.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/bootstrap/workoutAppRuntime.tsx:2773)`, `[src/bootstrap/workoutAppRuntime.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/bootstrap/workoutAppRuntime.tsx:2774)`, `[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:243)`).
- **PASS — Root, detail, and match headers now match the intended shell structure better than the prior audit.** Root keeps the inert back-sized placeholder and deep routes keep functional Back plus Appearance (`[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:151)`, `[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:110)`, `[src/ui/screens/ActivityMatchScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ActivityMatchScreen.tsx:44)`).

### Pillar 3: Color (4/4)

- **PASS — No targeted Garmin screen regressed into hardcoded presentation colors.** Route and screen surfaces continue to draw from `useAppTheme()` roles rather than local hex literals or one-off palettes (`[src/ui/garmin/GarminRouteShell.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/garmin/GarminRouteShell.tsx:31)`, `[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:149)`, `[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:108)`, `[src/ui/screens/ActivityMatchScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ActivityMatchScreen.tsx:42)`).
- **PASS — Semantic emphasis remains disciplined.** Attention color is used for revision review, destructive color stays scoped to disconnect/error contexts, and the route polyline uses the shared action color rather than introducing a Garmin-specific accent (`[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:257)`, `[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:210)`).

### Pillar 4: Typography (4/4)

- **PASS — Numeric typography is now implemented across the previously flagged surfaces.** Sync counts and timestamps use `numericSecondary` (`[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:349)`), detail facts and lap cells use `numericStrong`/`numericSecondary` (`[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:148)`, `[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:240)`), and match slot/date metadata uses the same numeric family (`[src/ui/screens/ActivityMatchScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ActivityMatchScreen.tsx:78)`, `[src/ui/screens/ActivityMatchScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ActivityMatchScreen.tsx:81)`).
- **PASS — The numeric roles are backed by the shared IBM Plex Mono family, not per-screen font hacks.** Targeted screens all consume the shared `fontFamilies.numericRegular` role (`[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:934)`, `[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:605)`, `[src/ui/screens/ActivityMatchScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ActivityMatchScreen.tsx:217)`).

### Pillar 5: Spacing (4/4)

- **PASS — The earlier 200% reflow gaps called out in the prior review are fixed in source.** Heart-rate layout now stacks in the compact/font-scale branch (`[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:324)`), lap rows stack when width is narrow or `fontScale >= 2` (`[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:472)`), and the match heading row now wraps instead of forcing a single rigid line (`[src/ui/screens/ActivityMatchScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ActivityMatchScreen.tsx:215)`).
- **PASS — Focused tests cover the host-level reflow contract that was previously missing.** Garmin root, detail, and match suites now assert compact/expanded or 200% alternatives rather than only static layout rendering (`[src/ui/__tests__/GarminSyncScreen.test.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/__tests__/GarminSyncScreen.test.tsx:522)`, `[src/ui/__tests__/ImportedActivityDetailScreen.test.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/__tests__/ImportedActivityDetailScreen.test.tsx:146)`, `[src/ui/__tests__/ActivityMatchScreen.test.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/__tests__/ActivityMatchScreen.test.tsx:220)`).

### Pillar 6: Experience Design (2/4)

- **BLOCKER — Unmatch and reassignment are still not available in product UI.** The domain continues to support `match | unmatch | reassign` (`[src/domains/running/activityMatchCommands.ts](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/domains/running/activityMatchCommands.ts:8)`), but the runtime only prepares `action: "match"` (`[src/bootstrap/workoutAppRuntime.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/bootstrap/workoutAppRuntime.tsx:2943)`), and the match route still maps `Leave unmatched` to `router.back()` with no corrective action path (`[app/garmin/match/[activityId].tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/app/garmin/match/[activityId].tsx:67)`). An already matched activity therefore still cannot be explicitly unlinked or reassigned from the shipped UI state.
- **WARNING — Match-route focus work is only partially implemented.** The match header is marked as a header, but unlike root and detail there is no heading ref or entry-focus effect (`[src/ui/screens/ActivityMatchScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ActivityMatchScreen.tsx:48)`). The detail route also pushes into match without preserving the initiating Match trigger, so returning cannot restore the exact control (`[app/garmin/activity/[activityId].tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/app/garmin/activity/[activityId].tsx:127)`).
- **WARNING — Safe Back is still incomplete for async review decisions outside the match confirm flow.** Match confirm now blocks Back while busy (`[src/ui/screens/ActivityMatchScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ActivityMatchScreen.tsx:119)`), but Garmin root Back still closes the date-review or disconnect overlays without checking whether their confirmation write is in flight (`[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:508)`), and detail Back remains active while revision accept/keep is running (`[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:431)`, `[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:502)`).
- **PASS — The prior date-confirmation dead end is fixed.** Sync failures with `date_confirmation_required` now expose `Review activity date`, the root opens a bounded date-review sheet, and the controller/runtime confirm the pending review through the shared command path (`[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:412)`, `[src/ui/screens/GarminSyncScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/GarminSyncScreen.tsx:773)`, `[src/ui/garmin/useGarminConnectionController.ts](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/garmin/useGarminConnectionController.ts:604)`, `[src/bootstrap/garminImportRuntime.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/bootstrap/garminImportRuntime.tsx:352)`).
- **PASS — Durable source-revision review is now productized.** The detail route loads changed fields and exposes explicit Use/Keep decisions backed by the shared revision resolver (`[src/bootstrap/workoutAppRuntime.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/bootstrap/workoutAppRuntime.tsx:2797)`, `[src/bootstrap/workoutAppRuntime.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/bootstrap/workoutAppRuntime.tsx:2851)`, `[app/garmin/activity/[activityId].tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/app/garmin/activity/[activityId].tsx:114)`, `[src/ui/screens/ImportedActivityDetailScreen.tsx](/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ImportedActivityDetailScreen.tsx:400)`).

---

## Verification Performed

- Screenshot-safety gate: `.planning/ui-reviews/.gitignore` already present with binary image exclusions.
- Dev-server probe: no response on localhost ports `3000`, `5173`, or `8080`.
- Focused Garmin component and route verification: `npm run test:components -- --runInBand app/__tests__/garmin-index-route.test.tsx app/__tests__/garmin-match-route.test.tsx src/ui/__tests__/GarminSyncScreen.test.tsx src/ui/__tests__/ImportedActivityDetailScreen.test.tsx src/ui/__tests__/ActivityMatchScreen.test.tsx` — **5 suites passed, 72 tests passed**.
- Focused Garmin controller verification: `npm run test:unit -- --runInBand src/ui/garmin/useGarminConnectionController.test.tsx` — **1 suite passed, 48 tests passed**.
- Registry check: `components.json` absent; shadcn or third-party registry audit not applicable.

The earlier `npm test` probe failed because this repo does not define a top-level `test` script; the focused verification above uses the repo’s actual `test:components` and `test:unit` entrypoints.

---

## Files Audited

- Planning baseline:
  - `.planning/phases/18-garmin-import/18-UI-SPEC.md`
  - `.planning/phases/18-garmin-import/18-CONTEXT.md`
  - `.planning/phases/18-garmin-import/18-UI-REVIEW.md` from the prior audit, re-verified against current source
  - Phase 18 plan and summary files referenced for the originally intended behaviors
- Production Garmin surfaces:
  - `src/ui/garmin/GarminRouteShell.tsx`
  - `app/garmin/index.tsx`
  - `app/garmin/activity/[activityId].tsx`
  - `app/garmin/match/[activityId].tsx`
  - `src/ui/screens/GarminSyncScreen.tsx`
  - `src/ui/screens/ImportedActivityDetailScreen.tsx`
  - `src/ui/screens/ActivityMatchScreen.tsx`
  - `src/ui/garmin/useGarminConnectionController.ts`
  - `src/bootstrap/garminImportRuntime.tsx`
  - `src/bootstrap/workoutAppRuntime.tsx`
  - `src/domains/running/activityMatchCommands.ts`
- Focused tests:
  - `app/__tests__/garmin-index-route.test.tsx`
  - `app/__tests__/garmin-match-route.test.tsx`
  - `src/ui/__tests__/GarminSyncScreen.test.tsx`
  - `src/ui/__tests__/ImportedActivityDetailScreen.test.tsx`
  - `src/ui/__tests__/ActivityMatchScreen.test.tsx`
  - `src/ui/garmin/useGarminConnectionController.test.tsx`
