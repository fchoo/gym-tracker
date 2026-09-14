---
phase: 3
slug: calendar-and-history-integrity
status: approved
shadcn_initialized: false
preset: none
created: 2026-08-24
reviewed_at: 2026-08-24T00:00:00+08:00
---

# Phase 3 — UI Design Contract

> Canonical visual and interaction contract for Calendar and History Integrity. This phase uses the repository-owned React Native system and preserves the Phase 2 grey canvas/card treatment.

## Contract Authority

1. 03-CONTEXT.md decisions D-01 through D-19.
2. HIST-01 through HIST-09 and Phase 3 roadmap success criteria.
3. This UI contract.
4. DESIGN.md, the Phase 2 UI contract, and approved product/QA references.

No new visual system, component framework, date package, chart library, or generic dashboard treatment may be added.

## Phase Boundary

### Included

- Civil-month Calendar with completed, partial, manual, planned-not-completed, and current-day states.
- Selected-date factual sessions/visits with actual exercise and working-set counts.
- Extended session detail, separate warm-ups, metric-aware exercise history, correction editor/audit, Remove from history confirmation, and Removed sessions/Restore.
- Loading, error, empty, conflict, stale/updating, long-text, compact/medium/expanded, landscape, 200% text, keyboard/D-pad, focus, and reduced-motion behavior.

### Excluded

- Phase 4 Overall Progress dashboards, charts, recommendation breadth, and global aggregate scores.
- Phase 5 backup, restore, export, release, and physical-attestation surfaces.
- Permanent deletion, automatic metric conversion, generic schedule editing, network/account state.

## Design System

| Property | Contract |
|---|---|
| Tool | Repository-owned React Native theme/components |
| Component library | None |
| Icon library | Lucide React Native, outlined 2dp stroke |
| Interface font | Source Sans 3 400/600 |
| Numeric font | IBM Plex Mono with tabular numerals |
| Light surface | #F1F3F4 canvas and #FFFFFF content cards |
| Dark surface | #202124 canvas and #121212 content cards |
| Accent | Existing action token for selected calendar state, primary Save/Restore, focus, and navigable text |

Use existing space scale 4/8/16/24/32/48/64dp, type scale, 8dp standard radius, 12dp emphasis radius, hairline divider, and 48dp minimum interactive target. Do not nest ContentCard; fields/sheets/notices retain dedicated surfaces.

## Surface Contract

### Calendar root

First hierarchy: selected civil month, state legend/marker explanation, selected-date factual sessions. Month navigation has labelled previous/next actions and textual month/year heading. Weekday headings remain visible; cells are 48dp minimum where layout permits and reflow at 200% text.

Each day cell exposes a combined accessible label such as Tuesday, 24 August 2026. Completed workout and planned but not completed. Current day adds Today; it never replaces a visit state. State uses label plus glyph/border, never color alone:

| State | Text semantics | Non-color reinforcement |
|---|---|---|
| Completed | Completed | Check glyph/border |
| Partial | Partial | Partial-ring/label |
| Manual | Manual visit | Manual glyph/label |
| Planned | Planned but not completed | Calendar/clock glyph/label |
| Current | Today | Today outline/text |

The legend explains every present marker. Multiple states are announced and visually stacked or compactly summarised. The selected date section is Sessions on date. Each selectable session card contains plan/day or source label, local time, Exercises N/N (P%), Working sets N/N (P%), and status. No activity reads No sessions on this date and preserves month navigation. Calendar contains no record/volume dashboard tiles.

At medium/expanded widths selected-date details may occupy AdaptiveScreen secondary; compact stacks grid and list. Both layouts consume the identical source read and preserve focus/back behavior.

### Session detail and audit

Title stays Workout details; eyebrow is factual status. Summary exposes effective local date/time, source/plan, actual counts, and compact Corrected/Removed status only when applicable. Warm-ups and working sets stay separate. Completed/partial sessions expose Correct workout; the editor is focus-contained with Save/Cancel and no optimistic mutation. Revision conflict says Workout changed elsewhere and offers Reload workout while retaining local inputs until owner choice.

Correction history is a collapsed disclosure after factual content. It lists timestamp, changed item/field, and previous to corrected value. Long values wrap; owner notes stay only in session/audit context. Remove from history is a secondary completed-session action with confirmation; Cancel precedes destructive Remove from history. No permanent-delete control/copy appears.

### Correction editor

Editorial sections: Session, Exercises and sets, Association, Note. Metric identity is plain language before observation fields. Add/remove/retype/replacement actions are explicit. Dates use CalendarField, times use time-style controls, and values retain numeric keyboards. Replacement never silently transfers incompatible values.

Large sessions use disclosures: correction target visible, other exercises collapsed. At 200% text metadata stacks before actions; unfamiliar/destructive actions retain text labels.

### Removed sessions

Removed sessions is reachable from More/settings. Each row has effective date, retained plan/session name, Removed date/time, and a 48dp Restore action. Empty state: No removed sessions, with a reason. Restore requires confirmation and reloads source-backed Calendar/detail after commit; no optimistic resurrection.

### Exercise history

Exercise history names its complete metric identity segment in text and shows Best/Average/Last editorially. Best uses the metric comparator, Average the existing aggregate, Last the latest comparable completed working set. It labels Working sets only. Warm-ups remain a separate expandable visit list and never affect the summary. No chart/global score/volume headline is introduced.

## Copywriting Contract

| Element | Copy |
|---|---|
| Date empty | No sessions on this date / Choose another day to review recorded visits. |
| Calendar empty | No history yet / Completed, partial, and manual sessions will appear here after you train. |
| Calendar error | Calendar could not be loaded / Your saved workouts were not changed. Retry loading history. |
| Correction primary | Save correction |
| Correction conflict | Workout changed elsewhere / Reload the latest saved workout before saving this correction. |
| Audit disclosure | Correction history |
| Remove title | Remove from history? |
| Remove body | This hides the workout from ordinary Calendar, history, records, and recommendations. You can restore it later from Removed sessions. |
| Remove CTA | Remove from history |
| Removed empty | No removed sessions / Workouts removed from history stay here until you restore them. |
| Freshness | Updating history / Saved history is being recalculated. Results refresh automatically. |
| No comparable history | No comparable working sets yet |

## Accessibility and Adaptation

- Calendar cells, session rows, disclosures, editor actions, Restore, and destructive confirmations have programmatic names, role/state, and 48dp targets.
- Meaning uses text plus glyph/border/status, not color alone.
- Focus order is heading, month controls, weekday/grid, selected-date heading, rows, secondary actions. Sheet focus opens at its heading and returns to invoker on close.
- FocusablePressable preserves Enter/Space/D-pad. Arrow grid navigation is deterministic when provided.
- Compact stacks content; medium/expanded may use AdaptiveScreen two-pane. Long names/notes wrap; numeric counts use tabular numerals.
- Loading uses stable skeletons. Error/empty states are actionable. Reduced motion uses direct state changes.

## UI Considerations

Applicable state considerations resolved: 19 explicit, 0 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution |
|---|---|---|---|
| loading | Calendar/detail/history | ✅ covered | Fixed-size skeletons preserve grid/list/detail geometry. |
| error | Calendar/detail/correction/restore | ✅ covered | Failures state saved facts were not changed and offer Retry/Reload/Cancel. |
| empty | Calendar/date/removed/history | ✅ covered | Exact empty copy and next action; no fake metrics. |
| populated | Calendar/date/detail/history | ✅ covered | Factual local date, source, counts, identity, warm-up separation. |
| partial | Calendar/detail/history | ✅ covered | Partial is textual/non-color; metric inclusion follows complete-working-set rule. |
| zero-one-many | Sessions/audits/removed list | ✅ covered | Singular/plural-safe headings; no one-item assumption. |
| overflow | Grid/long text/200% text | ✅ covered | Reflow, wrapping, adaptive panes prevent clipping. |
| destructive | Remove/Restore | ✅ covered | Confirmation, source commit, reload, no optimistic state spoofing. |

## Registry Safety

| Registry | Blocks used | Safety gate |
|---|---|---|
| Repository components | AdaptiveScreen, CalendarField, ContentCard, ConfirmationSheet, actions | Existing component coverage; no nested-card invariant |
| Lucide React Native | Existing status/navigation icons | Programmatic label for icon-only control |
| Third-party packages | None | No dependency addition |

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-08-24
