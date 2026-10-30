# Phase 20 — Offline Diagnostics Review — e39a8d05

- **Reviewed SHA:** `e39a8d050da313825cb857e2f7d7a5bba9f0c794`
- **Base SHA:** `6722d3dedb52d8f54b3cebdd3416e8b68c7e0550`
- **Branch:** `agent-p20-offline-diag-review-e39a8d05`
- **Worktree:** `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-review`
- **Status:** **CLEAN — SOURCE-ONLY DIAGNOSTIC DELTA; NATIVE ACCEPTANCE PENDING**
- **Findings:** **0 verified issues** (0 critical, 0 informational).
- **Source-review score:** **100/100**, restricted to this diagnostic delta and its relevant consumers; not a test, coverage, runtime-performance, root-cause, or native-acceptance score.

## Scope and execution boundary

Read root `AGENTS.md`, `.trae/rules/rules.md`, and the review checklist before reviewing the complete six-file base-to-head diff:

1. `scripts/run-coverage-gate.mjs`
2. `scripts/run-coverage-gate.test.mjs`
3. `src/testing/contracts/progressNativeDiagnostics.ts`
4. `src/testing/contracts/progressNativeDiagnostics.test.ts`
5. `src/testing/contracts/progressParity.contract.ts`
6. `src/testing/contracts/progressParity.contract.test.ts`

The delta comprises `66d8854f` and `e39a8d05`. HEAD and branch matched the assignment; `git diff HEAD -- src scripts app` was empty. The checkout was **not globally clean**: existing Phase 20 review metadata/reports and the shared `node_modules` entry were already present. They were left untouched.

Review used file reads, local searches, and read-only Git inspection only. No ADB/device actions, native execution, APK build, tests, coverage execution, installs, network/sync operations, new worktrees, branch switches, source edits, commits, or pushes occurred. This report is the sole authored repository file. The prior base audit and its 49 closed items were not reopened or re-certified.

## Findings

**No concrete, verified defect found in the six-file diagnostic delta.** No speculative findings or native-cause claims are included.

## Verified source evidence

### 1. Real parser calls; truthful, limited parser-stage results

`progressNativeDiagnostics.ts:24-38` advances each stage only after the previous real parser returns. Relevant quoted lines:

```ts
const identity = parseMetricIdentity({ profile, contractVersion: Number(contractVersion), exerciseMetricGeneration: Number(exerciseMetricGeneration) });
diagnostics.push(Object.freeze({ stage, status: "passed", code: "validated" }));
stage = "target";
parseMetricTargetJson(identity, record.targetJson);
```

The observation call is at lines 34-36; the single catch at lines 37-38 records the current failed stage and exits without running later parsers. Individual records and the result array are frozen (lines 30, 33, 36, 38, 40). These are **parser-validation results**, not projector success or native acceptance.

The imports resolve through `domains/metrics/index.ts:1-9,34-41` to the actual implementations in `metrics/contracts.ts:59-65` and `metrics/observations.ts:13-55`, with the registered load/reps schemas in `metrics/registry.ts:30-41`. The unchanged target schema explicitly permits omitted `targetReps` (`metrics/contracts.ts:91-105`). The unchanged production Strength parser uses the same identity/target/observation parser sequence (`progress/dashboardProjection.ts:361-374`). This establishes source-level alignment, not behavior on Hermes.

### 2. Finite diagnostic output; no raw message or row emission

`progressNativeDiagnostics.ts:6-18` defines seven exact allowlisted codes and only three fallback classifications. Quoted mapping:

```ts
if (allowedCodes.has(error.message)) return error.message;
if (error.name === "TypeError") return "type_error";
if (error.name === "ReferenceError") return "reference_error";
```

All other inputs return `"unexpected_error"`. No diagnostic record contains source fields, exception stacks, filenames, or arbitrary message text (`progressNativeDiagnostics.ts:30-40`). At the emission boundary, `progressParity.contract.ts:205` interpolates only the fixed case prefix, fixture ordinal, and bounded diagnostic fields:

```ts
reportContractProgress(observer, `${prefix}:fixture-${index + 1}:${diagnostic.stage}:${diagnostic.status}:${diagnostic.code}`);
```

The only contract callers pass `[strengthFact(1)]` and `[strengthFact(1), strengthFact(2)]` (lines 222-236), not rows returned by the repository. Fixture definitions remain unchanged at lines 81-89. The earlier Strength repository read at line 233 is still actual acceptance work, but its result does not enter this diagnostic helper.

### 3. Reachable stages fit the existing 80-character consumer bound

The two fixed arrays generate at most nine fixture-parser records and at most two additional case-error records. There is no timer, heartbeat, retry, budget increase, or synthetic completion checkpoint in the delta.

`v12Acceptance.contract.ts:281-282,308-309` adds the registry prefix `progress-parity:`. For the actual parser paths, the longest prefixed failure label is **78 ASCII characters**:

```text
progress-parity:case-3:fixture-2:observation:failed:metric_observation_invalid
```

The longest prefixed case-error label is 65 characters (`progress_strength_projection_invalid`). The longer Progress invariant codes belong to the outer case-error path; the metric parsers do not throw those codes as fixture-parser failures (`metrics/contracts.ts:59-65`, `metrics/observations.ts:13-55`, `metrics/registry.ts:160-168`). Thus this reasoning does not combine unreachable stage/code pairs.

The route adds the separate `v1.2-acceptance:` envelope (`app/__native-contracts.tsx:543-549`). The consumer explicitly allows that envelope **outside** its 80-character suffix bound (`scripts/native-contract-log-transport.mjs:103-109`):

```js
&& payload.runId === runId
&& typeof payload.stage === "string"
&& /^(?:v1\.2-acceptance:)?[a-z0-9_:-]{3,80}$/iu.test(payload.stage)
```

Consequently the complete enveloped longest label is 94 characters, but remains valid without truncation under the actual consumer grammar. Nonce binding remains intact. The consumer returns the latest progress label only (line 109); this review does **not** assert that it durably retains every parser checkpoint.

### 4. Observer isolation and acceptance outcomes remain separate

Every new emission uses `reportContractProgress`. Its synchronous observer boundary is isolated (`contractProgress.ts:5-10`):

```ts
try {
  observer?.(stage);
} catch {
  // An observer is not part of the acceptance work.
}
```

The new error label is emitted before the existing failed result is recorded (`progressParity.contract.ts:330-334`). It does not replace the original case result or its existing `safeErrorCode`. Actual work still determines passed/failed results, counts and hashes; `runtime.close()` and adapter cleanup remain awaited in the existing finally blocks (lines 328-343).

The aggregate still reduces source facts to `{ id, status }` (`v12Acceptance.contract.ts:222-226`) and keeps the existing verdict logic. New diagnostic progress is sent independently before that reduction. Production projectors, target schemas, eligibility logic, fixture definitions, acceptance case definitions, counts, private-row handling, and native budgets have no changes in this diff. The native consumer still validates result evidence separately from progress (`scripts/v12-production-native-runtime.mjs:224-235`); progress is not accepted as a passing result.

### 5. Coverage registration and focused test intent are preserved

The helper becomes the 11th Phase 20 TypeScript integrity entry (`run-coverage-gate.mjs:367-392`), bringing the global registry to 169 entries through its existing spread (`394-554`). Its focused test is registered at lines 895-911. The existing per-module requirement remains exactly 100% for statements, branches, functions, and lines (`1070-1075`). The Node project registry remains 19 modules / 54 test files (`824-853`); no thresholds, classifications, or native budgets were lowered.

Read all seven focused Jest test definitions: three in `progressNativeDiagnostics.test.ts` and four in `progressParity.contract.test.ts`. They assert real-parser validation without `targetReps`, failed-stage stopping, frozen/no-payload results, allowlisted/generic error mapping, exact fixture labels, throwing-observer isolation, unchanged factual results, and close/cleanup rejection propagation. The manifest assertion is updated from 10 to 11 (`run-coverage-gate.test.mjs:109-139`). These are source observations about test intent, **not a claim that this reviewer ran them**.

## Evidence and native-pending boundary

The assignment reports seven focused Jest tests passing, helper coverage at 100% across all four metrics, passing type/boundary checks (471 tests), and six registry tests passing. Those results are inherited context, not independently executed here.

The assignment also reports the prior unlocked native ten-category result as 8 passed / 2 failed, with failed source cases limited to `progress-pro02-all` and `progress-pro03-strength`, and the failed immutable `144410` run preserved. Its offline Zod/CJS/ESM/JIT-blocked/cold-import and Android-Babel probes are likewise inherited evidence. None is reclassified as a final-source native pass.

**Native cause remains UNPROVEN. This delta is diagnostic instrumentation, not a root-cause fix.** No production repair is justified by this source review alone. Actual nonce-bound native stage observations and fresh final-source native acceptance remain pending a later owner-authorized exclusive device window. Existing failed runs, reports, dependencies, and metadata were not altered.
