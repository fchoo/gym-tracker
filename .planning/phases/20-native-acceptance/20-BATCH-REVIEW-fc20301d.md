---
exact_sha: fc20301d2a81f7a8883a5346f7be7567bbaeff73
base: a650a4acf68285b9474d153c8dc0ca5ebb7e130e
branch: agent-p20-batch-review-fc20301d
status: issues_found
issues_found: 1
critical: 0
warnings: 1
informational: 1
score: 95
score_scale: 100
scope: complete pinned rollback / Garmin batch plus required integration, read-only source review
native_status: pending
native_garmin_cpython_status: pending
native_rollback_status: pending
final_phase20_combined_coverage_status: pending_parent_gate
review_worktree: /Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-review
---

# Phase 20 — Completed batch source review, fc20301d

**Pre-Landing Review: 1 issue (0 critical, 1 warning). Source score: 95/100.** The five-point deduction is for the verified result-publication race below, not for pending native execution. This is not native PASS, a physical-device approval, or milestone acceptance.

## Scope and isolation

Read root `AGENTS.md` and the gstack review checklist first. Reviewed the **full actual `a650a4acf68285b9474d153c8dc0ca5ebb7e130e..fc20301d2a81f7a8883a5346f7be7567bbaeff73` diff: 27 files, 2,050 insertions, 72 deletions**, covering all nine commits in that range. All 27 changed working-tree files were independently compared byte-for-byte with the exact fc20301d Git blobs; HEAD and the assigned branch match the review target.

The complete changed scope is:

- Rollback route/root: `app/__v12-recovery-archive.tsx`, `app/_layout.tsx`, `app/__tests__/v12-rollback-bridge.test.tsx`, `app/__tests__/root-layout.test.tsx`.
- Application rollback: `src/testing/v12NativeRollbackBridge.ts`, its unit test, `tests/sqlite-host/v12RollbackBridge.test.ts`.
- Host rollback transport/publication: `scripts/v12-native-rollback-bridge.mjs`, its test, `scripts/v12-rollback-archive-inspection.mjs`, `scripts/v12-rollback-async.test.mjs`, `scripts/v12-rollback-evidence.mjs`.
- Garmin production/tests: module Android `build.gradle`, `GarminClientWorker.kt`, `GarminConnectPlatformBindings.kt`, `GarminPythonContainers.kt`, `GarminPythonContainersTest.kt`, `GarminTokenStoreTest.kt`, `test_garmin_bridge.py`.
- Garmin diagnostic: `app/__garmin-bridge-diagnostic.tsx`, its route test, `src/testing/garminBridgeDiagnostic.ts`, its unit test.
- Registration: `scripts/phase18-language-coverage.mjs`, its test, `scripts/run-coverage-gate.mjs`, its test.

Read bounded integration outside the diff: production native runtime/lease handling, production RestoreCommands and repository transaction, AES-GCM/Argon2 ports, Python dispatcher/login/MFA/token lifecycle, native platform bindings, TypeScript native-module validators, root startup order, strict coverage enforcement, and the installed Expo file-writing implementation. Applied both checklist passes, including SQL, concurrency, enum/value consumers, type/privacy boundaries and distribution/registration. Did not repeat the prior whole-milestone or single-line tab source review.

**No source edit, test/coverage execution, build, ADB/device command, install, dependency change, new worktree, branch switch, fetch/sync, commit or push was performed. The only authored filesystem write is this report.** Existing report metadata and the shared dependency link were left untouched. Review status does not imply a clean working tree.

## Finding

### R1 — Publish completion only after the result file is fully written

**[Warning / P2] (confidence: 9/10) `src/testing/v12NativeRollbackBridge.ts:229,232` and `scripts/v12-native-rollback-bridge.mjs:110-115` — Direct result-file creation races the host's existence-based completion check.** This is a fail-closed intermittent acceptance failure, not accepted forged evidence or production database corruption.

Motivating application lines, verbatim:

```ts
// src/testing/v12NativeRollbackBridge.ts:229
resultFile.write(JSON.stringify({ schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm, inspection: result.inspection }));
// src/testing/v12NativeRollbackBridge.ts:232
resultFile.write(JSON.stringify({ schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm, failure: code }));
```

Motivating consumer lines, verbatim (`scripts/v12-native-rollback-bridge.mjs:110-115`):

```js
const fetched = adb(["exec-out", "run-as", PACKAGE, "sh", "-c", `test -f ${remote}/result.json && cat ${remote}/result.json`], undefined, true);
if (fetched.status === 0) { resultBytes = Buffer.from(fetched.stdout); break; }
await wait(250);
}
if (resultBytes === undefined || now() >= deadline) fail("native_timeout");
const result = JSON.parse(resultBytes);
```

The dependency is **Expo FileSystem 57.0.7**, matching `package.json:165` and the shared dependency's `package.json:3`. Its actual Android string writer is not an atomic publication operation. Verbatim `node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/FileSystemFile.kt:79-84`:

```kt
if (!exists) {
  create()
}
file.outputStream(append).use { outputStream ->
  outputStream.write(content.toByteArray())
}
```

`create()` separately calls `javaFile.createNewFile()` at line 57. Therefore this concrete interleaving is possible: the app creates an empty final `result.json`; the independent `run-as` shell sees it and successfully cats zero bytes; the host breaks out of polling; the app completes writing; the host parses the earlier empty bytes and permanently fails the attempt. A partial write has the same effect. Synchronous execution on the app JS thread does not serialize an external ADB shell against these filesystem steps. The async native restore and `am start -W` do not provide a file-close barrier.

The host catch preserves a fixed-code operational failure (`v12-native-rollback-bridge.mjs:138-141`) and never publishes the rollback shard in this case. That integrity protection is correct; the defect is treating visibility as completion. The inspected host command fakes return either absence or a complete JSON buffer, and the unit MockFile writes in one operation, so those tests do not exercise this native create-before-write interval.

**Recommended repair:** close a nonce-scoped temporary result and publish it via a genuinely atomic same-directory rename, or expose a separate readiness marker only after the complete result file is closed and make the host poll that marker. Apply the completion protocol to both success and sanitized failure results. Retain exact arm/archive binding, expiry, deadlines and immutable failure receipts; do not simply accept malformed JSON or extend timeouts. Add a focused read-before-close regression; no repair or test was performed by this read-only reviewer.

## Verified rollback integration

The following are source observations, not native execution results.

- **Real production authentication and commit — confidence: 10/10.** The bridge seals a parsed synthetic format-2/schema-22 snapshot using `createBackupEnvelopeCodec` and the Argon2 descriptor matching the production constants (`v12NativeRollbackBridge.ts:114-130`; `passwordKdf.ts:14-19`). Production ports select `createAesGcmArchivePort(createExpoAesGcmArchiveDriver())` and `createPasswordKdfPort()` (`v12NativeRollbackBridge.ts:183-207`). The AES driver passes AAD to actual Expo AES encryption/decryption (`aesGcmArchivePort.ts:156-198`); the default KDF resolves the native Argon2 module (`passwordKdf.ts:5-11,147-190`). No test crypto or host substitute is selected by the route.
- **Parser/token handoff — confidence: 10/10.** `v12NativeRollbackBridge.ts:135-149` initializes a fresh current target, calls production `createRestoreCommands`, waits for authenticated preflight, consumes its token with `confirmation: "REPLACE"`, and requires the captured authenticated snapshot to be version 2/schema 22. The store is single-consumption (`restoreCommands.ts:396-414`); preflight authenticates the envelope, validates rows/references and probes the candidate before issuing the token (`436-476`). Commit invokes the production restorer only after confirmation/token validation (`478-490`). The captured snapshot is not substituted for the archive parser.
- **Exclusive transaction and reopen proof — confidence: 10/10.** The repository returns only after its `kernel.write` transaction, with foreign keys required, ownership captured, source tables verified and restore state updated (`logicalRestoreRepository.ts:420-466`). The bridge hashes authenticated tables and committed reads, runs integrity/FK checks, closes and reopens the owned target, hashes again and refuses any mismatch (`v12NativeRollbackBridge.ts:150-167`; `71-100`). These are executed checks in the source path, not fabricated success callbacks.
- **Cleanup ownership — confidence: 10/10.** Names are fixed `v12-rollback-(source|target)-<32-hex nonce>.db`; production ports reject a pre-existing fresh database and reopening an unowned database (`193-203`). The executor closes all allocated handles, removes only its recorded created databases, preserves the first failure and fails on cleanup-only errors (`171-180`). Neither `workout.db` nor a production runtime startup is selected.
- **Nonce/lease/source/APK/device/expiry binding — confidence: 10/10.** The host validates the request's exact producer/run/lease shape, live test-package manifest and hash fields (`v12-native-rollback-bridge.mjs:44-78`); uses the explicitly selected device for every ADB call (`85`); verifies offline state and embedded test config (`88-102`); stages an arm with lease hash, source/APK/device hashes, input-archive hash and device-clock expiry (`99-106`). The private arm is checked and moved to `consumed.json` before any asynchronous bridge operation (`v12NativeRollbackBridge.ts:46-58,211-225`). Returned arm equality, exact restore bytes, archive/fact hashes and proof schema are checked (`v12-native-rollback-bridge.mjs:115-128`), followed by a fresh production runtime/lease/APK verification before retention (`129-135`). The production runtime verifies source bytes, device identity, installed/local APK, lease owner/run/device and an existing settings snapshot (`v12-production-native-runtime.mjs:47-91,194-210`).
- **Borrowed lease is intentional — confidence: 10/10.** The bridge receives an already-owned lease. The runtime releases/restores settings only for a lease it acquires itself (`194-210`); this helper does not steal or release the parent's exclusive window. It does not restart ADB, clear global logs, force-stop another process, or modify device settings. Operational attempts live outside immutable RunRoot, in fresh nonce directories with exclusive host file creation (`v12-native-rollback-bridge.mjs:33-39,103,121,132-140`). A failed attempt is retained rather than overwritten.
- **Actual asynchronous CLI — confidence: 10/10.** The production CLI imports `authenticateV12RollbackOnDevice`, passes it as the executor and calls the async publisher (`v12-rollback-evidence.mjs:367-378`). Publication awaits that executor and proof validation before entering the existing atomic shard writer (`301-310,271-290`). Snapshotted archive bytes are retained across the await (`254-268`), so changing the original path during native execution does not swap published content. R1 concerns the earlier private app-to-host result handoff, not a missing async production executor or the final shard writer.

### Compatibility honesty

The bridge's **source schema is 22, while its newly created restore target is CURRENT_SCHEMA_VERSION, currently 47** (`v12NativeRollbackBridge.ts:116,122,136,149`). The proof concerns the generated historical-format synthetic archive, production current-parser restore, canonical source-table equality and current target integrity after reopen. It does **not** execute a prior installed APK, downgrade a schema-47 database, or prove an old APK can open the new database.

The new retained prior-release derivation reads signed APK bytes and embedded production package/profile/hooks config; its result contains only artifact ownership, not an invented compatibility version (`v12-rollback-evidence.mjs:166-183`). The evidence keeps the explicit `compatible_restore_or_forward_fix` boundary (`20,219-224`). The parent's separately supplied signed production APK / embedded format-2/schema-22 static-support proof remains **static proof only**. Neither that proof nor these new closure reports authorizes old-APK/new-DB use. No contradictory missing-capability finding is asserted.

## Root and diagnostic route surface

**Verified source isolation — confidence: 10/10.** Root marks both new paths isolated regardless of hook enablement, excludes them from production appearance reads and fails closed on font errors (`app/_layout.tsx:438-439,541-578`). Each returns its isolated navigator before production workout startup (`687-719`). The route guards then enforce the exact devtest package/development-test profile/true hook/v1.2-acceptance suite and scalar 32-hex nonce (`v12NativeRollbackBridge.ts:41-58`; `app/__v12-recovery-archive.tsx:21-29`; `garminBridgeDiagnostic.ts:3-7`; `app/__garmin-bridge-diagnostic.tsx:24-30`). Disabled or malformed routes do not construct rollback ports/native diagnostic work. Both views publish only fixed outcomes and suppress UI updates after unmount.

The new **Garmin diagnostic is deliberately credential-free**, not a login or persistence test. It calls only runtime metadata, disconnected connection state and fixed `'{"probe":1}'` deterministic JSON (`garminBridgeDiagnostic.ts:10-26`). TypeScript validates runtime/JSON envelopes (`modules/garmin-connect/src/index.ts:55-108,119-133`). Native runtime info uses typed Python dispatch (`GarminConnectPlatformBindings.kt:220-249`); connectionState dispatches without `restoreSession` or token handoff (`GarminClientWorker.kt:167-171`; Python `garmin_bridge.py:357-359,405-410`). Runtime info and fixed JSON operations return local data without constructing a provider client (`garmin_bridge.py:739-761`). Lazy worker/store construction is not a stored-token read (`GarminConnectPlatformBindings.kt:66-85`).

Its console record contains the validated nonce plus fixed schema/status/stage/code; thrown native construction errors are reduced to `module/native_bridge_rejected`, not exception text or payload (`app/__garmin-bridge-diagnostic.tsx:8-20`). It does not restore a session, log in, request owner reauthentication, read tokens, contact Garmin, or exercise archive restore. A successful native diagnostic will establish only its bounded runtime/container transport path, not MFA/provider/persistence acceptance.

## Garmin container, capacity and MFA contract

**Verified source repair — confidence: 10/10.** `productionGarminPythonContainers` constructs actual `builtins.dict/list` objects, populates their `asMap/asList` views with typed Python scalar keys/values, and constructs Python bytes from an unsigned staged list (`GarminClientWorker.kt:51-88`; `GarminPythonContainers.kt:20-49`). It no longer passes a Java Map proxy to Python's strict dict guard or attempts `.toJava(Map/List)` for Python container results. Worker dispatch, runtimeInfo, rejection maps and recovery map-lists all use the typed families (`GarminClientWorker.kt:100-115`; `GarminConnectPlatformBindings.kt:229-231`). The Python production guard remains strict and unchanged (`garmin_bridge.py:116,351-387,741-743`); no alternate transport/provider fallback was added.

**Capacity/privacy preserved — confidence: 10/10.** Arguments are bounded to 16 keys, 128-character keys, supported String/Int/ByteArray types, 1MB strings and 64KiB token payloads; byte staging clears even on failure (`GarminPythonContainers.kt:20-49`). Detached result conversion handles exact dict/list/bool/int/float/string/None families, rejects unsupported keys/types, preserves schema integers as Int and larger safe JSON integers as Long, rejects nonfinite/unsafe numbers and bounds envelope depth/nodes/string transport (`51-94`). The 2MB transport-string ceiling accommodates canonical benchmark float expansion; it does not weaken private provider-data limits. The existing worker still enforces depth 16, 25,000 nodes, 16,384-character data strings, bounded keys and forbidden credential/URL fields (`GarminClientWorker.kt:11-33,374-423`), and Python `_bounded_json` remains in the production success path (`garmin_bridge.py:394-396`).

**MFA/persistence preserved — confidence: 10/10.** Login and resumeMfa now extract/persist tokens only after sanitized connected completion (`GarminClientWorker.kt:180-187,202-209`); the token helper additionally refuses `mfa_required` (`345-354`). `take_persistable_tokens` uses null-safe bytes conversion (`103-106`). Kotlin arguments are cleared and extracted token bytes wiped. Python creates only a pending challenge before returning MFA-required, captures tokens only after connected login/resume completion, and consumes pending tokens once (`garmin_bridge.py:389-392,459-516`). This prevents the premature Python-None handoff without weakening Python validation, generation checks, session ownership or credential privacy.

## Test/coverage inspection and reported evidence

**Inspected, not executed here:** rollback unit orchestration/guard/cleanup tests; the real host SQLite/AES-GCM/Argon2 create/restore/tamper test; route/root enabled-disabled/font/unmount tests; host transport/nonce/lease/expiry/archive/proof/failure tests; async waiting/input-swap/no-publication tests; typed-container boundary/byte cleanup/Int-Long/capacity tests; MFA incomplete/connected token tests; Python proxy rejection/canonical expansion tests; diagnostic fixed-stage/privacy/guard tests; and coverage registration changes. R1 identifies a real concurrency interval absent from their synchronous file/command fakes, not a claim that all these tests are missing.

The registry now explicitly includes **15 Phase 20 critical TypeScript boundaries**, including both rollback and both diagnostic files, with component-project and focused tests registered (`run-coverage-gate.mjs:371-399,902-926`). Its Node manifest requires **56 test files / 21 distinct modules** (`833-866`), including native bridge and shared inspection; the supplied all-phase critical count is 173. The four-metric 100% contract is unchanged (`388-390,1065-1090`). FactoryKt, Containers and Kind are included in both the language registry and Gradle report selection; Kind is an explicitly measured branchless class, not removed from coverage.

Parent-supplied execution evidence, **not independently rerun or promoted to native acceptance**:

| Scope | Supplied result / boundary |
| --- | --- |
| Acceptance source/host scope before the two newest diagnostic boundaries | 194 cases / 15 suites; all 13 then-critical files at exactly 100% |
| New diagnostic/root scope | 63 focused cases; both new critical boundaries at 100% on all four metrics |
| Complete rollback Node scope | 71 cases / 3 modules; all four metrics 100% |
| Rollback root/route scope | 59 cases passing |
| Preserved single-line tab scope | 68 cases; prior targeted source score 100 |
| Current types/boundaries | 475 passing |
| Python | 21 tests; 542/206/54/542 covered; zero skips |
| Kotlin | 66 tests (60 repository + 6 explicit fake-API factory cases); 7,430/637/166/1,159 JaCoCo units covered; zero skips |
| Real Chaquopy API compilation | Production compiles against Chaquopy 17 API; compilation/host fakes are not installed CPython proof |

**The latest combined 15-critical Phase 20 gate remains the parent's pending gate.** The older 13-critical combined result plus separately passing new boundaries is not relabelled as that completed gate. No broad 347-Jest rerun is recommended by this source review. R1 needs bounded publication/transport regression and affected coverage, followed by the parent's required complete focused gate; do not lower thresholds or drop integrity files to close it.

## Preserved prior tab evidence and native boundary

The a650 single-line tab source repair is already reviewed and **unchanged by this batch**. Preserved `20-TAB-FIT-REVIEW-a650a4ac.md`; did not edit its historical native-pending statements. The parent now supplies an **actual emulator eight-configuration portrait glyph pass: 360/390dp × Light/Dark × F100/F200**, with all complete labels on one line. That is attributed emulator visual evidence, not a new physical-device or full Phase 20 PASS from this reviewer. Prior failed diagnostics and older source reports retain their original meaning.

At report time the supplied native Garmin build is running **for the emulator only**; there is no supplied Samsung installation or completed new native CPython diagnostic. Owner reauthentication has not yet been requested. Native rollback authentication/reopen evidence likewise is not established by host primitives, static old-APK inspection, compilation or this source report.

**Final outcome: 0 Critical, 1 Warning (R1), 95/100 on the exact scoped source. Native acceptance remains pending.** After the bounded repair, batch it into the parent's subsequent fresh final-source build and exclusive device window. Preserve failed immutable attempts, keep diagnostics labelled non-acceptance, and obtain actual required source/APK/device-bound evidence before closure. No queued agent or native workflow was duplicated, restarted or touched.

The **17 pre-existing review Markdown files** in the reused checkout, including its modified `20-REVIEW.md`, were left unchanged. Their pre-report filename/content manifest SHA-256 was `1ce68bb51f0158cc7ea7ba182392657becc9c917e32495ea0cd2c1f29be16b48`. This report alone is the authorized output.
