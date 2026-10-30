---
exact_sha: 6abf53aa63eca6eb15a949de77caf1c8c4d08449
base: 898ae5f2cacca08f3457af1d66d3c573c09cd68c
status: issues_found
findings_counts:
  blocker: 0
  critical: 0
  warning: 1
  total: 1
score: 95
score_scale: 100
review_mode: independent_read_only_source
native_acceptance: not_established_pending_fresh_final_source_build
---

# Independent native corrective code review

Reviewed the complete exact committed delta: **34 files, 1,426 insertions, 80 deletions**, plus relevant integration outside it. Worktree: `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-review`; branch: `agent-p20-native-final-review-6abf53aa`. HEAD and branch matched the requested pin. Root `AGENTS.md` and `/Users/bytedance/.trae/skills/gstack/review/checklist.md` were read before review.

**Result: one Warning; no Critical or Blocker findings.** Score deduction is for the verified rendered-result nonce-binding defect below, not for the pending native execution.

## W1 — Rendered results can be rebound to a nonce that did not execute

**Severity:** Warning (P2)  
**Confidence:** 9/10  
**Primary location:** `app/__native-contracts.tsx:729`

### Verbatim motivating code

`app/__native-contracts.tsx:729`:

```tsx
            {`${RESULT_MARKER}${encodeURIComponent(JSON.stringify(selectedSuite === "v1.2-acceptance" ? { runId, result } : result))}`}
```

The execution identity is recalculated during every render, including a time-dependent fallback:

`app/__native-contracts.tsx:257-261`:

```tsx
function boundedRunId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.replace(/[^A-Za-z0-9._-]/gu, "").slice(0, 48)
    || `native-${Date.now()}`;
}
```

`app/__native-contracts.tsx:431`:

```tsx
  const runId = boundedRunId(parameters.runId);
```

The mount-wide guard prevents dispatch for a subsequent identity, and completion stores no execution identity:

`app/__native-contracts.tsx:444-448`:

```tsx
  useEffect(() => {
    if (!nativeContractsEnabled || started.current) {
      return;
    }
    started.current = true;
```

`app/__native-contracts.tsx:554`:

```tsx
          setState({ status: "finished", result });
```

### Concrete impact

Opening the enabled acceptance route without `runId` executes under the first generated `native-<timestamp>`. Completion calls `setState`, causing another render; the fallback then generates a different timestamp, and the newly added machine-result envelope attributes the completed result to that different identity. The console frames remain bound to the original execution identity.

With an explicit ID, changing only `runId` on the same mounted route has the analogous effect: `started.current` blocks new work, but line 729 wraps the old result with the new route ID. This also applies if the parameter changes while the original execution is pending. Thus the rendered envelope is not an immutable binding to the execution that produced its result.

### Verified integration handling and severity limit

- `app/_layout.tsx:277-285,662-671` retains the same native-contract navigator for this pathname; it does not key it by nonce. The installed Expo Router implementation reads live local route params (`node_modules/expo-router/build/hooks/useLocalSearchParams.js:11-14`) and supports updating them through the current navigation object (`node_modules/expo-router/build/global-state/router.js:126-131`). There is no route-level immutable-result binding elsewhere in the reviewed integration.
- **The live acceptance collector is protected from an automated false PASS here.** `scripts/v12-production-native-runtime.mjs:212-217` supplies a fresh explicit `v12-<32 hex>` nonce and force-stops the package before opening the route. Lines 225-230 collect console log frames, not rendered text, and apply `assertV12AcceptanceNativeContractResult`. The changed frame publication at `app/__native-contracts.tsx:542-553` captures the execution ID inside the retained promise. No rendered-text fallback exists in that collector.
- `src/testing/v12NativeContractLogTransport.test.ts` covers retained promises and framed identities, but does not render the screen or exercise changes to its local search parameters. Its passing helper assertions therefore do not close this screen-level defect.

**Recommended correction:** retain the execution ID together with its finished result and render that saved binding. If the same mounted route must accept a new nonce, reconcile/dispatch by nonce rather than a permanent mount-wide boolean, preserving the existing once-for-nonce registry. Add a focused route regression for changed parameters and the omitted-ID fallback. No fix was made during this audit.

## Other changed boundaries traced

| Boundary | Source verification |
| --- | --- |
| Shared ADB and agent queues | `AGENTS.md:23-30,37-38` preserves exact-SHA audits, normal waiting states, fresh final-source native evidence and exclusive device use; it expressly forbids destructive shared-ADB operations and invented heartbeat progress. |
| Literal progress namespace and framing parser | `scripts/native-contract-log-transport.mjs:40-75,95-109` recognizes only the optional literal `v1.2-acceptance:` prefix plus the constrained stage alphabet, checks the nonce, rejects unbound raw results for current cryptographic nonces, rejects invalid summary totals and missing/duplicate/non-object case records. Remaining acceptance shape/status checks are enforced at `scripts/v12-sqlite-producer-contract.mjs:62-84`; the permissive transport layer is not itself the all-pass validator. |
| Bounded console publication and remount single flight | `src/testing/v12NativeContractLogTransport.ts:18-35,39-60` inserts the promise before dispatch, retains rejections, caps the registry at eight identities, prepares all CASE and RESULT frames before output, and checks UTF-8 byte size against 3,840. `app/__native-contracts.tsx:111,541-555` puts actual aggregate execution and the sole result-frame publication inside that promise. The rendered binding exception is W1. |
| Source-owned case/operation checkpoints | `src/testing/contracts/contractProgress.ts:5-23` isolates synchronous observer failures and emits completion only after actual work resolves. The six changed runners preserve canonical case order and verdicts. `v12Acceptance.contract.ts:281-309` forwards concrete source checkpoints through the enclosing nonce-bound route callback. No timer heartbeat or execution-budget increase is added by this delta. The collector's existing 30-second idle limit and 20-minute overall limit remain at `scripts/v12-production-native-runtime.mjs:222-237`. |
| Migration cuts and nested merge | `multiPlanRunning.contract.ts:176-236` awaits close before reopen, reads rollback state from the reopened runtime, then awaits its close. Lines 919-924 inject the actual canonical portable-merge runner with an enclosing-run-scoped adapter. `portableMerge.contract.ts:123-138` and `migrationsEffects.contract.ts:969-970,1016-1027` propagate that identity into real isolated database names. The previous fixed-name fallback at `multiPlanRunning.contract.ts:841-843` is not used by this Expo adapter. Migration statement-cut completion follows `withFreshRuntime` cleanup (`migrationsEffects.contract.ts:147-160,299-335`). |
| Compiled devtest capability before publication | `scripts/validate-development-test-native-access.mjs:11-46` checks the exact devtest binary-manifest badging and generated release BuildConfig with literal `DEBUG = false`, selecting executable `aapt` or `aapt2` only under Build Tools `36.0.0`. CLI rejection output is sanitized at lines 49-57. `build-current-native-test-apk.sh:365-401,567-576` runs the gate after assembleRelease and embedded-config validation, before APK retention, installation and final manifest publication. |
| Production/devtest separation | `plugins/withAndroidPhysicalTestService.ts:39-73` enables manifest debugging only for the exact development-test profile, literal enabled hooks and devtest package; the service remains DUMP-protected. It does not modify Gradle debugging variants. `app.config.ts:28-43,114-129` keeps production hooks false and suite null. `assert-generated-production-android.mjs:42-81,87-126` validates raw hook values before Expo serialization, rejects production application/release debugging and test service/instrumentation, and requires the selected ARM64 property. `plugins/withGarminConnectModule.ts:18-26,68-74` is the existing ARM64 selector; restoring the obsolete full-ABI assertion would contradict that integration. |
| Coverage registration and integrity guards | `scripts/run-coverage-gate.mjs:147-235,271-390,823-852,894-909` registers all 54 Node test files, 19 distinct critical Node modules, and ten Phase 20 critical TS modules, with discovery, uniqueness and project-set checks. The four required metrics remain exactly 100. Unchanged missing-coverage and non-100 rejection logic is at `scripts/phase20-subprocess-coverage.mjs:322-360`; zero-skip enforcement remains at lines 247-253. No threshold or integrity guard is lowered in this delta. |

The added fixtures are confined to host tests and explicit mocked tool boundaries; they are not wired into the live native collector. The changed console payloads contain canonical aggregate facts and constrained diagnostics, not private SQL rows, raw device logs or credentials. No OAuth registration, signing credential or credential-handling change is present in the exact delta. This is a code review, not a replacement for the separately assigned security audit.

## Execution evidence and source-only limits

**No dependencies were installed; no worktree/branch was created or switched; no source was edited; no tests, coverage aggregates, builds, ADB/device commands, fetch/sync, commits, pushes or PR operations were run.** Existing modified/untracked planning reports and the existing dependency link were left intact. This report is the sole intentional file written by this reviewer.

The following is **parent/agent-supplied evidence, not reviewer execution or independent coverage certification**:

- 245 distinct tests across eight complete progress-related files, zero skips; V12 acceptance and progress helper at exact 100% for all four metrics.
- Integrated 151 tests across 11 suites, all ten Phase 20 TS critical modules at exact 100% for all four metrics.
- Parser/framing, packaging, builder and registry: 37 Node cases, zero skips; the two changed/new critical Node helpers at exact 100% for all four metrics.
- 44 plugin/tooling tests across five suites, zero skips; typecheck and 470 boundary tests passed; launcher 36 tests, zero skips.
- Python/Kotlin and other unchanged modules retain earlier input-bound evidence; it is not relabelled as execution on this SHA.
- Legacy Phase 5 full-file baseline: 15 failures before the production assertion repair, 14 of the same unrelated failures after; the changed assertion case was fixed with no new failures. This is not a current v1.2 aggregate result.

The known Samsung failure at the base SHA was an actual SQLite `marker_timeout`, with rejected progress prefix, duplicate same-process/thread markers, oversized/unbound output and unavailable run-as capability. Its immutable failed run is reported as preserved. **This review neither reclassifies that run nor claims native PASS.** A fresh final-source native build and exclusive-device acceptance execution remain pending; source inspection cannot establish device behavior, physical timings, compiled APK bytes, or successful native acceptance.
