# Phase 2: Owned Library and Planning - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `02-CONTEXT.md`; this log preserves the alternatives considered.

**Date:** 2026-08-17
**Phase:** 02-owned-library-and-planning
**Areas discussed:** Plan ownership and activation; Library browsing hierarchy; plan and exercise editing; schedule setup and overrides; cross-cutting library safeguards; metric-profile migration; starter discovery; exercise discovery and attribution; plan validity and live-use editing; schedule boundary behavior; content updates and plan replacement

---

## Plan Ownership and Activation

| Decision | Alternatives considered | Selected |
|---|---|---|
| Active schedules | One active schedule; multiple active schedules | One active schedule |
| Existing starter copies | Ask existing/new; always new; newest existing | Ask existing/new |
| Previous plan on switch | Preserve inactive state; reset; archive | Preserve inactive state |
| Switch during workout | Resolve workout first; allow resumable switch; silent switch | Resolve workout first |
| Activation | Editable preview; immediate; mandatory full setup | Editable preview |

**User's choice:** Accepted all recommended options.

---

## Library Browsing Hierarchy

| Decision | Alternatives considered | Selected |
|---|---|---|
| Initial section | Plans first then remember; Exercises first then remember; always active-plan section | Plans first then remember |
| Plan groups | Active → My Plans → Starters; My Plans first; combined recent list | Active → My Plans → Starters |
| Exercise groups | Favorites → Recent → All; blended ranking; alphabetical with favorite filter | Favorites → Recent → All |
| Transient state | Preserve during runtime/reset on restart; persist across restarts; clear on leave | Preserve during runtime/reset on restart |
| Non-active content | Explicit filters; inline; separate management screen | Explicit filters |

**User's choice:** Accepted all recommended options.

---

## Plan and Exercise Editing

| Decision | Alternatives considered | Selected |
|---|---|---|
| Saving | Explicit atomic Save; field blur; debounced auto-save | Explicit atomic Save |
| Dirty navigation | Save/Discard/Keep editing; auto-save; auto-discard | Save/Discard/Keep editing |
| Reordering | Drag plus accessible controls; controls only; drag only | Drag plus accessible controls |
| Duplication | Full inactive copy; copy and activate; partial reset copy | Full inactive copy |
| Lifecycle | Hide/archive only; conditional delete; confirmed delete | Hide/archive only |

**User's choice:** Accepted all recommended options.

---

## Schedule Setup and Overrides

| Decision | Alternatives considered | Selected |
|---|---|---|
| Initial setup | Editable starter defaults; fixed template mode; unscheduled | Editable starter defaults |
| Later edits | Dated before/after preview; immediate; cycle boundary | Dated before/after preview |
| Rotation | Scheduled completion advances with explicit Repeat/Skip/Advance; all manual; any day advances | Scheduled completion plus explicit controls |
| Overrides/Train anyway | Date-local and non-mutating by default; any workout advances; rewrite schedule | Date-local and non-mutating |
| Timezone change | Prompt prospective choice; always device timezone; fixed activation timezone | Prompt prospective choice |

**User's choice:** Accepted all recommended options.

---

## Cross-Cutting Library Safeguards

| Decision | Alternatives considered | Selected |
|---|---|---|
| Metric-profile edits | Lock after use; future-only switch; migrate future plan targets | Migrate future plan targets |
| Bundled edits | Create custom copy; local overrides; hiding only | Create custom copy |
| Archive referenced custom exercise | Preserve runnable references; block archive; break affected plans | Preserve runnable references |
| Alias results | Canonical plus matched alias; canonical only; alias primary | Canonical plus matched alias |
| Duplicate custom exercise | Warn and allow; reject; allow silently | Warn and allow |

**User's choice:** Chose full future-target migration for metric profiles and accepted the other recommendations.

---

## Metric-Profile Migration

| Decision | Alternatives considered | Selected |
|---|---|---|
| Mutation boundary | Future targets only; include active workout; include history | Future targets only |
| Live workout | Block migration; preserve old active profile; migrate active workout | Block migration |
| Conversion | Explicit replacement targets; infer where possible; generic defaults | Explicit replacement targets |
| History | Preserve and segment; hide old; convert old | Preserve and segment |
| Progression | Invalidate and fresh baseline; map recommendations; silent reset | Invalidate and fresh baseline |

**User's choice:** Accepted all recommended safeguards for the requested migration behavior.

---

## Starter Discovery and Creation Defaults

| Decision | Alternatives considered | Selected |
|---|---|---|
| Starter order | Explainable fit; curated fixed; alphabetical | Explainable fit |
| Filters | Goal/Experience/Days/Equipment; reduced filter set; questionnaire | Full optional filter set |
| Preview depth | Full days/metrics/schedule/progression/sources; summary; minimal | Full preview |
| Create my own | Small draft then editor; one wizard; immediate empty plan | Small draft then editor |
| Metric selection | Explicit plain-language examples; infer; default load/reps | Explicit plain-language examples |

**User's choice:** Accepted all recommended options.

---

## Exercise Discovery and Attribution

| Decision | Alternatives considered | Selected |
|---|---|---|
| Ranking | Exact/prefix/alias/partial with stable ties; engagement boost; alphabetical | Text-first deterministic ranking |
| Recent | Completed working-set exposure capped at 10; opens/selections; last five sessions | Working-set exposure capped at 10 |
| Favorites | Explicit without relevance boost; inferred; boost relevance | Explicit without relevance boost |
| Multi-value filters | OR within/AND across; AND everywhere; OR everywhere | OR within/AND across |
| Attribution | Compact row origin/full detail; full rows; About only | Compact row origin/full detail |

**User's choice:** Accepted all recommended options.

---

## Plan Validity and Live-Use Editing

| Decision | Alternatives considered | Selected |
|---|---|---|
| Minimum draft | Named empty day allowed but invalid for activation; require exercise to save; empty rest plans | Named empty day allowed |
| Active-plan edits | Future-facing edits with impact review; deactivate first; auto-regenerate | Future-facing edits |
| Edit during workout | Snapshot-safe except schedule structure; block all; mutate workout | Snapshot-safe except schedule structure |
| Delete scheduled day | Resolve impacted bindings; auto-remove; prohibit | Resolve impacted bindings |
| Invalid drafts | Visible blocked Draft; hidden; activate then error | Visible blocked Draft |

**User's choice:** Agreed with all recommendations.

---

## Schedule Boundary Behavior

| Decision | Alternatives considered | Selected |
|---|---|---|
| Cross-midnight date | Start date; completion date; ask | Start date |
| DST | Stored local-date intent; fixed elapsed hours; automatic device timezone | Stored local-date intent |
| Missed weekday | Planned but not completed; carry forward; auto-skip | Planned but not completed |
| Repeated overrides | One pending replaceable/consumed immutable; stack; one lifetime action | Pending replaceable/consumed immutable |
| Weekday Skip | Date-local; move to next day; remove binding | Date-local |

**User's choice:** Accepted all recommended options.

---

## Content Updates and Plan Replacement

| Decision | Alternatives considered | Selected |
|---|---|---|
| Pack visibility | Validated install plus summary; approval each update; silent | Validated install plus summary |
| Removed upstream item | Preserve Unavailable; auto-replace; remove from plans | Preserve Unavailable |
| Plan replacement | Compatibility-first with target review; copy settings; reset settings | Compatibility-first with target review |
| Replacement scope | Occurrence or plan-wide with preview; always all; one only | Occurrence or plan-wide with preview |
| Template updates | Preserve copies and offer diff/new copy; merge; update inactive copies | Preserve copies and offer diff/new copy |

**User's choice:** Agreed with all recommendations.

---

## Claude's Discretion

- Exact visual treatment and iconography within the approved design system and future Phase 2 UI contract.
- Exact implementation details beneath the locked FTS, metric, ownership, and scheduling behavior.
- Exact safe wording where the discussion did not lock a literal label.

## Deferred Ideas

- Permanent deletion, historical metric conversion, automatic substitutions, automatic template merges, and AI-generated plans are not part of Phase 2.
- Calendar correction remains Phase 3; overall progress and complete recommendation lifecycle remain Phase 4; recovery and release remain Phase 5.

---

## Equipment-Heavy Body-Part Starter Amendment

| Decision | Alternatives considered | Selected |
|---|---|---|
| Template count | Keep five; add a sixth body-part split | Add a sixth template |
| Day structure | Rotation; flexible body-part order; fixed weekdays | Monday Chest, Tuesday Back, Wednesday Shoulders, Thursday Legs, Friday Arms |
| Exercise style | Mixed equipment/bodyweight; equipment-first; machines only | Equipment-first mix of barbells, dumbbells, cables, machines, bench, and squat rack |
| Daily volume | Three, four, or five exercises per day | Four weighted exercises per day |
| Metric/substitution policy | Mixed profiles; load/reps only; inferred substitutions | Explicit `load_reps` only, no substitutions, editable candidate defaults |

**User's choice:** Requested an additional starter template focusing on one body part each day and using weights/gym equipment as much as possible. The concrete accepted review candidate is recorded as D-55 in `02-CONTEXT.md`.
