---
phase: 4
slug: overall-progress-and-complete-progression
status: approved
shadcn_initialized: false
preset: none
created: 2026-08-25
reviewed_at: 2026-08-25T00:00:00+08:00
---

# Phase 4 — UI Design Contract

> Canonical visual and interaction contract for Overall Progress and Complete Progression. It extends the established Gmail-like neutral-grey canvas and card surfaces; Progress is a factual reading and review surface, not a coaching dashboard.

## Contract Authority

1. `04-CONTEXT.md` locked decisions, especially source authority, freshness, policy, and deferred-verification boundaries.
2. `PROG-01` through `PROG-11` and the Phase 4 success criteria in `ROADMAP.md`.
3. This UI contract.
4. `DESIGN.md`, Phase 2 and Phase 3 UI contracts, and repository-owned components/theme.

No new visual system, component framework, chart package, analytics store, or generic adaptive-coaching language may be added.

## Phase Boundary

### Included

- Progress root with `4 weeks`, `12 weeks`, and `All time` factual windows.
- Overall Progress: scheduled opportunities, completed working sets, improving/holding/attention state counts, comparator-backed recent records, and one consistency trend.
- Needs attention, Recent improvements, searchable exercise progress, session/exercise drill-downs, and quiet pending recommendation review on Today and Progress.
- Named policy/rule evidence, current/proposed targets, lifecycle state, source links, loading/error/empty/updating states, keyboard/D-pad, screen-reader, reduced-motion, 200% text, and adaptive layout behavior.

### Excluded

- A global fitness, readiness, strength, volume, injury, or medical score; aggregate kilogram-volume headlines; generic coaching; automatic non-load advice; or silent target changes.
- Permanent history actions, plan editing outside an explicit committed recommendation decision, and source-fact writes from Progress.
- Backup, restore, CSV, signed release, native screenshots, Android builds, device/emulator/Maestro, performance-device claims, attended approval, and Terminal Seal. Those remain one shared Phase 5 gate.

## Design System

| Property | Contract |
|---|---|
| Tool | Repository-owned React Native theme/components |
| Component library | None |
| Icon library | Lucide React Native, outlined 2dp stroke |
| Interface font | Source Sans 3 400/600 |
| Numeric font | IBM Plex Mono with tabular numerals |
| Light surface | `#F1F3F4` canvas and `#FFFFFF` content cards |
| Dark surface | `#202124` canvas and `#121212` content cards |
| Accent | Existing action token for selected period, primary committed decision, focus, and navigable text |

Use existing 4/8/16/24/32/48/64dp spacing, 8dp standard and 12dp emphasis radii, hairline dividers, and 48dp minimum interactive targets. Cards group a reading task; do not create a grid of decorative statistic cards or nest `ContentCard`.

## Progress Information Hierarchy

### Root and period control

The title is `Progress`. Directly below it, the segmented but text-labelled period control offers `4 weeks`, `12 weeks`, and `All time`. The selected control exposes selected state programmatically. Changing it reloads the same source-backed view model, preserves focus, and never changes a plan target.

`Overall Progress` follows as one editorial summary with the selected local-date range. It contains textual rows for scheduled opportunities completed, completed working sets, improving/holding/attention counts, and recent metric-aware records. Each row names its state rather than relying on color, preserves source session/exercise IDs, and navigates to the existing Workout details or Exercise history flow. It does not calculate a universal score, volume total, or pretend missing observations equal zero.

`Baseline` appears where no prior comparable evidence exists. `Hold` appears where comparable evidence is unchanged. `Updating progress` replaces factual totals whenever a required projection is behind or unavailable; it says saved history is being recalculated and refreshes from the runtime. The screen must not combine an Updating label with stale numeric totals that appear final.

### Consistency trend

The one full-width `Consistency` block uses the exact same ordered source row sequence for:

- a restrained visual trend with labelled dates/states;
- plain-language summary text; and
- an accessible data table/disclosure containing date, scheduled opportunity, completion state, and linked source IDs.

No visual mark is the only meaning. Sparse evidence has an explicit no-comparable/baseline statement, not a zero-height or fabricated point. Trend interaction is optional navigation only; it never performs a write.

### Evidence lists

`Needs attention` appears only for an actionable owner decision. Its heading and description say `Review available`, not warning, emergency, safety, or health language. Each row names the exercise/target, current and proposed target where a proposal exists, named rule/version, confidence/reason, and the evidence/review link.

`Recent improvements` contains only comparator-backed source rows. Each row explains the metric identity in plain language and links to the source session/exercise. A tie is `Hold`; missing/comparator-incompatible evidence is never called an improvement.

`Exercise progress` is a searchable list ordered by recent training. Search filters the already-loaded factual list, has a labelled clear action, and reports an exact no-results state. Rows use `Baseline`, `Hold`, `Improving`, `Updating progress`, or manual wording as supplied by the view model. They link to Exercise history and retain metric-identity context.

### Pending recommendation surface

Today and Progress may show the same quiet pending review summary. It never replaces Today’s accepted current target. The detail surface shows source exercise/session, named policy and version, exact source evidence, current target, proposed target if actionable, confidence/reason, and lifecycle.

For `pending`, explicit `Accept recommendation` and `Reject recommendation` actions invoke the runtime and disable only while the committed command is in flight. The UI reloads after success, conflict, or failure; it never optimistically changes target/recommendation state. `accepted`, `rejected`, `invalidated`, and `superseded` remain readable historical states. `manual`/non-actionable outcomes state that no automatic target change is available.

## Copywriting Contract

| Element | Copy |
|---|---|
| Root title | Progress |
| Periods | 4 weeks / 12 weeks / All time |
| Overall heading | Overall Progress |
| Attention heading | Needs attention |
| Attention description | A review is available for this target. |
| Improvement heading | Recent improvements |
| Exercise heading | Exercise progress |
| Search label | Search exercises |
| Empty history | No progress history yet / Completed working sets and planned opportunities will appear here after you train. |
| Sparse evidence | Baseline / More comparable working sets are needed before a change is shown. |
| Hold | Hold / Comparable evidence is unchanged for this period. |
| Updating | Updating progress / Saved history is being recalculated. Results refresh automatically. |
| Read error | Progress could not be loaded / Your saved workouts and targets were not changed. Retry loading progress. |
| No results | No matching exercises / Try a different exercise name. |
| Pending review | Recommendation ready to review |
| Manual outcome | Manual review / This target has no automatic change. |
| Stale lifecycle | Superseded / This recommendation no longer matches the current target. |
| Invalidated lifecycle | Invalidated / Its source history changed before a decision was made. |

## Accessibility and Adaptation

- Period controls, search/clear, drill-down rows, trend-table disclosure, and decision actions have programmatic names, role/state, and 48dp targets.
- State relies on text plus icon/border/status, never color alone. A chart label/table tells the same fact as every visual point.
- Focus order is title, period control, overall summary, consistency, attention, improvements, exercise search/list, then recommendation actions. A review sheet opens at its heading and returns focus to the invoking row.
- `FocusablePressable` preserves Enter/Space/D-pad. Search does not trap keyboard focus.
- Compact stacks all content. Medium/expanded can use existing `AdaptiveScreen` panes, but the same runtime view model and order of meaning remain available. Long exercise names, rule versions, targets, reasons, and metric labels wrap; numbers retain tabular numerals.
- Loading uses stable skeleton geometry. Retryable error, empty, sparse, baseline, hold, stale/updating, one/many, rejected, invalidated, superseded, and manual states have explicit textual presentation. Reduced motion uses direct state changes.

## UI Considerations

Applicable state considerations resolved: 20 explicit, 0 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution |
|---|---|---|---|
| loading | Progress/Today review | covered | Stable skeletons; controls retain labels without invented totals. |
| error | Read/review actions | covered | Explicitly says saved facts/targets were not changed; Retry/Reload is available. |
| empty | Overall/records/exercises | covered | Exact next-step copy; no placeholder zero analytics. |
| sparse | Trend/records/exercises | covered | Baseline or Hold; no fabricated chart point. |
| stale | All factual sections | covered | `Updating progress` suppresses stale final totals. |
| populated | Summary/trend/lists | covered | Source IDs, metric identities, drill-downs, factual words. |
| search | Exercise progress | covered | Labelled search, clear action, exact no-results state. |
| lifecycle | Recommendation review | covered | Pending/accepted/rejected/invalidated/superseded/manual are readable and never optimistic. |
| destructive-ish decision | Accept/reject | covered | Explicit action plus committed runtime result; manual edits/revision conflict win. |
| overflow | Long IDs/copy/200% text | covered | Wrapping, stacking, adaptive panes, no clipped targets/actions. |

## Registry Safety

| Registry | Blocks used | Safety gate |
|---|---|---|
| Repository components | `AdaptiveScreen`, `ContentCard`, `FocusablePressable`, existing states/actions | Existing tests; no nested-card invariant |
| Lucide React Native | Existing status/navigation icons | Programmatic label for every icon-only control |
| Third-party packages | None | No dependency addition |

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-08-25
