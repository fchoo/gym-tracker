# Phase 19 — UI Review

**Audited:** 2026-10-13
**Baseline:** Phase 19 UI-SPEC against owner decisions → owner brief → v1.2 source precedence → approved Revision 18 JSON/HTML
**Screenshots:** Not captured — native/device evidence is Phase 20-owned, and no dev server answered on 3000, 5173, or 8080
**Scope:** Current `fchoo/UX-revamp`; Progress All/Strength/Running root, ranges, histories, target/recommendation/settings/bodyweight sheets, source navigation, responsive/accessibility/recovery source
**Excluded:** Unrelated Phase 16 fixes and preserved Phase 14 native evidence

The missing Phase 20 native matrix does not reduce these scores. The deductions below are current host/source defects, not absent device screenshots. Phase 19 correctly reports native `NOT_RUN` and overall `REVIEW_REQUIRED`.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 2/4 | Mutation copy is specific, but several root empty/evidence/recovery messages omit or replace the approved consequential wording. |
| 2. Visuals | 1/4 | All and Strength are placeholder-shaped, while Running omits the required root chart, Best efforts, and planned-next composition. |
| 3. Color | 3/4 | Shared Light/Dark tokens are used consistently, but Strength identity and some status/source color semantics are absent. |
| 4. Typography | 2/4 | The shared scale is mostly consumed, but an undeclared 18sp size and repeated Archivo-for-data usage violate the contract. |
| 5. Spacing | 2/4 | Approved tokens and 3dp/18dp exceptions are present, but required three-cell geometry, one 48dp target, and focus clearance diverge. |
| 6. Experience Design | 1/4 | Running ranges do not scope Running facts; core All/Strength tasks, exact source return, and parts of target/focus recovery remain incomplete. |

**Overall: 11/24**

**Classification:** `BLOCK` = task-breaking or score-1 contract failure; `FLAG` = quality/contract gap; `PASS` = source-backed behavior verified in scope.

---

## Top 3 Priority Fixes

1. **BLOCK — Replace the All/Strength placeholder projections and complete all three roots.** Extend the typed dashboard union with Latest, Best, Target, Gap, target-at-date series, evidence/source identities, status, active-goal, and planned-next facts. Render the root `FactualHistoryChart`, complete Running Best efforts, and source-backed planned-next content. This is the minimum fix for the Phase 19 owner goal.
2. **BLOCK — Make period selection and current Running target authority real.** Apply 4-week/12-week bounds to imported Running facts, page All time without dropping recent rows, keep active-plan/current-target identity, and preserve target-only/one-effort states. Add tests proving each period changes the factual series rather than only the selected chip.
3. **BLOCK — Close the exact history/editor navigation graph.** Enforce the displayed Strength `sourceRevision` at the session destination, restore the exact recommendation/history source control on return, provide all three Distance choices inside Running target, and bring every source action to 48dp. Then add source-level assertions for Back/Escape, D-pad propagation, stale reload, and focus return.

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)

- **PASS — Controls and consequential mutation actions use specific nouns.** `All / Strength / Running`, `4 weeks / 12 weeks / All time`, `Save target`, `Keep target unchanged`, `Use target`, `Discard bodyweight changes`, and the bodyweight delete confirmation are implemented without generic Submit/OK/Done labels (`ProgressScreen.tsx:58-67`, `RunningTargetSheet.tsx:203-278`, `RecommendationSurface.tsx:291-303`, `BodyweightHistorySheet.tsx:127-160`).
- **FLAG — The Running evidence notice drops two safety clauses.** The UI only says that facts come from accepted Garmin activities (`ProgressScreen.tsx:188-197`); it omits the approved exact-distance summary/lap requirement, sampled-chart prohibition, and “Matching never completes a scheduled workout without confirmation.”
- **FLAG — Sport-specific empty copy is replaced by generic or narrower text.** The shared empty branch says `No progress history yet` for Strength as well as All (`ProgressScreen.tsx:239-243`), and Running says `No 2.4 km effort recorded` rather than the approved `No imported running efforts yet` state (`ProgressScreen.tsx:187-192`). The test suite currently codifies the abbreviated/placeholder outcome rather than the UI-SPEC copy (`ProgressScreen.test.tsx:225-247`).
- **FLAG — Unavailable and rebuilding language can contradict the state.** `rebuildText` can return “Progress is temporarily unavailable” while the visible heading remains `Updating progress` (`ProgressScreen.tsx:82-87`, `ProgressScreen.tsx:377-380`). A current dashboard with `state: unavailable` also renders no recovery action (`ProgressScreen.tsx:245-247`).

### Pillar 2: Visuals (1/4)

- **BLOCK — The data contract makes complete All and Strength hierarchy impossible.** `ProgressAllDashboardProjection` contains only `primaryGoal`; `ProgressStrengthDashboardProjection` contains only raw `facts` (`src/domains/progress/contracts.ts:254-264`). The ready All UI therefore shows Target plus a fixed “More data needed” sentence, and Strength shows a count plus `Target unavailable` for every row (`ProgressScreen.tsx:248-268`). There is no root Latest/Best/Target/Gap row, goal line, factual chart, evidence disclosure, active goals, or planned-next content.
- **BLOCK — Running is only a partial Revision 18 composition.** Its hero has facts and pacing, but the root never mounts `FactualHistoryChart`, never renders the required Best efforts section, and omits source-backed planned-next/Next target content (`ProgressScreen.tsx:195-223`). The chart exists only after opening the history sheet (`RunningHistorySheet.tsx:96-102`).
- **BLOCK — A non-2.4 km fallback is visually mislabeled as 2.4 km.** The code falls back to `dashboard.goals[0]` when no 2.4 km effort exists, then hard-codes the heading `2.4 km goal` (`ProgressScreen.tsx:187-200`). A lone 10 km or Half Marathon effort can therefore be presented under the wrong identity.
- **FLAG — Root geometry does not match the approved hero.** The Latest/Best/Target “row” is a vertical `View` with no equal-cell columns or dividers (`ProgressScreen.tsx:201-205`, `ProgressScreen.tsx:506-519`), and the segmented control lacks the approved enclosing surface/border/13dp container treatment. The exact 3dp control gap and 18dp hero separation are present.
- **PASS — The implemented Running hero has a clear focal point.** Heading, faster-is-lower explanation, factual values, written Gap, pacing, and Evidence are ordered and readable (`ProgressScreen.tsx:198-216`).

### Pillar 3: Color (3/4)

- **PASS — Palette use is tokenized and theme-correct.** The audited Phase 19 UI uses the Phase 14 theme rather than private hex colors; the only local hard-coded color is the approved 68% black sheet scrim (`src/ui/theme/index.ts:261-283`, `BottomSheet.tsx:378-403`). The factual chart uses green actuals and a separate dashed yellow goal (`FactualHistoryChart.tsx:300-312`).
- **FLAG — Strength identity is absent.** Across the Phase 19 root/history/sheet files there are 63 `textPrimary`, 51 `textSecondary`, 17 `divider`, 15 `focusRing`, 7 `destructive`, 4 `action`, 3 `yellow`, 2 `green`, and **0 `orange`** references. Strength therefore loses the reserved orange identity, while the Running source notice is neutral instead of source-blue and Strength rows have no semantic status treatment (`ProgressScreen.tsx:188-223`, `ProgressScreen.tsx:254-268`).
- **PASS — Meaning is not color-only where states are implemented.** Written Gap, More data needed, Target unset, failure headings, and destructive labels accompany semantic colors.

### Pillar 4: Typography (2/4)

- **PASS — Shared typography establishes Archivo/IBM Plex Mono and the approved 14/16/20 roles with 400/800 weights** (`src/ui/theme/index.ts:18-22`, `src/ui/theme/index.ts:69-121`).
- **FLAG — Bodyweight input introduces an undeclared 18sp size.** `BodyweightEditorSheet` hard-codes `fontSize: 18` rather than using the four-size contract (`BodyweightEditorSheet.tsx:138-142`). Effective Phase 19 sizes are therefore 14/16/18/20 instead of the declared Progress subset.
- **FLAG — Data-like values repeatedly use Archivo instead of IBM Plex Mono.** Factual chart values use `bodyStrong` (`FactualHistoryChart.tsx:234-239`), Running sheet Best/Target use `screenTitle` (`RunningHistorySheet.tsx:68-73`), target time/date inputs use `body` (`RunningTargetSheet.tsx:285-295`), and bodyweight dates use `bodyStrong` (`BodyweightHistorySheet.tsx:127-130`). Conversely, root fact strings put both labels and numeric values into one Mono `targetValue` node (`ProgressScreen.tsx:201-205`) instead of separating Archivo labels from tabular numbers.

### Pillar 5: Spacing (2/4)

- **PASS — The reusable spacing scale is followed.** Compact/medium/expanded insets are 16/24/32dp (`AdaptiveScreen.tsx:39-47`), and Phase 19 uses token gaps/padding plus only the approved 3dp segmented gap and 18dp hero separation (`ProgressScreen.tsx:506-519`).
- **FLAG — The hero facts do not implement three equal cells.** `factRow` has no horizontal grid/flex direction and no per-cell divider/padding anatomy (`ProgressScreen.tsx:201-205`, `ProgressScreen.tsx:509`). This remains stacked at ordinary text size rather than adapting only at 200% text.
- **FLAG — Recommendation source navigation is below the 48dp minimum.** `sourceAction` has only 4dp vertical padding and no minimum height (`RecommendationSurface.tsx:260-275`, `RecommendationSurface.tsx:466-472`); this affects both pending and historical source actions.
- **FLAG — Focus clearance is 4dp instead of the approved 3dp offset.** `sizes.focusClearance` is 4 and every shared focusable consumes it (`src/ui/theme/index.ts:49-63`, `src/ui/components/index.ts:317-324`). The 3dp outline width itself is correct.
- **FLAG — The 82% cap applies to the scroll body, not the full sheet.** The non-landscape frame has no max-height while the child `ScrollView` alone is capped at 82%, allowing header plus body to exceed the contract surface cap (`BottomSheet.tsx:306-365`, `BottomSheet.tsx:388-403`). Native clipping remains Phase 20 evidence, but the source geometry already diverges.

### Pillar 6: Experience Design (1/4)

- **BLOCK — Period chips are selected-state controls, not factual Running filters.** `loadDashboardFacts` accepts no period/date and queries imported activities/goals without a range predicate (`progressRepository.ts:416-442`); the selected period is applied only to the separate legacy history projection before the same unscoped dashboard facts are projected (`progressRepository.ts:770-822`). Running 4 weeks, 12 weeks, and All time can therefore display identical facts.
- **BLOCK — Core Progress tasks are incomplete even though host metadata says PASS.** All cannot explain Latest/Best/Gap/evidence; Strength cannot explain a primary goal/target/status; Running cannot inspect its root chart/best-effort list. The verifier creates host `PASS` records from registered references and correctly leaves native `NOT_RUN`, so its `source_status: PASS` is traceability metadata, not proof of UI-SPEC parity (`scripts/verify-phase19-evidence.mjs:20-32`, `scripts/verify-phase19-evidence.mjs:174-209`).
- **FLAG — Strength source navigation does not enforce the displayed revision.** Exercise history passes `sourceRevision` to `/session/[sessionId]` (`app/exercise-history/[exerciseId].tsx:84-101`), but the destination parses only session ID/origin and loads the current session (`app/session/[sessionId].tsx:51-72`, `app/session/[sessionId].tsx:149-170`). Running source navigation does positively fence the accepted activity revision (`app/(tabs)/progress.tsx:74-81`, `app/garmin/activity/[activityId].tsx:79-95`).
- **FLAG — Exact focus return is incomplete.** Recommendation source navigation emits a `progress:Strength:...:recommendation:...` token (`ProgressScreen.tsx:256-264`), but the return handler recognizes only exercise, running-target, and running-history tokens (`ProgressScreen.tsx:320-330`). Running source return targets the root Open history control even though the history sheet remains mounted, rather than the invoking Open source row.
- **FLAG — Running target is distance-bound before the sheet, not switchable inside it.** Integration filters `runningTargetSources` to the selected distance (`ProgressScreen.tsx:403-406`, `ProgressScreen.tsx:430-441`), so the sheet's Distance tablist receives one item despite the contract requiring 2.4 km, 10 km, and Half Marathon switching with independent drafts (`RunningTargetSheet.tsx:212-228`). Unset distances also display validation error styling immediately because errors are derived from empty input before submit (`RunningTargetSheet.tsx:198-199`).
- **FLAG — Automatic rebuild recovery is only copy.** The screen performs one read per dependency generation and offers manual Refresh, but it does not schedule the declared bounded backoff while saying results refresh automatically (`ProgressScreen.tsx:300-318`, `ProgressScreen.tsx:375-380`).
- **PASS — Real authority and mutation boundaries are substantially implemented.** Root requests go through the typed runtime; target, recommendation, and bodyweight success feedback follows command/read-back; duplicate actions are blocked; bodyweight deletion is confirmed; no local fixture/localStorage production path was found (`ProgressScreen.tsx:300-364`, `ProgressScreen.tsx:430-502`).
- **PASS — Shared sheet cancellation and reduced motion are source-backed.** Modal isolation, Back, Escape, scrim, heading focus, trigger restore, IME avoidance, and zero-duration translation under reduced motion are centralized in `BottomSheet` (`BottomSheet.tsx:118-165`, `BottomSheet.tsx:229-375`). Root/chart changes introduce no chart-path animation.
- **PASS — Responsive structure has one root scroll owner and approved insets.** The host tests prove compact/medium/expanded classification and one scroll container, while `AdaptiveScreen` supplies safe-area and bottom content clearance (`AdaptiveScreen.tsx:88-175`, `AdaptiveScreen.tsx:177-256`; `ProgressScreen.test.tsx:421-433`). This is host structure proof only; native 200%/landscape capture remains correctly Phase 20-deferred.

---

## Host Evidence Run

- **PASS:** 11 focused component/route suites, 77 tests.
- **PASS:** `npm run typecheck`.
- **PASS:** `npm run check:boundaries` across 428 files.
- **PASS with authority caveat:** `verify:phase19:evidence -- --automated-only` returned `source_status: PASS`, `status: REVIEW_REQUIRED`, `native_status: NOT_RUN`. The native deferral is correct; the static host PASS registry does not override the source findings above.
- **Not run by design:** Android build/install, APK/device identity, screenshots, native semantics/focus/input, 200% text captures, landscape captures, and attended checks.

## Files Audited

- Phase authority: `.planning/v1.2-OWNER-DECISIONS.md`, `.planning/v1.2-OWNER-BRIEF.md`, `.planning/design/v1.2-SOURCE-PRECEDENCE.md`, Phase 19 CONTEXT/UI-SPEC, all ten Phase 19 PLAN/SUMMARY files, Revision 18 `approved.json` and `approved-hybrid.html` at the UI-SPEC hashes.
- Root/runtime/source: `app/(tabs)/progress.tsx`, `src/ui/screens/ProgressScreen.tsx`, `src/domains/progress/contracts.ts`, `src/domains/progress/dashboardProjection.ts`, `src/platform/sqlite/repositories/progressRepository.ts`, `src/bootstrap/workoutAppRuntime.tsx`.
- Histories/routes: `src/ui/components/FactualHistoryChart.tsx`, `src/ui/components/RunningHistorySheet.tsx`, `src/ui/screens/ExerciseHistoryScreen.tsx`, `app/exercise-history/[exerciseId].tsx`, `app/session/[sessionId].tsx`, `app/garmin/activity/[activityId].tsx`.
- Decisions/settings: `RunningTargetSheet.tsx`, `RecommendationSurface.tsx`, `ProgressSettingsSheet.tsx`, `BodyweightHistorySheet.tsx`, `BodyweightEditorSheet.tsx`.
- Shared UI: `BottomSheet.tsx`, `src/ui/components/index.ts`, `AdaptiveScreen.tsx`, `src/ui/theme/index.ts`.
- Host evidence: the 11 focused Phase 19 UI/route test files plus `scripts/verify-phase19-evidence.mjs` and the Phase 19 native-evidence source.

## Recommendation Count

- Priority fixes: 3
- BLOCK findings: 5
- FLAG findings: 15
- PASS findings: 9
