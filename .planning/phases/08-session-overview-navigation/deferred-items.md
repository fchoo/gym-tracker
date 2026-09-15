# Deferred Items — Phase 08 Plan 04

- The whole-repository Jest and explicit coverage gates stop on stale, out-of-scope UI expectations in `ActiveWorkoutMetricProfiles.test.tsx`, `foundation.test.tsx`, and `SetRow.test.tsx`. The focused Phase 8 contracts pass, and the diagnostic coverage summary reports 100% for the four specified workout modules, but the standalone gate did not emit its required success report.
- `scripts/phase2-evidence-scripts.test.mjs` retains unrelated pre-existing failures because Phase 2 planning artifacts `02-VALIDATION.md` and `02-UI-SPEC.md` are absent and its source ledger is stale.
- Native Maestro verification remains unrun because the required `artifacts/native/phase2/build.json` development-test manifest is absent.
