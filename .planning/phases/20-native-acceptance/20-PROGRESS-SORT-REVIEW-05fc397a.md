---
exact_sha: 05fc397a92cb8a77c330573b8634a5bf0915492d
base: e39a8d050da313825cb857e2f7d7a5bba9f0c794
status: clean
issues_found: 0
critical: 0
informational: 0
score: 100
score_scale: 100
scope: source-only focused four-file delta and direct integration
native_status: pending
branch: agent-p20-sort-review-05fc397a
source_code_current_root_path: /Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-review
data_handling: NoDataRows_PhoneLogs
---

# Phase 20 — Progress copy-sort review

Pre-Landing Review: No issues found.

**Verdict:** source-only review is clean, 100/100. This is not a native PASS, a full-milestone review, or permission to replace preserved failed native evidence.

## Scope and method

Read root `AGENTS.md`, the repository rules, and the gstack review checklist before reviewing the full immutable base-to-target diff. Verified the existing worktree's HEAD and branch against the values above; the base is an ancestor. The checkout already contained older review reports, a modified `20-REVIEW.md`, and the existing `node_modules` entry. `status: clean` describes the review result, not a clean checkout.

Only these four files differ in the requested range:

- `src/domains/progress/dashboardProjection.ts`
- `src/domains/progress/dashboardProjection.test.ts`
- `src/domains/progress/periodProjection.ts`
- `src/domains/progress/periodProjection.test.ts`

Read the directly related Progress contracts, repository construction/call sites, and native parity dispatch/host assertions. No wider milestone audit. No source edits, tests, ADB, native execution, builds, installs, new worktrees, branch switches, commits, pushes, fetches, or synchronization. No device logs or user-bearing data were read. The only project write is this report; older reports are preserved.

Static comparison of Git blobs proves each production file is byte-for-byte the base file after replacing every `.toSorted(` with `.slice().sort(`: **9 dashboard + 15 period = 24 calls**. Both production files on disk match the exact target blobs. No comparator, eligibility rule, source field, metric parser, fixture policy, engine, persistent/global polyfill, native budget, or acceptance assertion changes occur in this delta.

## All 24 copy-sort sites

Line numbers below refer to the exact target SHA. Each receiver is an ordinary dense array produced by a filter, push-built group, Map/Set iteration, or dense source mapping; direct caller-owned arrays are copied before sorting.

| File | Line | Receiver / preserved ordering |
| --- | ---: | --- |
| `dashboardProjection.ts` | 145 | Filtered authoritative historical targets; effective time, revision, target ID |
| `dashboardProjection.ts` | 164 | Filtered current targets; unchanged `compareGoals` |
| `dashboardProjection.ts` | 196 | Filtered planned opportunities; date, sport, opportunity ID |
| `dashboardProjection.ts` | 207 | Eligible Running facts; unchanged `compareEffort` |
| `dashboardProjection.ts` | 226 | Push-built Running group; unchanged `compareEffort` |
| `dashboardProjection.ts` | 270 | Built Running goals; distance, time basis |
| `dashboardProjection.ts` | 420 | Push-built parsed Strength group; unchanged `compareStrengthFact` |
| `dashboardProjection.ts` | 472 | Flattened Strength goals; exercise name, goal ID |
| `dashboardProjection.ts` | 504 | Mapped All goal candidates; unchanged persisted goal order |
| `periodProjection.ts` | 54 | Caller-owned Strength candidates; unchanged `candidateOrder` |
| `periodProjection.ts` | 158 | Parsed source dates; unchanged civil-date comparison |
| `periodProjection.ts` | 163 | Set-derived strings; unchanged default lexical sort |
| `periodProjection.ts` | 178 | Map-derived exercise references; name, ID |
| `periodProjection.ts` | 218 | Push-built active source sessions; date, session ID |
| `periodProjection.ts` | 289 | Validated/filtered period rows; date |
| `periodProjection.ts` | 322 | Validated/filtered exposures; unchanged `compareExposures` |
| `periodProjection.ts` | 341 | Validated/filtered opportunities; date, ID |
| `periodProjection.ts` | 357 | Push-built exposure group; unchanged `compareExposures` |
| `periodProjection.ts` | 365 | Mapped exposure groups; exercise, identity, comparator |
| `periodProjection.ts` | 460 | Map-derived trend rows; date |
| `periodProjection.ts` | 472 | Set-derived trend session IDs; default lexical sort |
| `periodProjection.ts` | 475 | Set-derived trend exercise IDs; default lexical sort |
| `periodProjection.ts` | 493 | Validated caller-owned attention; exercise ID, attention ID |
| `periodProjection.ts` | 534 | Mapped best records; descending date/session, exercise/set ID |

Dense-array provenance is supported by `progressRepository.ts:216-229` (page rows accumulated with `rows.push(...page)`), `561-600` (validated Running rows/goals constructed by `flatMap`), `755-792` (validated source-backed planned opportunities), and `1075-1122` (mapped period, exposure, opportunity, attention, source-session, and dashboard inputs). Direct parity callers construct literal arrays at `progressParity.contract.ts:223-246`. The internal Strength-candidate path passes the existing typed array directly to the copy at `dashboardProjection.ts:482-484`; its source/target revision fences and metric eligibility/comparability rules remain intact at `periodProjection.ts:55-76`. No sparse arrays, Array subclasses, custom species, or receiver overrides were found in the relevant callers; differences for such unsupported inputs are not concrete findings against this repair.

## Copy, ordering, nulls, and source facts

- **Copies precede every mutation.** For example, `periodProjection.ts:54` reads `for (const candidate of candidates.slice().sort(candidateOrder)) {`, and `493-495` reads `return Object.freeze(values.slice().sort((left, right) => ...));`. `.sort()` mutates only the fresh shallow copy, not the caller's frozen array. Existing objects and their identifiers remain the same elements until the existing projection mapping creates frozen outputs.
- **Freeze happens after sorting, not before.** `dashboardProjection.ts:270` reads `goals: Object.freeze(goals.slice().sort((left, right) => left.distanceMeters - right.distanceMeters`, and `periodProjection.ts:363-365` freezes each group's `ordered` exposures separately before sorting a new outer-array copy. The frozen-sort hypothesis is disproved by this call order; it is not a warning.
- **Ordering and tie decisions are unchanged.** All comparator bodies and tie-break keys are identical to the base: dashboard `34-40`, `127-130`, `377-380`; period `38-41`, `95-102`, `534-539`. Stable equal comparisons retain input order under standard stable Array sorting; explicit best/latest tie selection is unchanged at dashboard `228-233`, `423-433` and period `387-399`. Duplicate guards remain unchanged. Existing tests assert equal-effort selection, persisted All ordering, reordered inputs, and full exposure/group tie-breaks (`dashboardProjection.test.ts:200-216, 355-407, 471-550`; `periodProjection.test.ts:389-428, 510-565`). This is static evidence, not a new native sort-stability measurement.
- **Empty and nullable behavior is retained.** The same `.at(-1)`, `[0] ?? null`, empty-group branches, nullable target/history values, and current-versus-historical target selection remain at dashboard `138-168`, `183-200`, `226-250`. The period all-time empty-date fallback remains at `156-159`. No new zero-valued record or substitute fact is introduced.
- **No source facts are dropped or rewritten by this replacement.** Running acceptance/removal/fixture/exact-evidence guards remain at dashboard `101-112`; Strength parsing remains at `361-374`. Source identity/revision/history projection fields remain at dashboard `115-124`, `441-470`; period record and source-reference fields remain at `184-192`, `401-412`, `561-599`. Sorting changes only array order, with the same comparator and shallow element identity as before.

## Regression inspection and supplied gates

`dashboardProjection.test.ts:22-50` makes `Array.prototype.toSorted` unavailable by defining its value as `undefined` within `try/finally`; it directly projects All, Strength, and Running. It asserts two All active goals, two Strength evidence points, the Running evidence/target, frozen goal arrays, and an unchanged serialized input snapshot. The finally block restores the exact original descriptor, or removes the property when it was originally absent.

`periodProjection.test.ts:57-75` similarly makes the builtin unavailable, compares the complete period output with its expected output, exercises an empty frozen Strength-candidate array, checks the unchanged input snapshot, and restores the descriptor in finally. Both tests are synchronous ordinary `it` cases, not concurrent prototype mutations. No existing test assertions or fixture eligibility were weakened.

The three relevant files statically register **14 dashboard + 12 period + 4 parity = 30 complete Jest tests**, with no skip markers. The unchanged parity host test asserts all 18 contract cases pass with `failed: 0, skipped: 0` at `progressParity.contract.test.ts:170-178`.

The supplied execution results report 30/30 complete focused tests, no skips, both full critical modules at 100% statements/branches/functions/lines, passing typecheck, and 471 passing boundary checks. Supplied red/green evidence identifies old `plannedNextFor`/`sourceDates` missing-builtin TypeErrors and green repaired outputs. These results were not rerun or independently remeasured in this read-only review; the commit message also records the focused test/coverage outcome. No coverage threshold or native budget changed in the four-file delta.

## Direct native path and evidence boundary

Relevant source explains why a repository pass could coexist with direct All/Strength failures:

- `progressRepository.ts:252-278` temporarily supplies copy-and-sort compatibility and removes it in finally: `return [...this].sort(compareFn);` and `delete arrayPrototype.toSorted;`.
- Repository period/dashboard projection calls are inside that synchronous wrapper at `1075-1101` and `1112-1123`.
- All and Strength dispatch directly at `progressParity.contract.ts:225` and `236`, after synthetic fixture diagnostics. Running first calls `repository.load` and uses `read.dashboard ?? projectProgressDashboard(...)` at `245-246`.
- Every dashboard invocation enters `const plannedNext = plannedNextFor(input.sport, input.plannedNext ?? []);` at `dashboardProjection.ts:477`. The base's unconditional `.toSorted(...)` in that function therefore fails even for empty candidates when the builtin is unavailable. The repaired `.slice().sort(...)` at `196` removes that dependency before parsing/grouping.
- `progressNativeDiagnostics.ts:26-36` validates only fixture identity/target/observation; `15` classifies a TypeError as `type_error`. Those markers do not identify an actual native throw site or read the Hermes property.

The supplied diagnostic run reports passing identity/target/observation stages for both failing All/Strength paths, followed by TypeError. Supplied independent APK/library inspection reports the exact `libhermesvm.so` hash beginning `bf38be45`, byte-identical cached `250829098.0.17` release/HBC 98, no `toSorted` string/symbol, supported `sort`/`flatMap`/`at`/`toFixed`/`localeCompare`, and no installed polyfill. Supplied Node missing-builtin probes reproduce both actual fixture failures and recover with the temporary fallback. I did not inspect or execute the APK/library in this source review.

**Root-cause confidence: 9/10** from the unchanged direct-call topology plus supplied reproduction/library evidence, not live Hermes property inspection or a captured native throw site. **Native confirmation remains pending.** Preserve the failed immutable run and its diagnostic classification. This report does not establish a current native PASS or final Phase 20 acceptance; fresh final-source evidence remains a separate gate.

## Findings

Critical: **0**. Informational: **0**. No concrete warnings meet the quoted-code/confidence gate. No source fixes, test runs, or runtime-state changes were made.
