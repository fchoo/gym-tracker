---
phase: 20
slug: native-acceptance
status: verified
audit_scope: independent-read-only-four-file-source-security-continuation
exact_sha: 6722d3dedb52d8f54b3cebdd3416e8b68c7e0550
independent_source_sha: 6722d3dedb52d8f54b3cebdd3416e8b68c7e0550
base_sha: 73ad68ff2ac34c0e782fba5011ab0d3e7d45e53d
branch: agent-p20-native-lint-security-6722d3de
baseline_report: .planning/phases/20-native-acceptance/20-NATIVE-CORRECTIVE-SECURITY-73ad68ff.md
baseline_report_sha256: 9fc1dc43846974a39de63e71591314f6b56f1f418b5aa6010b5cd7b6e833ecfd
changed_files: 4
threats_total: 49
threats_closed: 49
threats_open: 0
blocking_threats_open: 0
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
native_proof: not_run
native_proof_not_run: true
native_acceptance_pending: true
release_authorized: false
created: 2026-10-22
---

# Phase 20 — Test-Only Debug Lint Source Security Continuation at 6722d3de

## Conclusion

**VERIFIED — source security only.** The complete four-file delta `73ad68ff2ac34c0e782fba5011ab0d3e7d45e53d..6722d3dedb52d8f54b3cebdd3416e8b68c7e0550` adds a narrowly scoped development-test manifest lint annotation and an independent production rejection. It does not enable a new production debugging capability, relax the release variant, disable lint globally, introduce a new credential/configuration leak, or manufacture native acceptance. **No concrete new security finding was established.**

All **49 authored source mitigations remain CLOSED**: 48 High and one Medium, all disposition `mitigate`. There are zero open/blocking threats, Critical/High/Medium/Low findings, unregistered flags, warnings, open risks, accepted risks, or transferred risks.

**Scoped source-security score: 100/100; ASVS Level 1; blocking threshold High.** This preserves the authored source-control closure, not comprehensive ASVS certification or independently reproduced test/build evidence.

**Native proof: NOT_RUN; release authority: NOT_GRANTED.** The reported fresh CNG/lint diagnostic is not APK publication, installation, compiled native acceptance, or release approval. This auditor ran no test, build, native tool, or device command. Fresh final-source-bound native evidence remains required through the existing immutable producer and exclusive-device workflow.

## Exact target, baseline, and restrictions

- Reused existing checkout: `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-security`.
- Independently verified branch: `agent-p20-native-lint-security-6722d3de`.
- Independently verified HEAD: `6722d3dedb52d8f54b3cebdd3416e8b68c7e0550`.
- Independently verified direct parent/base: `73ad68ff2ac34c0e782fba5011ab0d3e7d45e53d`; base ancestry was checked. This is one commit, subject `fix(phase20): scope debug-access lint annotation to devtest`.
- Complete Git delta: **4 files, 35 insertions, 1 deletion**. Both complete implementation files and both complete test files were read:
  - `plugins/withAndroidPhysicalTestService.ts`;
  - `plugins/withAndroidPhysicalTestService.test.ts`;
  - `scripts/assert-generated-production-android.mjs`;
  - `scripts/assert-generated-production-android.test.mjs`.
- These four checkout files match pinned HEAD; no uncommitted source change was included in the audit target. There is no delta in app routes, source registries, SQLite/receipt writers, native modules, app config, EAS/Gradle configuration, CI, dependencies/lockfiles, native collectors, privacy validators, immutable publication, or final verdict authority.
- Root `AGENTS.md:1-38` and project rules were read. Current `.planning/config.json:47-49` confirms security enforcement enabled, ASVS L1, block on High.
- Preserved baseline `20-NATIVE-CORRECTIVE-SECURITY-73ad68ff.md:6-34,40-46,167-229` binds 49/49 source closure and zero findings to the exact base, retaining native proof pending. Its SHA-256 is recorded above. Its referenced preceding report has the preserved hash `1193e052fd90d02ada26608dd1d80b68e7bb41ecb4bb68c5aee610d616eb61c7`; no earlier broad source audit was repeated.
- All 49 authored threat rows in `20-01-PLAN.md` through `20-12-PLAN.md` were read and reconciled against the baseline register. All twelve complete plan files are byte-identical between base, pinned HEAD, and checkout: eleven four-row tables plus one five-row table, 49 unique IDs, 48 High, one Medium, 49 `mitigate` dispositions.
- Existing older/baseline reports and the existing `node_modules` entry were preserved. No dependencies were installed or exercised. No credentials, account records, signing material, device state, or runtime logs were read.
- No source edits, tests, coverage, lint execution, CNG/prebuild, native builds, APK publication/installation, ADB/device commands, network probes, fetch/sync, branch switches, new worktrees, commits, pushes, or extra reviewer launches were performed. Only this report was authored; no prior report or immutable failed run was overwritten.

All current source references below are relative to the exact pinned checkout. Baseline references explicitly mean the preserved prior source-security report, not a new inspection of unchanged implementation outside these four files.

## Findings and confidence

| Severity / disposition | Count |
|---|---:|
| Critical findings | 0 |
| High findings / open High-or-higher blockers | 0 |
| Medium findings | 0 |
| Low findings | 0 |
| Unregistered security flags | 0 |
| Warnings / open risks / accepted risks / transferred risks | 0 / 0 / 0 / 0 |

The following assessments have **9/10 source-tracing confidence**, not compiled-binary/native confidence. A promoted finding would require a concrete exploit/consequence, severity, confidence, exact location, and verbatim motivating source. No new threat met that threshold; no speculative warning, remediation, or risk acceptance is substituted for evidence.

## C1 — Explicit test-only lint annotation, not a new debug-mode allowance

`plugins/withAndroidPhysicalTestService.ts:39-45` retains the existing strict identity conjunction, before either manifest or source mod registration:

```ts
  const enabled = config.extra?.buildProfile === 'development-test'
    && config.extra?.nativeContractsEnabled === true
    && config.android?.package === 'com.fchoo.gymtracker.devtest';
  if (!enabled) {
    return config;
  }
```

Every condition must hold. Production profile, wrong/missing package, missing extra/profile, disabled hooks, or string `'true'` cannot register this plugin's annotation or service/source mods. No new environment-variable override, truthy coercion, general package match, or caller-supplied lint identifier was introduced.

`plugins/withAndroidPhysicalTestService.ts:51-59` preserves the already authorized main-application capability and adds exactly one lint identifier using the canonical namespace:

```ts
    // run-as needs this test-only manifest capability; release BuildConfig.DEBUG stays false.
    application.$['android:debuggable'] = 'true';
    // The lint rule flags every debuggable attribute, even placeholders. This one
    // intentional capability is scoped by the exact identity guard above; all
    // other lint checks remain enabled and production rejects this annotation.
    manifestConfig.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const existingLintAnnotations = (application.$['tools:ignore'] ?? '')
      .split(',').map(value => value.trim()).filter(Boolean);
    application.$['tools:ignore'] = [...new Set([...existingLintAnnotations, 'HardcodedDebugMode'])].join(',');
```

The new surface is an intentional `tools:ignore` annotation on the guarded test application's manifest, not a new debuggable Gradle release variant. It preserves existing trusted annotations, trims comma-separated entries, removes empty entries, and deduplicates with `Set`, making repeated application idempotent. The sole added identifier is the literal `HardcodedDebugMode`; there is no new blanket `all`, global lint disable, abort-on-error relaxation, or severity override. Other lint checks and pre-existing annotation policy are not changed by this delta.

The unchanged `android:debuggable = 'true'` remains necessary for test-app `run-as` access; this report does not mislabel that application capability as production hardening. Release `BuildConfig.DEBUG = false`, embedded JS/release semantics, and compiled capability checks retain their prior source implementation by non-invalidation. The latter was verified by the baseline at `20-NATIVE-CORRECTIVE-SECURITY-73ad68ff.md:145-147`; this auditor did not inspect generated BuildConfig or an APK. No Gradle source or build-type modifier changed, and the plugin registers only the existing manifest/dangerous-source mods (`47-104`).

The unchanged service retains `android:permission = 'android.permission.DUMP'` at `73-76`; the generated Kotlin package/path remain fixed to devtest at `15,86-100`, and its suite allowlist is still `benchmark`/`argon2` at `25-27`. The new annotation does not remove permission protection, broaden service dispatch, or expose a new native endpoint. Existing build configuration/manifest inputs are trusted build inputs, not a newly introduced user-controlled execution boundary.

## C2 — Production rejects the annotation independently and keeps all existing guards

`script` scope here means `scripts/assert-generated-production-android.mjs`. At `58-65`, production debugging and the new annotation are separate failure checks:

```js
  const application = manifest.match(/<application\b[^>]*>/u)?.[0] ?? '';
  const debugFlag = application.match(/android:debuggable\s*=\s*["']([^"']*)["']/u)?.[1];
  if (debugFlag !== undefined && debugFlag !== 'false') {
    output.push('production main application must remain nondebuggable');
  }
  if (/\btools:ignore\s*=\s*["'][^"']*\bHardcodedDebugMode\b/u.test(manifest)) {
    output.push('production must not carry the development-test debug lint annotation');
  }
```

The annotation check scans the manifest's canonical `tools:ignore` attributes, not only an enabled debug flag. An otherwise nondebuggable production manifest carrying `HardcodedDebugMode` is rejected even when `android:debuggable` is absent or literal `false`. A mixed comma-separated annotation list is also rejected. The plugin emits exactly the namespace/prefix and identifier this guard checks; no delta introduces an alternate producer or namespace alias. This is a guard on the generated source contract, not a claim of generic adversarial-XML certification.

The following unchanged controls were read in this same changed file:

| Retained production boundary | Current pinned evidence |
|---|---|
| Hooks must be literal false and suite literal null | `42-45` |
| Exact production application ID and selected ARM64 ABI | `52-57` |
| Nonfalse application debug values, including placeholders, rejected | `58-62` |
| Release `debuggable true`, assignment override, or release in `debuggableVariants` rejected | `66-71` |
| Test instrumentation absent | `72-74` |
| Devtest identity/protected test service absent | `79-81` |
| Backup, cloud-backup, and device-transfer exclusions preserved | `23-39,77-84` |
| Production identity/OAuth comparison and raw factory validation before Expo null serialization | `91-129` |
| Every accumulated source failure yields failure JSON and nonzero CLI status | `131-145` |

The new rejection does not short-circuit or bypass any old guard. No sensitive configuration is newly emitted: the only new diagnostic is a fixed failure sentence at `64`, not raw manifest/config values, OAuth records, tokens, credentials, paths, or device data. Existing config evaluation and its argument-vector invocation remain unchanged, with forced production profile, bounded output, and ignored stderr (`109-116`); no new shell/URL/input forwarding exists.

App-config production isolation, compiled release DEBUG=false checks, ARM64 topology, native hooks/suite behavior, and embedded JS generation outside these four files are inherited from the exact-base source review, not rerun here. Their files and controlling configuration have no commit delta.

## C3 — Negative and idempotence assertions were read, not executed

| Authored test / assertion | Source inspected |
|---|---|
| `sets only the main application manifest flag and reapplies idempotently` | `plugins/withAndroidPhysicalTestService.test.ts:23-39`: two applications; debug true, canonical tools namespace, sole added `HardcodedDebugMode`, protected service and unrelated service retained; no appBuildGradle mod. |
| `adds only the intentional test-app lint annotation and preserves existing annotations` | Same file `41-51`: existing `UnusedAttribute, HardcodedDebugMode` survives as deduplicated `UnusedAttribute,HardcodedDebugMode` after two applications; no appBuildGradle mod. |
| `does not register manifest or source mods for any wrong identity or disabled hooks` | Same file `53-70`: missing extra/profile/android, production profile, hooks false/string true, and production package all return unchanged config without mods. |
| `retains the protected headless service implementation in the devtest package only` | Same file `72-83`: fixed package, existing timeout and suite allowlist; source-generation test only, not native proof. |
| `production rejects the development-test-only hardcoded-debug lint annotation` | `scripts/assert-generated-production-android.test.mjs:40-47`: standalone and mixed annotations rejected with no debug flag present. |
| Existing nondebuggable/release/instrumentation guards | Same file `27-38,49-68`: ordinary debug build type accepted; true/resource/placeholder application flags, release overrides, release debuggableVariants, and test service/instrumentation rejected. |
| Existing production hooks/factory/cache isolation | Same file `70-126`: hooks false/suite null, production ignores requested suite, raw factory fallback, and poisoned cache rejected. |
| Existing selected ARM64 guard | Same file `128-140`: selected ABI accepted; absent/widened/non-ARM64 settings rejected. |

The only fixture shape adjustment is an empty `queries` array at `plugins/withAndroidPhysicalTestService.test.ts:16`; it adds no production config or test bypass. The four-file delta introduces no `.only`, `.skip`, `.todo`, coverage-ignore, metric reduction, or removed integrity guard. These assertions directly call the real plugin/production validator; they are not acceptance result producers. Their contents were inspected, not executed by this auditor.

## All 49 authored mitigations — delta non-invalidation register

**CLOSED** below means the exact delta does not invalidate the authored source mitigation; it never means a native case ran. **U** means the controlling subsystem and authored plan are unchanged from the exact base, with source closure inherited from `20-NATIVE-CORRECTIVE-SECURITY-73ad68ff.md:167-223`. **C1/C2/C3** identify shared test-app capability/production boundary edges checked directly above. Every row retains disposition `mitigate`.

| Threat ID | Severity | Authored row | 6722d3de assessment |
|---|---|---|---|
| T-20-01-01 | high | `20-01-PLAN.md:112` | CLOSED — U: source registry exact sets/order/hash definitions unchanged. |
| T-20-01-02 | high | `20-01-PLAN.md:113` | CLOSED — U/C1/C2: run/build binding unchanged; lint annotation does not substitute production identity. |
| T-20-01-03 | high | `20-01-PLAN.md:114` | CLOSED — U/C2: observations/verdict authority unchanged; diagnostic cannot award release. |
| T-20-01-04 | high | `20-01-PLAN.md:115` | CLOSED — U/C2: fixed failure code/text only; hash-safe identity output unchanged. |
| T-20-02-01 | high | `20-02-PLAN.md:140` | CLOSED — U: migration/restore/merge checks, recovery and transactions unchanged. |
| T-20-02-02 | high | `20-02-PLAN.md:141` | CLOSED — U: receipt/source digests, failure cuts/reopen/retry unchanged. |
| T-20-02-03 | high | `20-02-PLAN.md:142` | CLOSED — U: native ordered source cases, exact counts and zero skips unchanged. |
| T-20-02-04 | high | `20-02-PLAN.md:143` | CLOSED — U/C2: no new result payload/private source data output. |
| T-20-03-01 | high | `20-03-PLAN.md:125` | CLOSED — U: Garmin component bounds/schema/hash and exclusive receipt/fact writer unchanged. |
| T-20-03-02 | high | `20-03-PLAN.md:126` | CLOSED — U: provider/match independent identity and revision fencing unchanged. |
| T-20-03-03 | high | `20-03-PLAN.md:127` | CLOSED — U: Calendar monotonic measured/generation/callback/source controls unchanged. |
| T-20-03-04 | high | `20-03-PLAN.md:128` | CLOSED — U/C2: synthetic/hash-safe Garmin artifacts, credentials/token exclusion unchanged. |
| T-20-04-01 | high | `20-04-PLAN.md:145` | CLOSED — U: one-to-one flow/source IDs, immutable snapshots, no sampling unchanged. |
| T-20-04-02 | high | `20-04-PLAN.md:146` | CLOSED — U: measured device config, exact lease/readback/restoration unchanged. |
| T-20-04-03 | high | `20-04-PLAN.md:147` | CLOSED — U: exception metadata and separate non-PASS counting unchanged. |
| T-20-04-04 | high | `20-04-PLAN.md:148` | CLOSED — U: synthetic screenshots/semantics, artifact sets and privacy validation unchanged. |
| T-20-05-01 | high | `20-05-PLAN.md:110` | CLOSED — U/C1/C2: intentional test-app run-as capability preserved; release BuildConfig/marker/build identity guards unchanged. |
| T-20-05-02 | high | `20-05-PLAN.md:111` | CLOSED — U: samples/raw arrays/literal limits/counts/recomputation unchanged. |
| T-20-05-03 | high | `20-05-PLAN.md:112` | CLOSED — U: failed/cold/maximum/overhead retention unchanged; diagnostic not relabelled PASS. |
| T-20-05-04 | medium | `20-05-PLAN.md:113` | CLOSED — U: reviewed fixture bounds/yield/cancellation/deadlines unchanged. |
| T-20-06-01 | high | `20-06-PLAN.md:111` | CLOSED — U/C1/C2: exact byte/signature/package/device/config validation unchanged; production rejects annotation independently. |
| T-20-06-02 | high | `20-06-PLAN.md:112` | CLOSED — U/C2: sole final validator, safe immutable sets and seal-time rehash unchanged. |
| T-20-06-03 | high | `20-06-PLAN.md:113` | CLOSED — U: complete exceptions metadata/separate count/policy reference unchanged. |
| T-20-06-04 | high | `20-06-PLAN.md:114` | CLOSED — U/C2: recursive report privacy unchanged; added diagnostic is literal, not raw config. |
| T-20-07-01 | high | `20-07-PLAN.md:105` | CLOSED — U: attended observation-only schema and authority exclusion unchanged. |
| T-20-07-02 | high | `20-07-PLAN.md:106` | CLOSED — U/C1/C2: source/APK/signature/installed-byte/hash-device/PNG identity unchanged. |
| T-20-07-03 | high | `20-07-PLAN.md:107` | CLOSED — U: readiness/exceptions policy and separate counts unchanged; no release permission. |
| T-20-07-04 | high | `20-07-PLAN.md:108` | CLOSED — U: rollback archive/APK/schema compatibility and forward-fix boundary unchanged. |
| T-20-08-01 | high | `20-08-PLAN.md:99` | CLOSED — U/C3: pinned preflight/compiled capability gates unchanged; assertions/diagnostic are not native proof. |
| T-20-08-02 | high | `20-08-PLAN.md:100` | CLOSED — U/C1: clean frozen source/single-build ownership unchanged; new final-source native run still required. |
| T-20-08-03 | high | `20-08-PLAN.md:101` | CLOSED — U/C1/C2: compiled manifest/release DEBUG=false and byte/package/signature checks unchanged; production isolation strengthened. |
| T-20-08-04 | high | `20-08-PLAN.md:102` | CLOSED — U/C2: no raw serial/private path/config output; build-manifest privacy unchanged. |
| T-20-09-01 | high | `20-09-PLAN.md:89` | CLOSED — U: exact SQLite versions/FK/integrity/graph/failure cuts/canonical digests unchanged. |
| T-20-09-02 | high | `20-09-PLAN.md:90` | CLOSED — U: lifecycle receipt/pointer/rest/effect readback and kill/retry semantics unchanged. |
| T-20-09-03 | high | `20-09-PLAN.md:91` | CLOSED — U/C1/C2: source/device/build/fixture binding and ordered registry unchanged. |
| T-20-09-04 | high | `20-09-PLAN.md:92` | CLOSED — U/C2: synthetic facts/codes/counts/hashes only; no new result output. |
| T-20-10-01 | high | `20-10-PLAN.md:96` | CLOSED — U: Garmin JSON/receipt hashes, strict bounds/schema and transactions unchanged. |
| T-20-10-02 | high | `20-10-PLAN.md:97` | CLOSED — U: provider/match independent signals and explicit revision-fenced selection unchanged. |
| T-20-10-03 | high | `20-10-PLAN.md:98` | CLOSED — U: Calendar measured monotonic samples/generation/callback/source identity unchanged. |
| T-20-10-04 | high | `20-10-PLAN.md:99` | CLOSED — U/C2: no raw payload/location/account/token/credential/device/path disclosure added. |
| T-20-11-01 | high | `20-11-PLAN.md:119` | CLOSED — U: flow/report source snapshot/hash, exact case IDs and immutable references unchanged. |
| T-20-11-02 | high | `20-11-PLAN.md:120` | CLOSED — U: measured configuration, semantic-first gates and artifact hashes unchanged. |
| T-20-11-03 | high | `20-11-PLAN.md:121` | CLOSED — U: performance raw arrays/fixed thresholds/cold/max/p95/overhead unchanged. |
| T-20-11-04 | high | `20-11-PLAN.md:122` | CLOSED — U: synthetic screenshots/traces, cleared overlays and privacy scans unchanged. |
| T-20-12-01 | high | `20-12-PLAN.md:114` | CLOSED — U/C2: sole post-checkpoint rehash/final derivation unchanged; lint pass cannot self-award verdict. |
| T-20-12-02 | high | `20-12-PLAN.md:115` | CLOSED — U: Samsung observation-only record cannot alter technical verdict/release authority. |
| T-20-12-03 | high | `20-12-PLAN.md:116` | CLOSED — U/C2: safe/hash-only/synthetic/unique/privacy boundaries unchanged. |
| T-20-12-04 | high | `20-12-PLAN.md:117` | CLOSED — U: complete scope/rationale/hash/policy metadata and separate readiness counts unchanged. |
| T-20-12-05 | high | `20-12-PLAN.md:118` | CLOSED — U: prior APK/archive/schema binding and old-APK/new-schema prohibition unchanged. |

**Reconciliation: 49 total = 49 CLOSED + 0 OPEN; 48 High + 1 Medium; 49 mitigate, 0 accept, 0 transfer.** No authored source mitigation is invalidated by this delta. No broader source re-audit was performed.

## Unregistered surface, risk disposition, and operational evidence

**Unregistered flags: 0.** The actual new surface was examined for scope escape into production, global lint suppression, idempotence/preservation failure, source-mod/service privilege broadening, debug/release-build conflation, private config/credential disclosure, and diagnostic-to-acceptance laundering. The literal test-only annotation is guarded at registration and explicitly rejected by production. No new concrete attack path or distinct unregistered threat was established.

**Open security risks: 0; accepted/transferred risks: 0.** Pending native/binary evidence is a verification limitation and outstanding acceptance gate, not a closed runtime gate or accepted security risk. No real account or credential evidence was obtained.

Parent-provided operational context, **not independently executed or reproduced here**:

- The actual 73ad devtest `assembleRelease` failed `LintHardcodedDebugMode`; the pinned 31.12 detector flags every `android:debuggable` attribute, not merely literal true, so placeholder substitution does not resolve it.
- 45 plugin/tooling tests across five suites and ten generated assertions pass; typecheck passes; boundary checks pass at 470.
- Fresh CNG plus actual `:app:lintVitalRelease` passed from clean 6722 commit; generated release `BuildConfig.DEBUG = false` was checked afterward.
- That diagnostic did not publish or install an APK and does not prove native acceptance. The consumed 73ad build claim and the prior failed 1138 immutable run remain preserved according to the parent handoff.

These claims explain the intentional annotation, but this verdict rests on independently read pinned source, exact delta identity, and register reconciliation. No detector implementation, generated tree, diagnostic log, compiled binary, device, account, or immutable native run was independently inspected. The lint fix is neither credential/release authority nor permission to reuse an old source-bound build claim; no failed run is promoted or overwritten by this report.

## Final sign-off

- [x] Exact existing checkout/branch/HEAD/direct parent and four-file source delta verified.
- [x] Complete four changed files read; strict devtest identity, literal scoped annotation, idempotent preservation and protected service traced.
- [x] Production annotation rejection checked independently of debug flag; existing hooks/suite/Gradle/ABI/backup/service controls retained.
- [x] Preserved 73ad source-security report and all 49 authored threat rows reconciled; plan bytes unchanged across base/HEAD/checkout.
- [x] 49/49 source mitigations closed; zero findings, unregistered flags, warnings, open/accepted/transferred risks.
- [x] Only this report authored; no tests, installs, builds, ADB/native/device/credential/network/source/git mutation actions.
- [ ] Fresh final-source compiled native acceptance and release approval — **NOT_RUN / NOT_GRANTED**.

**AI-assisted review limitation:** This bounded source-security continuation can miss subtle vulnerabilities. It is not a professional penetration test, comprehensive ASVS certification, a guarantee of security, or a substitute for independent professional security review and fresh native evidence.
