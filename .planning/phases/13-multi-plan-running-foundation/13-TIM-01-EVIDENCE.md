# TIM-01 Retirement Characterization Evidence

**Recorded:** 2026-10-07
**Decision status:** approved
**Selection:** retire-playback
**Legacy playback compatibility:** false

## Owner record validation

Validated against `.planning/v1.2-owner-decisions.json` on 2026-10-07:

| Field | Exact recorded value |
| --- | --- |
| `decisions.TIM-01.status` | `approved` |
| `decisions.TIM-01.selection` | `retire-playback` |
| `decisions.TIM-01.legacy_playback_compatibility` | `false` |

The dated owner record is authoritative. Remaining cases below are technical
verification work only and do not reopen the approved retirement decision.

## Approved retirement contract

TIM-01 is approved to remove cadence and cluster authoring, playback, callbacks,
and foreground reconciliation. Plan 13-10 must resolve new timing snapshots to
`off`, remove all cadence/cluster runtime entry points, and ensure restored or
merged legacy rows cannot re-enable playback. This is not permission to delete
historical configuration, timing state, committed sets, drafts, active pointers,
schedule provenance, ordinary workout history, or between-set rest.

## Evidence matrix

All values below are case IDs, counts, state labels, and SHA-256-style test
digests only. No workout names, timing JSON, route, heart-rate, or personal
values are recorded.

| Case | Source symbol | Boundary | Cadence/cluster observations | Between-set rest observations | Stored-fact proof | Status |
| --- | --- | --- | ---: | ---: | --- | --- |
| TIM-01-C01 | `AdvancedTimingStateV1` | state matrix | 8 state labels: idle, running, paused, stopped, ready-gap, gap-running, gap-paused, stopped | 0 | canonical JSON round-trip per label | passed |
| TIM-01-C02 | `parseAdvancedTimingPersistenceRow` | schema-21/27 readable rows | 7 readable row variants; expired is rejected as invalid by current reader | 0 | config/progress bytes are unchanged by reads | passed |
| TIM-01-C03 | advanced timing command wrappers | authoring and playback commands | 8 revision-fenced mutable commands | 0 | frozen input digest unchanged | passed |
| TIM-01-C04 | `workout_session_schedule_links` | relaunch | 1 dormant cluster snapshot; 1 paused state | 1 paused rest remainder | selected occurrence, active pointer, rest remainder, and config/progress query digest equal after reopen | passed |
| TIM-01-C05 | `reconcileAdvancedTimingAfterForeground` | foreground boundary crossing | active running and cluster-gap contexts reconcile; stopped contexts do not | 0 | advanced and rest repositories are separately asserted | passed |
| TIM-01-C06 | AppState queued callback / `advancedForegroundUnsubscribeRef` | callback resolves after unmount | 0 post-unmount reconcile calls; 0 cue calls | 0 rest reads | callback is ignored after generation teardown | passed |
| TIM-01-C07 | `emitAdvancedTimingCueBeforeRefresh` | committed cue failure | cadence/cluster cue failure is contained after reconciliation | 0 | result remains committed; no rest lifecycle entry | passed |
| TIM-01-C08 | `WorkoutLifecycle` + rest notification seam | ordinary foreground rest | 0 advanced timing calls | 1 authoritative rest expiry/feedback path | rest remains independently reconciled | passed |
| TIM-01-C09 | logical backup / clean restore | clean restore | not exercised in this plan | not exercised in this plan | pending an archive fixture that includes schema-21/27 rows and a Phase 13 provenance link | pending verification |
| TIM-01-C10 | logical merge / reconstruction | merge | not exercised in this plan | not exercised in this plan | pending a dual-archive merge fixture with dormant timing rows | pending verification |
| TIM-01-C11 | new, duplicate, and session-added target construction | inheritance | current default/snapshot behavior not mutated | unaffected | Plan 13-10 must prove all new snapshots resolve `off`; legacy defaults remain dormant readable facts | pending verification |

## Current storage and runtime inventory

- Schema 21 persists configuration defaults/overrides, resolved set snapshots,
  and `session_advanced_timing_states`; schema 27 adds target ownership checks.
- Runtime entry points currently include configure, start, cluster-gap begin/skip,
  pause, resume, reconcile, stop, foreground reconciliation, and cue delivery.
- The recovery characterization confirms that ordinary session provenance, active
  exercise/set pointer, committed/draft set graph, and paused between-set rest
  are separate facts from advisory cadence/cluster playback.
- A current persisted `expired` advanced-timing row is schema-admissible but is
  rejected by the current repository reader. This is a before-state fact for
  Plan 13-10, not a permission to coerce or discard a recovered session.

## Technical verification gaps

- Zero-cue proof after Plan 13-10 removal remains pending. This characterization
  proves today’s boundaries; it does not claim retirement is implemented.
- Clean restore and merge need dedicated privacy-safe schema-21/27 archive
  fixtures before release verification can claim all recovery boundaries.
- The full runtime test command currently has an unrelated fake-kernel migration
  fixture failure (`migration_verify_failed`) in the production-adapter test.
  Focused timing and queued-callback cases pass; this does not alter the approved
  TIM-01 decision or authorize a compatibility mode.

## Plan 13-10 protection boundary

Remove all cadence/cluster authoring, playback, queued callbacks, and foreground
reconciliation. Retain ordinary timed-hold metrics, between-set rest, workout
history, stored legacy configuration/state readability, backup parsing, and
set/pointer/provenance recovery. No runtime policy alternative is offered.
