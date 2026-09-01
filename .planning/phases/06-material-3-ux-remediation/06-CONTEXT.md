# Phase 6: Material 3 UX Remediation - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Remediate the whole-app Material 3 and accessibility findings reproduced on the exact Phase 5 candidate. Deliver the eight owner-requested Library, Search, Calendar, reorder, date-picker, refresh, Favorite, and exercise-row changes, plus the audit-discovered Progress runtime failure, clipped 200% root navigation, and duplicate Today More affordance. Preserve all existing workout, schedule, history, progression, backup, and release-integrity semantics.

</domain>

<decisions>
## Implementation Decisions

### Library discovery
- **D-68:** Replace the Library filter action/summary pattern with Material 3 filter chips. Selected state must be visible without relying on color, and `Favorite` must be a standalone one-tap chip. The full taxonomy may remain in an overflow filter sheet.
- **D-69:** Remove the unthemed `No filters selected` label; when no filter is active, do not spend permanent horizontal space on status copy. Active filters are represented by selected chips and accessible state.
- **D-70:** Replace the permanent `Refresh Library` action with pull-to-refresh on the owning Library scroll surface. Preserve current results and filters during refresh; expose a labelled Retry only when refresh fails.
- **D-71:** A selected Favorite uses a filled approved-green star and accessible selected state; inactive remains outlined. Browse rows omit source namespace, revision, license, and attribution, while Exercise Detail retains full provenance.

### Search
- **D-72:** Create one repository-owned Material 3 Search primitive and use it for Plans, Exercises, Progress, and the owned-plan exercise picker. It includes a leading search icon, integrated clear action, labelled input, keyboard/IME behavior, and explicit busy/empty/error/result semantics.

### Calendar and dates
- **D-73:** Root Calendar always renders a stable six-row grid containing subdued adjacent-month dates. Adjacent dates are selectable and move the visible month consistently with the selected civil date.
- **D-74:** Horizontal swipe changes month in both directions; labelled previous/next buttons remain as accessible, keyboard, and D-pad alternatives.
- **D-75:** All CalendarField consumers use one Material 3/Google Calendar-inspired dialog: clear date/month hierarchy, complete bounded grid, swipe/button parity, and explicit Cancel/Confirm. Draft selection remains private until confirmation, and all LocalDate/min/max/timezone guarantees remain unchanged.

### Reordering and adaptive behavior
- **D-76:** Plan-day and exercise order use touch-and-hold continuous drag with visible displacement and a 48dp handle. Explicit Move up/Move down buttons remain available. At normal text scale, handle, primary label, supporting label, and fallback actions occupy one horizontal row; at large text they may reflow without clipping or losing controls.
- **D-77:** Root navigation must remain readable and operable at Android 200% font scale. Label clipping or truncated fragments are release-blocking.

### Runtime and shell cleanup
- **D-78:** Diagnose the Progress load failure before changing its presentation. The fix must preserve SQLite source authority, projection rebuildability, period semantics, and bounded safe errors; Retry must actually recover when the underlying condition is recoverable.
- **D-79:** Today exposes one unambiguous secondary-tools entry. Keep the header overflow for appearance/rest-alert settings and replace the full-width generic `More` button with a clearly labelled, compact route to History and data/recovery, or integrate those destinations into one coherent secondary-tools surface.

### Verification and release boundary
- **D-80:** Every behavior change is test-first or receives a regression test in the same task. Integrity-critical code retains complete branch coverage; UI behavior receives component tests plus native interaction evidence where gestures are involved.
- **D-81:** Verify compact, medium, expanded, System/Light/Dark, 200% text, keyboard/D-pad, focus restoration, non-color cues, and minimum 48dp targets. Emulator covers deterministic layout/large-text/gesture evidence; Samsung covers touch ergonomics and OLED appearance.
- **D-82:** Phase 6 produces replacement Android candidate bytes. It does not grant owner approval, promote a release, publish a tag, or run Terminal Seal; those remain explicit final-release actions after attended verification.

### Claude's Discretion
- Exact React Native composition and internal component names, provided the shared primitives and observable contracts above are met.
- Whether the full taxonomy opens as a bottom sheet or dialog at compact width, provided selection remains visible, accessible, and reversible.
- The precise animation curve and drag implementation using installed React Native Gesture Handler/Reanimated versions, provided reduced-motion behavior and button fallbacks work.
- The internal root-cause repair for Progress after evidence identifies it.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audit and runtime evidence
- `.planning/phases/05-recovery-distribution-and-release/05-UI-REVIEW.md` — scored whole-app audit, source findings, runtime findings, and implementation order.
- `.planning/ui-reviews/material3-runtime-20260831/EVIDENCE.md` — exact installed-candidate identity, screenshot/hierarchy index, and evidence limits.

### Existing product contracts
- `DESIGN.md` — repository design tokens, typography, color, component, accessibility, and adaptive baseline.
- `.planning/phases/01-trustworthy-workout-loop/01-UI-SPEC.md` — shell, workout-loop, and accessibility contract.
- `.planning/phases/02-owned-library-and-planning/02-UI-SPEC.md` — Library, planning, filtering, input, and editor contract.
- `.planning/phases/03-calendar-and-history-integrity/03-UI-SPEC.md` — Calendar/history contract.
- `.planning/phases/04-overall-progress-and-complete-progression/04-UI-SPEC.md` — Progress/recommendation contract.
- `.planning/phases/05-recovery-distribution-and-release/05-UI-SPEC.md` — recovery and release contract.

### Official Material 3 guidance
- `https://m3.material.io/components/chips/guidelines` — filter-chip anatomy and selected states.
- `https://m3.material.io/components/search/overview` — search-bar/search-view hierarchy.
- `https://m3.material.io/components/date-pickers/overview` — date-picker dialog hierarchy and behavior.
- `https://m3.material.io/components/lists/guidelines` — concise list hierarchy and trailing actions.
- `https://m3.material.io/components/navigation-bar/overview` — compact root navigation behavior.
- `https://m3.material.io/components/icon-buttons/overview` — selected icon-button treatment.
- `https://m3.material.io/components/pull-to-refresh/overview` — pull-to-refresh behavior.
- `https://m3.material.io/foundations/accessible-design/overview` — accessible visual and interaction states.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ui/theme/index.ts`: centralized appearance, semantic color, type, shape, spacing, and target tokens.
- `src/ui/components/index.ts`: shared action, icon, sheet/dialog, navigation, and focus primitives; extend here rather than creating screen-local lookalikes.
- `src/ui/layout/AdaptiveScreen.tsx`: shared scroll/adaptive surface and the integration point for optional refresh behavior.
- `react-native-gesture-handler` 2.32.0 and `react-native-reanimated` 4.5.1 are already installed.

### Established Patterns
- Screens receive typed runtime operations and do not execute SQL.
- Civil `LocalDate` values remain strings and are never silently converted through instant/timezone parsing.
- User mutations remain drafts until explicit commit; UI success follows committed source state.
- Accessibility names, 48dp targets, keyboard activation, focus restoration, and reduced-motion support are cross-cutting requirements.

### Integration Points
- `src/ui/screens/LibraryScreen.tsx`: search, filter sheet/chips, refresh, favorite, and browse-row hierarchy.
- `src/ui/screens/CalendarScreen.tsx` and `src/ui/components/CalendarField.tsx`: month-grid and date-dialog behavior.
- `src/ui/components/PlanEditorFields.tsx` and `src/ui/screens/OwnedPlanEditorScreen.tsx`: reorder and exercise-picker search.
- `src/ui/screens/ProgressScreen.tsx` plus `src/bootstrap/workoutAppRuntime.tsx`: Progress failure diagnosis and Search integration.
- `src/ui/components/index.ts`, `app/(tabs)/_layout.tsx`, and `src/ui/screens/TodayScreen.tsx`: large-text navigation and secondary-tools entry.

</code_context>

<specifics>
## Specific Ideas

- Material 3 is the visual/component baseline, but adjacent-month days and horizontal month swipe are explicit owner requirements rather than claims that M3 universally mandates them.
- Keep the app calm and utility-first: one obvious primary action, compact controls, factual copy, no decorative gradients or unnecessary cards.
- The user-supplied reorder reference establishes the desired compact single-row arrangement; semantic button alternatives must remain even after drag is added.

</specifics>

<deferred>
## Deferred Ideas

- Accounts, cloud sync, social features, Health Connect, Wear OS, and new training domains remain out of scope.
- Release promotion, public tags, and Terminal Seal remain paused until the replacement candidate passes the final attended gate.

</deferred>

---

*Phase: 06-material-3-ux-remediation*
*Context gathered: 2026-08-31*
