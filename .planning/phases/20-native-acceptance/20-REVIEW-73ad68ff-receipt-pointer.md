---
exact_sha: 73ad68ff2ac34c0e782fba5011ab0d3e7d45e53d
base: 6abf53aa63eca6eb15a949de77caf1c8c4d08449
status: clean
findings_counts:
  blocker: 0
  critical: 0
  warning: 0
  total: 0
score: 100
score_scale: 100
review_mode: independent_read_only_source_delta
source_only: true
prior_full_audit: .planning/phases/20-native-acceptance/20-NATIVE-CORRECTIVE-REVIEW-6abf53aa.md
native_acceptance: not_established_pending_fresh_final_source_build_and_exclusive_device_execution
release_readiness: not_assessed
---

# Independent targeted native corrective review

**Pre-Landing Review: No issues found in the reviewed delta. W1 closed.**

## Exact scope and continuity

- Existing worktree: `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-review`.
- Branch: `agent-p20-native-warning-review-73ad68ff`; HEAD matched the exact SHA above. Its immediate parent is the exact base above.
- Root `AGENTS.md` and `/Users/bytedance/.trae/skills/gstack/review/checklist.md` were readable and read before substantive review; applicable project rules were also read.
- The complete committed delta contains **two files, 104 insertions, 16 deletions**: `app/__native-contracts.tsx` (18 insertions, 16 deletions) and `app/__tests__/native-contracts.identity.test.tsx` (86 new lines). Reviewed source and relevant integration matched the pinned HEAD, not unrelated working-tree metadata.
- Loaded and preserved `20-NATIVE-CORRECTIVE-REVIEW-6abf53aa.md`. It records the full `898ae5f2cacca08f3457af1d66d3c573c09cd68c..6abf53aa63eca6eb15a949de77caf1c8c4d08449` source audit at **95/100**, with W1 as its sole Warning. This continuation reviews only the subsequent two-file repair and saved-state integration. The other 35 source boundaries identified by the parent retain the prior audit by reference; they were not subjected to a duplicate full audit or relabelled as new execution evidence here.

The **100/100 source-review score** restores the five points deducted solely for W1 and records no new findings in this scoped delta. It is not a native acceptance or release score.

## W1 closure — saved results retain their actual execution identity

**Disposition:** closed by source inspection. **Confidence:** 9/10.

### Verbatim corrective code

`app/__native-contracts.tsx:246-253` now requires an execution identity on every finished state:

```tsx
type RouteState =
  | Readonly<{ status: "disabled" | "running" }>
  | Readonly<{
      status: "finished";
      runId: string;
      suite: NativeContractSuite;
      result: NativeContractResult;
    }>
```

`app/__native-contracts.tsx:543-557` stores the same closure-bound `runId` used by actual dispatch, progress and console frames:

```tsx
        if (selectedSuite === "v1.2-acceptance") {
          const result = await v12NativeExecutions.onceForNonce(runId, async () => {
            const completed = await verifyV12AcceptanceSqliteContracts(
              await createExpoV12AcceptanceSqliteContractAdapter(
                runId,
                (stage) => emitAggregateProgress(runId, `v1.2-acceptance:${stage}`),
              ),
            );
            for (const frame of createV12NativeContractLogFrames(runId, completed)) {
              console.log(frame);
            }
            return completed;
          });
          setState({ status: "finished", runId, suite: selectedSuite, result });
          return;
```

`app/__native-contracts.tsx:731` chooses the envelope from the completed suite and nonce, rather than current route parameters:

```tsx
            {`${RESULT_MARKER}${encodeURIComponent(JSON.stringify(state.status === "finished" && state.suite === "v1.2-acceptance" ? { runId: state.runId, result } : result))}`}
```

`app/__native-contracts.tsx:614` also obtains the displayed result from that same finished state:

```tsx
  const result = state.status === "finished" ? state.result : undefined;
```

### Saved-state and execution trace

- All **15** finished-state writers include `runId` and `suite: selectedSuite`: `app/__native-contracts.tsx:476,485,494,503,512,521,530,539,556,565,573,579,585,593,599`. This covers every existing `NativeContractSuite`, including the aggregate/cast branches and kernel fallback; no writer leaves either new field absent. No enum value or status is added.
- The nonce fallback still recalculates at `app/__native-contracts.tsx:259-262,433`, but a completion-driven rerender no longer uses that new value to label an old result. Changes during pending work cannot alter the primitive nonce/suite captured by the original effect; completion stores that binding. Non-v1.2 suites retain their existing unwrapped result shape.
- `app/_layout.tsx:277-285,662-671` still uses the same unkeyed native-contract navigator. Therefore this repair works on the same mounted component and does not depend on a nonce-triggered remount.
- The mount-wide guard at `app/__native-contracts.tsx:446-450` and effect dependencies at line 612 are unchanged. A parameter update is not presented as a new execution: the existing result keeps its actual identity. Dispatch policy is deliberately unchanged.
- `src/testing/v12NativeContractLogTransport.ts:18-35` is unchanged: it retains each promise before dispatch, reuses the existing nonce promise, retains failures, and preserves the eight-identity capacity. The route's module-level registry at `app/__native-contracts.tsx:111` is unchanged. Frame preparation/nonce validation and the 3,840-byte limit remain unchanged at `src/testing/v12NativeContractLogTransport.ts:3-4,39-60`.
- Actual source execution is still invoked inside `onceForNonce`, with its adapter nonce and progress callback unchanged at `app/__native-contracts.tsx:543-555`. The adapter continues deriving isolated source work from that nonce at `src/testing/contracts/v12Acceptance.contract.ts:277-319`; source-fact/result validation remains at lines 342-384. No fixture was inserted into this runtime path.
- The live collector remains console-frame based, not rendered-text based: `scripts/v12-production-native-runtime.mjs:212-230` supplies a fresh explicit nonce, force-stops the package, opens the route and validates the parsed console result. Its existing 20-minute total limit and 30-second progress-idle limit at lines 222-237 are unchanged. This inspection performed no native or ADB operation.

## Actual-route regression source

The new test imports the **actual route component** at `app/__tests__/native-contracts.identity.test.tsx:18` and renders it at lines 47, 61 and 76. `machineResult()` at lines 29-33 reads and decodes the rendered machine-result text rather than substituting a serialization helper.

| Exact test name | Source assertions and trigger |
| --- | --- |
| `keeps a completed result bound to its actual nonce after route parameters change` | Lines 43-53 complete nonce `b`, change parameters to nonce `c`, rerender, require `{ runId: original, result: fixture }`, and require exactly one runner call. |
| `retains the dispatch identity when parameters change while work is pending` | Lines 55-68 hold the runner promise for nonce `d`, change parameters to nonce `e`, resolve the original work inside `act`, require the original result binding, and require exactly one runner call. |
| `keeps an omitted-ID fallback stable through completion-driven rerenders` | Lines 70-85 omit the ID, dispatch at clock `1_700`, resolve at `8_000`, then rerender at `9_000`; both result assertions retain `native-1700`, with exactly one runner call. |

The suite environment is set **before** requiring the route and restored afterward (`app/__tests__/native-contracts.identity.test.tsx:16-22`), matching the route's module-time `configuredSuite` read at `app/__native-contracts.tsx:146`. Local params, enabled development-test constants, and adapter/runner boundaries are explicit fixture mocks at test lines 5-14. The unrelated notification dependency is mocked only in this unit fixture at line 7. The `console.log` spy is also confined to the unit fixture at line 38 and restored at line 41; the runtime still publishes frames via `console.log(frame)` at route line 552. The real execution registry and frame helper are not replaced by this test.

These are focused screen-binding regressions, not SQLite/native execution tests; the one-case fixture does not certify the complete acceptance suite. Reading their triggers/assertions against the old mutable-envelope line explains why each exercises W1. Their reported red/green outcome is supplied evidence, not reviewer execution.

## Regression assessment

Applied the checklist's critical and informational passes to the full exact delta. The repair adds no SQL/storage mutation, LLM/shell boundary, new suite/status value, production access capability, transport protocol, collector fallback, execution budget, or coverage-threshold change. The state fields were traced through all writers and the rendered consumer. The existing source execution, single-flight guard and frame publication remain intact. **No new Blocker, Critical or Warning finding was identified; no speculative finding was promoted.**

## Supplied execution evidence and source-only limits

The parent reports the following; **none was run or independently execution-certified by this reviewer**:

- All three actual-route cases demonstrated red before the repair and green afterward.
- Full typecheck and 470 boundary tests passed, without React `act` or Expo warnings.
- Other previously passing host/source gates retain their earlier input-bound evidence.

**Operations performed:** local instruction/report/source reads, targeted searches, read-only git identity/diff/status inspection and preservation fingerprints, plus creation of this new report. Existing modified/untracked reports and the dependency link were preserved. This report is the sole intentional filesystem write.

**Not performed:** source edits, test/coverage execution, native/ADB/device commands, builds, installs, commits, pushes, fetch/sync, branch changes, new worktrees, or background workers. The prior immutable failed native run remains failed; this report does not reclassify it or claim native PASS. A fresh final-source build and acceptance run under one exclusive device lease remain required. Source inspection cannot establish compiled APK bytes, native device behavior/timings, acceptance PASS, or release readiness.
