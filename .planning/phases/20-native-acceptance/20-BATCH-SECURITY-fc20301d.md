---
phase: 20
slug: native-acceptance
status: verified
audit_scope: independent-read-only-completed-rollback-and-garmin-batch-source-security-continuation
exact_sha: fc20301d2a81f7a8883a5346f7be7567bbaeff73
independent_source_sha: fc20301d2a81f7a8883a5346f7be7567bbaeff73
base_sha: a650a4acf68285b9474d153c8dc0ca5ebb7e130e
branch: agent-p20-batch-security-fc20301d
baseline_report: .planning/phases/20-native-acceptance/20-TAB-FIT-SECURITY-a650a4ac.md
baseline_report_sha256: 0ab1fb01d15e4bc379fa6c69654ae07418da5c8e3d6a2c1f34ecbe003eca885b
changed_files: 27
source_and_tooling_files: 14
test_files: 13
commits_in_range: 9
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
host_proof: not_run
native_proof: not_run
native_proof_not_run: true
native_acceptance_pending: true
android_python_313_proof_pending: true
production_ready: false
release_authorized: false
created: 2026-10-23
---

# Phase 20 — Independent Batch Source Security at fc20301d

## Conclusion

**VERIFIED — scoped source-security continuation only.** The complete nine-commit `a650a4ac..fc20301d` batch was inspected, including the removed code, all changed tests, and connected production crypto, restore, SQLite, lease, privacy, native-module and final-validator controls. No concrete new Critical, High, Medium or Low security finding was established. **49/49 authored source mitigations remain CLOSED: 48 High and one Medium, all disposition `mitigate`.** Open/blocking threats, unregistered flags, warnings, open risks, accepted risks and transferred risks are zero.

**Scoped score: 100/100; ASVS Level 1; block on High.** These are source-control continuity results under unchanged `.planning/config.json:47-49`, not a professional ASVS certification, whole-milestone re-audit, penetration test, runtime guarantee or release approval.

**Independent host proof: NOT_RUN. Native proof: NOT_RUN.** Genuine host cryptography/SQLite, mocked transport tests, fake Chaquopy API tests and coverage do not prove the installed ARM64 Python 3.13 bridge or final-source native restore. The credential-free Garmin route is an internal diagnostic, not final native acceptance. Parent-reported emulator build activity is not a completed proof. No Samsung reinstall, credential interaction, native execution or release is authorized by this report.

## Exact target and read-only boundary

- Reused checkout: `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security`.
- Independently verified branch: `agent-p20-batch-security-fc20301d`.
- Independently verified HEAD: `fc20301d2a81f7a8883a5346f7be7567bbaeff73`.
- Independently verified ancestor/base: `a650a4acf68285b9474d153c8dc0ca5ebb7e130e`.
- Complete delta: **27 files, +2,050 / -72; 14 source/tooling files and 13 test files**. All 27 checkout files match the exact target Git blobs byte-for-byte; the tracked checkout is clean against the target.
- Nine commits: `7d7860be`, `c991a64e`, `b7da54a7`, `6ac97a97`, `1ac58735`, `e84e516f`, `c49e0d8e`, `3838d27b`, `fc20301d`.
- The twelve authored threat-plan files are byte-identical across base, target and checkout. Every threat row and trust-boundary block was read and reconciled.
- Root `AGENTS.md:1-40`, project integrity rules, preserved fit/native-corrective reports, source precedence, owner transport decisions, repository recovery flow and retained Garmin handoff/metrics were read. The externally referenced historical pre-git design file was unavailable at its named path; no claim relies on having read it. Repository `v1.1-UX-FLOW.md:124-161` supplies recovery context, with current `v1.2-SOURCE-PRECEDENCE.md:3-7,12-13,24-39` and `v1.2-OWNER-DECISIONS.md:78-108` taking precedence over obsolete transport/timing proposals. `v1.2-push-inspired-ui-ux-overhaul-DRAFT.md:96-112` retains the source-fact/offline/commit invariants.

**Only this report was authored.** No source edit, test/coverage execution, application import, build/prebuild, install, ADB/device operation, provider request, credential/token/database-row read, signing operation, dependency install, worktree creation, branch switch, commit, push, fetch/sync or extra reviewer dispatch occurred. Local Python invocations only inspected files, Git blobs, hashes and metadata; no repository code was executed. Existing dependency links, host artifacts, old reports and failed receipts were preserved. Provider queue/quiet time is not a failure or evidence of runtime progress; no queued/quiet assignment was duplicated or restarted.

All source references below are relative to this pinned checkout unless explicitly identified as a preserved report or parent-provided observation.

## Findings and calibration

| Classification | Count |
|---|---:|
| Critical | 0 |
| High / open High-or-higher blockers | 0 / 0 |
| Medium | 0 |
| Low | 0 |
| Unregistered flags / warnings | 0 / 0 |
| Open / accepted / transferred risks | 0 / 0 / 0 |

**Source-tracing confidence: 9/10.** No concrete missing authentication, lease, expiry or result/failure-binding guard was established in the actual caller-to-native-to-publication path. Any finding would require an exact pinned location, verbatim motivating code, severity, confidence and a concrete consequence. No speculative exploit is manufactured from host injection seams or from native proof not having run. Pending native verification remains a mandatory evidence limitation, not an accepted security risk or a passed gate.

## B1 — New routes are isolated before production startup and independently guarded

The new paths are actual internal surfaces, not merely tests. `app/_layout.tsx:438-439,541-575` includes both paths in `isolatedNativeRoute`, chooses the memory appearance store, and does not read production preferences while either path is selected:

```ts
const appearanceRead = !isolatedNativeRoute && fontsLoaded && fontError === null
  ? productionAppearanceStore.read()
  : null;
```

Both paths are also in `failClosedFontRoute` (`556-563`): cold fonts receive only the isolated loading shell (`591-600`), and failed fonts receive `PreRuntimeFailure` before either native route (`577-579`). Their navigator branches (`687-709`) contain no `WorkoutAppRuntimeProvider`, production appearance store, workout storage construction, notification startup or running-plan provider. The ordinary production provider remains below those early returns at `829-840`. Isolation is selected by path even with hooks disabled; it does not rely on passing the child execution guard first.

The child guards are separate. `app/__v12-recovery-archive.tsx:23-29` requires `rollbackNativeEnabled` and a scalar 32-hex nonce before mounting `Execution`. `src/testing/v12NativeRollbackBridge.ts:41-44` requires the exact conjunction:

```ts
return identity.packageName === "com.fchoo.gymtracker.devtest" && identity.buildProfile === "development-test"
  && identity.nativeContractsEnabled === true && identity.suite === "v1.2-acceptance";
```

`collectNativeRollbackBridge` repeats that guard before loading private-file/native ports (`211-214`). The Garmin route/helper likewise require exact devtest package, development-test profile, literal enabled `true`, V12 suite and scalar nonce (`app/__garmin-bridge-diagnostic.tsx:25-30`; `src/testing/garminBridgeDiagnostic.ts:3-6`). A disabled, production, wrong-suite or array-nonce route cannot dispatch either operation. Redirecting later into the ordinary app does not grant an internal diagnostic capability.

The unchanged production config/generation gates still require hooks false/suite null, separate package/scheme, ARM64, no test instrumentation/service and nondebuggable production (`app.config.ts:27-43,66-70,114-117`; `scripts/assert-generated-production-android.mjs:42-81`). No production debug or test-hook exception was added.

## B2 — Real native primitives, clean nonce-owned targets, no schema downgrade

`productionRollbackPorts` is not a test port masquerading as production. At `src/testing/v12NativeRollbackBridge.ts:183-207` it dynamically obtains:

- `openSqliteKernel(name)` / `deleteDatabaseAsync(name)` and the actual Expo SQLite default directory;
- Expo SHA-256 and `getRandomBytes`;
- `createAesGcmArchivePort(createExpoAesGcmArchiveDriver())`;
- `createPasswordKdfPort()`.

The file URI normalization handles both absolute default-directory paths and existing `file://` URIs. Only `v12-rollback-(source|target)-<32 hex>.db` names are accepted. Verbatim ownership gate (`193-204`):

```ts
if (!/^v12-rollback-(?:source|target)-[a-f0-9]{32}\.db$/u.test(name)) fail("arguments_invalid");
const file = new File(databaseUri, name);
if (file.exists === fresh || (!fresh && !owned.has(name))) fail("clean_target_required");
const kernel = await openSqliteKernel(name);
if (fresh) owned.add(name);
...
if (!owned.has(name)) fail("cleanup_failed");
await deleteDatabaseAsync(name); owned.delete(name);
```

Fresh opens refuse an existing database; reopened targets must exist and belong to that port instance. Deletion is limited to successfully allocated names. `initialize` first refuses any non-SQLite table (`78-80`), then applies and verifies production migrations transactionally (`81-87`). The source is initialized only to schema 22; the distinct empty target is initialized to current production schema **47** (`115-116,135-136`; current migration index includes `0047` and derives the maximum). There is no production database name, live upgrade hook, user-data wipe or operation that sets an existing schema-47 database back to 22.

The source fixture is newly constructed synthetic historical-format data, not an owner's historical/private archive: an actual schema-22 graph with the synthetic appearance setting and portable owner identity, parsed as format 2 (`117-124`). It is sealed by the production GTBK codec with fresh 16-byte salt and 12-byte nonce (`125-130`). `ROLLBACK_SYNTHETIC_PASSWORD` is explicitly public synthetic-only (`20`); it is not a retained user password or an encryption claim for private production data.

Production crypto is unchanged and was traced: `passwordKdf.ts:14-19,77-116,147-196` pins Argon2id to 19,456 KiB, two iterations, parallelism one, 32-byte output, 16-byte salt and the native Bouncy Castle 1.85.2 result contract; it wipes owned transient buffers. `aesGcmArchivePort.ts:156-198` calls actual Expo AES encryption/decryption with a 12-byte nonce, 16-byte tag and additional authenticated data. `backupFormat.ts:205-249,267-318,367-459` enforces canonical exact-key headers, fixed cipher/KDF parameters, bounded UTF-8 payload, authenticated prefix/header, snapshot identity and wiping. No XOR/plaintext substitute, weaker KDF or alternate crypto implementation is selected by the installed route.

## B3 — Authentication and exclusive restore precede canonical close/reopen facts

Verbatim critical handoff, `src/testing/v12NativeRollbackBridge.ts:146-158`:

```ts
const preflight = await commands.preflightSecureRestore({ password: ROLLBACK_SYNTHETIC_PASSWORD });
if (preflight.outcome !== "ready") fail("archive_invalid");
await commands.commitSecureRestore({ token: preflight.token, confirmation: "REPLACE" });
if (authenticated === undefined || authenticated.version !== 2 || authenticated.schemaVersion !== 22) fail("schema_boundary_invalid");
...
await target.close(); target = undefined;
target = await ports.open(targetName, false);
...
if (sourceFactsSha256 !== postSha256 || postSha256 !== reopenedSha256) fail("restore_facts_invalid");
```

The installed bridge calls **production `createRestoreCommands`**, its schema/retained-reference/catalog adapters, pure candidate probe, one-use preflight store and `createLogicalRestoreRepository` (`138-145`). The captured snapshot comes from the authenticated preflight handoff passed to the actual repository, not a receipt-only fixture. `restoreCommands.ts:417-475` opens/authenticates the archive before row/reference/candidate validation and token issuance; raw parse/password/tag errors are indistinguishable and transient inputs are wiped. Confirmation and token consumption precede the writer (`478-489`). `restorePreflightAdapters.ts:173-255` is a pure candidate check, not a hidden production writer.

`logicalRestoreRepository.ts:420-466` runs the complete replacement inside `kernel.write`, checks foreign keys enabled, captures existing ownership, suspends/restores the exact trigger set, inserts and verifies source facts, checks FK violations and marks derivative rebuild pending. The unchanged kernel uses serialized `BEGIN IMMEDIATE`/COMMIT/ROLLBACK and returns only after commit (`serializedWriter.ts:37-80`; `sqliteKernel.ts:162-169`). This remains an exclusive transaction, not acknowledgement before commit.

The new bridge additionally hashes the authenticated source tables, committed target tables and reopened target tables using stable key order and registered primary-key SQL order (`61-100,150-158`). Source-table reads occur in serialized read snapshots. It requires one literal `ok` integrity result and no foreign-key violations at initialization, after restore and after reopening (`71-87,153-157`). A format/schema mismatch, differing facts, bad integrity, close failure or owned deletion failure cannot yield the returned success (`149,158,168-180`). Facts expose only archive/digest/count/schema/integrity fields, not source rows (`159-167`). No canonical fact digest or receipt is accepted merely because a function has a production-looking name.

## B4 — Host owns actual source/APK/device/lease/offline binding; app consumes the arm once

The host path, not an unverified JSON arm alone, establishes physical/source authority:

1. `scripts/v12-native-rollback-bridge.mjs:46-58` requires an exact run ID/phase, rejects test-origin and adapter-command environments, and reads an exact request with a 48-hex lease ID and literal `EXECUTED`. `safeFile` rejects symlinks through **every ancestor**; the request must be directly under `artifacts/native/phase20-operations/<run>` (`23-31,51-53`).
2. The retained build must be live, the same run, development-test/devtest, with matching retained/installed APK hash and shaped source/APK/signature/device hashes (`59-65`). The default tools are source-owned explicit-path ADB/unzip, with production origin and `test_only === false` (`66-69`; unchanged `v12-native-execution-origin.mjs:121-147`). No PATH or test transport fallback is accepted by this bridge.
3. The real runtime constructor re-reads the manifest/source digest and selected device (`v12-production-native-runtime.mjs:53-73`). `withLease` checks device-side owner run/lease/device identity, installed-versus-retained APK bytes and an existing settings snapshot (`75-91,194-203`). A merely well-shaped but unowned request lease is insufficient. Every bridge ADB call explicitly includes `-s <selected serial>` (`85-86`). No server restart/kill, global log clear, app data clear, install or force-stop is added.
4. Inside that owned lease, the bridge reads back airplane mode enabled, Wi-Fi zero and mobile data zero (`88-91`), and extracts the retained APK's embedded exact package/scheme/profile/hooks/suite (`92-96`). Device time is validated before creating a three-minute arm (`97-106`). No network state is changed by the bridge.
5. The private arm contains run/source/APK/device/lease/archive hashes, phase, nonce, declared schema 22 and expiry (`99-103`). On-device validation requires its **exact keys**, scalar nonce/run/hash types, exact route/schema, safe integer time and expiry strictly in the next five minutes (`src/testing/v12NativeRollbackBridge.ts:46-58`). The app refuses existing consumed/result state and synchronously moves the arm to `consumed.json` before asynchronous native work (`214-220`). For restore it hashes the incoming archive before execution (`222-224`). A deep link without the private arm cannot restore.
6. The app revalidates expiry after all execution/cleanup and before publishing output (`225-229`). The host enforces its independent fixed 180-second deadline both after fetching and at final retention (`79,109-114,130-131`). A fetched late result is rejected; no heartbeat or timeout extension is introduced.
7. The host requires the exact success/failure result envelope and **byte-equivalent JSON arm** (`115-123`), exact returned archive bytes for restore, format 2, archive hash and full inspection (`124-128`). Before retaining success it reconstructs the actual runtime and checks source/device/APK/owned lease again (`129-136`). Shape checks are not represented as actual device verification; these connected runtime checks are what supply it.

The app's arm validator does not independently measure every claimed source/device hash. That is deliberately not asserted here: the installed-byte/source/device/lease authority is enforced by the actual source-owned host runtime before arming and again before successful retention. The private run-as directory and nonce are not a public account endpoint, and neither the arm nor the route can award a final verdict. Native evidence for this chain still has to be produced; source tracing is not the observation itself.

## B5 — Operational metadata stays outside RunRoot; publication awaits and remains no-clobber

Operational requests, arms, collected results, encrypted archive staging and fixed-code failures live under `artifacts/native/phase20-operations/<run>/rollback-<fresh nonce>`, **outside** `artifacts/native/v1.2/<run>` (`scripts/v12-native-rollback-bridge.mjs:33-40,51-53,77-78`). A fresh nonce directory must be newly created; ancestor symlinks/non-directories fail. Arm/result/archive/failure writes use exclusive `wx` and mode 0600 (`103,121,132-140`). A completed attempt or first failure cannot be overwritten by rerunning the same attempt.

On-device replay is refused before result writes by consumed/result checks. Failures during native work are reduced to fixed `v12_rollback_*` codes and paired with the consumed arm (`src/testing/v12NativeRollbackBridge.ts:217-219,230-233`); execution/cleanup retains the first fixed failure (`168-179`). The route renders only fixed outcome text and discards exception details (`app/__v12-recovery-archive.tsx:8-18`). The host preserves a valid native failure envelope when received and creates a fixed-code operational failure, never an archive success (`scripts/v12-native-rollback-bridge.mjs:119-123,138-142`). Missing/partial/malformed output fails closed. The private native file write is not claimed to be a durable atomic acceptance publication; the following host publisher is the acceptance-artifact boundary.

`publishV12RollbackEvidenceAsync` captures the selected APK/archive/manifest bytes before awaiting, awaits the actual executor and then validates inspection **before entering publication** (`scripts/v12-rollback-evidence.mjs:254-269,300-310`):

```js
value = await authenticateArchiveValue(compatibleArchive, archiveBytes, lastValidSchemaVersion, authenticateAndRestoreArchive);
...
return publishPreparedRollback(prepared, archiveInspection(value, archiveBytes, lastValidSchemaVersion));
```

`executeV12RollbackCli:373-378` imports the source-owned native authenticator and wires it to this async publisher. The real CLI does not accept an environment-provided inspection object, canned receipt callback, fake database, runtime dependency override or arbitrary adapter command. The synchronous export remains an explicit host fixture seam; a thenable fails the exact inspection shape rather than publishing pending work. The extracted `archiveInspection` preserves the base validator's exact keys, archive/source/reopened digests, clean-target/parser/outcome/schema/integrity/FK requirements (`v12-rollback-archive-inspection.mjs:12-37`); no integrity guard was dropped in the move.

Exactly seven retained rollback members are published (`v12-rollback-evidence.mjs:24-32,271-290`). The unchanged atomic publisher enforces owner claims, prior-failure consumption, private staging, recursive privacy, exclusive writes/fsync, member hashes and durable no-clobber promotion; publication manifest is last (`v12-atomic-shard-publication.mjs:174-218,366-408,456-522`). Consequently native preflight/restore failure does not publish a rollback PASS shard, and host operational files do not violate the final RunRoot's exact artifact set. No earlier failed immutable run or diagnostic is overwritten or rebound.

## B6 — Prior signed bytes are not authority to open schema 47 with an old APK

`deriveV12RetainedPriorReleaseManifest` validates regular selected APK bytes, actual pinned-path signature-tool verification, certificate/report consistency and the APK's embedded production package/profile/hooks false (`v12-rollback-evidence.mjs:140-184`). The derived manifest contains byte size/hash, signature-report hash and certificate hash, **not an invented old-source hash or compatible-schema assertion**. Publication verification rehashes all retained APK/archive/receipt/facts bytes, re-runs signature verification and revalidates the complete receipt/facts bindings (`313-349`).

Parent reports that the actual retained production APK's signed bytes and static format-2/schema-22 support were separately verified. This auditor did not run those tools, inspect a compiled old APK or install it. That parent observation is not proof of installed-old restore, full old-source binding or an old APK's ability to open newer committed data.

The retained boundary still requires current schema greater than the authenticated archive schema and explicitly records `compatible_restore_or_forward_fix` (`186-225,248-250`). The actual new native path restores format 2/schema 22 **with current production parser/writer into an isolated current-schema target**. It does not install an old APK, downgrade a live schema-47 database or silently discard newer data. Neither signed-byte ownership nor the synthetic clean restore grants that authority.

## G1 — Java proxy requests now become actual typed Python containers

`GarminClientWorker.kt:51-89` constructs real builtin dict/list objects, uses `PyObject.fromJava` only for typed scalars and traverses actual `asMap()`/`asList()` views. The explicit builtin classifier handles dict, list, bool, int, float and str, with an unsupported branch; it is not unchecked `toJava(Map/List)` container casting. Boolean is classified separately from integer.

`GarminPythonContainers.kt:21-49` limits argument count/key length/string length and accepts only String, Int and bounded ByteArray families. Token bytes become unsigned integer items in a real Python list, then builtin bytes. Staging is cleared even when byte construction throws:

```kt
try {
  value.forEach { items.add(fromScalar(it.toInt() and 255)) }
  bytesFromList(sequence)
} finally {
  items.clear()
}
```

Results are detached maps/lists (`51-94`); Python None maps to Java null; dict keys must be actual strings; unsupported types, unsafe integers, nonfinite/oversized floats, excess depth/nodes/string length reject. Small integers stay Int for `GarminRuntimeInfo`; larger safe integers stay Long. The changed source routes all actual families through this conversion: dispatch arguments/results (`81-102`), flat runtimeInfo (`GarminConnectPlatformBindings.kt:229-231`), rejection string maps and recovery lists (`GarminClientWorker.kt:107-116`). The optional token handoff is now null-safe (`103-106`). No arbitrary eval, provider-method/URL forwarding or alternate dispatcher is added.

## G2 — Envelope reserve does not weaken private-data limits or strict Python schema

The converter's transport bounds are **depth 19 / 25,016 nodes / 2,000,000-character strings** (`GarminPythonContainers.kt:68-90`), reserving envelope capacity separately from data. These are not relaxed provider-data limits. The unchanged worker still sanitizes only `result["data"]` at depth zero with **16 / 25,000 / 16,384**, rejects sensitive keys/URLs, validates generation and reduces unknown errors to allowlisted codes (`GarminClientWorker.kt:11-33,374-422`). The unchanged Python boundary still requires an actual dict with the exact operation keys (`garmin_bridge.py:115-118`) and the same bounded/private-data guard (`152-181`). Tuple/list Python inputs become ordinary lists in that guard before bridge conversion.

The benchmark has a separate flat fixed DTO: Python first bounds/parses its <=1MB input, then canonicalizes JSON (`garmin_bridge.py:745-761`). Canonical float spelling can expand output, explaining the converter's 2MB **transport-string** ceiling; it does not remove the worker's 16,384 private-data ceiling. No Python schema, provider pagination/chart/polyline bound, persisted normalized digest, import transaction or explicit-match revision fence changes in this batch.

## G3 — MFA handoff waits for connected completion; secure storage is unchanged

Verbatim changed login gate, `GarminClientWorker.kt:180-185`:

```kt
val result = safeDispatch("login", arguments)
requireGeneration(result, generation)
val isConnected = connected(result)
if (isConnected) persistPendingTokens(result)
sessionAvailable = isConnected
```

MFA completion uses the same gate (`202-207`). `connected` requires status `ok`, data map and literal `kind == "connected"` (`357-361`). The shared persistence helper additionally returns before token extraction for an MFA challenge (`345-354`). Thus errors, disconnected/incomplete successes and all MFA challenges do not extract/persist a login/MFA session. Existing authenticated refresh/read token rotation is not incorrectly described as requiring a connection-kind DTO; those unchanged operations retain their own generation/session gates.

Generation fencing, locks and argument clearing remain (`173-232,302-342`). Extracted token bytes are wiped after the unchanged session-store replacement (`349-354`). Optional absence is not dereferenced as a nonnull PyObject. No password/token is added to the result DTO or a new log sink.

Production DI storage remains the lazy `GarminTokenStore` under `noBackupFilesDir/garmin-session` (`GarminConnectPlatformBindings.kt:72-84`), with Android Keystore AES-256-GCM, randomized nonce, AAD, verified atomic replacement and transient wiping (`GarminTokenStore.kt:148-199,203-262`). Its implementation is byte-identical to the base. Python token capture remains an internal Kotlin-only byte handoff, not an Expo method (`garmin_bridge.py:389-392,422-455,771-773`). Provider logging suppression and bounded errors are unchanged (`94-102,351-386`). No credentials were inspected by this audit.

## G4 — Credential-free native probe is diagnostic, not account or acceptance proof

The actual probe does only three fixed operations in sequence (`src/testing/garminBridgeDiagnostic.ts:10-26`):

```ts
await readGarminRuntimeInfo(native);
...
const value = await native.connectionState();
...
if (envelope.status !== "ok" || data?.kind !== "disconnected") throw new Error("rejected");
...
const json = await benchmarkGarminDeterministicJson('{"probe":1}', native);
if (json.normalizedJson !== '{"probe":1}') throw new Error("rejected");
```

The runtime metadata validator requires Python 3.13, client 0.3.17, exact selected client commit, ARM64, capability and valid bounded benchmark facts (`modules/garmin-connect/src/index.ts:55-108`). The fixed JSON helper validates its exact DTO (`119-132`). These are source validations, not independent proof of the installed interpreter version.

`connectionState` dispatches only the in-memory Python state and generation (`GarminClientWorker.kt:167-171`; `garmin_bridge.py:357-359,405-410`); constructing the lazy worker/store does not invoke `store.read`, decrypt tokens, restore a session or contact a provider (`GarminConnectPlatformBindings.kt:72-85`; `GarminTokenStore.kt:203-215`). Python's provider import/client creation is lazy inside `_default_client_factory` (`garmin_bridge.py:109-112`), not part of runtimeInfo/disconnected/fixed JSON. The probe invokes no login, MFA, logout, session restoration, token-record inspection, provider read, evidence-arm lifecycle or SQL operation. A connected state fails rather than being reused for the probe.

The route loads the real named native module only after the route guard (`app/__garmin-bridge-diagnostic.tsx:25-30`, then `14`). It catches module/native failures and emits only a fixed stage/code/status plus schema version and the dispatch nonce (`14-18`); raw metadata, JSON, account data and error text never enter its marker. Unmount prevents late marker publication (`16,20`). The marker is uniquely named `GYM_TRACKER_GARMIN_BRIDGE_DIAGNOSTIC`; source search found no final-verifier or production acceptance consumer of it. A diagnostic `passed` is not a final native verdict, real-account authorization, transport-fidelity proof or release gate.

## C1 — Registry additions are permanent and exact; host fakes stay host-only

The delta registers, rather than excludes, the new integrity work:

- `scripts/phase18-language-coverage.mjs:38-85`: converter source and test, `GarminClientWorkerKt`, `GarminPythonContainers` and `GarminPythonKind`; enum is accurately listed as branchless, not omitted from other counters.
- `modules/garmin-connect/android/build.gradle:58-60`: those factory/converter/enum classes added to JaCoCo report inputs.
- `phase18-language-coverage.mjs:141-195`: all four counters require missed zero/percent exactly 100, zero test skips/failures/errors, exact required classes/cases and source/test hashes.
- `scripts/run-coverage-gate.mjs:162-163,278-279,377-380,833-853,903-916`: **56 uniquely/exhaustively assigned Node test files, 21 Node integrity modules, 15 TS/TSX integrity modules**, and the new actual-route/real-host-SQLite tests included in focused scope. Existing seven-project partition retained; components are added, not removed.
- `run-coverage-gate.test.mjs:98-145` updates the exact expected sets/counts. Four-metric 100% checks remain (`run-coverage-gate.mjs:1083-1085`). Exact added-line inspection found no `.skip`, `.only`, `.todo`, coverage-ignore directive or threshold reduction.

Canned results were explicitly examined, not assumed harmless: the unit test ports mock SQLite, crypto, restore and command boundaries to exercise orchestration (`v12NativeRollbackBridge.test.ts:15-94`; `v12-native-rollback-bridge.test.mjs:13-66`; `v12-rollback-async.test.mjs:12-36`). Their fake receipts are openly marked HOST UNIT ONLY and are not imported by the installed route/CLI. The async test file's fake signer/subprocess preload is test code, not production injection routing. The live bridge rejects test adapter/origin environments and the CLI supplies no dependency overrides. Authority cannot come from the inspection validator alone; it comes from the connected fixed native execution path described in B2-B5.

The genuine host test uses Node AES-GCM, Argon2 and SQLite with actual production codec/restore orchestration, and explicitly labels itself non-native (`tests/sqlite-host/v12RollbackBridge.test.ts:34-83`). It checks the encrypted plaintext absence, format/schema, second restore and tampered-tag rejection. It does not prove Android Expo crypto/KDF bindings. Converter tests use pure host fakes and exercise typed families, bounds, nulls, detached containers, bytes staging and envelope reserve (`GarminPythonContainersTest.kt:6-150`). New MFA tests refuse premature token extraction and check wiping (`GarminTokenStoreTest.kt:643-686`). Python proxy/canonical-expansion regressions remain host-only (`test_garmin_bridge.py:80-107`). Route/root tests exercise actual rendering/orchestration with mocks; no passing mock is called native proof.

## Parent/agent host evidence — read, not independently executed

The following scopes overlap; they are not summed into a fabricated independent total:

| Provided scope | Reported result | Audit interpretation |
|---|---|---|
| Rollback implementation agent | 105 corrective cases | Parent-provided host context only. |
| Parent rollback corrective scope | 194 TS / 71 Node, all relevant four metrics 100% | Not rerun; does not prove native restore. |
| Parent isolation/root scope | 58 cases | Source assertions inspected; not device startup observation. |
| Garmin retained host handoff | 66 Kotlin: 60 repository + 6 supplemental fake-API cases; zero skips/errors/failures | Host API compilation/fakes, not installed Chaquopy runtime. |
| Garmin retained Python host scope | 21 cases, zero skips/errors/failures; all four metrics 100% | Host Python 3.14.8, not Android Python 3.13. |
| Parent credential-free probe/root scope | 63 cases; two new probe modules 100% | Diagnostic host coverage, not native proof. |
| Parent updated registry scope | 173 TS cases overall; 15 TS / 21 Node critical modules; 56 Node files registered | Registration inspected; no aggregate run asserted by auditor. |

The retained Kotlin metric JSON records 7,430/7,430 instructions (statement metric), 637/637 branches, 166/166 methods and 1,159/1,159 lines. Python records 542/542 statements/lines, 206/206 branches and 54/54 functions. All recorded Kotlin source/test/fake/harness input hashes and Python source/test hashes were compared to their retained files and match; counters were parsed, **not reproduced**. The Kotlin report's selected integrity scope is not misrepresented as every compiled class or an Android runtime run.

Retained metrics SHA-256:

- `artifacts/garmin-conversion-host/kotlin-four-metrics.json`: `63c5fda2be85da5af87f33bafebf43f0ba3e4125744eafc4d34d6eb4e370cf8b`.
- `artifacts/garmin-conversion-host/python-four-metrics.json`: `6f32d37f30f4ad176493d178c5e82098cd3cb4bee87a35ee9103f9a514937bcd`.

The retained handoff's implementation commit `654cd84e` is historical agent context; **the audit target is fc20301d**, including the parent's conversion cherry-pick and registry/probe additions. Historical failed/fake harness logs remain non-acceptance evidence. No emulator/Samsung acceptance or account/MFA operation was inferred from them.

## All 49 authored mitigations — exact-base continuation register

**CLOSED** means the authored source mitigation remains intact for this exact batch, not that a native test ran. **U** denotes unchanged controlling source inherited from the preserved exact-base fit report and connected native-corrective baseline. **B1-B6 / G1-G4 / C1** denote directly traced batch controls above. All rows remain disposition `mitigate`; no accept/transfer disposition is introduced.

| Threat ID | Severity | Authored row | fc20301d source assessment |
|---|---|---|---|
| T-20-01-01 | high | `20-01-PLAN.md:112` | CLOSED — C1/U: exact source registry/order/unique complete gates retained. |
| T-20-01-02 | high | `20-01-PLAN.md:113` | CLOSED — B4/B5: actual source/APK/device/owned-lease checks and exact nonce-bound arm/result. |
| T-20-01-03 | high | `20-01-PLAN.md:114` | CLOSED — G4/U: diagnostic/restore receipts cannot self-award final verdict. |
| T-20-01-04 | high | `20-01-PLAN.md:115` | CLOSED — B4/B5/G4: hashed identity, bounded fixed diagnostics, no raw serial/private payload. |
| T-20-02-01 | high | `20-02-PLAN.md:140` | CLOSED — B2/B3/U: real production authenticated restore, current empty target, graph/FK/integrity/exclusive writer. |
| T-20-02-02 | high | `20-02-PLAN.md:141` | CLOSED — B3/B5: committed/reopened canonical facts, one-shot arm, first-failure retention. |
| T-20-02-03 | high | `20-02-PLAN.md:142` | CLOSED — C1/U: ordered native acceptance case set/zero-skip gates not sampled or replaced by probe. |
| T-20-02-04 | high | `20-02-PLAN.md:143` | CLOSED — B3/B5: synthetic archive and digest/count/code-only facts. |
| T-20-03-01 | high | `20-03-PLAN.md:125` | CLOSED — G1/G2/U: actual typed containers; strict private-data/schema and production import transaction/hash unchanged. |
| T-20-03-02 | high | `20-03-PLAN.md:126` | CLOSED — G3/U: generation fencing strengthened; independent provider/match identities unchanged. |
| T-20-03-03 | high | `20-03-PLAN.md:127` | CLOSED — U/B1: Calendar geometry/generation/callback/source validators untouched. |
| T-20-03-04 | high | `20-03-PLAN.md:128` | CLOSED — G2/G3/G4: no token/account/raw response output, existing privacy guard retained. |
| T-20-04-01 | high | `20-04-PLAN.md:145` | CLOSED — C1/U: immutable flow mappings and unsampled source IDs unchanged. |
| T-20-04-02 | high | `20-04-PLAN.md:146` | CLOSED — B4/U: actual owned-device settings/readback/restoration controls retained. |
| T-20-04-03 | high | `20-04-PLAN.md:147` | CLOSED — U: complete exception metadata/separate non-PASS counts unchanged. |
| T-20-04-04 | high | `20-04-PLAN.md:148` | CLOSED — B1/B5/U: isolated synthetic state; screenshot/semantic privacy policies unchanged. |
| T-20-05-01 | high | `20-05-PLAN.md:110` | CLOSED — B4/G4/U: real source/APK/nonce binding; probe marker does not replace user-perceived performance endpoints. |
| T-20-05-02 | high | `20-05-PLAN.md:111` | CLOSED — U: raw arrays/literal counts/limits and recomputation unchanged. |
| T-20-05-03 | high | `20-05-PLAN.md:112` | CLOSED — B5/U: failed/late operations preserved; no cold/failure sample laundering. |
| T-20-05-04 | medium | `20-05-PLAN.md:113` | CLOSED — B2/B4/G1/G2/G4: bounded archive/conversion/fixed probe/deadline; no fixture/cancellation-budget weakening. |
| T-20-06-01 | high | `20-06-PLAN.md:111` | CLOSED — B4/B6: exact runtime source/bytes/device/lease and retained prior signed-byte identity. |
| T-20-06-02 | high | `20-06-PLAN.md:112` | CLOSED — B3/B5/U: await real restore, exact inspection/members, no-clobber manifest-last and sole final rehash. |
| T-20-06-03 | high | `20-06-PLAN.md:113` | CLOSED — U: exception/policy metadata and separate counting untouched. |
| T-20-06-04 | high | `20-06-PLAN.md:114` | CLOSED — B3/B5/G4: synthetic facts/fixed failure sinks; recursive final privacy unchanged. |
| T-20-07-01 | high | `20-07-PLAN.md:105` | CLOSED — G4/U: diagnostic/source report remains observation-only, not attended authority. |
| T-20-07-02 | high | `20-07-PLAN.md:106` | CLOSED — B4/U: exact installed-byte/source/device/PNG acceptance still required. |
| T-20-07-03 | high | `20-07-PLAN.md:107` | CLOSED — U: readiness/exception policy unchanged; report grants no release authority. |
| T-20-07-04 | high | `20-07-PLAN.md:108` | CLOSED — B2/B3/B6: current-parser clean restore of authenticated older archive; no old-APK/new-schema or downgrade claim. |
| T-20-08-01 | high | `20-08-PLAN.md:99` | CLOSED — B4/C1/U: unavailable native bindings fail; host and pending build are not native terminal proof. |
| T-20-08-02 | high | `20-08-PLAN.md:100` | CLOSED — B4/U: frozen-source digest checks retained; fresh final-source build remains mandatory. |
| T-20-08-03 | high | `20-08-PLAN.md:101` | CLOSED — B1/B4/B6/U: byte/signature/package/debug isolation gates not weakened. |
| T-20-08-04 | high | `20-08-PLAN.md:102` | CLOSED — B4/B5: safe operational paths, hash-only identity, fixed diagnostics. |
| T-20-09-01 | high | `20-09-PLAN.md:89` | CLOSED — B2/B3: exact historical/current schema separation, authenticated graph and canonical reopened facts. |
| T-20-09-02 | high | `20-09-PLAN.md:90` | CLOSED — B3/B5/U: genuine awaited commit/close/reopen; receipt/rest/effect replay writers untouched. |
| T-20-09-03 | high | `20-09-PLAN.md:91` | CLOSED — B4/C1/U: source/device/APK/lease revalidation; ordered acceptance registry retained. |
| T-20-09-04 | high | `20-09-PLAN.md:92` | CLOSED — B3/B5: encrypted synthetic input, safe facts/counts/digests only. |
| T-20-10-01 | high | `20-10-PLAN.md:96` | CLOSED — G1/G2/U: typed conversion, same Python/Kotlin privacy/schema and immutable import/digest controls. |
| T-20-10-02 | high | `20-10-PLAN.md:97` | CLOSED — G3/U: session generation and explicit revision-fenced matching preserved. |
| T-20-10-03 | high | `20-10-PLAN.md:98` | CLOSED — U/B1: Calendar measured transition/source identity controls untouched. |
| T-20-10-04 | high | `20-10-PLAN.md:99` | CLOSED — G2/G3/G4: no credential/account/location/payload disclosure or diagnostic transport fallback. |
| T-20-11-01 | high | `20-11-PLAN.md:119` | CLOSED — C1/U: source snapshot/hash/exact flow IDs/immutable references retained. |
| T-20-11-02 | high | `20-11-PLAN.md:120` | CLOSED — B1/B4/U: measured final-source semantic/pixel gates remain required. |
| T-20-11-03 | high | `20-11-PLAN.md:121` | CLOSED — U: fixed performance limits/counts/cold/max/p95/overhead unchanged. |
| T-20-11-04 | high | `20-11-PLAN.md:122` | CLOSED — B1/B5/U: synthetic isolation and unchanged screenshot/trace privacy. |
| T-20-12-01 | high | `20-12-PLAN.md:114` | CLOSED — B5/G4/U: diagnostic cannot award verdict; sole post-checkpoint seal/rehash retained. |
| T-20-12-02 | high | `20-12-PLAN.md:115` | CLOSED — U: owner/Samsung observations cannot change technical verdicts or authorize release. |
| T-20-12-03 | high | `20-12-PLAN.md:116` | CLOSED — B1/B4/B5/G4/U: synthetic/hash-only/safe-path/fixed output and final unique-artifact privacy. |
| T-20-12-04 | high | `20-12-PLAN.md:117` | CLOSED — U: complete rationale/scope/hash/policy metadata and separate counts unchanged. |
| T-20-12-05 | high | `20-12-PLAN.md:118` | CLOSED — B6: bind prior signed bytes/archive/schema; no downgrade, old installed restore or full old-source claim. |

**Reconciliation: 49 unique IDs = 49 CLOSED + 0 OPEN; 48 High + 1 Medium; 49 mitigate + 0 accept + 0 transfer.** This is a continuation of the prior authored mitigation audit, with changed boundaries explicitly retraced, not an assertion that all prior native observations were repeated.

The actual additional surfaces were assessed: private rollback filesystem/crypto/restore route, operational host transport, prior-APK config/signature derivation, typed Python-container boundary and credential-free Garmin route. They map to the existing restore/source integrity, run/build spoofing, privacy, bounded-input and verdict-authority threats above. **No distinct source-supported unregistered security threat was established.** There is no new public auth/API endpoint, provider operation, arbitrary SQL/tool/method/URL forwarding, signing secret, permission, transport fallback, pinned client change or JS-engine switch.

## Unchanged authority and production integrity

Byte comparison across base/target/checkout confirmed unchanged production GTBK contracts/codec, RestoreCommands/repository/preflight adapters, AES-GCM/KDF ports, native runtime/atomic publisher/final verifier, Python bridge, secure DI store, TS native-module API, app config, Garmin plugin/client lock, package/lockfiles, security config and fitted tab source.

The final validator still rejects producer verdicts and test-origin evidence, requires actual source lineage and rollback verification, checks the exact artifact set, then rehashes preseal/shard/contract/native identities before deriving final outputs (`verify-v12-native-evidence.mjs:531-539,1322-1373`). Release authority stays false. New operational files are not final inputs masquerading as accepted native shards. Existing SQLite source/metrics/import ownership, exclusive workout commit acknowledgement, offline critical path, immutable receipt/replay and derived-state rebuild rules are not changed by this batch. No native performance budget was extended, and no old-source audit/failed diagnostic was relabelled final-source acceptance.

## Preservation

A read-only snapshot covered **37 pre-existing Phase 20 Markdown artifacts** before report creation. Each entry records relative path, SHA-256, byte size, mode, inode and nanosecond mtime. Before authoring, the complete sorted metadata/content fingerprint was recomputed and unchanged:

```text
d185f5597dfa2815104bcad5c7d18128cc432d1cb22f3fb90b3c6f5629252e8f
```

The historical report hashes remain their original values; no report was normalized, overwritten, deleted or rebound:

| Existing report | Preserved SHA-256 |
|---|---|
| `20-SECURITY.md` | `fe8557840c888cb51ff180f46aab0c027fa5cc25f5d285b97054249b5628725e` |
| `20-SECURITY-59d9085e.md` | `fe8557840c888cb51ff180f46aab0c027fa5cc25f5d285b97054249b5628725e` |
| `20-NATIVE-CORRECTIVE-SECURITY-6abf53aa.md` | `1193e052fd90d02ada26608dd1d80b68e7bb41ecb4bb68c5aee610d616eb61c7` |
| `20-NATIVE-CORRECTIVE-SECURITY-73ad68ff.md` | `9fc1dc43846974a39de63e71591314f6b56f1f418b5aa6010b5cd7b6e833ecfd` |
| `20-NATIVE-LINT-SECURITY-6722d3de.md` | `47847e36b6c563ff1ebc86dceffdf16c792b93702a4434cc89b5a0913d9a9d6d` |
| `20-OFFLINE-DIAGNOSTIC-SECURITY-e39a8d05.md` | `03a177f3ba68bd5fe4df4010a699eb94d3cef2b2ad2fb1093a093c6f81f38a86` |
| `20-PROGRESS-SORT-SECURITY-05fc397a.md` | `fd0086367ec0b230e9fc1e0aaa98af021eb7e8bf74fb106de2a8883df925a9e7` |
| `20-TAB-LABEL-SECURITY-d9d2e754.md` | `59ffb8cf64a1a87cd41c20136ba8132c31a566ac99002ae0ec6036d93d321605` |
| `20-TAB-WIDTH-SECURITY-b61013b8.md` | `c50ebccf20bab227a0035428b1532711c96486ea78e26bd9ea53b144daaa47db` |
| `20-TAB-FIT-SECURITY-a650a4ac.md` | `0ab1fb01d15e4bc379fa6c69654ae07418da5c8e3d6a2c1f34ecbe003eca885b` |

The snapshot is local preservation evidence, not a new native run or final-source build attestation.

## Exact pinned changed-file fingerprints

Every listed file matched its `fc20301d` Git blob before report creation.

| File | SHA-256 |
|---|---|
| `app/__garmin-bridge-diagnostic.tsx` | `f768d95169208c93556763cdc0eb35e29f3d1a9ec28e15475cac2fd6f85c0d2b` |
| `app/__tests__/garmin-bridge-diagnostic.test.tsx` | `e19faf652cc33d4b0c5c4816c53e06a4ea960b001ff585291ef3a6828d7c0ac5` |
| `app/__tests__/root-layout.test.tsx` | `85d00aaa50151acd75498b5efa2e75af9a4f55bedd4f4f06abcbc4cd955ecd53` |
| `app/__tests__/v12-rollback-bridge.test.tsx` | `db0deb381961f33104007547d4478aa8aa6115cdcfbc189883da79d0995d2a61` |
| `app/__v12-recovery-archive.tsx` | `f17a053a60410c3895ccec00c03ccf3a6ecfe60903207e632b9c9626c58a9fac` |
| `app/_layout.tsx` | `06ed3f4567fb437bd566b4a1997629756fa3ce8c488076916eafd1f95db4b49a` |
| `modules/garmin-connect/android/build.gradle` | `33f1b44dca4352729f28b8ce70b4e12a87c10c98f47c003e907a818ad6a89752` |
| `modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminClientWorker.kt` | `0d83e17b5ee2221c1919469bc80041caf9e0880fef8a84d26d1d4e0b26dfc4bc` |
| `modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminConnectPlatformBindings.kt` | `4577375c4aa53dfb2d4368892b70ad733fc3e59a75750f7b54980ead0d476f11` |
| `modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminPythonContainers.kt` | `df6c499c30c3b0e9b270727d863699f48759799c0b2db62a23466e25559fec90` |
| `modules/garmin-connect/android/src/test/java/expo/modules/garminconnect/GarminPythonContainersTest.kt` | `5c80f44aed7ab9ce945b315b39e97afde6f390f474c704b6c87c8b582d6d8ebb` |
| `modules/garmin-connect/android/src/test/java/expo/modules/garminconnect/GarminTokenStoreTest.kt` | `cde116e4d2469b788b91bcfc4c052f270966840afd1c0430353187790960e39a` |
| `modules/garmin-connect/android/src/test/python/test_garmin_bridge.py` | `d3dcfe6ee49e107eb2f2e42f7b700539cdcfc82f61df743c8ce3e541fa3e39bf` |
| `scripts/phase18-language-coverage.mjs` | `e856a69b98369f8aee8027cc0cafc2c37cc685ce55c96b0c3f8f2d0d42fa19de` |
| `scripts/phase18-language-coverage.test.mjs` | `aa4048ba558b5298dc6aa585c56fa2f6f61d05cfaedaa3cae225b0f5e194f8d9` |
| `scripts/run-coverage-gate.mjs` | `74518a233248e168dfca08f2c4a2fe3e555c03ed60032cf9be7381240f7d7746` |
| `scripts/run-coverage-gate.test.mjs` | `3fb9eab990f4fb4735bfc4861810aab429724a1c5f5529b92afaa70e6398693c` |
| `scripts/v12-native-rollback-bridge.mjs` | `efcc7ddacb34df91aea776aabf5894927edb9ec6b9efc49cbfc9e97d00516792` |
| `scripts/v12-native-rollback-bridge.test.mjs` | `29787315705ce7fbd94355471f8151c024e44e86e7e128bfc80f1c7d43e2cff7` |
| `scripts/v12-rollback-archive-inspection.mjs` | `3018b554cdab04259fe4f542e5bc166600e2a23fb515cb98f3b12d64a1a7f222` |
| `scripts/v12-rollback-async.test.mjs` | `a1f99a353537419a301b3502adcbd4f1cd2592679d8166e370633c9303e0cc00` |
| `scripts/v12-rollback-evidence.mjs` | `3b6063c3138164e644415e671bed8aa11ea60adf30d9b79fbd5f0fabb696713f` |
| `src/testing/garminBridgeDiagnostic.test.ts` | `aa562422487bd90bdc65116f292f50c11506c6e57a637f5892d68744dc75868d` |
| `src/testing/garminBridgeDiagnostic.ts` | `cf5d081bfeeed1d85bf5f8f3f8cacbef5e962c66a5bf4b9ca933e9b6071a5844` |
| `src/testing/v12NativeRollbackBridge.test.ts` | `adef00e57fa923a85e4c6ec644a7ed481bbf4092ab13b5b6db729a2381071b6b` |
| `src/testing/v12NativeRollbackBridge.ts` | `32408be20d7025b662203710eef7b7297c8173f9592823385f4db78659e9dc04` |
| `tests/sqlite-host/v12RollbackBridge.test.ts` | `d3ce739af63e97e628ad13a581d79c23cda96d061b8db74a6078f61d6efc5a51` |

## Final sign-off

- [x] Exact branch/HEAD/base, complete delta and checkout/blob equality independently verified.
- [x] All 49 authored source mitigations reconciled; changed filesystem/native-crypto/auth/lease/publication boundaries traced.
- [x] Real production GTBK/AES-GCM/Argon2/RestoreCommands and exclusive current-schema target; canonical committed/reopened facts and integrity/FK checks retained.
- [x] Exact source/APK/device/owned lease/offline/expiry/nonce/result binding and first-failure/no-clobber boundaries inspected.
- [x] Typed actual Python containers, None-safe tokens, envelope reserve, unchanged private-data schema/limits and connected-only login/MFA handoff inspected.
- [x] New credential-free route isolated from production startup and account operations; marker has no final-verdict authority.
- [x] Permanent source/hash/class/test scopes and four-metric 100% policy retained; no guard/ignore/threshold weakening.
- [x] Only requested report authored; historical hashes/reports/host artifacts/failures preserved.
- [ ] Independent host execution — **NOT_RUN**.
- [ ] Fresh final-source native rollback and installed Python 3.13/ARM64 probe — **NOT_RUN / PENDING**.
- [ ] Samsung final native/visual/semantic/account acceptance and production readiness — **PENDING / NO**.
- [ ] Release authorization or professional ASVS certification — **NOT_GRANTED / NOT_CLAIMED**.

**AI-assisted review limitation:** This bounded read-only source continuation can miss subtle vulnerabilities. It is not a professional security audit, comprehensive ASVS certification, runtime/binary guarantee or substitute for fresh final-source native evidence and the final release review.
