# Phase 19 — UI Review

**Audited:** 2026-10-14
**Baseline:** Approved Phase 19 UI-SPEC → owner decisions/brief → v1.2 source precedence → approved Revision 18 JSON/HTML
**Source:** Exact current merged `fchoo/UX-revamp` HEAD `d97ea569fc6f8671df94f68e64635c55d06864aa`
**Screenshots:** Current implementation screenshots not captured — no dev server answered on 3000, 5173, or 8080. Android/device screenshots remain explicitly Phase 20-owned and carry no Phase 19 score penalty.
**Scope:** All six UI pillars; all prior Phase 19 findings; `867c369c` leaf focus-clearance fix; 3dp ring/offset; focus trap/return; keyboard/D-pad/Back/Escape/scrim; 48dp close; 16dp default sheet inset; 82% cap; typography; responsive layouts; exact history/source routes
**Excluded:** Unrelated dirty Phase 14 evidence and concurrent Phase 16/19 review documents. This audit changes only this report.

Revision 18 source identity remains exact: HTML `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`, approval JSON `b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf`, and focused audit `3d121af24fe92907ab035ab49f50473107043bcd9ea126722d5d2132ece7c048`. The approved `19-UI-SPEC.md` remains byte-identical (`199e9b8bc1f0c9cea221008dd8a30f1dae0cad78537e73af6a84058f57212390`).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 4/4 | Exact factual, recovery, decision, destructive, sheet-close, and source-route copy remains contract-specific. |
| 2. Visuals | 4/4 | Revision 18 hierarchy, selector/hero/chart composition, 16dp sheet alignment, 82% cap, and frame-owned close remain exact. |
| 3. Color | 4/4 | Light/Dark semantic allocation and the close action's neutral/focus colors remain disciplined and non-color-equivalent. |
| 4. Typography | 4/4 | Progress and sheet surfaces retain declared Archivo/IBM Plex Mono roles with no private type declarations. |
| 5. Spacing | 4/4 | Progress now renders the required 3dp ring with 3dp offset while retaining 48dp targets, 16dp inset, 24dp corners, and 82% cap. |
| 6. Experience Design | 4/4 | Focus trap/return, keyboard/D-pad, Back/Escape/scrim, source routes, recovery, large text, and responsive behaviors are source-tested. |

**Overall: 24/24**

**Classification:** **PASS — 0 BLOCKER, 0 WARNING, 0 REGISTRY FLAG.**

The required 24/24, zero-BLOCKER/WARNING/FLAG certification gate is met at exact current HEAD. Native screenshots/device execution remain Phase 20-only and were not scored down.

---

## Top 3 Priority Fixes

None remain. The three final certification risks were freshly re-tested and are closed:

1. **Scoped close-action focus geometry — CLOSED.** `BottomSheetCloseAction` consumes the cycle-free `useFocusClearance()` leaf hook; default sheets retain 4dp while every Progress-owned sheet inherits the scoped 3dp value and renders a 3dp ring with 3dp offset (`BottomSheet.tsx:24-28,65-147`; `bottomSheetFocus.ts:15-29`; `ProgressScreen.tsx:730`; `BottomSheet.test.tsx:149-179`).
2. **Public sheet behavior after cycle removal — CLOSED.** Frame-owned close remains 48dp, keyboard/D-pad reachable, trapped, disabled when required, and routed through the same no-write close/Back/Escape/scrim cancellation and exact-focus-return path (`BottomSheet.tsx:65-147,284-366,382-462,497-506`).
3. **Shared leaf/coverage classification — CLOSED.** The provider export remains public through `components/index.ts`, both generic focusables and the sheet close consume the same leaf context, and the valid integrity-registry entry adds no runtime authority or UI drift.

---

## Current-HEAD Re-test Ledger

| Area | Verdict | Current-HEAD evidence |
|---|---|---|
| Leaf focus-clearance architecture | **PASS** | `FocusClearanceProvider` and `useFocusClearance` live in `bottomSheetFocus.ts`; neither BottomSheet nor the shared focusable needs a barrel-cycle import (`bottomSheetFocus.ts:15-29`; `components/index.ts:55-91,243-326`). |
| Default versus Progress-scoped focus | **PASS** | Regression tests assert default `4/3` offset/ring and Progress-scoped `3/3`; Progress wraps roots and sheets in `clearance={3}` (`BottomSheet.test.tsx:149-179`; `ProgressScreen.tsx:730-850`). |
| Default sheet inset | **PASS** | Phase 19 passes no `horizontalInset`, retaining shared 16dp header/content padding (`BottomSheet.tsx:205-207,426-456,489-508`; `BottomSheet.test.tsx:185-207`). |
| Complete 82% cap | **PASS** | The full frame remains bottom-anchored with 24dp top corners, 1dp border, and `maxHeight: "82%"`; the scroll body remains bounded inside it (`BottomSheet.tsx:402-462,482-508`). |
| Frame-owned close semantics | **PASS** | Close has a specific accessible label/role/state, is disabled when cancellation is disabled, and invokes the frame-owned cancellation path (`BottomSheet.tsx:65-147,324-366,426-442`). |
| Close-action target | **PASS** | Height, width, and minimum dimensions are exactly 48dp; icon size is 24dp with 2dp stroke (`BottomSheet.tsx:139-146,497-506`; `BottomSheet.test.tsx:88-117`). |
| Focus trap and exact return | **PASS** | Close registers with the sheet trap; traversal wraps, cancellation restores the exact invoker, and native-ID fallback remains (`BottomSheet.tsx:79-100,241-366`; `BottomSheet.test.tsx:209-453`). |
| Keyboard/D-pad/Back/Escape/scrim | **PASS** | Enter/Space activates close, disabled close ignores activation, arrows/Tab stay inside the modal, and Modal Back/Escape/scrim use one no-write path (`BottomSheet.tsx:102-147,324-366,380-462`). |
| Typography and color | **PASS** | Heading remains `screenTitle`; local close uses semantic `textPrimary`, `divider`, `surfaceSubtle`, and `focusRing`; no raw type or private color was introduced (`BottomSheet.tsx:125-146,426-442`). |
| Responsive/large-text sheet behavior | **PASS** | Compact landscape retains measured height and scroll space while frame/header/content stay reachable (`BottomSheet.tsx:178-207,402-462`; `BottomSheet.test.tsx:375-453`). |
| Edited target retries | **PASS** | Changed retained drafts rotate request identity while exact retries retain their receipt (`RunningTargetSheet.tsx:97-106,204-218`; `runningPlanRuntime.test.tsx:205-268`). |
| Goal ordering and Active-goal focus | **PASS** | Persisted cross-sport ordering remains deterministic and Active-goal activation transfers focus to the selected tab while retaining range (`progressRepository.test.ts:1448-1524`; `ProgressScreen.test.tsx:282-315`). |
| Drill-down/source graph | **PASS** | Running/Strength histories, accepted source revisions, recommendations, target/settings/bodyweight sheets, and exact invoker return remain covered (`ProgressScreen.test.tsx:446-984`; `garmin-activity-route.test.tsx`). |
| Selector/hero/large-text composition | **PASS** | One framed selector per group, one Latest/Best/Target owner, one scroll owner at required widths, and fontScale 2 stacking remain unchanged (`ProgressScreen.tsx:85-190,853-870`; `ProgressScreen.test.tsx:232-260,854-879`). |

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- **PASS — Phase 19 copy remains exact and task-specific.** Sport/range labels, factual states, recovery actions, target/recommendation/bodyweight consequences, close labels, and source-route copy match the approved contract.
- **PASS — Calendar wording remains isolated.** Calendar-specific missing/Back copy does not enter Progress management or exact-revision routes.
- **PASS — Generic-label scan is clean.** No prohibited bare `Submit`, `OK`, `Done`, `Success`, `Apply`, `Continue`, `Cancel`, or `Save` CTA exists in the audited Phase 19 surfaces.

### Pillar 2: Visuals (4/4)

- **PASS — Revision 18 hierarchy and composition are unchanged.** Header/actions, selectors, one factual hero, evidence/history, sport sections, and planned-next order remain intact.
- **PASS — Shared sheet composition remains exact.** Default 16dp alignment, 24dp top corners, 82% complete-frame cap, semantic heading, circular trailing close, and scroll body are preserved (`BottomSheet.tsx:402-508`).
- **PASS — Close icon matches the shared visual vocabulary.** It remains an outlined 24dp X at 2dp stroke inside a 48dp target, with decorative SVG hidden from accessibility (`BottomSheet.tsx:139-147,497-506`).

### Pillar 3: Color (4/4)

- **PASS — Phase 19 token allocation remains disciplined.** Neutral surfaces/copy dominate; blue remains focus/navigation/Running identity, orange Strength identity, green factual history, yellow goals/attention, and red destructive/error only.
- **PASS — Close states use semantic tokens.** Pressed, border, icon, disabled, and focus states use `surfaceSubtle`, `divider`, `textPrimary`, and `focusRing`; the only hard-coded shared-sheet color remains the approved 68% black scrim (`BottomSheet.tsx:125-146,472-508`).

### Pillar 4: Typography (4/4)

- **PASS — Declared roles remain intact.** Phase 19 consumes the approved Archivo/IBM Plex Mono 14/16/20sp roles and 400/800 weights with tabular numeric values.
- **PASS — The focus fix adds no type drift.** The frame heading remains `typeScale.screenTitle`, and the icon-only close exposes a semantic accessible label instead of hidden text (`BottomSheet.tsx:426-442`).

### Pillar 5: Spacing (4/4)

- **PASS — Layout spacing remains contract-compliant.** Phase 19 retains the shared 4/8/16/24/32/48/64dp scale, approved 3dp selector and 18dp hero exceptions, 16dp sheet inset, 48dp controls, 24dp corners, and 82% cap.
- **PASS — Focus geometry is now exact.** Under Progress, both ring width and outline offset resolve to 3dp through the shared leaf context (`BottomSheet.tsx:76,125-135`; `bottomSheetFocus.ts:15-29`; `ProgressScreen.tsx:730`; `BottomSheet.test.tsx:149-179`).
- **PASS — Default behavior is preserved.** Sheets outside a scoped provider retain the shared 4dp default clearance; the fix does not globally mutate existing roots.

### Pillar 6: Experience Design (4/4)

- **PASS — Public sheet behavior is preserved.** Frame close, heading focus, trap/wrap, exact trigger return, inert background, IME-safe scrolling, disabled state, Enter/Space, D-pad/Tab, Back, Escape, and scrim all remain executable.
- **PASS — Prior Phase 19 behaviors remain closed.** Retry identity, goal ordering, Active-goal focus transfer, all history/source drill-downs, recovery, mutation fencing, responsive widths, fontScale 2, and reduced motion pass.
- **PASS — The former warning is regression-protected.** One test proves default 4dp; a separate provider-scoped test proves Progress's required 3dp/3dp geometry, so the source contract and test oracle now agree.

---

## Host Evidence Run

- **PASS:** Expanded Phase 19/shared component and route matrix: **17 suites, 234 tests**.
- **PASS:** Final fix5 runtime/domain suites: **2 suites, 28 tests**.
- **PASS:** Real-SQLite Progress repository suite: **1 suite, 28 tests**.
- **PASS:** Total targeted current-HEAD certification: **20 suite invocations, 290 tests**.
- **PASS:** `npm run typecheck`.
- **PASS:** `npm run check:boundaries` across **430 files**.
- **PASS:** Screenshot `.gitignore` gate present; no screenshot binary was added.
- **Registry audit:** Not applicable — `components.json` is absent and UI-SPEC declares zero third-party registry blocks.
- **Not run by design:** Android build/install, APK/device identity, native screenshots, native semantic/focus/input execution, fontScale 2 captures, landscape captures, and attended checks. Phase 20 owns those and no score was deducted for their absence.

## Files Audited

- Authority: Phase 19 CONTEXT/UI-SPEC/PLAN/SUMMARY/VERIFICATION/prior UI review, v1.2 owner/source-precedence documents, Revision 18 JSON/HTML/focused audit.
- Phase 19 UI: `ProgressScreen.tsx`, `FactualHistoryChart.tsx`, `RunningHistorySheet.tsx`, `RunningTargetSheet.tsx`, `RecommendationSurface.tsx`, `ProgressSettingsSheet.tsx`, `BodyweightHistorySheet.tsx`, `BodyweightEditorSheet.tsx`, `ExerciseHistoryScreen.tsx`, and route adapters.
- Shared/current-HEAD UI: `BottomSheet.tsx`, `BottomSheet.test.tsx`, `bottomSheetFocus.ts`, `src/ui/components/index.ts`, `AdaptiveScreen.tsx`, `src/ui/theme/index.ts`.
- Current-head delta: `867c369c`, merge `d97ea569`, and `scripts/phase19-integrity-coverage.json`.
- Evidence: the 20 suite invocations above plus static copy/color/type/spacing/focus/registry scans.

## Recommendation Count

- Priority issues: 0
- Minor recommendations: 0
- BLOCKER findings: 0
- WARNING findings: 0
- REGISTRY FLAG findings: 0
