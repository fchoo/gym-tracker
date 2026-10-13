# Phase 19 — UI Review

**Audited:** 2026-10-13
**Baseline:** Approved Phase 19 UI-SPEC → owner decisions/brief → v1.2 source precedence → approved Revision 18 JSON/HTML
**Source:** Current merged `fchoo/UX-revamp` at `efb0e4ba`
**Screenshots:** Not captured — no web dev server answered on 3000, 5173, or 8080; native/device screenshots are explicitly Phase 20-owned and carry no Phase 19 score penalty
**Scope:** Progress All/Strength/Running roots, factual goal ordering, history/source drill-downs, retained focus, selectors/heroes, charts, target/recommendation/settings/bodyweight sheets, responsive/accessibility/recovery source
**Excluded:** Unrelated dirty Phase 14 evidence and concurrent Phase 16 artifacts; this audit edits only this report

Revision 18 source hashes match the approved UI-SPEC exactly: HTML `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`, approval JSON `b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf`.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 4/4 | Exact factual, empty, unavailable, retry, decision, and destructive-action copy is present; no prohibited generic CTA remains in the audited surfaces. |
| 2. Visuals | 4/4 | All three roots implement the approved factual hierarchy with one nonduplicated three-cell hero, enclosing segmented frames, source-backed charts, and complete drill-downs. |
| 3. Color | 4/4 | Shared Light/Dark tokens preserve the 60/30/10 hierarchy, orange Strength identity, blue Running/navigation identity, green facts, yellow goals, and destructive-only red. |
| 4. Typography | 4/4 | Phase 19 surfaces use declared Archivo/IBM Plex Mono roles, 14/16/20sp sizes, 400/800 weights, tabular numeric values, and no private 18sp declaration. |
| 5. Spacing | 4/4 | Shared spacing, the approved 3dp/18dp local exceptions, 3dp focus offset, 48dp targets, responsive fact cells, and the full 82% sheet cap all match contract. |
| 6. Experience Design | 4/4 | Goal authority, every history/source path, exact focus return, neutral validation, D-pad, Back/Escape, landscape, 200% text, recovery, and reduced motion are source-tested. |

**Overall: 24/24**

**Classification:** **PASS — zero BLOCKER, WARNING, or FLAG findings.**

The required 24/24, no-BLOCK/FLAG gate is met. Phase 20 still owns native screenshots and device execution; that planned deferral is not a Phase 19 defect.

---

## Top 3 Priority Fixes

None remain. The three former priority groups were re-tested and are closed:

1. **All factual authority and Running drill-down — CLOSED.** Persisted source order now selects the nearest goal deterministically; every Active goal is actionable; a Running focal goal opens history and exact accepted-source revision, then restores the precise invoker.
2. **Selector/hero composition — CLOSED.** Sport/range controls use one approved enclosing segmented frame, the hero owns one Latest/Best/Target row, and embedded charts suppress the former duplicate fact strip.
3. **Shared state-shell and token drift — CLOSED.** Exact copy, sport colors, declared type roles, 3dp focus offset, complete 82% sheet cap, neutral initial target validation, and distance D-pad interaction are implemented and tested.

---

## Prior BLOCK/FLAG Re-test Ledger

| Prior area | Verdict | Current merged evidence |
|---|---|---|
| Complete All/Strength/Running roots | **PASS** | Running renders evidence notice, hero, pacing, goals, Best efforts and planned-next; Strength renders factual hero/chart/reviews/exercises; All renders either factual sport branch plus Active goals (`ProgressScreen.tsx:275-325,365-505`). |
| Nearest active goal ordering | **PASS** | `compareGoals` orders by persisted `sourceOrder`, explicit target date, sport, plan/target identity and revision; All sorts before selecting `primaryGoal` (`dashboardProjection.ts:34-40,490-505`). The adversarial cross-sport reorder case passes (`dashboardProjection.test.ts:440-501`). |
| All → Running history/source completion | **PASS** | All-Running supplies history, exact accepted activity/revision source callbacks, stable tokens, and ref registration (`ProgressScreen.tsx:454-470`). The end-to-end host interaction and return-focus case passes (`ProgressScreen.test.tsx:492-559`). |
| Every Active goal is actionable | **PASS** | `ActiveGoalRows` uses 48dp focusable buttons for both sports and selects the corresponding sport while retaining range (`ProgressScreen.tsx:204-230,450-471`). |
| Exact drill-down/focus graph | **PASS** | Stable maps resolve hero, row, recommendation, Running source, target and deep-route tokens (`ProgressScreen.tsx:587-604,714-760`); component tests cover All/Strength/Running source and exact invoker return. |
| Segmented-control composition | **PASS** | Both groups have one surface/border, 13dp radius, 3dp padding/gap, and borderless 9dp choices (`ProgressScreen.tsx:85-141,842-843`); semantics and Home/End behavior pass. |
| Nonduplicated hero facts | **PASS** | `HeroFactRow` is the single Latest/Best/Target owner and root charts receive `showSummaryFacts={false}` (`ProgressScreen.tsx:161-183,293-305,379-392,458-469`). |
| Three-cell facts / fontScale 2 | **PASS** | Normal layout is three equal cells with 1dp dividers; fontScale 2 stacks the same complete facts (`ProgressScreen.tsx:543-544,831-835`; `ProgressScreen.test.tsx:859-870`). |
| Unavailable versus Updating copy | **PASS** | Unavailable renders `Progress could not be loaded`, unchanged-facts assurance, and `Retry loading progress`; only rebuilding renders `Updating progress` (`ProgressScreen.tsx:72-82,663-666`). |
| Strength/Running identity colors | **PASS** | Strength hero/rows use orange; Running evidence/navigation use the blue action/focus token; actual history and goal line remain green/yellow (`ProgressScreen.tsx:224-236,376-393`; `FactualHistoryChart.tsx:311-324`). |
| Declared typography roles | **PASS** | Labels/prose use Archivo roles and data/date/time/target values use IBM Plex Mono roles; no raw `fontSize`, `fontFamily`, or `fontWeight` declaration remains in audited Phase 19 surfaces (`theme/index.ts:69-135`; `ProgressScreen.tsx:179-180`; `FactualHistoryChart.tsx:238-243,332-336`). |
| 3dp outline offset | **PASS** | Phase 19 scopes `FocusClearanceProvider` to 3dp and every `FocusablePressable` consumes the contextual offset (`ProgressScreen.tsx:705-825`; `components/index.ts:140-147,239-336`). Focused selector assertion passes at 3dp. |
| Full 82% sheet cap | **PASS** | The complete frame, including header and safe-area padding, has `maxHeight: "82%"` and clips/scrolls content inside it (`BottomSheet.tsx:306-368,388-404`). Target-sheet and shared-frame tests assert the surface cap. |
| 48dp interactive targets | **PASS** | Shared minimum is 48dp; selectors, source actions, disclosures, rows, days, fields and retries consume it (`theme/index.ts:49-63`; `FactualHistoryChart.tsx:345-357`; `RunningTargetSheet.tsx:370-380`). |
| Neutral unset-target validation | **PASS** | Validation is interaction-gated and resets on distance changes; an unset distance stays neutral until blur/save (`RunningTargetSheet.tsx:132,147-180,249-250,268-301`). |
| Distance/day keyboard interaction | **PASS** | Distance tabs and weekdays support Left/Right/Home/End plus Enter/Space with wrapped focus where required (`RunningTargetSheet.tsx:268-337`); host interaction tests pass. |
| Landscape / Back / Escape / reduced motion | **PASS** | Shared sheet computes bounded compact-landscape body height, routes Modal Back, Escape, close and scrim through one safe cancellation path, traps traversal, and removes translation at reduced motion (`BottomSheet.tsx:86-94,108-165,229-271,285-368`). |

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- **PASS — Contract copy is exact and state-specific.** All/Strength/Running labels, ranges, `Nearest active goal`, `Personal history`, `Open history`, `Evidence`, `Running goals`, `Best efforts`, `Garmin imported`, fixed/unset goal language, and sport-specific empty states match the approved contract (`ProgressScreen.tsx:72-82,204-325,417-505,651-666`).
- **PASS — Mutation/recovery language names the task and consequence.** Target, recommendation and bodyweight surfaces use `Save target`, `Discard target changes`, `Keep target unchanged`, `Use target`, explicit stale/failure assurances, and row-specific bodyweight actions (`RunningTargetSheet.tsx:254-350`; `RecommendationSurface.tsx:245-307`; `BodyweightHistorySheet.tsx:91-170`).
- **PASS — String scan found no prohibited generic `Submit`, `Click Here`, `OK`, `Done`, `Success`, `Apply`, or `Continue` CTA in the audited Phase 19 surfaces.**

### Pillar 2: Visuals (4/4)

- **PASS — The approved focal hierarchy is complete.** Each root has one factual hero rather than decorative cards; All follows persisted nearest-goal authority, Strength uses orange identity, and Running starts with its accepted-import evidence notice (`ProgressScreen.tsx:233-325,365-505`).
- **PASS — Selector and hero composition match Revision 18.** One 13dp enclosing frame owns three equal choices at the approved 3dp gap; the hero begins after 18dp with a 2dp rule; its only fact row is Latest/Best/Target and Gap remains written separately (`ProgressScreen.tsx:85-183,828-845`).
- **PASS — The chart remains supporting evidence.** Straight green source segments, outlined points, dashed yellow target segments, written summary, semantic label, complete pageable data, and exact source actions share one typed series (`FactualHistoryChart.tsx:254-342`).

### Pillar 3: Color (4/4)

- **PASS — Shared token allocation is disciplined.** The audited references are dominated by neutral text/surfaces (`textPrimary` 57, `textSecondary` 44, `divider` 11), with restrained focus/action blue (12 combined), orange Strength identity (2), green factual history (1), yellow goal/attention (3), and destructive-only red (5).
- **PASS — Sport and semantic meanings are not color-only.** Strength/Running identity accompanies written sport labels; green history accompanies factual values/status; yellow uses a dashed goal line plus `Goal <value>`/attention copy; destructive color appears with explicit bodyweight/error language (`ProgressScreen.tsx:204-236,365-393`; `FactualHistoryChart.tsx:305-337`).
- **PASS — No private Phase 19 hex/rgb color was found.** The sole hard-coded color in the audited shared surface is the approved 68% black sheet scrim (`BottomSheet.tsx:378-404`).

### Pillar 4: Typography (4/4)

- **PASS — Declared roles are used consistently.** Archivo owns prose, labels, controls and headings; IBM Plex Mono owns dates, times, targets, chart/table values and bodyweight data (`theme/index.ts:69-135`; `ProgressScreen.tsx:161-183`; `FactualHistoryChart.tsx:238-243,327-338`).
- **PASS — The former 18sp private input is gone.** Bodyweight and target inputs now consume `bodyNumeric`; audited surfaces contain no raw typography declaration and use the declared 14/16/20sp roles with only 400/800 weights (`BodyweightEditorSheet.tsx:109-142`; `RunningTargetSheet.tsx:357-380`).
- **PASS — Labels and values are separate text nodes.** Hero labels use Archivo body roles while values use tabular IBM Plex Mono, preserving wrapping and semantic clarity at large text (`ProgressScreen.tsx:170-181`).

### Pillar 5: Spacing (4/4)

- **PASS — Reusable spacing stays on the shared 4/8/16/24/32/48/64dp scale.** The only Phase 19 layout exceptions are the oracle-backed 3dp segmented gap/padding and 18dp hero separation; 9/13dp selector radii are component geometry (`ProgressScreen.tsx:828-845`; `theme/index.ts:34-63`).
- **PASS — Focus and target geometry is exact.** Progress focusables receive a 3dp outline with 3dp contextual offset, and required actions are at least 48dp (`ProgressScreen.tsx:705-825`; `components/index.ts:239-336`).
- **PASS — Sheet height is bounded at the complete surface.** The 82% frame cap includes header/safe-area content, while the inner body scrolls and compact landscape receives a measured numeric bound (`BottomSheet.tsx:86-94,306-404`).

### Pillar 6: Experience Design (4/4)

- **PASS — All goal authority and task completion are deterministic.** Cross-sport goals are selected by persisted source order and tie-breakers, every Active goal changes sport without losing range, and Running heroes/Best efforts reach the correct history and exact accepted source revision (`dashboardProjection.ts:34-40,490-505`; `ProgressScreen.tsx:204-230,275-325,428-473`).
- **PASS — State coverage remains honest.** Loading, empty, sparse, target-only, missing effort, rebuild, unavailable, stale, mutation failure and retry states preserve source facts and never synthesize zero (`ProgressScreen.tsx:275-325,417-426,663-666`; `RunningTargetSheet.tsx:170-250,340-350`).
- **PASS — Accessibility interactions are source-complete.** Sport/range and target/day groups expose selected state and keyboard movement; source/history controls are 48dp; deep routes and sheets restore exact invoking focus; Modal Back, Escape, scrim and close share no-write dismissal (`ProgressScreen.tsx:85-141,587-604,705-760`; `RunningTargetSheet.tsx:268-337`; `BottomSheet.tsx:229-368`).
- **PASS — Responsive and motion contracts are implemented.** Four required widths retain one scroll owner; facts stack at fontScale 2; chart/sheets adapt in landscape; reduced motion removes translation while preserving state, focus and callbacks (`ProgressScreen.test.tsx:845-870`; `FactualHistoryChart.tsx:254-310`; `BottomSheet.tsx:86-144`). Native visual confirmation remains Phase 20-owned without penalty.

---

## Host Evidence Run

- **PASS:** 9 focused Phase 19 component/route suites, 85 tests.
- **PASS:** Shared `BottomSheet` suite, 9 tests covering heading focus, one no-write close/Back/Escape/scrim path, exact trigger restoration, focus trapping, keyboard/D-pad traversal, and keyboard-safe geometry.
- **PASS:** `dashboardProjection` unit suite, 13 tests including persisted cross-sport nearest-goal ordering.
- **PASS:** Total targeted audit run: 11 suites, 107 tests.
- **PASS:** `npm run typecheck`.
- **PASS:** `npm run check:boundaries` across 429 files.
- **Not run by design:** Android build/install, APK/device identity, native screenshots, native semantic/focus/input execution, fontScale 2 captures, landscape captures, and attended checks. Phase 20 owns those and no Phase 19 score was deducted.

## Files Audited

- Authority: `.planning/v1.2-OWNER-DECISIONS.md`, `.planning/v1.2-OWNER-BRIEF.md`, `.planning/design/v1.2-SOURCE-PRECEDENCE.md`, Phase 19 CONTEXT/UI-SPEC/prior UI review/final review-fix chain, Phase 19 PLAN/SUMMARY artifacts, Revision 18 `approved.json`, rendered Progress source, and focused Revision 18 audit.
- Root/domain/runtime: `app/(tabs)/progress.tsx`, `src/ui/screens/ProgressScreen.tsx`, `src/domains/progress/contracts.ts`, `src/domains/progress/dashboardProjection.ts`, `src/platform/sqlite/repositories/progressRepository.ts`, `src/bootstrap/workoutAppRuntime.tsx`, `src/bootstrap/runningPlanRuntime.tsx`.
- Histories/routes: `FactualHistoryChart.tsx`, `RunningHistorySheet.tsx`, `ExerciseHistoryScreen.tsx`, `app/exercise-history/[exerciseId].tsx`, `app/session/[sessionId].tsx`, `app/garmin/activity/[activityId].tsx`.
- Decisions/settings: `RunningTargetSheet.tsx`, `RecommendationSurface.tsx`, `ProgressSettingsSheet.tsx`, `BodyweightHistorySheet.tsx`, `BodyweightEditorSheet.tsx`.
- Shared UI: `BottomSheet.tsx`, `src/ui/components/index.ts`, `AdaptiveScreen.tsx`, `src/ui/theme/index.ts`.
- Evidence: focused component/route/domain tests named in Host Evidence Run. Registry audit was not applicable because `components.json` is absent and UI-SPEC declares no third-party registries.

## Recommendation Count

- Priority fixes: 0
- Minor recommendations: 0
- BLOCKER findings: 0
- WARNING/FLAG findings: 0
