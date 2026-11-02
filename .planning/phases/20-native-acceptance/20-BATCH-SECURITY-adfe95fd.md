---
phase: 20
slug: native-acceptance
status: verified
audit_scope: independent-read-only-four-file-single-publication-source-security-continuation
exact_sha: adfe95fd9b4f79d7b2b206c086e1693232cc9637
independent_source_sha: adfe95fd9b4f79d7b2b206c086e1693232cc9637
base_sha: cf8cb9927672d77356cbf43982ea8b3042454fcb
branch: agent-p20-publish-final-security-adfe95fd
baseline_report: .planning/phases/20-native-acceptance/20-BATCH-SECURITY-cf8cb992.md
baseline_report_sha256: 96aca313247586a6e64e94a6b137da3813ab39d18cb9e05cc34c010ce5d18f87
prior_code_review: .planning/phases/20-native-acceptance/20-BATCH-REVIEW-cf8cb992.md
prior_code_review_sha256: 14a97d69885b9b2d55049f0f9b5285c278affc2ae410984639523ab3672ca90d
changed_files: 4
source_files: 2
test_files: 2
commits_in_range: 1
baseline_threats_closed: 49
baseline_threats_open: 0
threats_total: 49
threats_closed: 49
threats_open: 0
blocking_threats_open: 0
high_threats: 48
medium_threats: 1
mitigate_dispositions: 49
mitigated_threats: 49
findings_total: 0
critical_findings: 0
high_findings: 0
medium_findings: 0
low_findings: 0
resolved_prior_code_review_warnings: 1
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
host_proof: not_run
native_proof: not_run
native_proof_not_run: true
final_source_native_proof_pending: true
native_acceptance_pending: true
production_ready: false
release_authorized: false
created: 2026-10-23
---

# Phase 20 — Four-file Source Security Continuation at adfe95fd

## Conclusion

**VERIFIED — bounded source-security continuation only.** The exact **`cf8cb9927672d77356cbf43982ea8b3042454fcb..adfe95fd9b4f79d7b2b206c086e1693232cc9637`** delta closes the prior code review's verified **R1 Warning/P2**: readiness-write failure cannot re-enter operation handling and publish again through Expo's already-moved `File`. The success/failure envelope is selected before publication; the shared publication call is outside that catch and is attempted once. Its failure throws the literal `v12_rollback_result_publication_failed`, without retry, result rewrite or raw error disclosure. Host polling additionally requires the sentinel value `ready`, not marker existence alone.

**49/49 authored source mitigations remain CLOSED: 48 High + one Medium, all disposition `mitigate`.** Zero unresolved Critical/High/Medium/Low findings, open/blocking threats, unregistered flags, warnings, open risks, accepted risks or transferred risks. **Scoped source-security score: 100/100; ASVS Level 1; block on High**, consistent with unchanged `.planning/config.json:47-49`. This is continuation of the authored source-control ledger, not a new whole-batch audit or comprehensive ASVS certification.

**Independent host proof: NOT_RUN. Independent native proof: NOT_RUN.** The supplied complete affected host results and actual emulator diagnostics are attributed separately below. This report establishes no fresh final-source native rollback proof, new Samsung acceptance, reauthentication, production readiness or release authorization.

## Pin, scope and isolation

- Reused worktree: `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security`.
- Independently verified assigned branch: **`agent-p20-publish-final-security-adfe95fd`**, HEAD **`adfe95fd9b4f79d7b2b206c086e1693232cc9637`**. Immediate commit parent is exactly **`cf8cb9927672d77356cbf43982ea8b3042454fcb`**.
- Complete delta: **one commit; four files; +35 / -8**, comprising `src/testing/v12NativeRollbackBridge.ts`, `src/testing/v12NativeRollbackBridge.test.ts`, `scripts/v12-native-rollback-bridge.mjs` and `scripts/v12-native-rollback-bridge.test.mjs`. All four checkout files independently match their exact target Git blobs byte-for-byte.
- Base tree: `8b11dd29c75b53629af9464a4e9bc5dfef734050`; target tree: `f33d82d044e534c124b8c7c93929cec261473bc3`.
- Read root `AGENTS.md`, project rules, gstack review checklist, the preserved cf8 security report and the preserved cf8 code review containing R1. Read the complete four-file diff and all four files, with bounded connected SDK, route, runtime, inspection and final-validation source. The prior batch audit was not repeated; no additional reviewer was dispatched.
- Existing shared dependency source reports **expo-file-system 57.0.7**, equal to the pinned lockfile version. Only existing declarations and relevant Android implementation were read. No dependency was imported, installed or rebuilt; dependency source is not binary attestation.

**The only authored filesystem write is this report.** No source/test edit, tests/coverage execution, build/prebuild, application import, ADB/device command, install, credential/provider operation, branch/worktree creation or switch, commit, push, fetch/sync, cleanup or prior-report edit occurred. Read-only Git object/status inspection and local Python metadata/hash comparisons executed no repository code. Existing report metadata, source and failed evidence were preserved. No queued/quiet assignment was duplicated or restarted, and no queue interval was counted as execution proof.

Source paths and line references below are relative to this pinned checkout, except the explicitly identified preserved code-review report in the sibling `p20-final5-review` worktree.

## R1 closure — select once, publish once, never rewrite after readiness

The prior security report recorded zero findings and 49 CLOSED source mitigations. The separately preserved **`20-BATCH-REVIEW-cf8cb992.md:44-115`** identified the actual residual publication-error defect. This continuation reads both without rewriting their historical outcomes: the earlier code review remains a one-warning report at its original SHA; the current source closes that warning.

### Concrete source controls

Verbatim **`src/testing/v12NativeRollbackBridge.ts:220-225`**:

```ts
async function publishResult(value: unknown): Promise<void> {
  // Expo move may fall back to copy/delete. Await its completion before exposing
  // the readiness barrier; the host never reads a partially copied result.json.
  stagedResult.write(JSON.stringify(value));
  await stagedResult.move(resultFile);
  resultReady.write("ready");
```

Verbatim **`src/testing/v12NativeRollbackBridge.ts:240-249`**:

```ts
  publication = { schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm, inspection: result.inspection };
} catch (error) {
  operationFailure = error instanceof Error && /^v12_rollback_[a-z_]+$/u.test(error.message) ? error.message : "v12_rollback_failed";
  publication = { schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm, failure: operationFailure };
}
// Publication errors cannot enter the operation-failure path and rewrite a
// moved result object after the readiness barrier became externally visible.
try { await publishResult(publication); }
catch { throw new Error("v12_rollback_result_publication_failed"); }
if (operationFailure !== undefined) throw new Error(operationFailure);
```

**Assessment, confidence 10/10:** both operation outcomes assign one envelope; the operation catch contains no publication call. There is exactly one call at `247`, after that catch has ended. The publication catch contains only a fixed-code throw. Neither publication rejection nor a readiness-write exception can select a second envelope, execute another result write/move or retry through a URI-mutated `stagedResult`. After successful failure-envelope publication, `249` preserves rejection with the sanitized operation code. It cannot become an inspection/success envelope.

### Actual Expo semantics retained, not assumed atomic

- **URI mutation verified, confidence 10/10:** existing `node_modules/expo-file-system/src/internal/NativeFileSystem.types.ts:248-250` declares Promise-returning `move` and documents the URI update. Concrete Android `FileSystemPath.kt:180-186` awaits `file.moveTo(...)` and then executes **`uri = finalUri`**. The old retry really could target `result.json`; the repair removes that retry rather than assuming the source object's path stays staged.
- **Awaited copy/delete retained, confidence 10/10:** `FileSystemModule.kt:213-215` registers coroutine-based asynchronous move. `fsops/CopyMoveStrategy.kt:37-45` performs `resolved.receiveFrom(file)` and requires source deletion before fallback returns. Its rename/NIO attempts may return null and choose fallback (`96-114`). `224` awaits the whole operation before marker writing. This review makes no rename-only, infallible move or power-loss/fsync guarantee.
- **Create-then-error marker is a real SDK possibility, confidence 9/10:** `FileSystemModule.kt:141-156` exposes synchronous writing, append default false. `FileSystemFile.kt:57,76-84` creates a missing file before opening/writing the output stream. Thus a marker can exist without complete content if writing fails. This audit read that source; it did not induce an Android filesystem failure.

### Host refuses empty/partial sentinel values

Verbatim **`scripts/v12-native-rollback-bridge.mjs:110-114`**:

```js
const fetched = adb(["exec-out", "run-as", PACKAGE, "sh", "-c", `test -f ${remote}/result.ready && test "$(cat ${remote}/result.ready)" = ready && test -f ${remote}/result.json && cat ${remote}/result.json`], undefined, true);
if (fetched.status === 0) { resultBytes = Buffer.from(fetched.stdout); break; }
await wait(250);
}
if (resultBytes === undefined || now() >= deadline) fail("native_timeout");
```

**Assessment, confidence 10/10:** the quoted shell test compares the marker's command-substitution value to literal `ready`, before any final-result `cat`. A missing marker, empty marker or incomplete value such as `r`/`rea` cannot grant read permission. Such a test failure returns status 1, which remains an absent/not-ready poll under `80-83`; the same fixed deadline applies. There is no existence-only fallback, partial-JSON acceptance or extended budget. This is an exact sentinel-value control, not an assertion about byte-for-byte newline handling by shell command substitution.

If readiness writing throws **after** the entire sentinel value has become visible, the host may observe the already-complete result. The result is no longer rewritten, so that observation is not the old changing-file race. The collector still rejects with its literal publication error. Readiness is a transport-completion barrier, **not** authentication, UI success, archive success or final release authority; the unchanged host envelope, archive, fact and identity validators remain mandatory.

## Boundaries not invalidated by this delta

| Boundary | Direct source evidence / retained control |
|---|---|
| Capability, private paths and replay | `v12NativeRollbackBridge.ts:41-58,212-219` keeps exact development-test identity, literal enablement, scalar 32-hex nonce, exact arm keys/hash/run/schema/expiry and fixed private nonce directory. Existing consumed, final, staged or ready state is refused before native work. No public path, user-selected filename, new token or stale-ready reuse is introduced. |
| Arm consumption | `227-228` still validates and **awaits** `armFile.move(consumed)` before the operation try at `231`. Consumption rejection cannot dispatch restore work or create readiness; it is not caught and transformed into a result-success envelope. |
| Crypto/KDF and authoritative facts | `125-158,183-207,232-239` retain real production archive/KDF/SQLite ports, incoming archive digest, authenticated preflight, awaited commit, committed/reopened source-fact equality, integrity/FK checks, cleanup and post-execution arm validation. The success envelope is selected only after the archive write. Readiness is not consulted by those decisions. |
| Exact result/failure binding | Host `115-123` still requires the exact producer/schema/envelope and JSON-equal host-issued arm. A failure envelope is retained privately and rejected; it cannot masquerade as inspection. Archive bounds/version/restore byte equality/hash and shared canonical receipt/fact validation remain at `124-128`; `v12-rollback-archive-inspection.mjs:12-35` requires matching authenticated-source/reopened digests, receipt fields, parser, restored/clean target, integrity and zero FK violations. |
| Source/APK/device/lease authority | Actual authority remains in unchanged `v12-production-native-runtime.mjs:53-91,194-203`: real source-tree measurement, real device identity, installed/retained APK digest, device-side lease owner/run/device and required settings snapshot. Bridge `70-71,88,129-136` retains runtime creation before arming and reconstruction/revalidation before success retention. Marker content cannot substitute for these measurements. |
| Expiry and failure privacy | App `46-58,236` keeps bounded expiry and revalidation; host `79,109-114,130-131` keeps the fixed 180-second deadline. App `242,248-249` and unchanged route `app/__v12-recovery-archive.tsx:11-15` expose only fixed codes/text. Host `138-141` retains an exclusive private fixed-code failure file. No raw native error/path/credential is serialized by the new catch. |
| Permissions and immutable final provenance | Host `33-40,103-106,121,132-140` keeps nonce-scoped operational storage, `umask 077`, 0700 directories, exclusive `wx` 0600 result/failure writes and no final-RunRoot promotion. Final `verify-v12-native-evidence.mjs:1322-1373` still rejects test origin and checks lineage, rollback, production/native identity, exact artifacts and retained hashes. Neither this report nor `result.ready` supplies a final verdict. |

All files outside the four-file delta are unchanged between the exact base and target. Independently compared policy, rules, lockfile, route, runtime, inspection, atomic publication, final verifier, RestoreCommands, logical restore repository and serialized writer against both commit blobs and checkout bytes; all match. The production crypto subtree is identical at **`644efdccddbf5e40de3efd639ba877b6197462d6`**. The Garmin native module subtree is identical at **`7dbae0211beb8e733e548eb84fd06553c59ab817`**. No crypto/KDF, source-fact, lease, expiry, provenance, credential, permission or tab/Garmin-source change is introduced. Those established controls were checked for non-invalidation, not re-audited as a whole batch.

**Findings calibration:** no concrete new security flag was established. Overall bounded source-tracing confidence is **9/10**; the local call-order/no-retry and sentinel-value controls are directly established at **10/10**. Any new flag would require exact pinned motivating lines, a concrete consequence, severity and confidence. Absent fresh independent native proof remains an evidence limitation, not an invented vulnerability or accepted risk.

## Regression source and separately attributed execution

Both complete changed test files were read; neither was executed.

- **Native URI behavior:** `src/testing/v12NativeRollbackBridge.test.ts:20,28` makes the fake path mutable and ends move with **`this.path = other.path`**, matching the relevant native URI behavior. The ordinary fake move remains synchronous; it is not represented as an Android implementation or universal Promise/failure simulator.
- **Readiness-created-then-error:** test **“never retries or rewrites a published result if readiness creation fails”**, `283-302`, selects a synthetic operation-failure envelope, snapshots complete final bytes, creates an **empty marker**, then throws. Assertions require the literal publication failure, **`resultWrites` equal to 1**, unchanged final bytes and retained empty marker. This exercises the shared one-call publication boundary with a failure envelope; the success envelope's no-retry behavior is established by the common source structure at `240-249`, not misrepresented as a separately executed native fault case.
- **Pending-copy continuity:** test **“does not announce readiness or completion while an asynchronous copy fallback is incomplete”**, `256-281`, still makes a final file exist with empty bytes while its relocation promise is pending, verifies readiness **absent**, then completes relocation and verifies full failure JSON plus `ready`. The URI-mutating fake now also applies on its completion. This is host-only orchestration coverage, not actual Android copy evidence.
- **Host sentinel command:** test **“host never reads a partially copied result before the private readiness barrier (HOST UNIT ONLY)”**, `scripts/v12-native-rollback-bridge.test.mjs:79-93`, now asserts the generated shell command contains the literal `ready` value check in addition to the two file checks. It simulates an initial not-ready status and verifies continued polling. The fake does not execute a device shell; the actual shell predicate was assessed in source.
- Existing stale-ready/staged/final refusals, sanitized native-binding failure, nonce/capability and expiry cases remain (`v12NativeRollbackBridge.test.ts:304-342`). No guard, coverage threshold, skip or coverage-ignore relaxation appears in the delta.

| Parent-supplied execution / observation | Attribution and limit |
|---|---|
| **39 complete Jest helper cases**, zero skips; statements/branches/functions/lines each exactly **100%** | Supplied PASS, not rerun. Changed regression source was inspected. Host fake SQLite/crypto/filesystem results are not native proof. |
| **72 complete Node cases**, zero skips; complete affected **three-critical-module scope**, all four metrics exactly **100%** | Supplied PASS, not rerun. The delta changes one Node implementation file; three modules refers to the affected verification scope, not three changed implementations. |
| Type checks and boundary checks **PASS** | Parent-supplied, not rerun. No overlapping scopes are summed into a fabricated aggregate. |
| **Actual credential-free emulator CPython `runtimeInfo`, `connectionState` dictionary dispatch and deterministic JSON PASS** | Actual native diagnostic supplied by the parent, not relabelled as a mock. Garmin source is unchanged by this fix. No actual account login, reauthentication/MFA, token persistence or provider HTTP proof is inferred. |
| **Eight actual emulator tab configurations PASS:** 360/390 widths × Light/Dark × 100/200 font scale, complete glyphs | Actual emulator visual observations supplied by the parent. Tab source is unchanged by this fix. These are not new Samsung or final-source same-device acceptance observations. |

`host_proof: not_run` and `native_proof: not_run` describe this auditor's independent work, without erasing the parent's actual emulator diagnostics. No new build, native receipt or device observation was generated or independently verified here. Required fresh final-source rollback and Samsung acceptance gates remain pending; production readiness and release authorization remain false.

## Authored threat continuity — 49 CLOSED, zero OPEN

Administrative comparison of the twelve unchanged `20-01-PLAN.md` through `20-12-PLAN.md` threat registers confirms **49 unique authored IDs, 48 High + one Medium, 49 `mitigate`, zero `accept`, zero `transfer`**; each plan matches base, target and checkout bytes. The preserved cf8 security ledger (`20-BATCH-SECURITY-cf8cb992.md:158-180`) remains the baseline. This is non-invalidation reconciliation, not repetition of the full prior mitigation audit.

| Authored group | Total | Base CLOSED | Base OPEN | Target CLOSED | Target OPEN |
|---|---:|---:|---:|---:|---:|
| T-20-01-* | 4 | 4 | 0 | 4 | 0 |
| T-20-02-* | 4 | 4 | 0 | 4 | 0 |
| T-20-03-* | 4 | 4 | 0 | 4 | 0 |
| T-20-04-* | 4 | 4 | 0 | 4 | 0 |
| T-20-05-* | 4 | 4 | 0 | 4 | 0 |
| T-20-06-* | 4 | 4 | 0 | 4 | 0 |
| T-20-07-* | 4 | 4 | 0 | 4 | 0 |
| T-20-08-* | 4 | 4 | 0 | 4 | 0 |
| T-20-09-* | 4 | 4 | 0 | 4 | 0 |
| T-20-10-* | 4 | 4 | 0 | 4 | 0 |
| T-20-11-* | 4 | 4 | 0 | 4 | 0 |
| T-20-12-* | 5 | 5 | 0 | 5 | 0 |
| **Total** | **49** | **49** | **0** | **49** | **0** |

The directly affected **T-20-02-02** remains authored **High / Repudiation / commit-replay / `mitigate` / “Exact receipt/source digests across cuts, reopen and retry.”** (`20-02-PLAN.md:141`). Single publication, awaited completion, exact sentinel-value gating and unchanged result/receipt binding preserve its source-control closure through the previously warned error path. Privacy remains within T-20-02-04's fixed-code/count/hash boundary (`143`). The other 48 closures are retained by non-invalidation. No distinct source-supported unregistered threat, acceptance or transfer was introduced.

## Fingerprints and preservation

| Member | SHA-256 |
|---|---|
| Preserved `20-BATCH-SECURITY-cf8cb992.md` | `96aca313247586a6e64e94a6b137da3813ab39d18cb9e05cc34c010ce5d18f87` |
| Preserved sibling `20-BATCH-REVIEW-cf8cb992.md` | `14a97d69885b9b2d55049f0f9b5285c278affc2ae410984639523ab3672ca90d` |
| Preserved `20-BATCH-SECURITY-4a472d3c.md` | `010df8ba9615a310ffd3d6fa83b7b2321c25d1f97c95947288ba3fe2bf8f2527` |
| Preserved `20-BATCH-SECURITY-fc20301d.md` | `75ea505f968427eab1262e20b60acb2434dbf1e94c061e5ea6433e7cae6fcac4` |
| Target `src/testing/v12NativeRollbackBridge.ts` | `48d9e4dabb5b5de72721d152a55c4502fd311ca62213b9411471b9fd4b8604ca` |
| Target `src/testing/v12NativeRollbackBridge.test.ts` | `e82053e7a68318c16557f21629804bccc2879ccff59eaca098c5e6adf7e4dd5e` |
| Target `scripts/v12-native-rollback-bridge.mjs` | `a065231a4515fc1e7cad636265e754b28b428723adc066f4f7049731849238c4` |
| Target `scripts/v12-native-rollback-bridge.test.mjs` | `27267a0cbaed5af1aeb5d2d7234cc2614af4fb1bda33b667f3b6942b66abb94d` |

Before authoring, **40 pre-existing Phase 20 Markdown artifacts** were fingerprinted using sorted filename/content SHA-256/size/mode/inode/nanosecond mtime. Canonical metadata-manifest SHA-256: **`d22ccb1f0c777ce659f4b51ff2308c182b9c6bb1e1e46ae8498c52533af46020`**. This report's destination was absent. No prior report, failed immutable attempt, diagnostic observation or metadata was overwritten, normalized, deleted or relabelled as final acceptance.

**AI-assisted review limitation:** this targeted source review can miss subtle vulnerabilities. Its 100-point source-ledger outcome is not professional ASVS certification, penetration testing, runtime/binary assurance, whole-milestone acceptance or release approval. Fresh final-source native proof and required Samsung/release gates remain separate.
