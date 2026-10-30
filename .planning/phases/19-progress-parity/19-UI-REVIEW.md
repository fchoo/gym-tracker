# Phase 19 — UI Review

**Audited:** 2026-10-14
**Baseline:** Approved Phase 19 UI-SPEC → PRO-10 → owner decisions/brief → v1.2 source precedence → approved Revision 18
**Source:** Exact current merged `fchoo/UX-revamp` HEAD `0932f7c87a189e72db3f3a39e691644efddd9821`
**Screenshots:** Current implementation screenshots not captured — no dev server answered on 3000, 5173, or 8080. Native/device evidence remains Phase 20-owned and carries no Phase 19 score penalty.
**Scope:** Immutable-pair source-action deduplication; per-set factual text; invalid/missing fallback; deterministic order; repeated activation; 3dp focus; 48dp/keyboard/D-pad; load-chart isolation; Light/Dark/wrapping; all prior Progress/sheet contracts
**Excluded:** Dirty Phase 14 evidence, `19-VERIFICATION.md`, and unrelated review/source work. This audit changes only this report.

The approved `19-UI-SPEC.md` remains byte-identical (`199e9b8bc1f0c9cea221008dd8a30f1dae0cad78537e73af6a84058f57212390`). Revision 18 HTML/JSON/focused-audit hashes remain exact. The current rendered-UI delta is limited to Exercise History source-action deduplication and its regression test.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 4/4 | Every set retains factual visit/observation text; valid and unavailable source states remain explicit. |
| 2. Visuals | 4/4 | Deduplication removes repeated controls without removing rows, reordering facts, or duplicating load-chart actions. |
| 3. Color | 4/4 | Actions/fallbacks continue using semantic focus and secondary-text tokens with written non-color meaning. |
| 4. Typography | 4/4 | Visit, action, and fallback text retains declared wrapping Archivo roles with no private typography. |
| 5. Spacing | 4/4 | Unique actions retain 48dp targets, 3dp ring/offset, shared padding, and responsive width-independent flow. |
| 6. Experience Design | 4/4 | Unique-pair identity, deterministic first action, exact repeated activation, keyboard routing, fallback, and all Progress states are tested. |

**Overall: 24/24**

**Classification:** **PASS — 0 BLOCKER, 0 WARNING, 0 REGISTRY FLAG.**

The required 24/24, zero-finding certification gate is met at exact current HEAD. Native Phase 20 evidence remains deferred without penalty.

---

## Top 3 Priority Fixes

None remain. The three final deduplication risks were freshly re-tested and are closed:

1. **One action per immutable pair — CLOSED.** Valid non-load sources are keyed by the exact `sessionId + NUL + sourceRevision` pair; the first occurrence owns the only action and later duplicate rows remain factual text without a repeated control (`ExerciseHistoryScreen.tsx:125-135,394-465`; `ExerciseHistoryScreen.test.tsx:317-382`).
2. **Fallback and load isolation — CLOSED.** Invalid/missing revisions retain per-row `Source unavailable`; `load_reps` still uses only the factual chart/data source path and receives no row-level duplicates (`ExerciseHistoryScreen.tsx:136-159,444-465`).
3. **Deterministic interaction/focus — CLOSED.** Ordered data yields ordered unique controls; repeated activation dispatches the same exact pair each time, and focused actions retain Phase 19's 3dp ring/offset and 48dp target (`ExerciseHistoryScreen.test.tsx:317-397`; `ExerciseHistoryScreen.tsx:506-546`).

---

## Targeted Deduplication Re-test Ledger

| Area | Verdict | Current-HEAD evidence |
|---|---|---|
| Immutable identity key | **PASS** | Only positive safe revisions produce a key; key material is exact session ID plus NUL plus revision, preventing concatenation ambiguity (`ExerciseHistoryScreen.tsx:125-135`). |
| One action per unique pair | **PASS** | A screen-wide `Set` suppresses only subsequent valid duplicate pairs across ordered segments/sets (`ExerciseHistoryScreen.tsx:394-465`). |
| Deterministic order | **PASS** | First occurrence wins during stable segment/comparable-set iteration; tests assert shared pair first and unique pair second (`ExerciseHistoryScreen.test.tsx:317-382`). |
| Per-set factual text retained | **PASS** | All three duplicate/unique sets retain their own date, ordinal, and metric observation even though only two actions render (`ExerciseHistoryScreen.test.tsx:354-366`). |
| Repeated activation exactness | **PASS** | Shared → unique → shared presses dispatch exactly `[(session-shared,11),(session-unique,12),(session-shared,11)]` (`ExerciseHistoryScreen.test.tsx:374-382`). |
| Invalid/missing fallback | **PASS** | Null/invalid keys are never added to the seen set; every affected set still renders `Source unavailable` and cannot navigate (`ExerciseHistoryScreen.tsx:136-159,445-465`). |
| No load-chart duplicates | **PASS** | `load_reps` bypasses row source actions entirely and retains the single `FactualHistoryChart` disclosure/source path (`ExerciseHistoryScreen.tsx:192-264,445-465`). |
| 48dp target | **PASS** | Source action retains `minHeight: 48`, shared padding, no fixed width, and wrapping text (`ExerciseHistoryScreen.tsx:537-546`). |
| Keyboard/D-pad | **PASS** | Shared `FocusablePressable` supplies Enter/Space, native focus, preferred-focus handoff, and D-pad-compatible semantics (`components/index.ts:239-338`). |
| Focus geometry | **PASS** | Exercise History owns `clearance={3}` across all states; deduplication test and focused-action test assert 3dp offset/ring (`ExerciseHistoryScreen.tsx:501-509`; `ExerciseHistoryScreen.test.tsx:367-397`). |
| Light/Dark | **PASS** | Action uses `focusRing`, fallback uses `textSecondary`, and cards retain shared Light/Dark surfaces; no raw color was introduced. |
| Responsive / 200% mechanics | **PASS** | Rows remain vertically flowing and width-independent inside the adaptive scroll owner; factual text wraps and controls preserve 48dp without a fixed text width. Native capture remains Phase 20-only. |
| Existing Progress/sheet contracts | **PASS** | Retry identity, ordering/focus, selectors/heroes, exact drill-downs, 3dp sheet focus, 16dp inset, 82% cap, typography, colors, and recovery remain green. |

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- **PASS — Deduplication affects controls only.** Every set retains exact factual visit/date/ordinal/observation copy.
- **PASS — Availability remains explicit.** Valid first occurrences say `Open source`; every invalid or missing source says `Source unavailable`.
- **PASS — Existing Phase 19 copy remains exact.** No generic or inferred wording was introduced.

### Pillar 2: Visuals (4/4)

- **PASS — Repeated controls are removed without hiding evidence.** Duplicate source pairs retain all factual rows while exposing one restrained action.
- **PASS — Ordering remains source-order deterministic.** Deduplication does not sort or regroup user-visible facts.
- **PASS — Load history remains singular.** Load charts/data keep their existing source controls with no extra row actions.

### Pillar 3: Color (4/4)

- **PASS — Semantic token use is unchanged.** Navigable actions use `focusRing`; unavailable source copy uses `textSecondary`; cards remain theme-owned.
- **PASS — Meaning is not color-only.** Action/fallback text explicitly states availability.

### Pillar 4: Typography (4/4)

- **PASS — Declared roles remain intact.** Visit, action, and fallback copy use the approved secondary Archivo role.
- **PASS — Factual text remains per-set and wrapping.** No ellipsis, forced single line, or raw typography was introduced.

### Pillar 5: Spacing (4/4)

- **PASS — Action geometry remains exact.** Controls retain 48dp minimum height, shared horizontal padding, restrained radius, and no fixed width.
- **PASS — Focus geometry remains exact.** Exercise History's screen-owned provider yields a 3dp ring with 3dp offset for each unique action.
- **PASS — Shared sheets remain exact.** Progress sheets retain 3dp/3dp focus, 16dp inset, 48dp close target, 24dp corners, and 82% cap.

### Pillar 6: Experience Design (4/4)

- **PASS — Deduplication is identity-exact and replay-stable.** Each valid immutable pair owns one control; repeated use dispatches the same pair without mutating evidence.
- **PASS — Invalid data fails closed.** Invalid revisions cannot create an action and continue to show per-row fallback.
- **PASS — Interaction/state coverage remains complete.** Touch, Enter, Space, D-pad, Back, Light/Dark, adaptive flow, loading/empty/error/freshness, and all prior Progress interactions remain intact.

---

## Host Evidence Run

- **PASS:** Expanded Phase 19/shared component and route matrix: **17 suites, 238 tests**.
- **PASS:** Runtime/projection/history unit matrix: **3 suites, 38 tests**.
- **PASS:** Progress and Exercise History real-SQLite repositories: **2 suites, 38 tests**.
- **PASS:** Total targeted current-HEAD certification: **22 suite invocations, 314 tests**.
- **PASS:** `npm run typecheck`.
- **PASS:** `npm run check:boundaries` across **430 files**.
- **PASS:** Screenshot `.gitignore` gate present; no screenshot binary was added.
- **Registry audit:** Not applicable — `components.json` is absent and UI-SPEC declares zero third-party registry blocks.
- **Not run by design:** Android/native screenshots, physical D-pad, native focus captures, fontScale 2 captures, landscape captures, and attended checks. Phase 20 owns those and no score was deducted.

## Files Audited

- Authority: Phase 19 UI-SPEC, PRO-10, CONTEXT, current UI review, v1.2 owner/source-precedence documents, Revision 18 references.
- Targeted UI: `ExerciseHistoryScreen.tsx`, `ExerciseHistoryScreen.test.tsx`, `app/exercise-history/[exerciseId].tsx`, route tests, `FactualHistoryChart.tsx`, and shared focusable implementation.
- Regression UI: `ProgressScreen.tsx`, all Phase 19 sheets/history components, `BottomSheet.tsx`, `bottomSheetFocus.ts`, `AdaptiveScreen.tsx`, and theme tokens.
- Current-head delta: `365ba691`, merge `0932f7c8`.
- Evidence: the 22 suite invocations above plus static copy/color/type/spacing/focus/deduplication/provider-tree scans.

## Recommendation Count

- Priority issues: 0
- Minor recommendations: 0
- BLOCKER findings: 0
- WARNING findings: 0
- REGISTRY FLAG findings: 0
