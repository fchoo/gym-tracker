# Phase 6 Progress Diagnosis

## Candidate-Bound Observation

The audited production candidate reaches the Progress screen error branch after
`ProgressScreen` delegates `loadProgress` through the trusted runtime to
`progressRepository.load`.

| Field | Observed classification |
| --- | --- |
| Read stage | `progress_repository_load` |
| Branch | `current_baseline_runtime_capability` |
| Error class | `TypeError` |
| Error code | `runtime_array_to_sorted_unavailable` |
| Freshness | `not_returned` |
| Recoverability | `requires_candidate_compatible_runtime` |

The candidate manifest and installed package were verified as the same
`com.fchoo.gymtracker` APK SHA-256 before this observation. The diagnostic
records no device serial, database path, SQLite row, identifier, JSON payload,
backup content, or raw exception message.

## Evidence Chain

1. The candidate database applies the complete current migration manifest and
   has clean integrity and foreign-key checks.
2. The authoritative four-query
   `loadEffectiveHistoryProjectionSessions` source adapter resolves against the
   private candidate database copy. No missing table, missing column, SQL
   syntax, or constraint rejection is evidenced.
3. The candidate's empty-history state reaches the repository's `current`
   freshness branch and projects the factual baseline when
   `Array.prototype.toSorted` is available.
4. The production APK's Hermes bytecode references `toSorted`, but its embedded
   runtime exposes the related non-mutating array methods without `toSorted`.
   Modeling that candidate capability against the private full-current-schema
   database reproduces `TypeError` at `progress_repository_load`.

## Repair Boundary

The causal seam is runtime compatibility in the current-baseline Progress
projection path, not a SQLite migration, projection freshness, source row,
queue, parser, or UI copy defect.

Only Plan 06-07 may select the minimal compatibility repair after retaining the
full-migration host fixture. That plan must preserve:

- SQLite source authority and parameterized repository reads.
- Existing `unavailable` and `updating` freshness early returns.
- Projection rebuildability and existing period semantics.
- The bounded Progress error and retry contract.

### Allowed production paths

- `src/platform/sqlite/repositories/progressRepository.ts` — the only
  diagnosis-authorized production path for the causal runtime-compatibility
  repair.
- `src/ui/screens/ProgressScreen.tsx` — authorized only for the separately
  planned shared Search and truthful typed Retry presentation after the causal
  repair is proven.

The diagnosis does not authorize changes to
`src/bootstrap/workoutAppRuntime.tsx`, `src/bootstrap/workoutLifecycle.ts`, or
`src/platform/sqlite/effects/historyProjectionEffects.ts`.

This diagnostic plan changes no production runtime, repository, migration,
projection, effect, or UI behavior.

## Regression Fixture

`tests/sqlite-host/progressRepository.test.ts` opens an isolated database,
applies the complete migration manifest, and leaves the legitimate empty-history
baseline unseeded. With normal host capabilities the repository returns
`freshness: "current"` and a baseline projection. When only
`Array.prototype.toSorted` is unavailable, the same full-migration state rejects
with `TypeError`; restoring the capability returns the factual baseline again.

The fixture asserts only the bounded error class and public baseline state. It
does not copy candidate data or expose source rows, identifiers, JSON, database
paths, backup contents, or device facts.
