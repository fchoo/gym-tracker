---
phase: 17
phase_name: library-running-plans
audited: "2026-10-11"
baseline: .planning/phases/17-library-running-plans/17-UI-SPEC.md
screenshots: not captured (no dev server on ports 3000, 5173, or 8080)
native_proof: deferred by owner; not scored as a defect
registry_audit: skipped (components.json absent; UI-SPEC declares no third-party registries)
overall_score: 20/24
status: passed
recommendation: clean at source-contract level; proceed to deferred native proof
---

# Phase 17 — UI Review

## UI REVIEW COMPLETE

This is a final source-and-component-suite confirmation after `6758311`, `0befdb8a`, `2b0eaef`, `2bfd7f7`, and the related Phase 17 fixes. No product source was changed and no commit was created. The existing review was overwritten with this report.

## Pillar Scores

| Pillar | Score | Key finding |
|---|---:|---|
| 1. Copywriting | 4/4 | Required facts, exact recovery copy, seven session labels/summaries, success/count language, and component-suite labels are present and covered by passing tests. |
| 2. Visuals | 3/4 | The source has the required hierarchy and chooser geometry, but rendered 200% text, long-name wrapping, landscape balance, and keyboard-visible composition were not captured. |
| 3. Color | 3/4 | Themed light/dark semantic tokens and sport/status roles are wired; rendered 60/30/10 composition and contrast remain unobserved. |
| 4. Typography | 3/4 | Shared Archivo/IBM Plex roles and contract sizes are used in the audited Phase 17 surfaces; 200% wrapping and native font rendering remain unverified. |
| 5. Spacing | 3/4 | AdaptiveScreen, the 4dp spacing scale, and 64/88/120 geometry are source-backed; runtime safe-area, expansion, and keyboard reachability remain unobserved. |
| 6. Experience Design | 4/4 | All prior named interaction defects are fixed and the full component suite is green, including save recovery, first-invalid focus, Escape reorder, draft/delete restoration, lifecycle, and collision confirmation paths. |

**Overall: 20/24**

## Prior Finding Confirmation

| Prior finding | Result | Evidence |
|---|---|---|
| Goal facts | Verified | `RunningPlanDetailScreen.tsx:25` and `RunningPlanEditorScreen.tsx:159-174` render goal distance, target time/pace, runs/week, available days, long-run day, and current weekly distance with units. |
| Benchmark provenance and dates | Verified | `RunningPlanDetailScreen.tsx:25` reads benchmark value, provenance, and recorded date; `runningFormDraft.ts:52-67` rejects impossible calendar dates and tests cover leap-year and invalid-date cases. |
| Week/day facts | Verified | The editor and detail surfaces render weekly count, selected days, long-run day, and stable weekday session slots. |
| Distance facts and units | Verified | `RunningSessionFields.tsx:149-166,170-183` preserves distance/time/pace/heart-rate/RPE units in preview and persisted readback. |
| Seven summaries and effort units | Verified | The seven kinds are enumerated in `RunningSessionFields.tsx` and `RunningPlanEditorScreen.tsx:176-177`; Recovery, Long run, Progression, Tempo, Intervals, Hills, and Fartlek have distinct summaries, and Hills/structured Fartlek include effort targets plus unit-bearing quantities. `RunningSessionFields.test.tsx` covers the branches. |
| Exact copy, success, and count | Verified | Chooser copy is exact in `PlanTypeChooserScreen.tsx:44-62`; save success explicitly says activation stays separate in `RunningPlanEditorScreen.tsx:139-145` and `RunningSessionEditorScreen.tsx:176-181`; the full component suite now passes all former stale-label/count contracts. |
| Save-error heading, focus, and retry | Verified | Both save catches render noun-specific headings and retry actions; `RunningPlanEditorScreen.tsx:94-100,178` and `RunningSessionEditorScreen.tsx:153-158,178-192` focus stable error-heading IDs after async failure. Focus/retry tests pass. |
| First-invalid focus | Verified | Plan validation maps each plan error to a ref in `RunningPlanEditorScreen.tsx:115-125`; session validation returns the first visible field and uses stable native IDs in `RunningSessionEditorScreen.tsx:144-152` and `RunningSessionFields.tsx:102-136`. |
| Escape reorder | Verified | `PlanEditorFields.tsx:396-407` handles ordinary Escape before the Shift-key arrow guard and clears the reorder preview without mutating the order. |
| Delete/draft focus restoration | Verified | `RunningPlanEditorScreen.tsx:34-44,81-92,177-183` restores focus to the next row, previous row, or Add session after deletion and restores the launching action through draft/confirmation flows. Tests pass. |
| Chooser geometry | Verified at source level | `PlanTypeChooserScreen.tsx:83-100,104-110` gives Strength and Running equal focusable choices, 48dp-capable pressables, equal `minHeight: 156`, shared spacing, identity labels, and required copy. |
| Themed AdaptiveScreen / 64 / 88 / 120 | Verified at source level | Running screens use `AdaptiveScreen`; `src/ui/theme/index.ts:32-61` defines the 4dp scale, 48/56 targets, and 64/88/120 geometry; `AdaptiveScreen.tsx:197-216` applies keyboard-adjusted scrolling and safe-area/dock composition. |
| Lifecycle/collision confirmations | Verified | `RunningPlanDetailScreen.tsx:34-41` keeps operation-specific confirmation labels/consequences and retains review on failure; collision review uses `ScheduleConflictSheet` and the current confirmation token path. Related component/integration contracts pass. |
| Dark / 200% source contracts | Source contract verified; runtime deferred | Semantic light/dark tokens are consumed by the Phase 17 screens and shared controls; type roles use the declared Archivo/IBM Plex families and 14/16/20 sizes. No native screenshot or 200% runtime proof was requested, so this is not classified as a defect. |
| Component suite labels | Verified | `npm run test:components -- --runInBand` passes 71 suites and 684 tests, including the formerly failing retry and reorder label suites. |

## Top 3 Priority Follow-ups

These are deferred verification items, not unresolved Phase 17 source defects:

1. Capture the native deep routes at 200% text and landscape to confirm long facts, error/retry copy, seven summaries, and chooser choices reflow without clipping.
2. Capture Light and Dark native states to confirm the declared 60/30/10 composition, small-text contrast, focus ring, blue Running context, green success, and red destructive roles.
3. Run the owner’s native accessibility/device matrix for keyboard/D-pad focus and safe-area/keyboard reachability; specifically exercise save-error focus, first-invalid focus, Escape reorder, delete restoration, and lifecycle/collision confirmation retry.

## Detailed Findings

### Pillar 1: Copywriting (4/4)

The previously reported factual and copy defects are closed. Goal, benchmark provenance/date, target date, weekly count, selected weekdays, long-run day, current weekly distance, and session readback are explicit in `src/ui/screens/RunningPlanDetailScreen.tsx:24-25` and `src/ui/screens/RunningPlanEditorScreen.tsx:159-177`. The seven typed session summaries retain user-facing units and effort context in `src/ui/components/RunningSessionFields.tsx:149-183`.

The chooser matches the contract at `src/ui/screens/PlanTypeChooserScreen.tsx:44-62`. Save success and failure copy is noun-specific and keeps activation separate. The formerly stale generic retry/reorder labels are reconciled: the full component run passed 71/71 suites and 684/684 tests.

### Pillar 2: Visuals (3/4) — WARNING

Source structure now provides the required deep-route hierarchy: header, status, identity, explanation, flat factual rows, weekly structure, typed session rows, and explicit actions (`RunningPlanDetailScreen.tsx:24-41`). The neutral chooser has equal Strength/Running choice structure and explicit equal minimum geometry (`PlanTypeChooserScreen.tsx:83-110`).

The score remains 3 because no dev server was available and native proof is deferred. There is no rendered evidence for 200% text, long plan names, landscape, safe-area headers, or keyboard-visible editor composition. Those are verification gaps, not claims that the source contract is absent.

### Pillar 3: Color (3/4) — WARNING

The Phase 17 surfaces consume `useAppTheme` and semantic roles rather than local palette forks (`RunningPlanDetailScreen.tsx:24-25`, `RunningPlanEditorScreen.tsx:56`, `PlanTypeChooserScreen.tsx:38-99`). Light and dark tokens, Running blue, success green, attention yellow, destructive red, and focus blue are defined in `src/ui/theme/index.ts:211-233`.

Rendered 60/30/10 distribution, dark-theme contrast, and focus-ring appearance could not be observed without native rendering. No hard-coded Phase 17 palette violation was found in the audited source.

### Pillar 4: Typography (3/4) — WARNING

The shared Phase 14 type contract is consumed by the audited Phase 17 routes: 20sp/24sp Archivo 800 headings, 16sp/22sp body/control, and 14sp/20sp supporting labels (`src/ui/theme/index.ts:67-119`; `RunningPlanDetailScreen.tsx:24-25`; `RunningPlanEditorScreen.tsx:159-177`; `RunningSessionFields.tsx:170-183`). Data-like readbacks remain separated from prose roles.

The remaining warning is evidence-only: Android font scaling and 200% wrapping/clipping were not run. Native proof is deferred and is not a shipping blocker in this review.

### Pillar 5: Spacing (3/4) — WARNING

The shared tokens define the declared 4/8/16/24/32/48/64 scale plus 48dp minimum target, 56dp action, 64dp deep header, 88dp collection row, and 120dp active-plan row (`src/ui/theme/index.ts:32-61`). `AdaptiveScreen.tsx:177-245` supplies safe-area, keyboard-adjusted scrolling, and dock-aware content; chooser and session controls use the shared spacing tokens.

Runtime geometry is not captured. The remaining uncertainty is whether long content expands every row/header and keeps Save, retry, and confirmation actions reachable at 200% text and keyboard-visible states.

### Pillar 6: Experience Design (4/4)

The formerly identified interaction gaps are fixed and test-backed:

- Save failures retain drafts, announce noun-specific recovery, focus the error heading, and expose noun-specific retry actions (`RunningPlanEditorScreen.tsx:94-100,137-146,178`; `RunningSessionEditorScreen.tsx:153-182,192`).
- First-invalid focus is field-specific for plan and all seven session forms (`RunningPlanEditorScreen.tsx:115-135`; `RunningSessionFields.tsx:39-55,102-136`).
- Escape cancels reorder, while Shift+Arrow retains reorder semantics (`PlanEditorFields.tsx:396-417`).
- Delete confirmation and dirty-draft confirmation restore focus to the appropriate surviving row, Add session, or launching action (`RunningPlanEditorScreen.tsx:81-92,177-183`).
- Loading, missing, load-error, empty-session, disabled/busy, save-error, retry, lifecycle, and collision confirmation states are represented by shared notices/dialogs/sheets.
- Full component verification is green: 71 suites, 684 tests. `npm run typecheck` and `npm run check:boundaries` also pass.

## Registry Safety

Registry audit: not applicable. `components.json` is absent, `17-UI-SPEC.md` declares `shadcn_initialized: false`, and its registry table declares no third-party blocks.

## Files Audited

- Contract: `.planning/phases/17-library-running-plans/17-UI-SPEC.md`, `17-VALIDATION.md`, `17-UI-REVIEW-FIX.md`, `17-REVIEW-FIX.md`.
- Running UI: `src/ui/screens/RunningPlanDetailScreen.tsx`, `RunningPlanEditorScreen.tsx`, `RunningSessionEditorScreen.tsx`, `src/ui/components/RunningSessionFields.tsx`, `src/ui/running/runningFormDraft.ts`.
- Shared UI: `src/ui/layout/AdaptiveScreen.tsx`, `src/ui/theme/index.ts`, `src/ui/components/PlanEditorFields.tsx`, `src/ui/components/ConfirmationDialog.tsx`, `src/ui/components/ScheduleConflictSheet.tsx`, `src/ui/components/NavigationRow.tsx`, `src/ui/components/PlanRow.tsx`.
- Chooser and library contracts: `src/ui/screens/PlanTypeChooserScreen.tsx`, `src/ui/screens/LibraryScreen.tsx`.
- Tests: `src/ui/__tests__/RunningPlanEditorScreen.test.tsx`, `RunningPlanDetailScreen.test.tsx`, `RunningSessionEditorScreen.test.tsx`, `PlanTypeChooserScreen.test.tsx`, `src/ui/components/RunningSessionFields.test.tsx`, `src/ui/running/runningFormDraft.test.ts`, `src/ui/components/PlanEditorFields.test.tsx`, `src/ui/components/ScheduleConflictSheet.test.tsx`, plus the complete component project.

## Verification Commands

- `npm run test:components -- --runInBand` — passed, 71 suites / 684 tests.
- `npm run typecheck` — passed.
- `npm run check:boundaries` — passed, 371 files.
- Screenshot probes — no server on ports 3000, 5173, or 8080; no screenshots captured.
