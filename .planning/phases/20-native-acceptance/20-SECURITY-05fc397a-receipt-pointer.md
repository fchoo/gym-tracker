---
phase: 20
slug: native-acceptance
status: verified
audit_scope: independent-read-only-four-file-progress-copy-sort-security-continuation
exact_sha: 05fc397a92cb8a77c330573b8634a5bf0915492d
independent_source_sha: 05fc397a92cb8a77c330573b8634a5bf0915492d
base_sha: e39a8d050da313825cb857e2f7d7a5bba9f0c794
branch: agent-p20-sort-security-05fc397a
baseline_report: .planning/phases/20-native-acceptance/20-OFFLINE-DIAGNOSTIC-SECURITY-e39a8d05.md
baseline_report_sha256: 03a177f3ba68bd5fe4df4010a699eb94d3cef2b2ad2fb1093a093c6f81f38a86
changed_files: 4
copy_sort_replacements: 24
threats_total: 49
threats_closed: 49
threats_open: 0
blocking_threats_open: 0
high_threats: 48
medium_threats: 1
mitigated_threats: 49
findings_total: 0
critical_findings: 0
high_findings: 0
medium_findings: 0
low_findings: 0
unregistered_flags: 0
warnings: 0
open_risks: 0
accepted_risks: 0
transfer_risks: 0
asvs_level: 1
block_on: high
score: 100
score_scale: 100
source_tracing_confidence: 9
source_runtime_compatibility_confidence: 9
native_proof: not_run
native_proof_not_run: true
live_builtin_property_read: not_run
native_root_cause_proven: false
native_acceptance_pending: true
release_authorized: false
created: 2026-10-23
---

# Phase 20 — Progress Copy-Sort Security Continuation at 05fc397a

## Conclusion

**VERIFIED — bounded, independent source-security continuation only.** The complete exact four-file delta replaces **24** Progress-domain `.toSorted(...)` calls with `.slice().sort(...)` and adds two missing-callable-builtin regression tests. No concrete new source-fact mutation, ordering/identity corruption, eligibility bypass, privacy disclosure, credential boundary, production/debug activation, native-transport, acknowledgement, or acceptance-authority regression was established.

**49/49 authored mitigations remain CLOSED by delta non-invalidation:** 48 High, one Medium, all disposition `mitigate`; zero open/blocking threats, findings at every severity, unregistered flags, warnings, open risks, accepted risks, or transferred risks. **Scoped source-security score: 100/100; ASVS Level 1; block on High.** This is inherited authored source-control closure, not comprehensive ASVS certification or a new whole-branch audit.

**Native proof: NOT_RUN; live builtin property read: NOT_RUN; native acceptance: PENDING; release authority: NOT_GRANTED.** Source tracing plus attributed host/cached-Hermes evidence supports **9/10 source/runtime compatibility confidence**, not a verified live property observation or fresh final-source native PASS. A new final-source-bound native check remains necessary; earlier failed immutable runs remain failures. Neither the helper, host tests, nor cached binary observations close that gate.

## Exact target, scope, and preservation

- Reused worktree: `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security`.
- Independently verified branch: `agent-p20-sort-security-05fc397a`.
- Independently verified HEAD: `05fc397a92cb8a77c330573b8634a5bf0915492d`.
- Independently verified base: `e39a8d050da313825cb857e2f7d7a5bba9f0c794`, an ancestor and the direct parent of this single-commit continuation.
- Complete delta: **4 files, 76 insertions, 24 deletions**. The full diff and all four current files were read; all four checkout files match their exact pinned Git blobs byte-for-byte.

| Changed file | Delta | Reviewed change |
|---|---:|---|
| `src/domains/progress/dashboardProjection.ts` | +9 / -9 | Nine copy-sort substitutions; no other byte changes. |
| `src/domains/progress/dashboardProjection.test.ts` | +31 / -0 | One synthetic direct All/Strength/Running missing-builtin test. |
| `src/domains/progress/periodProjection.ts` | +15 / -15 | Fifteen copy-sort substitutions; no other byte changes. |
| `src/domains/progress/periodProjection.test.ts` | +21 / -0 | One period/comparable-candidate missing-builtin test. |

A **static text comparison**, without importing/executing application code, independently confirmed for each production module:

```text
base_source.replace('.toSorted(', '.slice().sort(') == exact_HEAD_source
```

Dashboard: 9 old calls -> 9 new calls; period: 15 -> 15. Thus comparator bodies, filters, scalar/identity/JSON handling, statement order, result fields, and freezing expressions are byte-identical except for those call names. No production global patch, engine change, fixture change, new helper, dependency change, budget change, or source-policy relaxation appears in this delta.

Root `AGENTS.md:1-38`, project rules, `.planning/config.json:47-49`, the complete preserved exact-base report, and the needed unchanged Progress repository/contract/diagnostic edges were read. The security policy retains `security_enforcement: true`, ASVS L1 and block on High. All **49 authored threat rows** were read from the twelve Phase 20 plans. All twelve complete plan files were independently compared byte-for-byte across base, HEAD, and checkout and are identical. Unchanged whole-branch controls are inherited from the exact-base report rather than broadly re-audited.

**No prohibited action performed:** no tests/coverage, application imports, builds/prebuilds/native execution, ADB/phone operations, private SQL-row reads, account/credential/signing operations, installs, new worktrees, branch switches, fetch/sync/network activity, source edits, commits, pushes, duplicate audit agents, or extra report/metadata writes. Only this new report is authored. Existing report headers/hashes and dependency linkage are not rewritten. Actual review execution time is separate from any provider queue time; no queue state was treated as a failure and no agent was restarted or duplicated.

All current source citations below refer to the exact pinned target; old-source quotations are explicitly base-SHA source. Operational execution/binary observations are separately attributed and were not reproduced by this auditor.

## Findings and confidence

| Classification | Count |
|---|---:|
| Critical findings | 0 |
| High findings / open High-or-higher blockers | 0 / 0 |
| Medium findings | 0 |
| Low findings | 0 |
| Unregistered security flags | 0 |
| Warnings / open risks / accepted risks / transferred risks | 0 / 0 / 0 / 0 |

**Source-tracing confidence: 9/10.** A promoted finding requires severity, exact source location, verbatim motivating code, confidence, and a concrete new consequence. No hypothetical future caller, arbitrary Array-subclass/prototype scenario, inferred production reachability, or unobserved native property state is promoted as a new security finding. The missing native acceptance remains a verification gate, not an accepted security risk or a closed runtime gate.

## D1 — All 24 sorts copy their container before mutation

Every changed call has `.slice()` immediately before `.sort()`. The receiver of the mutating sort is consequently a new ordinary domain-array container, not the caller's array, source fact, retained history, grouped source array, or immutable projection array. Copies remain shallow, just as the old copy-sort operation retained element references; this change does not claim new deep immutability. Comparator bodies perform reads and do not assign source-record properties. Existing result freezes remain in the same locations.

Representative verbatim changed code:

```ts
// dashboardProjection.ts:196-200
  ).slice().sort((left, right) =>
    left.localDate.localeCompare(right.localDate)
    || left.sport.localeCompare(right.sport)
    || left.sourceOpportunityId.localeCompare(right.sourceOpportunityId)
  )[0] ?? null;

// dashboardProjection.ts:420
    const ordered = values.slice().sort(compareStrengthFact);

// periodProjection.ts:54
  for (const candidate of candidates.slice().sort(candidateOrder)) {

// periodProjection.ts:493-495
  return Object.freeze(values.slice().sort((left, right) =>
    left.exerciseId.localeCompare(right.exerciseId) || left.id.localeCompare(right.id)
  ));
```

Complete changed-sort inventory:

| Source | Exact lines | Ordered container / unchanged criterion |
|---|---|---|
| Dashboard | `145-147` | Filtered historical Running targets: effective time, revision, target ID; latest selected. |
| Dashboard | `164-165` | Filtered current Running targets: existing `compareGoals`; latest selected. |
| Dashboard | `196-200` | Compatible valid planned opportunities: civil date, sport, source opportunity ID; earliest selected. |
| Dashboard | `207` | Eligible Running source facts: existing `compareEffort`. |
| Dashboard | `226` | Per-distance/time-basis fact group: existing `compareEffort`. |
| Dashboard | `270-271` | Derived Running goal list: distance, time basis. |
| Dashboard | `420` | Parsed Strength group: existing `compareStrengthFact`. |
| Dashboard | `472-473` | Derived Strength goals: exercise name, deterministic goal ID. |
| Dashboard | `504-505` | All goal candidates: existing persisted factual `compareGoals`, then unwrap. |
| Period | `54` | Caller-owned Strength candidates: existing `candidateOrder`, before unchanged eligibility/fencing. |
| Period | `158` | Parsed all-time source dates: existing `compareLocalDates`; earliest selected. |
| Period | `163` | Set-deduplicated source IDs: unchanged default string ordering. |
| Period | `178-181` | Derived exercise references: exercise name, exercise ID. |
| Period | `218-221` | Active in-window source sessions: civil date, session ID. |
| Period | `289-291` | Valid filtered period facts: civil date. |
| Period | `322` | Valid filtered comparable exposures: existing `compareExposures`. |
| Period | `341-343` | Valid in-window opportunities: civil date, ID. |
| Period | `357` | Internal exposure group: existing `compareExposures`. |
| Period | `365-369` | Derived metric groups: exercise ID, identity key, comparator key. |
| Period | `460-462` | Trend entries: civil-date key. |
| Period | `472` | Trend session-ID Set materialization: unchanged default string ordering. |
| Period | `475` | Deduplicated trend exercise IDs: unchanged default string ordering. |
| Period | `493-495` | Caller/filtered attention items: exercise ID, attention ID. |
| Period | `534-539` | Derived best records: descending date/session ID, ascending exercise/set ID. |

The reviewed domain paths build dense arrays using repository mappings, filter/map/flatMap, Set/Map materialization, and internal pushes. No new sparse-array or user-defined array-subclass entry boundary is introduced. The scope does not assert universal semantic equivalence for adversarial arrays outside those existing domain contracts. Default string ordering and existing `localeCompare` behavior are retained, not normalized or replaced with a different locale policy.

## D2 — Source facts, identities, eligibility, history, and factual comparison are preserved

The exact substitution comparison establishes that the following source controls and calculations did not change:

- **Running evidence authority:** `dashboardProjection.ts:90-113` retains active/current goal validity and active, accepted, non-fixture, valid identity/revision/time, positive scalar, exact-distance, source-summary/source-laps fact eligibility. In particular `102-104` remains `fact.lifecycle === "active" && fact.accepted && !fact.fixture`; no sampled or schedule-only record is promoted into accepted effort.
- **Stable goal order:** `dashboardProjection.ts:34-40` still orders by persisted `sourceOrder`, target date, sport, plan/target identity, target ID, and revision. `72-87` still prefers a valid current declared source goal; fallback identity rules `48-69` are unchanged. All selection remains `activeGoals[0]` after that exact comparator (`500-510`), not unreviewed array position or a composite score.
- **Running history and gap:** historical target-at-effort versus current target logic (`133-168,234-250`) and best-effort duration/tie selection (`127-131,226-233`) are unchanged. Time bases remain separate (`211,223-225`). Gap, pacing, evidence count, honest empty/sparse/more-data states, and immutable history/goal/result construction (`171-180,240-278`) are unchanged.
- **Metric-aware Strength identity:** `dashboardProjection.ts:403-407` still constructs `exerciseId + NUL + identityKey + NUL + comparatorKey`. Parsing (`361-374`), local-date/session/set tie order (`377-380`), real `compareMetricObservations` (`423-440`), scalar/native-unit/direction logic (`313-358`), target/gap/evidence/source-revision fields and per-point historical target snapshots (`441-470`) are unchanged.
- **Effective candidates and recommendation fences:** `periodProjection.ts:38-76` keeps positive effective/target revisions, pending recommendation source/target revision equality, `isMetricExposureEligible`, `areMetricExposuresComparable`, and frozen accepted record copies. Sorting the copy does not move eligibility to UI code or broaden comparability.
- **Source/date/duplicate authority:** civil four-/twelve-week inclusive windows and earliest all-time source date (`142-159`), strict identity/date/count/duplicate checks (`105-139,195-221,268-343,481-495`), effective active-source filtering (`501-519`) and source-reference membership (`184-265,556-598`) are unchanged.
- **Period comparisons and outputs:** exposure chronology (`95-103`), metric grouping (`346-369`), latest/previous status comparison and metric-aware best-record/tie resolution (`372-413`), immutable source/trend collections (`415-478`) and honest state/summary derivation (`520-599`) are unchanged.

Verbatim identity and comparison authority:

```ts
// dashboardProjection.ts:403-407
export function progressStrengthGoalId(
  record: Pick<ProgressRecord, "comparatorKey" | "exerciseId" | "identityKey">,
): string {
  return `${record.exerciseId}\u0000${record.identityKey}\u0000${record.comparatorKey}`;
}

// periodProjection.ts:64-72
    if (!isMetricExposureEligible(candidate.metricExposure)) {
      continue;
    }
    const key = `${candidate.record.exerciseId}\u0000${candidate.record.identityKey}`;
    const first = firstByMetric.get(key);
    if (first !== undefined
      && !areMetricExposuresComparable(first.metricExposure, candidate.metricExposure)) {
      continue;
    }
```

The unchanged SQLite repository requires `kernel.readSnapshot` and runs load inside that snapshot (`src/platform/sqlite/repositories/progressRepository.ts:895-905`). Effective exercise/session/source-revision and JSON mapping (`324-369`), period input construction and source-reference mapping (`1072-1101`), factual dashboard order and immutable repository result (`1102-1136`) remain unchanged. There is no new writer or acknowledgement path in either pure module; this delta cannot itself commit source facts, alter receipt ownership, or acknowledge work ahead of the exclusive transaction. Other immutable ownership/remapping/JSON-binding and source-integrity controls are inherited without re-audit, not waived.

## D3 — Missing-builtin tests isolate the property change; source assertions are not native proof

The only new prototype modification is in **test code**, never in either changed production module. Each new test saves the original own-property descriptor, makes `Array.prototype.toSorted` non-callable inside `try`, and restores the exact descriptor in `finally`; if it did not originally exist, the test deletes the temporary property.

```ts
// dashboardProjection.test.ts:23,35,47-49
const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "toSorted");
Object.defineProperty(Array.prototype, "toSorted", { value: undefined, configurable: true, writable: true });
} finally {
  if (descriptor === undefined) Reflect.deleteProperty(Array.prototype, "toSorted");
  else Object.defineProperty(Array.prototype, "toSorted", descriptor);
}
```

`periodProjection.test.ts:66-75` has the same descriptor-preserving pattern. Precisely, the committed tests **set the callable builtin to `undefined`**, rather than deleting it during the exercise; they reproduce an unavailable callable method. Any separately reported pre-fix probe that deleted the property is owner-provided execution evidence, not an action performed here. The tests contain no async/concurrent scheduling around this temporary mutation and no broader global shim.

Assertions read, **not executed**:

- `dashboardProjection.test.ts:24-46` creates synthetic Strength facts with the existing valid optional-`targetReps` shape, freezes fact containers/Strength records and Running activity state, calls the direct projector for All, Strength, and Running, checks **two All goals**, **two Strength evidence points**, Running evidence/target, frozen returned goal arrays, and identical input JSON afterward. The target array is frozen; its contained target object is not newly claimed deeply frozen. The All call passes a sliced one-fact array; the Strength call exercises the frozen two-fact array directly.
- `periodProjection.test.ts:58-71` snapshots input JSON, computes expected period output before disabling the builtin, compares the output while it is non-callable, exercises an empty frozen candidate array, and checks input JSON is unchanged. This asserts ordinary-host parity, not Hermes execution or pre-fix error reproduction inside the committed test.
- Existing dashboard tests retain exact-effort rejection (`84-105`), historical target/time-basis separation (`108-137`), deterministic equal-best/goal order (`200-217,471-550`), metric-profile units/gaps/comparators (`311-408`), current versus historical targets (`263-308`), and compatible planned-opportunity order (`428-469`).
- Existing period tests retain stable source/history/metric/trend/drill-down outputs (`154-245,270-387`), input reordering and duplicate rejection (`389-429`), malformed-source fail-closed cases (`431-508`), exposure/group ties (`510-565`), and effective eligibility/stale-recommendation fences (`579-643`).
- The unchanged `src/testing/contracts/progressParity.contract.test.ts` declares four tests. Its complete result/count/hash/privacy assertions (`135-230`), requirement-specific failure versus Running independence (`233-249`), close/cleanup rejection propagation (`251-270`) and source-owned suite registration (`273-292`) remain intact. Together with the **14 dashboard and 12 period declarations**, the reported affected scope is **30 tests in three files**, with no new skips, name-filtered replacement scope, or removed assertion.

The parent reports all 30 complete cases pass with zero skips, both changed integrity-critical modules at **100% statements, branches, functions and lines**, typecheck passing and **471** boundary checks passing. The commit message repeats the host-scope claim. Those are attributed parent execution proofs; this auditor ran none of them and does not re-label them as independent execution or native proof. Coverage thresholds/registration/tooling are outside the four-file delta and remain unchanged. No threshold relaxation, guard deletion, source-policy bypass, or repeated broad host suite is recommended.

## D4 — Direct failure boundary, existing fallback, and native evidence limitations

The exact-base source called the unsupported builtin before useful direct-projection work, including empty sorted inputs:

```ts
// Base e39a8d05, dashboardProjection.ts:196-200
  ).toSorted((left, right) =>
    left.localDate.localeCompare(right.localDate)
    || left.sport.localeCompare(right.sport)
    || left.sourceOpportunityId.localeCompare(right.sourceOpportunityId)
  )[0] ?? null;

// Base e39a8d05, periodProjection.ts:156-158
  const start = sourceDates.length === 0
    ? end
    : sourceDates.toSorted(compareLocalDates)[0]!;
```

Current `dashboardProjection.ts:477-485` still calls `plannedNextFor` first, then Running projection and Strength projection; current `periodProjection.ts:501-505` still computes the window before filtered source inputs. The fix supplies local copy-sort operations at those boundaries without reordering or skipping validation/operation stages. The parent reports an actual Node pre-fix missing-builtin regression produced the old **TypeError** at `plannedNextFor` / the non-empty all-time `sourceDates` path, then restored the descriptor in `finally`. No exact exception-message text is invented here and no pre-fix application execution was undertaken by this auditor.

The unchanged repository has a temporary compatibility helper (`progressRepository.ts:252-278`): it installs a copy-sort function only while its synchronous operation runs and removes it in `finally`.

```ts
// progressRepository.ts:265-270
    value: function toSorted<Value>(
      this: readonly Value[],
      compareFn?: (left: Value, right: Value) => number,
    ): Value[] {
      return [...this].sort(compareFn);
    },
```

Repository calls wrap both period projection (`1075-1101`) and repository dashboard projection (`1112-1123`). This explains a protected repository Running read; it **does not** protect a separate direct call after the helper has returned. In particular unchanged All/Strength native-contract calls invoke `projectProgressDashboard` directly (`progressParity.contract.ts:222-238`), while Running uses `repository.load` and its returned dashboard first (`240-247`). The helper also remains available to other repository sport reads; this report does not inaccurately describe it as globally Running-only. It is not introduced, expanded, removed, or used as native proof by this delta.

Unchanged synthetic factories and actual contract invariants remain `strengthFact` (`81-86`), All two active goals (`223-227`), and Strength two evidence points (`234-238`). The native contract's `runningActivity.fixture: true` remains unchanged (`89`); direct Running fact eligibility still excludes fixtures, and target-only active goal construction remains distinct from accepted effort. No fixture flag or acceptance invariant was adjusted to make a case pass.

**Owner/parent-provided operational evidence, not independently reproduced:**

1. An actual native diagnostic run observed all three real parser steps — identity, target, observation — pass before a TypeError in Progress All/Strength. This is diagnostic context for an old failed immutable run, not final-source acceptance.
2. The cached exact APK's Hermes VM is reported as release **250829098.0.17**, **HBC 98**; its library bytes are reported identical to the inspected library. The cached library is reported to contain other used builtin names but no `toSorted`.
3. The author reports pre-fix missing-builtin failure and post-fix direct All/Strength/Running/period host behavior, plus the complete focused host gates described in D3.

This auditor did not inspect that APK/library, run a VM, read the live builtin property, import a fallback helper, or read native/private-row logs. Cached binary-string evidence is corroboration, **not a live `Array.prototype.toSorted` property read** or a proof that fresh compiled native execution succeeds. **9/10 source/runtime confidence** therefore does not become `native_root_cause_proven: true` or native PASS. No runtime budget, fabricated heartbeat, diagnostic PASS substitution, or immutable old-failure overwrite is authorized.

## D5 — Privacy, transport, authority, and production separation are unchanged

The four-file delta adds no network/native transport, SQL, arbitrary-output/logging sink, credential/account field, route, environment activation, permission/service, signing/build setting, source-hash/nonce field, receipt writer or acceptance verdict field. Production module imports and public interfaces are unchanged. Tests serialize only their fixed synthetic input state for local assertions; they do not introduce raw private-row logging into production/native execution.

The unchanged actual diagnostic helper returns only fixed stage/status/code records and allowlisted invariant literals or fixed error-class codes (`src/testing/contracts/progressNativeDiagnostics.ts:4-18,22-40`). It still discards parsed results and freezes output; no exception payload is newly emitted. The fixed synthetic-only reporting caller remains `progressParity.contract.ts:202-207,223-224,234-235`.

Observer exceptions remain isolated by `contractProgress.ts:5-10`. Actual failures remain failed with original empty counts/hashes and safe error code (`progressParity.contract.ts:330-334`); close is awaited in `finally` (`335-337`), cleanup is awaited (`340-342`), and final passed/failed totals derive from actual case statuses (`343`). A diagnostic parser checkpoint cannot award native acceptance. This four-file delta changes none of the prior nonce-bound progress grammar, genuine transition/stall timing, absolute budgets, source/APK/device binding, immutable publication/ownership, recursive privacy checks, sole final rehash/verdict derivation, or production/devtest activation controls. Their source-control closure is inherited from exact-base report `20-OFFLINE-DIAGNOSTIC-SECURITY-e39a8d05.md:133-178,197-208`, not newly claimed compiled-binary proof.

## All 49 authored mitigations — non-invalidation register

**CLOSED** means this exact four-file delta does not invalidate the existing authored source mitigation; it does not mean a native case ran. **U** means the plan and controlling source are unchanged, retaining exact-base source closure from `20-OFFLINE-DIAGNOSTIC-SECURITY-e39a8d05.md:210-266`. **D1..D5** refer to the directly reviewed changed/shared boundaries above. All rows retain disposition `mitigate`; the plans are byte-identical across base, HEAD, and checkout.

| Threat ID | Severity | Authored row | 05fc397a assessment |
|---|---|---|---|
| T-20-01-01 | high | `20-01-PLAN.md:112` | CLOSED — U/D2/D5: exact source sets/order/identity authority unchanged. |
| T-20-01-02 | high | `20-01-PLAN.md:113` | CLOSED — U/D5: exact run/build/nonce binding unchanged. |
| T-20-01-03 | high | `20-01-PLAN.md:114` | CLOSED — U/D5: actual results/validator remain authority. |
| T-20-01-04 | high | `20-01-PLAN.md:115` | CLOSED — U/D3/D5: no new private identity/output sink. |
| T-20-02-01 | high | `20-02-PLAN.md:140` | CLOSED — U/D1/D2: migration/restore/merge writers untouched; source facts not sorted in place. |
| T-20-02-02 | high | `20-02-PLAN.md:141` | CLOSED — U/D2: commit/receipt/digest/replay boundaries unchanged. |
| T-20-02-03 | high | `20-02-PLAN.md:142` | CLOSED — U/D3/D5: actual ordered native case set and zero-skip policy unchanged. |
| T-20-02-04 | high | `20-02-PLAN.md:143` | CLOSED — U/D5: result privacy schema unchanged. |
| T-20-03-01 | high | `20-03-PLAN.md:125` | CLOSED — U/D2: Garmin hash/bounds/schema/transaction controls untouched. |
| T-20-03-02 | high | `20-03-PLAN.md:126` | CLOSED — U/D2: provider/match independence and revision fencing unchanged. |
| T-20-03-03 | high | `20-03-PLAN.md:127` | CLOSED — U: Calendar measured trace/generation/callback/source controls untouched. |
| T-20-03-04 | high | `20-03-PLAN.md:128` | CLOSED — U/D5: no Garmin payload/account/credential output added. |
| T-20-04-01 | high | `20-04-PLAN.md:145` | CLOSED — U/D1/D2: source/flow identity and immutable historical snapshots retained. |
| T-20-04-02 | high | `20-04-PLAN.md:146` | CLOSED — U: measured device configuration/restoration controls untouched. |
| T-20-04-03 | high | `20-04-PLAN.md:147` | CLOSED — U/D5: actual exceptions/non-PASS counts unchanged. |
| T-20-04-04 | high | `20-04-PLAN.md:148` | CLOSED — U/D5: screenshot/semantic artifact privacy controls unchanged. |
| T-20-05-01 | high | `20-05-PLAN.md:110` | CLOSED — U/D4/D5: marker/build/devtest binding retained; helper is not native proof. |
| T-20-05-02 | high | `20-05-PLAN.md:111` | CLOSED — U/D3: measurement arrays/limits/counts/recomputation unchanged. |
| T-20-05-03 | high | `20-05-PLAN.md:112` | CLOSED — U/D4: old failed runs/cold/max/overhead retention unchanged. |
| T-20-05-04 | medium | `20-05-PLAN.md:113` | CLOSED — U/D1/D4: no fixture expansion or budget/yield/cancellation-policy change. |
| T-20-06-01 | high | `20-06-PLAN.md:111` | CLOSED — U/D4/D5: source/byte/signature/package/device/config binding unchanged. |
| T-20-06-02 | high | `20-06-PLAN.md:112` | CLOSED — U/D5: sole validator/immutable inputs/seal-time rehash unchanged. |
| T-20-06-03 | high | `20-06-PLAN.md:113` | CLOSED — U/D5: complete exception metadata/separate counts unchanged. |
| T-20-06-04 | high | `20-06-PLAN.md:114` | CLOSED — U/D5: recursive report privacy unchanged. |
| T-20-07-01 | high | `20-07-PLAN.md:105` | CLOSED — U/D5: attended record remains observation-only. |
| T-20-07-02 | high | `20-07-PLAN.md:106` | CLOSED — U/D4: final-source/APK/signature/device/PNG proof still required. |
| T-20-07-03 | high | `20-07-PLAN.md:107` | CLOSED — U/D5: readiness/exception authority unchanged; no release approval. |
| T-20-07-04 | high | `20-07-PLAN.md:108` | CLOSED — U: archive/rollback/schema/forward-fix boundary unchanged. |
| T-20-08-01 | high | `20-08-PLAN.md:99` | CLOSED — U/D3/D4: host assertions/cache/helper cannot substitute final native evidence. |
| T-20-08-02 | high | `20-08-PLAN.md:100` | CLOSED — U/D4: fresh frozen final-source single-build ownership remains required. |
| T-20-08-03 | high | `20-08-PLAN.md:101` | CLOSED — U/D5: compiled DEBUG/package/byte/signature controls unchanged. |
| T-20-08-04 | high | `20-08-PLAN.md:102` | CLOSED — U/D5: no serial/private path/config disclosure added. |
| T-20-09-01 | high | `20-09-PLAN.md:89` | CLOSED — U/D1/D2: SQLite/FK/integrity/graph/canonical digest controls unchanged. |
| T-20-09-02 | high | `20-09-PLAN.md:90` | CLOSED — U/D2: lifecycle receipt/pointer/rest/effect/kill/retry authority unchanged. |
| T-20-09-03 | high | `20-09-PLAN.md:91` | CLOSED — U/D4/D5: exact source/device/build/fixture/case binding unchanged. |
| T-20-09-04 | high | `20-09-PLAN.md:92` | CLOSED — U/D5: unchanged bounded synthetic/hash/code/count output. |
| T-20-10-01 | high | `20-10-PLAN.md:96` | CLOSED — U/D2: Garmin normalized/hash/schema/transaction authority unchanged. |
| T-20-10-02 | high | `20-10-PLAN.md:97` | CLOSED — U/D2: provider/match and revision-fenced selection unchanged. |
| T-20-10-03 | high | `20-10-PLAN.md:98` | CLOSED — U: actual Calendar monotonic trace/identity controls untouched. |
| T-20-10-04 | high | `20-10-PLAN.md:99` | CLOSED — U/D5: no payload/location/account/credential/device/path output added. |
| T-20-11-01 | high | `20-11-PLAN.md:119` | CLOSED — U/D1/D2/D5: snapshot/hash/case/immutable reference identity retained. |
| T-20-11-02 | high | `20-11-PLAN.md:120` | CLOSED — U: measured configuration/semantic-first/individual hash controls unchanged. |
| T-20-11-03 | high | `20-11-PLAN.md:121` | CLOSED — U/D3/D4: performance limits/counts/cold/max/p95/overhead unchanged. |
| T-20-11-04 | high | `20-11-PLAN.md:122` | CLOSED — U/D5: synthetic screenshot/trace/privacy policy unchanged. |
| T-20-12-01 | high | `20-12-PLAN.md:114` | CLOSED — U/D5: sole post-checkpoint final verdict derivation unchanged. |
| T-20-12-02 | high | `20-12-PLAN.md:115` | CLOSED — U/D5: attended record cannot alter technical/release authority. |
| T-20-12-03 | high | `20-12-PLAN.md:116` | CLOSED — U/D5: synthetic/hash/safe-path/unique/privacy boundaries unchanged. |
| T-20-12-04 | high | `20-12-PLAN.md:117` | CLOSED — U/D5: full rationale/scope/hash/policy metadata and counts retained. |
| T-20-12-05 | high | `20-12-PLAN.md:118` | CLOSED — U: prior APK/archive/schema and old-APK/new-schema prohibition retained. |

**Reconciliation: 49 total = 49 CLOSED + 0 OPEN; 48 High + 1 Medium; 49 mitigate + 0 accept + 0 transfer.** No authored source mitigation is invalidated. No new concrete unregistered attack surface meets the finding threshold. No accepted-risk or threshold-relaxation disposition is added to conceal the pending native check.

## Preserved artifact and pinned source fingerprints

Before authoring this report, a read-only preservation snapshot captured SHA-256 plus size, mode, inode and nanosecond mtime for **24 existing artifacts**: six old security reports, twelve plans, root AGENTS, config, STATE, package/lock files, and the dependency symlink. Its canonical metadata/content fingerprint is:

```text
54c58a9bdb8465d827d5f4f91fcb20c343ba9545f9196b03389f5dc87d0d54a7
```

The new report is excluded from that old-artifact snapshot. No old metadata is normalized, copied over, or rebound to this SHA. Content hashes of preserved security reports:

| Existing report | SHA-256 |
|---|---|
| `20-OFFLINE-DIAGNOSTIC-SECURITY-e39a8d05.md` | `03a177f3ba68bd5fe4df4010a699eb94d3cef2b2ad2fb1093a093c6f81f38a86` |
| `20-NATIVE-LINT-SECURITY-6722d3de.md` | `47847e36b6c563ff1ebc86dceffdf16c792b93702a4434cc89b5a0913d9a9d6d` |
| `20-NATIVE-CORRECTIVE-SECURITY-73ad68ff.md` | `9fc1dc43846974a39de63e71591314f6b56f1f418b5aa6010b5cd7b6e833ecfd` |
| `20-NATIVE-CORRECTIVE-SECURITY-6abf53aa.md` | `1193e052fd90d02ada26608dd1d80b68e7bb41ecb4bb68c5aee610d616eb61c7` |
| `20-SECURITY-59d9085e.md` | `fe8557840c888cb51ff180f46aab0c027fa5cc25f5d285b97054249b5628725e` |
| `20-SECURITY.md` | `fe8557840c888cb51ff180f46aab0c027fa5cc25f5d285b97054249b5628725e` |

The earlier five report hashes match the exact-base report's preserved hash table (`268-278`). Existing `node_modules` remains the symlink to `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/node_modules`; no dependency installation, imports, or tree audit occurred.

| Exact pinned changed source | SHA-256 |
|---|---|
| `src/domains/progress/dashboardProjection.ts` | `39a354b866761a2238040437aaf23336abd31fb017ff0734bcf3acc9d96bfc1a` |
| `src/domains/progress/dashboardProjection.test.ts` | `c70684865d64559f1d5c70a07da00851e2ee5720468d8491325086d43e17fa18` |
| `src/domains/progress/periodProjection.ts` | `128b4eae690928c45544fd7caeefade4fa749a88cd389bd8559030ef589930e9` |
| `src/domains/progress/periodProjection.test.ts` | `d85d208fb1ae042975a5310c8c5658ca5585050834b9ea6a10237b06270004af` |

## Final sign-off

- [x] Existing exact worktree/branch/HEAD/base ancestry and complete four-file delta verified.
- [x] All 24 copy-before-sort calls inspected; exact production text-substitution equivalence independently verified.
- [x] Source facts, factual ordering/identity/eligibility, snapshots/history/gaps, comparators and mutation boundaries preserved.
- [x] Synthetic missing-callable-builtin regressions and exact-descriptor `finally` restoration inspected without execution.
- [x] Existing repository fallback distinguished from direct All/Strength calls; no helper-as-native-proof claim.
- [x] All 49 authored threat rows reconciled; all twelve plans unchanged; zero new findings/flags/risks.
- [x] Source-security score 100/100, ASVS L1, block on High; no policy/coverage/acceptance relaxation.
- [x] Only this requested report authored; old reports/metadata/dependency linkage preserved.
- [ ] Independent host test/coverage execution — **NOT_RUN**, parent proof only.
- [ ] Live builtin property observation / final-source native root-cause proof — **NOT_RUN / NOT_PROVEN**.
- [ ] Fresh final-source compiled native acceptance / release approval — **NOT_RUN / NOT_GRANTED**.

**AI-assisted review limitation:** This bounded source-only continuation can miss subtle vulnerabilities. It is not a professional penetration test, full ASVS certification, security guarantee, whole-branch re-audit, or substitute for required independent native evidence and professional review where appropriate.
