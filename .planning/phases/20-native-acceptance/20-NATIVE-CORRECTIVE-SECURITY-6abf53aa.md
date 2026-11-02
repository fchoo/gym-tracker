---
phase: 20
slug: native-acceptance
status: verified
audit_scope: independent-read-only-native-corrective-source-delta
exact_sha: 6abf53aa63eca6eb15a949de77caf1c8c4d08449
independent_source_sha: 6abf53aa63eca6eb15a949de77caf1c8c4d08449
base_sha: 898ae5f2cacca08f3457af1d66d3c573c09cd68c
branch: agent-p20-native-final-security-6abf53aa
threats_total: 49
threats_closed: 49
threats_open: 0
blocking_threats_open: 0
findings_total: 0
unregistered_flags: 0
warnings: 0
accepted_risks: 0
transfer_risks: 0
asvs_level: 1
block_on: high
score: 100
native_proof: not_run
native_proof_not_run: true
native_acceptance_pending: true
release_authorized: false
created: 2026-10-22
---

# Phase 20 — Independent Native-Corrective Source Security Audit

## Conclusion

**VERIFIED — source security only.** No concrete Critical, High, Medium, or Low security finding was established in the complete corrective delta `898ae5f2cacca08f3457af1d66d3c573c09cd68c..6abf53aa63eca6eb15a949de77caf1c8c4d08449`. The **49 authored mitigations remain closed at the source-control level**: 48 High threats and one Medium threat, all disposition `mitigate`. There are zero open blocking threats, unregistered flags, warnings, accepted risks, or transferred risks.

**Score: 100/100 for this scoped source-security continuity review, ASVS L1, blocking threshold High.** This is not a claim of comprehensive ASVS certification, independently reproduced coverage, binary correctness, native acceptance, account authentication, or production release readiness.

**Native proof was not run.** The changed source requires a fresh source-bound native build and exclusive-device evidence. The failed native run at `898ae5f2` remains failed historical evidence, not proof for this SHA. Neither that run nor diagnostic observations can be relabelled PASS. This report grants **no release authority**.

## Identity, scope, and constraints

- Exact checkout: `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security`.
- Branch and HEAD independently read back as `agent-p20-native-final-security-6abf53aa` and `6abf53aa63eca6eb15a949de77caf1c8c4d08449`, including at the end of source inspection. The supplied base is an ancestor of HEAD.
- All 34 changed files were inspected through source reads and the exact Git delta: 16 source/tooling files, 17 test files, and `AGENTS.md` process guidance.
- Existing untracked `20-SECURITY.md`, `20-SECURITY-59d9085e.md`, and `node_modules` were present before this audit and preserved. No dependency directory was installed, modified, or treated as new independent execution proof.
- No source edit, test execution, dependency install, new worktree, branch switch, build, ADB/device action, native command, signed production build, credential read, account sign-in, fetch/sync, commit, push, or PR action was performed.
- Only this new report was authored. Old reports, immutable failed runs, and parent metadata were not overwritten.
- Method: read-only security tracing using the CSO finding/confidence discipline, restricted to the requested delta and connected controls. Broad secret archaeology, dependency audits, global skill scans, active probes, and test/build execution were deliberately outside scope. No extra reviewer was launched; the separately assigned code reviewer is not represented as verification performed by this auditor.
- Source security is independent of the parent's execution results. Unchanged mitigations are retained from the preserved baseline only after checking whether this delta invalidates their controlling source, not counted as fresh native observations.

## Authority and baseline

| Input | Source read and interpretation |
|---|---|
| Root instructions | `AGENTS.md:1-38`; read-only pinning, immutable evidence, bounded real checkpoints, and exclusive device use are compatible with this assignment. Its two added lines are process guidance, not runtime controls. |
| Security configuration | `.planning/config.json:47-49`: `"security_enforcement": true`, `"security_asvs_level": 1`, `"security_block_on": "high"`. |
| Source precedence | `.planning/design/v1.2-SOURCE-PRECEDENCE.md:3-7,11-13,24-39`; owner decisions first, existing domain integrity authoritative, selected standalone ARM64 Garmin topology, no fixture-to-production fact promotion. |
| Owner bounds | `.planning/v1.2-OWNER-DECISIONS.md:35-61,78-108` and `.planning/v1.2-OWNER-BRIEF.md:52-76,131-155`; embedded runtime, narrow account-scoped Garmin reads, foreground credentials/MFA, tokens excluded from logical backups/Drive, immutable offline SQLite facts. These documents are product context, not new execution authorization. |
| Source-fact invariants | `.trae/rules/rules.md:16-23`; SQLite authoritative, derived effects replayable, no set acknowledgement before exclusive commit, ownership boundaries, offline workout path. |
| Authored register | The threat tables in all existing `20-01-PLAN.md` through `20-12-PLAN.md` were read. They contain 49 distinct IDs; Plan 20-12 has five, the other eleven have four each. Exact table-row locations are listed below. No plan or threat table was changed in the audited delta. |
| Preserved baseline | `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/.planning/phases/20-native-acceptance/20-SECURITY.md:1-21,79-131,152-159` binds its independent source result to `898ae5f2cacca08f3457af1d66d3c573c09cd68c`, records 49/49 closed, and expressly leaves native proof pending. The older worktree report at `59d9085e` was read for receipt/merge context, not mistaken for the requested base. |
| Prior flags | `20-04-SUMMARY.md:130-132` says no flags for that earlier plan. That statement does not erase the actual devtest capability change in this delta; the new change was assessed separately below. |

Unless otherwise stated, file/line references below are relative to the pinned audit checkout and refer to HEAD `6abf53aa63eca6eb15a949de77caf1c8c4d08449`.

## Findings and calibration

| Severity | Concrete findings |
|---|---:|
| Critical | 0 |
| High / blocking | 0 |
| Medium | 0 |
| Low | 0 |
| Unregistered security flags | 0 |

No speculative warning is promoted. The control assessments below have **9/10 source-tracing confidence**, not runtime/binary confidence. A parser's intermediate output is not equated to accepted evidence: the downstream validator and actual caller were traced. Likewise, tests were read as regression assertions, not executed as proof. With no established finding, there is no exploit scenario or remediation to apply.

## Corrective controls traced

### C1 — One execution per nonce; complete bounded CASE/RESULT publication

`src/testing/v12NativeContractLogTransport.ts:3-4,17-36` bounds the process registry to eight entries, validates the run ID before dispatch, returns the existing promise for repeated mounts, and stores it before scheduling work. Rejected promises are retained, so the same failed nonce does not silently start a competing SQLite retry.

Verbatim dispatch boundary, `src/testing/v12NativeContractLogTransport.ts:30-34`:

```ts
      // Store before dispatch so a second mount cannot start competing SQLite work.
      // Rejections remain retained too: a failed nonce is not silently retried.
      const execution = Promise.resolve().then(execute);
      executions.set(runId, execution);
      return execution;
```

`app/__native-contracts.tsx:111,436-448,541-555` creates the registry at module scope and puts the real aggregate execution **and log emission** inside `onceForNonce`. It therefore shares work across route remounts rather than only sharing a component-local flag. Production route execution remains gated by `nativeContractsEnabled === true`; disabled routes redirect at `613-615`.

`src/testing/v12NativeContractLogTransport.ts:8-14,39-60` measures UTF-8 bytes, prepares every frame before the caller emits any, preserves the complete case object including source facts, binds each CASE and the summary RESULT to the same run ID, and rejects frames above 3,840 bytes. It does not truncate facts or turn a failed outcome into a success. The RESULT frame is last.

Verbatim frame bindings, `src/testing/v12NativeContractLogTransport.ts:49,55`:

```ts
    const frame = `${CASE_MARKER}${JSON.stringify({ runId, case: contractCase })}`;
  const resultFrame = `${RESULT_MARKER}${JSON.stringify({ runId, summary })}`;
```

Regression assertions inspected: `src/testing/v12NativeContractLogTransport.test.ts:18-101` covers shared pending execution, retained rejection, capacity, all ten categories/eleven frames, multibyte overflow, and failed outcomes. These assertions were not run here.

### C2 — Current receiver rejects raw legacy results; acceptance validates full shape

The current native collector generates `v12-` plus 16 random bytes at `scripts/v12-production-native-runtime.mjs:212-214`. This is exactly the namespace for which `scripts/native-contract-log-transport.mjs:40-55` rejects unbound legacy results, wrong nonce, null/array/nonobject summaries, noninteger or out-of-range totals. `56-75` rejects missing/malformed cases, count mismatch, duplicate IDs, and foreign records rather than joining records from another nonce.

Verbatim current-request rejection, `scripts/native-contract-log-transport.mjs:46-48`:

```js
    // Current acceptance requests require the route-owned nonce envelope.
    // Raw legacy results must not satisfy a fresh Phase 20 collection.
    return /^v12-[a-f0-9]{32}$/u.test(runId) ? undefined : latest;
```

The transport parser is framing, **not the sole result validator**. In `scripts/v12-production-native-runtime.mjs:218-231`, the caller derives ten canonical category IDs from current source and invokes `assertV12AcceptanceNativeContractResult` before returning success. `scripts/v12-sqlite-producer-contract.mjs:41-84` then requires exact summary/case/count/source-fact keys, expected category order/count, literal passed codes/status, unique valid source entries, `failed === 0`, `skipped === 0`, and recursive privacy safety. Thus an incomplete intermediate object or a total-zero parser result cannot satisfy current acceptance. Legacy parser compatibility is retained for older callers, not used as a current V12 bypass.

Source ownership is also checked inside the real aggregate: `src/testing/contracts/v12Acceptance.contract.ts:199-210,213-246,249-275,342-384` requires exact source registry order/count, covered source definitions, no skipped registry, consistent category IDs/counts/source statuses, and failure isolation. Raw cases/facts are produced by actual source wrappers rather than the receiver fabricating passing facts.

Regression assertions inspected: `scripts/v12-native-contract-log-transport.test.mjs:49-81` covers legacy compatibility versus current rejection, malformed summaries/cases, incomplete/duplicate/foreign records; the existing producer validator remains unchanged.

### C3 — Literal owned dotted namespace and fixed deadlines, not fabricated liveness

`scripts/native-contract-log-transport.mjs:95-109` binds progress to the requested run, requires a bounded stage string, and accepts only the **literal** optional dotted `v1.2-acceptance:` prefix before the existing code-label grammar. It does not generalize arbitrary dotted namespaces or permit email/private-path text.

Verbatim stage gate, `scripts/native-contract-log-transport.mjs:105-107`:

```js
      && payload.runId === runId
      && typeof payload.stage === "string"
      && /^(?:v1\.2-acceptance:)?[a-z0-9_:-]{3,80}$/iu.test(payload.stage)
```

`scripts/v12-production-native-runtime.mjs:222-237` remains unchanged: 20-minute absolute operation loop, 30-second progress-stall cutoff, and 250ms polling. Only a changed stage updates `progressedAt`; repeated identical stages do not. The absolute start is not reset. There is no added heartbeat, timer-driven completion, budget extension, stall override, or timeout-to-PASS path in the delta. `scripts/v12-native-time-budgets.mjs` and the performance source/thresholds are unchanged.

Regression assertions inspected: `scripts/v12-native-contract-log-transport.test.mjs:17-34` verifies the actual namespace, newest genuine transition, repeated-stage handling, foreign nonce and unowned namespace rejection.

### C4 — Progress follows real canonical cases and awaited rollback/close/reopen work

Verbatim operation boundary, `src/testing/contracts/contractProgress.ts:19-22`:

```ts
  reportContractProgress(observer, `${operation}:start`);
  const result = await work();
  reportContractProgress(observer, `${operation}:done`);
  return result;
```

`contractProgress.ts:4-11` swallows only diagnostic observer exceptions. `observeContractOperation` neither catches the work rejection nor emits `done` for rejected/pending work. The helper does not manufacture a result or skip cleanup.

- `src/testing/contracts/v12Acceptance.contract.ts:277-319` forwards registry-scoped checkpoints through the one shared source-results promise, including the SQLite adapter's real case-start callback. Each real wrapper runs once; later category consumers reuse that promise at `320-339`.
- `src/testing/contracts/migrationsEffects.contract.ts:294-342` emits each real statement-cut start before opening/running the fault scenario, awaits rollback assertions through `withFreshRuntime`, and emits completion only after native close. `withFreshRuntime` awaits close in `147-162`. The before/after cuts remain exhaustive over `INITIAL_SCHEMA_STATEMENTS`.
- `src/testing/contracts/multiPlanRunning.contract.ts:114-139,176-238` observes actual open, migration, assertions, close, reopen, query readback, and reclose. Expected migration failure is recorded only after the awaited action actually rejects. Reopen starts after close resolves. Readback completion denotes completed queries, not an early case PASS: the failure/version/table invariants still run at `202-203`.
- `src/testing/contracts/multiPlanRunning.contract.ts:905-931` injects a **real nested portable matrix** using `multi-plan-running-${runId}-merge-rebuild`, not the old constant database namespace for the current native path. Nested progress is forwarded with a fixed `portable-merge:` prefix. The existing merge-rebuild case still awaits the result and rejects failure at `839-844`.
- Canonical case start/status transitions remain at `migrationsEffects.contract.ts:1053-1097`, `multiPlanRunning.contract.ts:933-961`, `portableMerge.contract.ts:1285-1310`, `googleDriveBackup.contract.ts:153-171`, and `progressParity.contract.ts:306-328`. Their registries are not sampled or shortened.
- Drive's `durable` checkpoint wraps an actual SQLite companion scenario (`googleDriveBackup.contract.ts:84-149,161-165`); it is not a cloud credential/account operation. Progress parity status is reported after its close await. Existing matrix-cleanup suppression in migrations/portable merge is unchanged; multi-plan/Drive/progress cleanup rejection semantics are unchanged as well. This delta did not replace real cleanup outcomes with observer success.

Regression assertions inspected include real host SQLite through the actual three-cut adapter, delayed close before reopen, delayed/rejected readback, nested 19-case merge, throwing observers, failure statuses, and cleanup outcomes: `multiPlanRunning.contract.test.ts:70-221,242-265`, `tests/sqlite-host/migrations-effects.test.ts:3063-3180`, `contractProgress.test.ts:4-30`, plus the changed Drive/merge/progress/aggregate test files. These are authored assertions, not native reproductions.

### C5 — Intentional debug access is exactly devtest, with DUMP service protection

Verbatim capability selection and assignment, `plugins/withAndroidPhysicalTestService.ts:39-52`:

```ts
const withAndroidPhysicalTestService: ConfigPlugin = (config) => {
  const enabled = config.extra?.buildProfile === 'development-test'
    && config.extra?.nativeContractsEnabled === true
    && config.android?.package === 'com.fchoo.gymtracker.devtest';
  if (!enabled) {
    return config;
  }

  config = withAndroidManifest(config, (manifestConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifestConfig.modResults,
    );
    // run-as needs this manifest capability; keep release BuildConfig.DEBUG false.
    application.$['android:debuggable'] = 'true';
```

This is an **actual local debug capability expansion for the installed devtest package**. It is not described as no surface change. The manifest-only change enables run-as/debug access under the authorized local-device trust boundary; it does not alter the release Gradle debug variant or the production package.

The existing exported service remains permission-protected (`withAndroidPhysicalTestService.ts:65-70`):

```ts
        'android:name': serviceClass,
        'android:exported': 'true',
        'android:permission': 'android.permission.DUMP',
```

The generated service retains only `benchmark`/`argon2` suite selection and a 900,000ms timeout at `15-37`. `scripts/assert-generated-android.mjs:309-313,338-357` requires the main application capability and protected service; its existing package, permission, backup, D2D, Hermes, and New Architecture gates remain.

This capability belongs only to disposable devtest evidence under exclusive device ownership. It is **not permission to ship debuggable production or use a devtest package as a personal-data production release**. Production package isolation and forbidden debug controls are traced in C7. New manifest access is mapped to the existing build/run spoofing and artifact-disclosure threats (T-20-01-02/04, T-20-06-01/04, T-20-08-03/04); no distinct unmapped security threat was established.

Regression assertions inspected: `plugins/withAndroidPhysicalTestService.test.ts:21-69` checks idempotence, wrong/missing profile/package/hooks, no Gradle mod, DUMP protection and service source; `scripts/assert-generated-android.test.mjs:49-76` rejects missing/component-only flags and retains identity/backup/service guards.

### C6 — Compiled binary capability and release DEBUG=false checked before publication

`scripts/validate-development-test-native-access.mjs:11-29` requires one exact devtest package badging record, one valid application record, and one affirmative `application-debuggable` marker. It separately checks the generated **release** `BuildConfig.java`: devtest package/application ID, `BUILD_TYPE = "release"`, and the sole literal `boolean DEBUG = false;`, after stripping comments.

`scripts/validate-development-test-native-access.mjs:31-46` invokes only executable `aapt`, or `aapt2` if aapt is unavailable, beneath the selected SDK's **`build-tools/36.0.0`**. It passes `dump badging` and the APK as an argument vector, not shell interpolation. Tool output is captured with a 1MiB buffer and 30-second call timeout. Missing/failed tools, missing source, bad shape, or mismatched capabilities fail closed. Failure does not fall back to an unpinned PATH tool. The SDK/install is a trusted local preflight input; this audit did not independently verify installed tool bytes or versions.

Verbatim invocation, `scripts/validate-development-test-native-access.mjs:36-45`:

```js
    const buildTools = path.join(androidHome, 'build-tools/36.0.0');
    const tool = ['aapt', 'aapt2'].map(name => path.join(buildTools, name)).find(candidate => {
      try { accessSync(candidate, constants.X_OK); return true; } catch { return false; }
    });
    if (tool === undefined) invalid();
    const badging = execFileSync(tool, ['dump', 'badging', apkPath], {
      encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    validateCompiledDevtestBadging(badging);
```

The call at `scripts/build-current-native-test-apk.sh:382-386` is after `:app:assembleRelease` (`365-375`) and the embedded config/bundle check (`376-380`), but **before** copying retained bytes (`393-399`), install (`401`), or no-clobber publication (`567-581`). Missing debug capability cannot be published as a completed acceptance build. Embedded JS remains required by `scripts/validate-development-test-app-config.mjs:24-33,52-69`; manifest debuggability does not enable release `BuildConfig.DEBUG` or make Metro a runtime dependency.

The new validator emits no badging/BuildConfig/tool stderr/private path. Its CLI has a constant rejection at `49-58`. Existing build cleanup and failed-claim handling at `build-current-native-test-apk.sh:184-201` remain intact. Installed/retained byte equality, signature/certificate checks, source digest, hashed device identity, and manifest-last publication remain at `317-322,395-431,455-462,494-558,567-581`.

Regression assertions inspected: `scripts/validate-development-test-native-access.test.mjs:52-116` includes malformed/duplicate badging, incorrect package/DEBUG/build type, pinned aapt2 fallback, unavailable/failed tools, and sanitized CLI output. `scripts/build-current-native-test-apk.test.mjs:72-117` checks ordering and that missing capability/release DEBUG=true/tool failure reaches neither install nor artifact publication.

**Limit:** the gate reads the compiled binary manifest via badging and generated release BuildConfig source. This source audit did not execute the gate, inspect DEX, or establish that a final APK has these properties. Native proof remains pending.

### C7 — Production remains nondebuggable, hooks false/suite null, ARM64 selected

`app.config.ts:27-43,66-70,114-117` defaults to production, rejects unsupported profiles, assigns distinct packages, forces production suite null regardless of the requested acceptance environment, and sets native hooks only for development-test.

Verbatim raw hook check, `scripts/assert-generated-production-android.mjs:42-45`:

```js
export function validateProductionNativeContractConfig(config) {
  return config.extra?.nativeContractsEnabled === false && config.extra?.nativeContractSuite === null
    ? [] : ["production native contract hooks must be false and suite null"];
}
```

The fallback at `assert-generated-production-android.mjs:104-126` evaluates `app.config.ts` through the config factory directly under `GYM_TRACKER_BUILD_PROFILE: "production"`, then applies this check to the **raw factory result**, not the Expo-serialized null representation. A parsed cache with enabled hooks/non-null suite is rejected at `89-103` rather than silently ignored. Thus serialized `{}` is not misinterpreted as owner-approved null. This review did not run Expo or independently reproduce serialization.

`assert-generated-production-android.mjs:52-81` requires production identity, exact `reactNativeArchitectures=arm64-v8a`, absent or literal-false application debuggability, no literal release debugging override/`debuggableVariants` release inclusion, no instrumentation, no devtest identity/service, and retained backup/D2D exclusions. A normal debug build type is not confused with shipping a debug-enabled release. `scripts/build-release-candidate-once.sh:54-69` runs the assertion after production generation and before signing configuration/compile; the signed build itself was not invoked here.

The selected Garmin topology is preserved, not weakened to satisfy generation: `plugins/withGarminConnectModule.ts:18-26,60-89` still sets ARM64, Chaquopy 17.0, Python 3.13, ARM64 ABI filters, locked artifacts and no-deps pip options. That plugin, native Garmin source, and Python lock are unchanged in this delta. `plugins/withPhase20QualityInstrumentation.ts:13-19,27-45` remains devtest/hook/acceptance-suite gated and targets devtest. The production generated-manifest check independently rejects instrumentation.

Regression assertions inspected: `scripts/assert-generated-production-android.test.mjs:27-131` covers main/release debug flags, instrumentation/service, poisoned cache, raw factory hooks, and absent/widened/non-ARM64 properties. The one changed legacy Phase 5 assertion now expects the owner-selected ARM64 contract and explicitly rejects the widened legacy ABI set (`scripts/phase5-evidence-scripts.test.mjs:1687-1705`); it does not delete Chaquopy or widen supported ABIs.

### C8 — Permanent 19-Node / 10-TS / 54-file gates; no new skip/ignore weakening

`scripts/run-coverage-gate.mjs:147-235,271-290,367-391,823-853,894-909` registers the new transport/access tests, new critical modules, and helper tests. Discovery must equal the 54-file manifest; assignment must be unique/exhaustive across seven projects, and the unique Node critical module count must be 19. The TS integrity list contains ten modules, including `v12NativeContractLogTransport.ts` and `contractProgress.ts`. All four metrics remain exactly 100 at `379-381,1067-1074`.

Verbatim aggregate assignment guard, `scripts/run-coverage-gate.mjs:840-845`:

```js
if (JSON.stringify(phase20EvidenceProjects.map(({ name }) => name)) !== JSON.stringify(expectedPhase20ProjectNames)
  || assignedPhase20Tests.length !== 54
  || new Set(assignedPhase20Tests).size !== 54
  || JSON.stringify([...assignedPhase20Tests].sort()) !== JSON.stringify(registeredPhase20EvidenceTests)
  || assignedPhase20Modules.size !== 19
  || phase20EvidenceProjects.find(({ name }) => name === "cli-blackbox")?.coverage !== false) {
```

`scripts/phase20-subprocess-coverage.mjs:247-254,322-363` remains unchanged and rejects skipped-test reports, missing module coverage, and any metric below 100. Existing noncoverage fixture projects do not remove a registered critical module from coverage. Existing focused/skip-evidence CLI options are not new acceptance authority; a partial focused run is not treated here as a passing complete aggregate.

No new `.skip`, `.only`, `.todo`, name-filtered test invocation, coverage-ignore directive, threshold reduction, or ignore/config exclusion was introduced in the audited delta. No coverage/test result is claimed from merely reading registry assertions. Changes to `run-coverage-gate.test.mjs` assert 54 unique tests, 19 Node modules, ten TS modules, complete discovery and unchanged metrics; `src/domains/shared/tooling.test.ts:141-150` preserves release/bundle/no-debug-build and gate-before-install assertions.

### C9 — Privacy, path/provenance, failure, cleanup, credential/account continuity

Changed frames/progress contain nonce, fixed registry/case labels, allowlisted status/codes, and counts/source case outcomes—not raw SQLite rows, Garmin JSON, email, account namespace, coordinates, credentials, tokens, or local device serials. `app/__native-contracts.tsx:263-270,598-608` retains bounded error codes. `scripts/native-contract-log-transport.mjs:78-109` rejects unbounded/private-shaped failure/progress strings. The new compiled-access CLI captures tool material and emits only a constant rejection (C6).

Connected retained controls are unchanged:

- `scripts/v12-artifact-privacy.mjs:3-8,25-66`: recursive normalized-key and string scanning, private-location/JWT checks, safe relative artifact names, UTF-8 validation, JSON parsing before publication.
- `scripts/v12-atomic-shard-publication.mjs:47-67,174-218,243-257,299-308,388-408,488-517`: safe ancestry/symlink rejection, nonce/birth owner claim, write-once files, bounded failure code plus raw-error digest, privacy checks, durable no-clobber members and manifest-last publication. The baseline Linux ownership fix is not modified.
- `scripts/v12-production-native-runtime.mjs:28-45,53-83,85-110,148-209`: source/APK/device binding, safe retained paths, captured/sanitized subprocess failure, exact `adb -s` binding, exclusive device lease, restore readback and retained lease on restore failure. Nonce-scoped SQLite collection does not clear global logs or app data (`212-217`). No device command was executed by this auditor.
- `scripts/v12-native-execution-origin.mjs:51-79,117-147,166-184,231-247`: existing explicit-path native tool selection and source/byte-bound execution-origin attestations remain intact. The new aapt helper is path-pinned locally; it is not claimed to create a new cryptographic tool attestation.
- `scripts/v12-sqlite-shard.mjs:189-264,267-280`: source/build identity revalidation; reject prior outputs; retain bounded native/translation failures; CLI atomic failure publication keeps first receipt. Failed current observations cannot be translated into a passed shard.
- `scripts/verify-v12-native-evidence.mjs:531-539,575-592,609-629,658-680,1348-1373`: producer verdict rejection, privacy enforcement, observation-only attended record, FAIL/NOT_RUN/REVIEW_REQUIRED precedence, separate exceptions, source rehash before final derivation, and `release_authorized: false` remain unchanged.

No changed production Garmin transport, auth/token store, backup/Drive integration, account matching, native bridge, dependency/lockfile, or app credential handling invalidates the retained baseline. Reading static variable names in build/config source is not reading credential values. No credentials or account payloads were read or logged by this audit.

### C10 — SQLite source facts, offline commit acknowledgement, receipt immutability untouched

Exact source-delta inspection shows **no implementation change** under `src/platform/`, `modules/`, or production `src/domains/`; the sole domain-tree change is `src/domains/shared/tooling.test.ts`. In particular, merge/restore planners, exclusive writers, migrations/immutable-receipt triggers, source generation, workout commit/acknowledgement, and offline workout runtime are unchanged from the base.

The changed testing adapters execute existing production SQLite/kernel/migration/repository controls in isolated run-scoped databases, with fixed synthetic fixtures. They do not add a UI SQL writer, network-dependent workout commit, mutable production receipt, ownership bypass, or receipt-result remapping change. Baseline closure for those production mitigations is retained by source non-invalidation, not by claiming to rerun their prior tests.

## All 49 authored mitigations re-evaluated

**CLOSED** means the authored source mitigation remains intact for this delta. It does not mean the native case has been independently run. `U` means the controlling subsystem is unchanged from the preserved `898ae5f2` baseline; changed shared privacy/identity edges were still traced through C1–C9. Every row remains disposition `mitigate`.

| Threat ID | Authored category / component | Severity | Authored row | Delta assessment |
|---|---|---|---|---|
| T-20-01-01 | Tampering / source registries | high | `20-01-PLAN.md:112` | CLOSED — C2/C8: exact canonical registry order/coverage and unique exhaustive gate assignments retained. |
| T-20-01-02 | Spoofing / run/build identity | high | `20-01-PLAN.md:113` | CLOSED — C1/C2/C5/C6/C9: fresh nonce frames, exact devtest capabilities, source/APK/device binding. |
| T-20-01-03 | Elevation of Privilege / verdict vocabulary | high | `20-01-PLAN.md:114` | CLOSED — C9: sole-validator derivation unchanged; no debug-to-release authority. |
| T-20-01-04 | Information Disclosure / identity fields | high | `20-01-PLAN.md:115` | CLOSED — C3/C6/C9: bounded stages/errors, captured badging, hashed device/safe artifacts. |
| T-20-02-01 | Tampering / migration/restore/merge | high | `20-02-PLAN.md:140` | CLOSED — C4/C10: actual cuts and nested merge; production transaction/graph/FK controls U. |
| T-20-02-02 | Repudiation / commit/replay | high | `20-02-PLAN.md:141` | CLOSED — C1/C4/C10: retained failed nonce, awaited rollback close/reopen; receipt/replay implementation U. |
| T-20-02-03 | Spoofing / native case set | high | `20-02-PLAN.md:142` | CLOSED — C1/C2/C4/C8: complete bound frames and zero-skip canonical source loops. |
| T-20-02-04 | Information Disclosure / result payload | high | `20-02-PLAN.md:143` | CLOSED — C1/C2/C3/C9: source statuses/counts only, downstream exact-key/privacy checks. |
| T-20-03-01 | Tampering / Garmin JSON/receipt | high | `20-03-PLAN.md:125` | CLOSED — U/C10: Garmin normalization/hash/transaction controls unchanged; C2 retains Garmin source facts. |
| T-20-03-02 | Spoofing / provider/match identity | high | `20-03-PLAN.md:126` | CLOSED — U/C9/C10: account-scoped identity and revision-fenced explicit matching unchanged. |
| T-20-03-03 | Tampering / Calendar trace | high | `20-03-PLAN.md:127` | CLOSED — U: geometry/generation/callback validators and source implementation unchanged. |
| T-20-03-04 | Information Disclosure / Garmin/trace artifacts | high | `20-03-PLAN.md:128` | CLOSED — U/C9: no new raw payload/account/token path; recursive artifact privacy retained. |
| T-20-04-01 | Tampering / flow/state mapping | high | `20-04-PLAN.md:145` | CLOSED — U/C8: flow snapshots/mappings unchanged; no registry sampling added. |
| T-20-04-02 | Spoofing / device configuration | high | `20-04-PLAN.md:146` | CLOSED — U/C9: measured settings, exclusive lease and restoration controls unchanged. |
| T-20-04-03 | Repudiation / accepted exception | high | `20-04-PLAN.md:147` | CLOSED — U/C9: metadata/separate counts and non-PASS precedence unchanged. |
| T-20-04-04 | Information Disclosure / screenshots/semantics | high | `20-04-PLAN.md:148` | CLOSED — U/C9: synthetic fixture and artifact privacy gates unchanged. |
| T-20-05-01 | Spoofing / marker/build identity | high | `20-05-PLAN.md:110` | CLOSED — C1/C3/C5/C6/C9: real nonce markers, release variant/bundle, compiled capability prerequisite. |
| T-20-05-02 | Tampering / samples/thresholds | high | `20-05-PLAN.md:111` | CLOSED — U/C3: performance arrays/limits/counts and deterministic recomputation unchanged. |
| T-20-05-03 | Repudiation / cold/failure samples | high | `20-05-PLAN.md:112` | CLOSED — U/C9: failure retention unchanged; no timeout/diagnostic promotion into PASS. |
| T-20-05-04 | Denial of Service / maximum fixtures | medium | `20-05-PLAN.md:113` | CLOSED — U: reviewed fixture bounds/yield/cancel source unchanged; no budget relaxation. |
| T-20-06-01 | Spoofing / build/run identity | high | `20-06-PLAN.md:111` | CLOSED — C5/C6/C7/C9: exact package/capability/profile/bundle and existing byte/device checks. |
| T-20-06-02 | Tampering / final evidence | high | `20-06-PLAN.md:112` | CLOSED — C1/C2/C8/C9: complete cases; safe immutable artifacts and sole seal-time validator unchanged. |
| T-20-06-03 | Repudiation / accepted exception | high | `20-06-PLAN.md:113` | CLOSED — U/C9: exception/policy metadata and separate counting unchanged. |
| T-20-06-04 | Information Disclosure / reports | high | `20-06-PLAN.md:114` | CLOSED — C3/C6/C9: sanitized diagnostics, synthetic outputs, recursive rejection unchanged. |
| T-20-07-01 | Elevation of Privilege / attended record | high | `20-07-PLAN.md:105` | CLOSED — U/C9: observation-only/forbidden authority fields unchanged. |
| T-20-07-02 | Spoofing / Samsung/APK identity | high | `20-07-PLAN.md:106` | CLOSED — U/C6/C9: installed/retained/signature/source/device identities retained. |
| T-20-07-03 | Repudiation / readiness/exceptions | high | `20-07-PLAN.md:107` | CLOSED — U/C9: separate counts/reviewed policy unchanged; this report grants no release. |
| T-20-07-04 | Tampering / rollback | high | `20-07-PLAN.md:108` | CLOSED — U: prior archive/APK/schema and forward-fix boundary unchanged. |
| T-20-08-01 | Spoofing / terminal/preflight status | high | `20-08-PLAN.md:99` | CLOSED — U/C6/C8: predecessor/doctor gates retained; unavailable compiled-tool prerequisite fails closed. |
| T-20-08-02 | Tampering / frozen source/build | high | `20-08-PLAN.md:100` | CLOSED — C6/C9: clean source digest/single-build claim and immutable publication retained. |
| T-20-08-03 | Spoofing / retained/installed APK | high | `20-08-PLAN.md:101` | CLOSED — C5/C6/C7: compiled manifest checked before retention/install; byte/signature checks retained. |
| T-20-08-04 | Information Disclosure / build manifest | high | `20-08-PLAN.md:102` | CLOSED — C6/C9: new helper leaks no badging/private path; V12 build metadata remains bounded. |
| T-20-09-01 | Tampering / migration/portability | high | `20-09-PLAN.md:89` | CLOSED — C4/C10: truthful actual fault/close/reopen checks and nonce-scoped nested canonical merge. |
| T-20-09-02 | Repudiation / lifecycle/replay | high | `20-09-PLAN.md:90` | CLOSED — C1/C4/C10: genuine awaited cuts and rejection retention; production receipts/rest/effects U. |
| T-20-09-03 | Spoofing / artifact/case identity | high | `20-09-PLAN.md:91` | CLOSED — C1/C2/C4/C9: fresh nonce, complete ordered cases, source/APK/device/fixture revalidation. |
| T-20-09-04 | Information Disclosure / reports | high | `20-09-PLAN.md:92` | CLOSED — C2/C3/C6/C9: synthetic source outcomes, bounded codes/counts/hash identities only. |
| T-20-10-01 | Tampering / Garmin JSON/receipt | high | `20-10-PLAN.md:96` | CLOSED — U/C10: selected transport/hash/schema/transaction code unchanged. |
| T-20-10-02 | Spoofing / provider/match | high | `20-10-PLAN.md:97` | CLOSED — U/C9/C10: provider/account identity and explicit candidate fence unchanged. |
| T-20-10-03 | Tampering / Calendar trace | high | `20-10-PLAN.md:98` | CLOSED — U: real trace/generation/source identity validators unchanged. |
| T-20-10-04 | Information Disclosure / artifacts | high | `20-10-PLAN.md:99` | CLOSED — U/C9: no new raw location/account/payload/credential/token/device output. |
| T-20-11-01 | Tampering / flow/report identity | high | `20-11-PLAN.md:119` | CLOSED — U/C8/C9: source snapshots/exact mappings/immutable references unchanged. |
| T-20-11-02 | Spoofing / configuration/comparison | high | `20-11-PLAN.md:120` | CLOSED — U/C9: measured settings, semantic-first comparison, per-artifact hashes unchanged. |
| T-20-11-03 | Repudiation / performance | high | `20-11-PLAN.md:121` | CLOSED — U/C3: fixed sample arrays/counts/cold/max/p95/overhead logic unchanged. |
| T-20-11-04 | Information Disclosure / screenshots/traces | high | `20-11-PLAN.md:122` | CLOSED — U/C9: privacy scan and synthetic fixture requirements unchanged. |
| T-20-12-01 | Spoofing / final verdict | high | `20-12-PLAN.md:114` | CLOSED — C2/C9: intermediate logs cannot self-award final verdict; sole rehash/derivation unchanged. |
| T-20-12-02 | Elevation of Privilege / Samsung record | high | `20-12-PLAN.md:115` | CLOSED — U/C9: attended record cannot alter technical verdicts/release authority. |
| T-20-12-03 | Information Disclosure / attended/final artifacts | high | `20-12-PLAN.md:116` | CLOSED — C6/C9: recursive privacy, hashed device/safe paths and unique artifact controls retained. |
| T-20-12-04 | Repudiation / accepted exception/readiness | high | `20-12-PLAN.md:117` | CLOSED — U/C9: complete metadata, separate exception counts and policy unchanged. |
| T-20-12-05 | Tampering / rollback | high | `20-12-PLAN.md:118` | CLOSED — U: previous archive/APK/schema binding and old-APK/new-schema prohibition unchanged. |

## Unregistered flags and risk disposition

**Unregistered flags: 0.** The new surfaces were explicitly considered:

1. Installed devtest manifest debug access (C5), confined to the exact devtest profile/hooks/package and protected against production bleed (C7).
2. New bounded in-app frame/nonce registry and diagnostic operation helper (C1–C4), under the existing native-case spoofing/tampering/disclosure register.
3. New local compiled-APK tool invocation (C6), using the pinned Build Tools directory, argument-vector execution, bounded captured output, and fail-closed pre-publication ordering.

These are not claimed to have no surface effect. No source-supported exploit or distinct security threat outside the authored build/run identity, source-case integrity, evidence publication, and information-disclosure mitigations was established. No new account/API endpoint, production auth flow, arbitrary tool/method/URL forwarding, filesystem output namespace from untrusted input, production data writer, or dependency supply-chain change was added.

**Open security risks found: 0; accepted/transferred risks: 0.** The pending native/account/binary evidence is a verification limitation, not a risk acceptance or a passing release gate.

## Parent execution evidence — context only, not independently reproduced

The parent supplied the following results; this auditor ran none of them and did not treat them as new native or security proof:

- 37 integrated Node cases, zero skips; the two changed helpers at 100% on all four metrics.
- 44 plugin/tooling tests in five suites, zero skips; typecheck/boundary 470 passing.
- 151 acceptance cases in eleven suites; all ten TS critical modules at 100% on all four metrics.
- 245 progress cases across eight complete files, zero skips; V12 and the new progress helper at 100% on all four metrics.
- Complete production launcher: 36 cases, zero skips.
- Legacy Phase 5 file: fourteen unrelated unchanged failures before/after; the changed production assertion fixes the fifteenth. No broad legacy PASS is claimed here.

Legacy N4/public-release/multi-ABI claims are not current v1.2 acceptance and are not relabelled PASS. No signed production build or account credential/MFA operation was run. Current source is **not yet native verified**; fresh final-source build, pinned-tool/device preflight, exclusive-device observations, and sole-validator final derivation remain outside this source-only sign-off.

## Final sign-off

- [x] Exact requested branch, SHA and base verified; no source changed during this audit.
- [x] Twelve authored threat tables and preserved source baseline read; 49/49 source mitigation continuity assessed.
- [x] Complete corrective delta and connected collector/build/privacy/failure controls inspected.
- [x] No concrete High-or-higher blocking finding; no speculative warnings or unregistered security flags.
- [x] Debug access acknowledged as devtest-only capability, not production shipping authorization.
- [x] Old reports and failed immutable evidence preserved; only this new report authored.
- [ ] Native proof, compiled final APK execution, current-SHA device acceptance, and release approval — **not run / not granted**.

**AI-assisted audit disclaimer:** This source review is not a substitute for a professional security audit or penetration test. It can miss subtle vulnerabilities and does not guarantee complete ASVS coverage, runtime safety, or production readiness.
