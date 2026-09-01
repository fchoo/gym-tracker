# Phase 6 Progress Compatibility Diagnosis

## Evidence Boundary

This repository does not contain an executable candidate-observation command
for the original Progress failure. The prior command accepted caller-supplied
candidate hashes and emitted a fixed classification, so it was removed: it
could not independently establish that an installed APK produced the claimed
branch or error.

The historical audit remains context for why Phase 6 investigated Progress, but
it is not reasserted here as command-produced candidate evidence. Any future
candidate observation must bind an immutable manifest, a recomputed installed
APK hash, and an independently captured redacted measurement before it can
claim a candidate branch, error class, or error code.

## Repository-Verifiable Causal Proof

`tests/sqlite-host/progressRepository.test.ts` opens an isolated database,
applies the complete migration manifest, and retains the legitimate
empty-history baseline. It removes `Array.prototype.toSorted` only for the test
operation and proves that `progressRepository.load`:

1. returns `freshness: "current"` with a factual baseline projection while the
   capability is absent;
2. leaves an originally absent `toSorted` capability absent after the operation;
3. returns the same factual current baseline once normal host capabilities are
   restored.

This is independent causal proof for the repository compatibility repair. It
does not copy, inspect, or emit candidate SQLite rows, device facts, installed
APK hashes, paths, JSON payloads, backup contents, or raw exception messages.

## Repair Boundary

The repository-verifiable seam is runtime compatibility in the current-baseline
Progress projection path. The host fixture proves neither the historical
candidate's exact runtime error nor any external candidate identity.

The completed Plan 06-07 compatibility repair must preserve:

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

No repository command now claims a candidate observation. The full-migration
host fixture is the durable, independently executable causal proof.
