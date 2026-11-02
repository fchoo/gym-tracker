---
phase: 20
slug: native-acceptance
status: verified
audit_scope: independent-read-only-four-file-readiness-barrier-source-security-closure
exact_sha: cf8cb9927672d77356cbf43982ea8b3042454fcb
independent_source_sha: cf8cb9927672d77356cbf43982ea8b3042454fcb
base_sha: 4a472d3c32c9264d7e6dc1ebc3b70144fd1902af
branch: agent-p20-ready-security-cf8cb992
baseline_report: .planning/phases/20-native-acceptance/20-BATCH-SECURITY-4a472d3c.md
baseline_report_sha256: 010df8ba9615a310ffd3d6fa83b7b2321c25d1f97c95947288ba3fe2bf8f2527
prior_closed_report: .planning/phases/20-native-acceptance/20-BATCH-SECURITY-fc20301d.md
prior_closed_report_sha256: 75ea505f968427eab1262e20b60acb2434dbf1e94c061e5ea6433e7cae6fcac4
changed_files: 4
source_files: 2
test_files: 2
commits_in_range: 1
baseline_threats_closed: 48
baseline_threats_open: 1
previously_held_threats_closed: 1
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
resolved_baseline_findings: 1
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

# Phase 20 — Four-file Source Security Closure at cf8cb992

## Conclusion

**VERIFIED — bounded source-security closure only.** The complete `4a472d3c..cf8cb992` repair closes the preserved **F1 Medium/P2** publication finding and restores source-mitigation closure for **T-20-02-02**, an authored High threat. Arm consumption and result relocation are now awaited; the host requires a private readiness barrier created only after the result bytes have been written and relocation has completed. **This conclusion does not rely on atomic-only rename:** the pinned SDK's copy/delete fallback remains supported, but its in-progress destination is no longer sufficient to end host polling.

**49/49 authored source mitigations CLOSED: 48 High + one Medium, all disposition `mitigate`.** Zero unresolved findings at every severity, open/blocking threats, unregistered flags, warnings, open risks, accepted risks or transferred risks. **Scoped source-security score: 100/100; ASVS Level 1; block on High**, under unchanged `.planning/config.json:47-49`. This score records closure of the scoped authored source controls, not full ASVS certification, a whole-milestone audit or an executed native gate.

**Independent host proof: NOT_RUN. Native proof: NOT_RUN.** Parent-provided complete host results and actual credential-free emulator/visual diagnostics remain separately identified below. They do not establish fresh final-source Samsung acceptance, production readiness or release authority.

## Exact target and read-only boundary

- Reused checkout: `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security`.
- Administrative HEAD/ref independently read as branch `agent-p20-ready-security-cf8cb992`, pointing to **`cf8cb9927672d77356cbf43982ea8b3042454fcb`**; pin reconfirmed before authoring.
- Exact immediate parent/base: **`4a472d3c32c9264d7e6dc1ebc3b70144fd1902af`**. Commit-object parentage was independently verified; this is not a diff against mutable main or the dirty primary checkout.
- Complete delta: **one commit, four files, +58 / -9** — two implementation files and two test files. Every changed checkout file matches its exact target blob byte-for-byte. Target tree: `8b11dd29c75b53629af9464a4e9bc5dfef734050`; base tree: `728490fe04806d28b4cad8b7b2caf4d68a54b9b1`.
- Root `AGENTS.md`, project integrity rules, the preserved `fc20301d` closed report, the `4a472d3c` held report, unchanged security policy and all twelve authored threat blocks were read. The complete four-file diff and changed files were read, along with the connected route, SDK relocation/write implementation, host runtime, receipt inspector and committed-fact controls necessary to assess this repair. The prior batch/milestone audit was not repeated.
- Existing shared dependency source reports **expo-file-system 57.0.7**, matching `package-lock.json:5133-5136`. Dependency declarations and Android source were inspected only; they were not imported, installed, executed or rebuilt and are not a compiled-binary attestation.

**Only this report was written.** No source/test edit, test/coverage execution, application import, build/prebuild, ADB/device command, phone/emulator install, provider/credential/token operation, dependency installation, branch operation, Git command/mutation, sync, cleanup or additional reviewer dispatch occurred. Read-only local Python inspected administrative metadata, verified object/content hashes and compared bytes; it executed no repository code. Old reports and failed evidence were preserved. No queued or quiet assignment was duplicated/restarted, and no queue time was represented as execution progress.

All source references below are relative to the pinned checkout unless explicitly identified as preserved-report or parent-provided evidence.

## F1 closure — completed bytes, then readiness, then host read

The preserved `20-BATCH-SECURITY-4a472d3c.md:75-151` established two connected problems: detached asynchronous relocation/errors, and host polling of a final path that could already exist during copy fallback. Its adjacent arm-consumption observation at `161` is also corrected. The repair addresses both problems, rather than merely adding `await` and continuing to assume rename-only behavior.

Verbatim target control, **`src/testing/v12NativeRollbackBridge.ts:218-228`**:

```ts
const resultReady = new File(Paths.document, `v12-rollback-${nonce}`, "result.ready");
if (consumed.exists || resultFile.exists || stagedResult.exists || resultReady.exists) fail("arm_invalid");
async function publishResult(value: unknown): Promise<void> {
  // Expo move may fall back to copy/delete. Await its completion before exposing
  // the readiness barrier; the host never reads a partially copied result.json.
  stagedResult.write(JSON.stringify(value));
  await stagedResult.move(resultFile);
  resultReady.write("ready");
}
const arm = validateRollbackArm(JSON.parse(armFile.textSync()), nonce, Date.now());
await armFile.move(consumed);
```

Verbatim target consumer, **`scripts/v12-native-rollback-bridge.mjs:110-112`**:

```js
const fetched = adb(["exec-out", "run-as", PACKAGE, "sh", "-c", `test -f ${remote}/result.ready && test -f ${remote}/result.json && cat ${remote}/result.json`], undefined, true);
if (fetched.status === 0) { resultBytes = Buffer.from(fetched.stdout); break; }
await wait(250);
```

### SDK semantics independently checked

- `node_modules/expo-file-system/build/internal/NativeFileSystem.types.d.ts:190` declares `move(...): Promise<void>`. Android `FileSystemModule.kt:213-215` registers `AsyncFunction("move") Coroutine`; `FileSystemPath.kt:174-186` awaits IO relocation before updating the source URI and returning.
- `fsops/CopyMoveStrategy.kt:37-45` awaits `resolved.receiveFrom(file)` and then requires successful source deletion before returning from fallback. Rename/NIO failure can still choose copy/delete (`96-114`). The review **does not** recast this API as rename-or-fail.
- `FileSystemModule.kt:141-156` registers synchronous `Function("write")`. String writing in `FileSystemFile.kt:76-84` creates if necessary and writes inside the output stream's `use` scope. JSON is therefore synchronously written to staging before relocation begins; the marker write is invoked only after awaited relocation returns.
- Default destination overwrite remains false (`fsops/DestinationSpec.kt:12-15`), and an existing destination is rejected by the local resolver (`CopyMoveStrategy.kt:88-90`). These are retained refusal controls, not a new claim of OS-level exclusive no-clobber rename against arbitrary concurrent writers.

### Failure ownership and what readiness means

1. **Arm relocation rejection cannot dispatch native work.** The awaited consumption at `228` precedes `productionRollbackPorts()` at `230`. On rejection, the collector promise rejects without entering execution or creating readiness. The unchanged route catches collector rejection and renders only fixed failure text (`app/__v12-recovery-archive.tsx:11-15`); the host's absent-result deadline/fixed failure sink remains intact (`v12-native-rollback-bridge.mjs:109-114,138-141`).
2. **Result serialization/staging-write or relocation/copy failure cannot reach the marker statement in that publication attempt.** `223-225` are ordered, with no detached promise or `finally` that unconditionally creates readiness. A synchronous staging exception or awaited rejection interrupts control before `resultReady.write`. If fallback has left an empty/partial `result.json`, the host still requires readiness and will not read it merely because it exists.
3. **Both success and sanitized failure publication are awaited.** At `238`, successful publication belongs to the enclosing collector `try`; at `240-242`, errors are reduced to the existing fixed-code envelope and its publication is awaited before the collector throws. A successful recovery publication carries `failure`, not `inspection`. The host preserves an exact valid failure envelope and rejects it (`119-123`); it cannot promote it to an archive success.
4. **If failure publication itself cannot finish, that is not silently converted into success.** Its rejection propagates to the route catch. An existing final destination is not explicitly deleted or overwritten to conceal a failed copy. Without a completed publication reaching the marker, polling remains absent/fails or times out, followed by the host's fixed-code operational failure. No raw exception text is added to JSON or route output.
5. **The marker is a completion barrier, not authentication or a success verdict.** Its content is not parsed. Even existence becoming visible during the subsequent synchronous marker write cannot expose an in-progress result: the data write and awaited relocation already completed before marker creation is attempted. This is not a guarantee of marker-write success, collector/UI success, fsync/power-loss durability or atomic visibility to consumers that ignore the marker. Those stronger claims are unnecessary to close the demonstrated incomplete-result read.

Result-write/copy rejection paths were traced in source and the pinned SDK, **not fault-induced in this audit**. No unsupported claim of tested native failure recovery or infallible filesystem behavior is made.

## Readiness does not bypass nonce, source, lease, expiry, authentication or commits

| Boundary | Exact target evidence and assessment |
|---|---|
| Capability and paths | `v12NativeRollbackBridge.ts:41-58,212-219` preserves exact devtest/profile/literal hooks/suite, scalar 32-hex nonce, exact arm keys/run/hash/schema/expiry and fixed app-private nonce paths. New readiness is another fixed child of the same directory, not caller-selected/public storage or a new capability token. |
| Replay/stale state | `219` refuses existing consumed, staged, final **or ready** state before arm parsing/consumption/native work. The host still creates a fresh nonce directory rather than reusing it (`v12-native-rollback-bridge.mjs:33-40,75-78,103-106`); operational writes remain exclusive `wx`, mode 0600. No stale-ready compatibility fallback was added. |
| Authenticated archive and authoritative facts | `v12NativeRollbackBridge.ts:138-158,183-207,231-237` retains actual production crypto/KDF/restore ports, input archive hash, authenticated preflight, awaited commit, canonical committed/reopened table digests, integrity/FK checks, cleanup, post-execution arm validation and archive write before success publication. Readiness is not consulted anywhere in these decisions. |
| Production authentication/writer continuity | Unchanged `restoreCommands.ts:436-452,478-489` authenticates via `codec.open` before issuing a one-use preflight token and awaits the real restorer. `logicalRestoreRepository.ts:420-466` remains inside the exclusive kernel writer, verifies source tables and restore state. `serializedWriter.ts:37-80` serializes work and awaits COMMIT before returning. The repair adds no receipt-only or pre-commit success path. |
| Result binding | After the ready-gated read, `v12-native-rollback-bridge.mjs:115-128` still parses and validates the exact success/failure envelope, producer/schema and **JSON-equal host-issued arm**, archive bounds/version/hash and restore byte equality. Thus wrong nonce/run/source/APK/device/lease/expiry fields remain mismatched arm data, not accepted because a marker exists. `v12-rollback-archive-inspection.mjs:12-35` independently retains exact receipt/fact schemas, digests, clean target/parser/outcome, integrity and FK requirements. |
| Actual source/device/lease authority | The app does not independently measure every arm identity. That authority remains in the unchanged real host runtime: `v12-production-native-runtime.mjs:53-91,194-203` measures source/device, retained-versus-installed APK and device-side lease owner/run/device, and requires the settings snapshot. The bridge constructs this runtime before arming and reconstructs/rechecks it before retaining success (`v12-native-rollback-bridge.mjs:70-71,88,129-136`). A correctly shaped marker/arm cannot replace those checks. |
| Expiry and deadlines | `v12NativeRollbackBridge.ts:46-58,234` preserves bounded expiry and post-execution revalidation. The host keeps its independent fixed 180-second deadline and rejects late fetch/retention (`v12-native-rollback-bridge.mjs:79,109-114,130-131`). Awaiting relocation introduces no timeout extension or invented heartbeat. |
| Final acceptance/publication | Readiness is confined to the app-private transport. Operational metadata remains outside immutable RunRoot (`v12-native-rollback-bridge.mjs:33-40,51-53,77-78`). The unchanged final validator rejects test origin, revalidates lineage/rollback/identity/exact artifact sets and seal-time hashes (`verify-v12-native-evidence.mjs:1322-1373`); it does not accept readiness or this report as a verdict or release authority. |

Byte comparison confirmed that the twelve plans, policy, lockfile, route, receipt inspector, production runtime, rollback evidence publisher, atomic shard publisher, final verifier, RestoreCommands, logical restore repository, serialized writer and inspected Garmin probe/converter files are unchanged across **fc20301d / base / target** and match their checkout blobs. The production crypto subtree is identical across all three commits (`644efdccddbf5e40de3efd639ba877b6197462d6`); its previously reviewed implementation was not re-audited. The four-file delta changes neither native cryptography nor production source-fact contracts.

**Findings calibration:** no concrete remaining Critical/High/Medium/Low security issue was established. Source-tracing confidence is **9/10**. Any new finding would require exact pinned lines, verbatim motivating code, concrete consequence, severity and confidence. Missing independent native proof is an evidence limitation, not a speculative exploit or accepted risk.

## Tests and parent observations — read, not executed

The complete changed tests were read. Existing mocks remain explicitly host-only; no mocked transport/crypto/SQLite result is presented as native proof.

- **Pending-copy regression:** `src/testing/v12NativeRollbackBridge.test.ts:256-281`, “does not announce readiness or completion while an asynchronous copy fallback is incomplete,” returns a pending promise from the staged-result move. It makes the final file exist with **EMPTY bytes**, verifies readiness is **absent**, then completes the copy and verifies complete failure JSON plus `ready`. Unlike the ordinary synchronous `MockFile.move` at `28`, this case actually exercises the promise wait in orchestration; it does not implement or execute Android filesystem copying.
- **Ready replay refusal:** `283-285`, “rejects an existing readiness barrier instead of reusing stale completion.” Existing consumed/replay, staged/final refusal, native-binding sanitization, archive-hash and expiry cases remain (`221-254,287-321`).
- **Host consumer regression:** `scripts/v12-native-rollback-bridge.test.mjs:79-93`, “host never reads a partially copied result before the private readiness barrier (HOST UNIT ONLY),” verifies the actual generated command checks ready **and** final file, simulates one absent-ready poll, and verifies polling continues. Existing wrong arm, malformed/failure/fact/archive, late-result, source/runtime revalidation and no-overwrite cases remain (`160-207,234-255`).

| Parent-provided result | Interpretation in this independent closure |
|---|---|
| **38 complete Jest cases**, zero skips; collector critical statements/branches/functions/lines each exactly **100%** | Not rerun. The pending-copy and stale-ready test source was inspected. Host mocks/coverage are not native relocation proof. |
| **72 complete Node cases**, zero skips; complete affected **three-module Node critical scope**, all four metrics exactly **100%** | Not rerun; no name-filtered/skipped run is substituted. The exact repair changes one Node implementation file, not three; the supplied three-module figure describes the affected critical verification scope. |
| Type check and **475 boundary cases** passed | Parent-reported, not rerun. No guard/threshold/coverage-ignore or test-skip relaxation appears in the four-file diff. These overlapping scopes are not summed into a fabricated aggregate. |
| **Actual credential-free emulator CPython metadata / disconnected typed dispatch / fixed JSON PASS** | Parent-reported actual native diagnostic, **not relabelled as a host mock**. No login, MFA/token restoration, HTTP/provider or real-account proof is inferred; no exact-target rollback/Samsung acceptance is inferred. Garmin source is unaffected by this repair. |
| **Eight actual portrait combinations:** 360/390 widths × Light/Dark × 100/200 font scale; complete tab glyphs | Parent-reported actual emulator visual observations, not phone installation or fresh final-source Samsung visual/semantic acceptance. Tab source is unaffected by this four-file delta. |

`native_proof: not_run` describes **this auditor's independent scoped proof**, without erasing the parent's actual emulator diagnostics. No new native receipt/build/device observation was produced or independently verified here. Fresh final-source rollback evidence and required Samsung acceptance remain pending; production readiness and release authorization remain false.

## Authored threat continuity ledger

All twelve authored threat blocks and trust boundaries were reconciled, and the plan files are identical across fc20301d/base/target/checkout: **49 unique IDs; 48 High + one Medium; 49 `mitigate`, zero `accept`, zero `transfer`.**

The preserved fc20301d report provides the prior **49 CLOSED / zero OPEN** source-control ledger (`20-BATCH-SECURITY-fc20301d.md:298-354`). The intervening 4a472d3c report held exactly **T-20-02-02** (`20-BATCH-SECURITY-4a472d3c.md:178-200`). That hold is now closed by the directly traced await/readiness/result-binding controls above. Its authored row is unchanged: **High, Repudiation, commit/replay, `mitigate`, “Exact receipt/source digests across cuts, reopen and retry.”** (`20-02-PLAN.md:141`). Resolving its Medium/P2 finding does not reclassify the authored threat.

| Authored group | Total | Base CLOSED | Base OPEN | Target CLOSED | Target OPEN |
|---|---:|---:|---:|---:|---:|
| T-20-01-* | 4 | 4 | 0 | 4 | 0 |
| T-20-02-* | 4 | 3 | 1 | 4 | 0 |
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
| **Total** | **49** | **48** | **1** | **49** | **0** |

The other **48** closures are retained by exact-base non-invalidation, with connected identity/privacy/authentication/commit/evidence boundaries retraced only where this repair touches them. They are **not** newly executed proofs or a repeated full-batch audit. New readiness maps to the existing commit/replay and native-result/source-identity boundaries; no distinct source-supported unregistered threat was established. Native proof remains a prerequisite, not an accepted or transferred risk.

## Fingerprints and preservation

| Member | SHA-256 |
|---|---|
| Preserved `20-BATCH-SECURITY-fc20301d.md` | `75ea505f968427eab1262e20b60acb2434dbf1e94c061e5ea6433e7cae6fcac4` |
| Preserved `20-BATCH-SECURITY-4a472d3c.md` | `010df8ba9615a310ffd3d6fa83b7b2321c25d1f97c95947288ba3fe2bf8f2527` |
| Target `src/testing/v12NativeRollbackBridge.ts` | `596de43948fb480da8914193f5301746ca2dcf73c6077f49e6e0d9f8e860243f` |
| Target `src/testing/v12NativeRollbackBridge.test.ts` | `98f9236ae9a6aadb7c406bb38f7f8119d71b662d5b408dec5f6e41a9e11d25ee` |
| Target `scripts/v12-native-rollback-bridge.mjs` | `9e1e4674365070347b8f4e0fcdf30e72002f27fca648fd737887d2909872fe5d` |
| Target `scripts/v12-native-rollback-bridge.test.mjs` | `4b8029bfc3d0cb5442da1a633fd215459076a4d8424efd25543a3b7e5ce06e35` |

Before writing, **39 pre-existing Phase 20 Markdown artifacts** were fingerprinted and reconfirmed unchanged using sorted filename/content SHA-256/size/mode/inode/nanosecond mtime. Snapshot SHA-256: **`470f4af22160825afd588df72a75a9517089bd75e6e2c89ed7c6c9a2f25433ba`**. The requested new report destination was absent. No old report, failed run, diagnostic observation or metadata was overwritten, normalized, deleted, rebound or relabelled as final acceptance.

**AI-assisted review limitation:** this bounded source closure can miss subtle vulnerabilities. It is not a professional ASVS certification, penetration test, runtime/binary guarantee, broad milestone audit, native acceptance or release approval. Fresh final-source native proof and the required Samsung/release gates remain separate and unpassed by this report.
