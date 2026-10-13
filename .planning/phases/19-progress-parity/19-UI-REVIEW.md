# Phase 19 — UI Review

**Audited:** 2026-10-13
**Baseline:** Approved Phase 19 UI-SPEC → owner decisions/brief → v1.2 source precedence → approved Revision 18 JSON/HTML
**Source:** Current merged `fchoo/UX-revamp` at `57774f77`
**Screenshots:** Not captured — no web dev server answered on 3000, 5173, or 8080; native/device screenshots remain Phase 20-owned and carry no Phase 19 score penalty
**Scope:** Progress All/Strength/Running roots, ranges, factual histories, target/recommendation/settings/bodyweight sheets, source navigation, responsive/accessibility/recovery source
**Excluded:** Unrelated dirty Phase 14 evidence and concurrent Phase 16 documentation; no source/shared/Phase 14/Phase 16 file was edited by this audit

Revision 18 source hashes still match the approved UI-SPEC: HTML `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`, approval JSON `b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf`. Missing Phase 20 native evidence is not scored here.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 3/4 | Exact root, evidence, mutation, and empty-state copy is substantially restored, but unavailable projections still appear under the contradictory `Updating progress` heading and one unavailable branch has no approved recovery action. |
| 2. Visuals | 2/4 | All three sports now have factual heroes/charts and responsive three-cell facts, but every populated root duplicates the same facts in the chart and the segmented-control frame still diverges from the approved composition. |
| 3. Color | 3/4 | Shared Light/Dark tokens and green/yellow chart semantics are correct, but the audited Phase 19 surfaces contain zero orange token uses, leaving Strength without its reserved identity and the Running evidence notice neutral. |
| 4. Typography | 2/4 | Archivo/IBM Plex Mono tokens are present, but an undeclared 18sp input remains and labels, dates, times, and factual values repeatedly use the wrong family/role. |
| 5. Spacing | 3/4 | The approved scale, 3dp/18dp exceptions, 48dp source actions, and responsive fact cells are implemented; the shared focus offset is still 4dp and the 82% sheet cap still applies only to the scroll body. |
| 6. Experience Design | 1/4 | Periods, multi-distance targets, planned-next, source revisions, focus, recovery, Back/Escape, and reduced motion are implemented, but the All root can select the wrong focal goal and cannot complete the required Running history/source flow. |

**Overall: 14/24**

**Classification:** `BLOCK` = task-breaking or factual-authority defect; `FLAG` = contract/quality gap; `PASS` = current-source behavior verified in scope.

The required 24/24, zero-BLOCK/FLAG gate is **not met**.

---

## Top 3 Priority Fixes

1. **BLOCK — Finish the All factual root instead of using array position as authority.** Preserve the approved nearest-goal ordering facts across Strength and Running, sort before selecting `primaryGoal`, render Active goals in both primary-sport branches, make every row select its sport, and give a Running primary goal the same Open history/exact-source graph available on the Running root.
2. **FLAG — Remove duplicated root facts and restore the approved selector/hero composition.** Let one three-cell Latest/Best/Target row plus the written Gap own the hero summary; make the embedded chart suppress its second Latest/Best/Target/Gap strip on root use, and add the 13dp enclosing segmented surface/border rather than three independently rounded chips.
3. **FLAG — Close the remaining shared token and state-shell drift.** Replace the 18sp bodyweight input with declared type roles, split Archivo labels from IBM Plex Mono values, set the focus offset to 3dp, cap the full sheet at 82%, and render unavailable projections with `Progress could not be loaded` plus the approved retry action rather than `Updating progress`.

---

## Prior BLOCK/FLAG Re-test Ledger

| Prior area | Verdict | Current evidence |
|---|---|---|
| All/Strength/Running factual roots | **PARTIAL / BLOCK** | Strength and Running heroes, charts, goals, best efforts, and exact copy now render (`ProgressScreen.tsx:178-328`, `397-424`), but All still has the factual/navigation defects documented under Pillar 6. |
| Period scoping and complete All time | **PASS** | `rangeStart` defines 4/12-week windows, accepted Running reads bind the window, and All time pages to completion (`progressRepository.ts:214-247`, `477-519`); the 501-row/out-of-range SQLite test passes. |
| Multi-distance targets | **PASS** | The aggregate retains one current target per distance, saves compare-and-swap the selected root, and reload spans 2.4 km/10 km/Half Marathon (`contracts.ts:210-231`, `runningPlanRuntime.tsx:117-160`, `runningPlanRepository.ts:198-239,492-507`); runtime-recreation integration coverage passes. |
| Planned-next | **PASS** | Typed Strength/Running opportunities are queried from current active schedules, projected deterministically, and rendered on all three sports (`progressRepository.ts:632-752`, `dashboardProjection.ts:136-153,423-453`, `ProgressScreen.tsx:145-152`). |
| Exact source revision | **PASS** | Progress routes validate and load the exact effective session revision, failing closed for invalid/mismatched/removed facts (`app/session/[sessionId].tsx:183-216`, `workoutOutcomeRepository.ts:2419-2448`). |
| Exact focus restoration | **PASS in implemented paths** | Stable All/Strength hero/source, recommendation, Running-history source, target, exercise, and bodyweight tokens resolve to exact refs (`ProgressScreen.tsx:364-404,504-520,625-679`); the missing All→Running path is a separate BLOCK. |
| 48dp source actions | **PASS** | Chart and recommendation source actions use `sizes.minimumTarget` (`FactualHistoryChart.tsx:350-356`, `RecommendationSurface.tsx:473-480`). |
| Responsive three-cell facts | **PASS** | Normal text uses three equal cells/dividers and fontScale 2 stacks them (`ProgressScreen.tsx:155-175,460-461,739-746`); host assertions cover both layouts. |
| fontScale 2 / landscape structure | **PASS, native deferred** | Root/chart facts stack at fontScale 2; chart and shared sheet have landscape adaptations and one scroll owner (`FactualHistoryChart.tsx:253-303`, `BottomSheet.tsx:86-94,302-368`). Phase 20 still owns visual/native proof. |
| Back / Escape / reduced motion / recovery | **PASS** | Shared sheets route close, hardware Back, Escape, scrim, focus trap/return, IME avoidance, and zero-duration reduced-motion translation through one safe path (`BottomSheet.tsx:118-165,229-270,285-368`). Bounded rebuild refresh uses source metadata (`ProgressScreen.tsx:463-502`). |
| Tokens / typography / density | **PARTIAL / FLAG** | The shared spacing/color system is consumed, but the exact typography, focus, sheet-cap, Strength-color, and segmented-frame deviations below remain in current source. |
| Honest sparse / error states | **PARTIAL / FLAG** | Sport-specific empty, target-only, one-fact, mutation failure, and stale states are present (`ProgressScreen.tsx:213-225,348-399,579-581`; `RunningTargetSheet.tsx:167-245,319-325`), but unavailable-state semantics and initial target validation remain misleading. |

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **PASS — Consequential and factual copy now matches the contract.** `Save target`, `Discard target changes`, `Keep target unchanged`, `Use target`, Bodyweight actions, exact Running evidence clauses, and the three sport-specific empty states are present (`ProgressScreen.tsx:213-225,348-354,567-581`; `RunningTargetSheet.tsx:249-325`; `RecommendationSurface.tsx:245-307`). No generic Submit/OK/Done/Apply/Continue label was found in the audited Phase 19 surfaces.
- **FLAG — An unavailable projection is still described as updating.** `rebuildText` returns `Progress is temporarily unavailable. Reload to try again.` for `history_projection_unavailable`, but the render hard-codes the heading `Updating progress` (`ProgressScreen.tsx:72-77,581`). The heading and body describe mutually exclusive states.
- **FLAG — The current-dashboard unavailable branch omits the approved assurance and retry action.** It renders only `The requested progress facts are unavailable. Reload to try again.` under `Progress is temporarily unavailable` (`ProgressScreen.tsx:356-358`), rather than `Your saved workouts and targets were not changed. Retry loading progress.` plus `Retry loading progress`.

### Pillar 2: Visuals (2/4)

- **PASS — The prior placeholder roots are gone.** Running has a factual hero, chart, goals, Best efforts and planned-next; Strength has a primary goal, chart, recommendations and exercise rows; All has a factual primary hero (`ProgressScreen.tsx:178-424`). The three-cell hero itself is responsive and source-tested.
- **FLAG — Every populated root duplicates its key facts.** `HeroFactRow` renders Latest/Best/Target in the hero, then `FactualHistoryChart` immediately renders another Latest/Best/Target/Gap strip (`ProgressScreen.tsx:155-175,229-241,314-325,389`; `FactualHistoryChart.tsx:297-303`). This pushes Personal history/chart evidence down and diverges from Revision 18's single fact row.
- **FLAG — The sport/range controls remain three independent chips rather than one approved segmented frame.** The group has only `flexDirection` and the 3dp gap, while each child carries its own 12dp radius/border (`ProgressScreen.tsx:103-134,752-753`; `src/ui/theme/index.ts:43-47`). The UI-SPEC requires one enclosing surface/border with a 13dp container radius.

### Pillar 3: Color (3/4)

- **PASS — Shared theme and semantic chart colors are used.** Actual factual lines are green, persisted goal lines are separately dashed yellow, focus/navigation uses the shared blue action/focus token, and the only hard-coded color is the approved 68% black sheet scrim (`FactualHistoryChart.tsx:307-322`; `BottomSheet.tsx:378-403`).
- **FLAG — Strength and Running identity allocation is incomplete.** Across the audited Phase 19 surfaces the token counts are: `orange` 0, direct `blue` 0, `action` 4, `focusRing` 15, `green` 2, `yellow` 3, `destructive` 7, `textPrimary` 68, `textSecondary` 49, `divider` 19. Strength heroes/rows therefore have no reserved orange identity, and the Running evidence notice is explicitly neutral (`ProgressScreen.tsx:214,224,300-424`). This does not meet the contract's 60/30/10 sport-identity reservation.

### Pillar 4: Typography (2/4)

- **PASS — The shared system exposes Archivo and IBM Plex Mono with the declared 14/16/20 roles and 400/800 weights** (`src/ui/theme/index.ts:18-22,69-121`).
- **FLAG — An undeclared 18sp input remains.** `BodyweightEditorSheet` hard-codes `fontSize: 18` and does not apply a declared font-family/line-height token (`BodyweightEditorSheet.tsx:109-128,138-142`). Phase 19 therefore uses 14/16/18/20 rather than the contract's declared Progress sizes.
- **FLAG — Numeric/data roles still use Archivo while labels are folded into Mono.** Chart values use `bodyStrong` Archivo, Running sheet Best/Target values use `screenTitle` Archivo, bodyweight dates use `bodyStrong`, and target time/date fields use `body` (`FactualHistoryChart.tsx:238-243`; `RunningHistorySheet.tsx:69-74`; `BodyweightHistorySheet.tsx:121-130`; `RunningTargetSheet.tsx:332-341`). Conversely, each root fact combines `Latest · <value>` inside one 20sp Mono node (`ProgressScreen.tsx:164-174`) instead of separating Archivo labels from tabular Mono values.

### Pillar 5: Spacing (3/4)

- **PASS — The reusable scale and approved exceptions are disciplined.** Audited usage is limited to 4/8/16/24dp tokens plus the approved local 3dp segmented gap and 18dp hero separation. Source/history actions are at least 48dp, and normal/200% fact geometry uses equal cells and proper dividers (`ProgressScreen.tsx:739-755`; `FactualHistoryChart.tsx:344-356`; `RecommendationSurface.tsx:460-481`).
- **FLAG — Focus clearance remains 4dp rather than the approved 3dp.** `sizes.focusClearance` is 4 and every `FocusablePressable` consumes it as `outlineOffset` (`src/ui/theme/index.ts:49-63`; `src/ui/components/index.ts:317-324`).
- **FLAG — The 82% cap does not constrain the full sheet.** The frame has no portrait max height; `maxHeight: "82%"` applies to the child `ScrollView`, so the 56dp header and insets can make the sheet surface exceed 82% (`BottomSheet.tsx:302-368,378-403`). Compact landscape is separately bounded, but normal portrait remains off-contract.

### Pillar 6: Experience Design (1/4)

- **BLOCK — All cannot complete the required Running history/source task.** A Running primary goal on All renders `FactualHistoryChart` without `onOpenSource` and offers only `Open Running goal`, which changes sport instead of opening Running history (`ProgressScreen.tsx:386-391`). The All contract requires Personal history to open the correct Running history sheet and exact accepted source revision. Strength has that graph; Running-on-All does not.
- **BLOCK — `Nearest active goal` is not selected by the declared factual ordering.** All builds `activeGoals` as Strength goals followed by Running goals and takes `activeGoals[0]` (`dashboardProjection.ts:443-452`). Strength ordering is exercise-name-based (`dashboardProjection.ts:419-420`), while persisted source order/target date are not carried into the cross-sport selection. In the UI, Active goals are plain `Text`, not activating rows, and the list disappears entirely when the primary goal is Running (`ProgressScreen.tsx:359-391`). The focal All fact can therefore be the wrong goal and alternate goals cannot perform the required sport selection.
- **FLAG — An unset distance opens in an error state before owner interaction.** `timeError` is derived immediately from an empty target draft and passed straight to a destructive-border/error label (`RunningTargetSheet.tsx:79-90,244-245,275,332-341`). A valid unset 10 km/Half Marathon target should remain neutral until save/blur validation.
- **FLAG — Distance tabs do not implement tablist keyboard movement.** The three distance controls expose `tab` semantics but only `onPress`; there is no Left/Right/Home/End handler or roving focus (`RunningTargetSheet.tsx:260-274`). Training-day D-pad behavior is implemented separately (`RunningTargetSheet.tsx:283-313`).
- **PASS — The major prior data/interaction blockers are genuinely closed.** Selected periods alter factual SQL windows; All time is fully paged; 2.4 km/10 km/Half Marathon targets persist independently; planned-next is source-backed; exact Strength revisions fail closed; 48dp and exact return-focus paths are present; shared Back/Escape/scrim/reduced-motion behavior and bounded 250/1000/4000ms rebuild polling are implemented.

---

## Host Evidence Run

- **PASS:** 12 focused Phase 19 UI/route suites, 113 tests.
- **PASS:** 4 focused domain/runtime suites, 54 tests.
- **PASS:** Progress SQLite host suite, 27 tests, including selected periods, 501-row paging, current target source, planned-next, rebuild and unavailable states.
- **PASS:** Running foundation + workout outcome integration suites, 33 tests, including three-distance persistence across runtime recreation and exact source-revision behavior.
- **PASS:** `npm run typecheck`.
- **PASS:** `npm run check:boundaries` across 429 files.
- **Not run by design:** Android build/install, APK/device identity, native screenshots, native semantics/focus/input, fontScale 2 captures, landscape captures, and attended checks. Phase 20 owns those without Phase 19 score penalty.

## Registry Safety

Skipped as not applicable: `components.json` is absent and the approved UI-SPEC declares zero shadcn or third-party registry blocks.

## Files Audited

- Authority: `.planning/v1.2-OWNER-DECISIONS.md`, `.planning/v1.2-OWNER-BRIEF.md`, `.planning/design/v1.2-SOURCE-PRECEDENCE.md`, Phase 19 CONTEXT/UI-SPEC/prior UI review/review-fix, all Phase 19 PLAN/SUMMARY artifacts, Revision 18 `approved.json`, focused Revision 18 audit, and the approved Progress reference captures.
- Root/domain/runtime: `app/(tabs)/progress.tsx`, `src/ui/screens/ProgressScreen.tsx`, `src/domains/progress/contracts.ts`, `src/domains/progress/dashboardProjection.ts`, `src/platform/sqlite/repositories/progressRepository.ts`, `src/bootstrap/workoutAppRuntime.tsx`, `src/bootstrap/runningPlanRuntime.tsx`.
- Histories/routes: `FactualHistoryChart.tsx`, `RunningHistorySheet.tsx`, `ExerciseHistoryScreen.tsx`, `app/exercise-history/[exerciseId].tsx`, `app/session/[sessionId].tsx`, `app/garmin/activity/[activityId].tsx`.
- Decisions/settings: `RunningTargetSheet.tsx`, `RecommendationSurface.tsx`, `ProgressSettingsSheet.tsx`, `BodyweightHistorySheet.tsx`, `BodyweightEditorSheet.tsx`.
- Shared UI: `BottomSheet.tsx`, `src/ui/components/index.ts`, `AdaptiveScreen.tsx`, `src/ui/theme/index.ts`.
- Evidence: focused component/route/domain/SQLite/integration test files covering all sources above.

## Recommendation Count

- Priority fixes: 3
- BLOCK findings: 2
- FLAG findings: 12
- PASS findings: 14
