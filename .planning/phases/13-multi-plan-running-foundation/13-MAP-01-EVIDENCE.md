# MAP-01: one-per-sport implementation evidence

**Recorded:** 2026-10-07  
**Approval source:** `.planning/v1.2-owner-decisions.json` (direct owner reply)  
**Approval status:** approved  
**Selection:** `one-per-sport`  
**Implementation verification:** pending — this record fixes the approved contract; the
SQLite migrations, repositories, restore, merge, and runtime proof remain Phase 13
implementation evidence.

## Binding cardinality

MAP-01 permits zero or one active Strength plan/schedule pair and zero or one
active Running plan/schedule pair. The two pairs may be active concurrently.
The existing single global in-progress Strength workout remains a separate
invariant. A Running plan may contain multiple ordered same-day session slots;
the cardinality rule does not collapse those slots into one event.

## Schema and activation contract

- `plans.plan_kind` is an immutable `strength` or `running` source fact. Legacy
  plans default to `strength`; no exercise or timing-profile inference is allowed.
- `owned_plan_schedules.plan_kind` is an immutable copy checked against its
  parent plan. It exists because a SQLite partial unique index cannot inspect
  another table.
- Migration replaces global `one_active_owned_plan` and
  `one_active_owned_schedule` only after per-kind partial unique indexes exist.
  The replacement predicates permit at most one active plan and one active
  schedule for each kind, while preserving one schedule per plan and requiring
  an active pair to share plan identity and kind.
- Active-pair readers return a bounded collection (maximum two), and every
  mutation receives an explicit plan/schedule identity and expected revisions.
  No runtime selector may take an arbitrary row through an unscoped `LIMIT 1`.
- Same-sport replacement deactivates only the selected kind's prior pair in the
  same exclusive transaction. It does not change the other sport's pair, its
  revision, pointer, opportunities, or historical outcomes.

## Singleton call sites to replace

The implementation must remove or explicitly scope the existing singleton
assumptions in `starterPlanRepository.ts`, `scheduleRepository.ts`,
`scheduleRuntime.tsx`, `plansWorkoutRepository.ts`, `workoutAppRuntime.tsx`,
and `mergePlan.ts`. Session completion resolves captured schedule provenance,
not whichever plan happens to be active later.

## Restore and merge outcomes

| Situation | Required outcome |
| --- | --- |
| Restore-clean has one valid active Strength pair and one valid active Running pair | Preserve both pairs after pair/kind validation. |
| Restore-clean has duplicate active pairs in a single sport or mismatched plan/schedule kinds | Reject atomically; never repair by guessing. |
| Legacy archive has one active pair | Preserve it as Strength using the compatibility default. |
| Merge has local Strength and archived Running | Preserve both active pairs. |
| Merge has a local active pair in a sport and a distinct archived active pair in that sport | Local pair wins; imported distinct plan remains inactive and previewed. |
| Same portable plan has conflicting kinds | Treat as a validation conflict, never implicit conversion. |

## Migration and rollback constraints

- The migration preflight validates legacy global cardinality, pair identity,
  parent ownership, and the one global in-progress Strength session before DDL.
- Per-kind indexes are created before the global indexes are removed, inside the
  same exclusive transaction that commits `user_version`.
- Failure leaves either the original schema/facts or the complete new schema;
  a runner is restarted after failure rather than reused.
- Before new Running data is committed, the validated recovery copy may restore
  v1.1. After new authoritative facts exist, rollback requires a forward repair
  or export path rather than an unsupported binary/schema downgrade.

## Required technical fixtures and proof

- Fresh v0 → schema 27 migration must retain the frozen migration-23 trigger
  registry without Phase 13 source tables.
- The retained schema-27 fixture must cover legacy Strength ownership, active
  schedule pairing, completed history, in-progress and partial recovery,
  ready/running/paused/stopped/expired/gap timing states, portable identities,
  and automatic-backup generation state.
- Real SQLite tests must prove Strength + Running coexistence, same-sport-only
  replacement, mismatch rejection, restore-clean validation, and per-sport
  merge normalization. Android lifecycle proof remains pending implementation.

Approval is complete. Evidence not listed as executed above is pending
verification and must not reopen the `one-per-sport` owner decision.

## Validation carried forward

Validated against `.planning/v1.2-owner-decisions.json` on 2026-10-07:
`decisions["MAP-01"].status` is `approved` and its exact selection is
`one-per-sport`. Plan 13-02 may proceed only with that approved per-sport
contract; no local artifact may substitute a different cardinality default.
