---
exact_sha: 6722d3dedb52d8f54b3cebdd3416e8b68c7e0550
base: 73ad68ff2ac34c0e782fba5011ab0d3e7d45e53d
status: clean
findings_counts:
  blocker: 0
  critical: 0
  warning: 0
  total: 0
score: 100
score_scale: 100
review_mode: independent_read_only_source_delta
source_only: true
prior_clean_review: .planning/phases/20-native-acceptance/20-NATIVE-CORRECTIVE-REVIEW-73ad68ff.md
inherited_source_boundaries: 34
native_pending: true
native_acceptance: not_established_pending_fresh_final_source_build_and_exclusive_device_execution
release_readiness: not_assessed
---

# Independent targeted development-test lint review

**Pre-Landing Review: No issues found in the reviewed delta.**

## Exact scope and continuity

- Reused the existing worktree `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-review`, branch `agent-p20-native-lint-review-6722d3de`. HEAD matched the full exact SHA above; its immediate parent matched the full base above.
- Read root `AGENTS.md`, the applicable project rules, and `/Users/bytedance/.trae/skills/gstack/review/checklist.md` before substantive review. The explicit read-only assignment overrides the skill's generic fetch, fix-first, execution and auxiliary logging steps.
- Read the complete committed four-file delta: **35 insertions, 1 deletion**. The files are `plugins/withAndroidPhysicalTestService.ts`, `plugins/withAndroidPhysicalTestService.test.ts`, `scripts/assert-generated-production-android.mjs`, and `scripts/assert-generated-production-android.test.mjs`. Reviewed files and directly relevant integration had no uncommitted source changes relative to pinned HEAD.
- Preserved and read `20-NATIVE-CORRECTIVE-REVIEW-73ad68ff.md`, which records **100/100, clean, zero findings**, with native acceptance still pending. Its SHA-256 is `9653d7abf4fa97fba0089b5ae9078e2790a65dab11eded29f211837ceac18d02`.
- The other **34 source boundaries** inherit that prior clean review and its referenced earlier audit, as requested. They were not independently reaudited here; no old-SHA aggregate gate or full audit was repeated.

The **100/100 score is a scoped source-review score**, maintaining the prior clean score with no new findings. It is not an APK, native acceptance, performance, production-security or release-approval score.

## 1. Intentional capability exception stays inside the exact test identity

**Assessment:** verified in source; no new Warning or Critical. **Confidence: 9/10.**

`plugins/withAndroidPhysicalTestService.ts:39-45` retains the existing three-part guard verbatim:

```ts
const withAndroidPhysicalTestService: ConfigPlugin = (config) => {
  const enabled = config.extra?.buildProfile === 'development-test'
    && config.extra?.nativeContractsEnabled === true
    && config.android?.package === 'com.fchoo.gymtracker.devtest';
  if (!enabled) {
    return config;
  }
```

The guard precedes both manifest-mod registration and source-mod registration. Neither the new annotation nor the existing debug capability is registered for production, disabled/string-valued hooks, absent identity, or the production package.

`plugins/withAndroidPhysicalTestService.ts:51-59` changes only lint handling of the already-existing main-application capability:

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

- The namespace is the canonical Android tools namespace; `tools:ignore` is on the main application, not a Gradle/global lint disable or baseline.
- Existing annotation tokens are retained, surrounding token whitespace/empty entries normalized, and duplicates eliminated. Reapplication leaves the same annotation token set and order. The only newly requested ignored issue is `HardcodedDebugMode`.
- The application was already explicitly debuggable at the base. This repair does not introduce that capability, make a production application debuggable, modify release Gradle debug flags, or request a Metro/debug build.
- Service deduplication at lines 60-63 and its protected configuration at lines 71-79 are unchanged. In particular, the service retains `'android:permission': 'android.permission.DUMP'` at line 75 and the devtest-only Kotlin package at line 15. Other services remain retained.
- No app-build-Gradle mod is added. This plugin continues to register only its guarded manifest mod and guarded dangerous source mod (`:47-50,83-104`).

The parent-supplied detector investigation explains the repair's intent: pinned Android lint **31.12** reportedly checks the Android namespace and reports every `debuggable` attribute rather than inspecting only its literal value. Consequently a placeholder would not remove this fatal diagnostic. That bytecode investigation is **supplied evidence, not reviewer execution or an independently inspected bytecode artifact**. The source-level exception is justified by the existing test-only capability and the retained production rejection, not by silently weakening native acceptance.

## 2. Production is explicitly forbidden from carrying the exception

**Assessment:** verified in source; no production-debug relaxation. **Confidence: 9/10.**

` scripts/assert-generated-production-android.mjs:58-65` (path without the leading formatting space) retains the nondebuggable check and adds an independent manifest-wide annotation rejection:

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

The rejection is not nested under the debug-value condition: the annotation is forbidden even when the application has no debug attribute or has the permitted literal `false`. Existing production release-debugging, test-instrumentation and devtest-service rejection remain at lines 66-81. Existing raw configuration checks still require literal hooks `false` and suite `null` at lines 42-44, with CLI failures producing nonzero exit status at lines 131-142.

Directly relevant unchanged integration was read, not presumed:

- `app.config.ts:28-43,68-70,114-117` defaults to production, restricts supported profiles, makes production suite null, selects the production package, and derives hooks solely from the development-test boolean. The plugin is wired at line 107.
- `scripts/build-release-candidate-once.sh:30-31,54-56` requires the production profile, performs clean production CNG and runs this production assertion before Gradle compilation at lines 64-69 and APK/AAB copying at lines 76-77.

No production approval or acceptance semantics are changed. This is a capability-specific test-artifact lint exception plus a stronger production source rejection, not a waiver for failed receipts or native quality gates.

## 3. Compiler/package/binary publication safeguards remain intact

**Assessment:** relevant unchanged safeguards verified in source, not executed. **Confidence: 9/10.**

` scripts/validate-development-test-native-access.mjs:22-28` (path without the leading formatting space) continues to require the release-generated configuration to remain non-debug:

```js
export function validateReleaseBuildConfig(contents) {
  const source = contents.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, '');
  const debugDeclarations = source.match(/\bboolean\s+DEBUG\s*=[^;]*;/gu) ?? [];
  if (!/^\s*package com\.fchoo\.gymtracker\.devtest;\s*$/mu.test(source)
    || debugDeclarations.length !== 1 || debugDeclarations[0] !== 'boolean DEBUG = false;'
    || !/\bString APPLICATION_ID = "com\.fchoo\.gymtracker\.devtest";/u.test(source)
    || !/\bString BUILD_TYPE = "release";/u.test(source)) invalid();
```

- The same validator's lines 11-19 require exact devtest binary-manifest package badging and exactly one `application-debuggable` flag. Lines 31-46 read the release-generated BuildConfig and use executable `aapt`/`aapt2` only under pinned Build Tools `36.0.0`; errors remain fail-closed.
- `scripts/validate-development-test-app-config.mjs:52-70` independently requires the embedded development-test profile, literal enabled hooks, exact requested suite, devtest scheme/package and registered OAuth identity.
- `scripts/assert-generated-android.mjs:309-313` continues to require the main application's explicit `android:debuggable="true"` run-as capability; it is not replaced by a placeholder.
- `scripts/build-current-native-test-apk.sh:358-386` retains clean CNG/generated assertion, `:app:assembleRelease`, embedded-config validation, then compiled native-access validation. That gate still precedes APK retention (`:393-398`), installation (`:401`) and final immutable artifact/build-manifest publication (`:567-576`).
- `plugins/phase20/Phase20QualityInstrumentation.kt:762` still rejects debug BuildConfig, invalid nonce and unsupported action, verbatim:

```kt
      if (BuildConfig.DEBUG || !nonce.matches(Regex("[a-f0-9]{48}")) || action !in setOf("accessibility", "performance")) throw IllegalArgumentException("gate")
```

All of these relevant integration files are unchanged in the reviewed four-file delta. Source checks establish retained safeguards, **not actual compiled APK bytes or runtime behavior**.

## 4. Focused regression tests match the changed behavior

Read both complete affected test files; **no tests were run by this reviewer**.

| Test file and exact test name | Verified source assertions |
| --- | --- |
| `plugins/withAndroidPhysicalTestService.test.ts:23-39` — `sets only the main application manifest flag and reapplies idempotently` | Runs the manifest mod twice; requires main-app debug `true`, the canonical tools namespace and exactly `HardcodedDebugMode`; retains the unrelated service and protected DUMP service; requires no app-build-Gradle mod. |
| Same file `:41-51` — `adds only the intentional test-app lint annotation and preserves existing annotations` | Seeds `UnusedAttribute, HardcodedDebugMode`, applies twice and requires `UnusedAttribute,HardcodedDebugMode`, proving preservation/normalization and no duplicate ignored issue. |
| Same file `:53-70` — `does not register manifest or source mods for any wrong identity or disabled hooks` | Existing negative cases cover missing extra/profile, production profile, hooks false or string `true`, production package and missing Android config; each requires unchanged config identity and no mods. |
| Same file `:72-83` — `retains the protected headless service implementation in the devtest package only` | Existing source fixture requires the devtest package, unchanged task budget and benchmark/argon2 suite filter. |
| `scripts/assert-generated-production-android.test.mjs:40-47` — `production rejects the development-test-only hardcoded-debug lint annotation` | New negative cases use standalone and combined ignored-issue values on a normally nondebuggable production fixture with no debug attribute (`:20`); both require the annotation-specific rejection. |
| Same file `:27-38,49-77` — existing production debug/override/instrumentation/config regressions | Accepts absent or literal-false production app debugging, rejects true/resource/placeholder values, retains release-override and test-component rejection, and requires hooks false/suite null. |

The added `queries: []` at plugin-test line 16 is a manifest-fixture shape correction, not runtime production configuration. The test-source change does not mask the real plugin, compiled access gate or production validator.

## Checklist result and evidence limits

Applied the checklist's critical and informational passes to the complete exact delta and read only directly relevant unchanged integration. No SQL/storage, concurrency protocol, LLM/shell boundary, new suite/status enum, approval protocol, collector fallback, timeout/budget, coverage threshold, toolchain pin, CI global lint disable or lint baseline changes are present. No real Blocker, Critical or Warning was identified; there are no speculative findings promoted to the report.

The following execution outcomes are **parent-supplied evidence, not reviewer execution**:

1. A fresh actual build at `73ad68ff` failed on this fatal lint diagnostic before APK publication/native execution; its consumed single-build claim and failure log remain preserved. This failed run is not converted into a PASS by this review.
2. A clean-commit diagnostic at `6722d3de` reportedly completed Expo CNG, the generated-source assertion and `:app:lintVitalRelease`, then verified generated release `BuildConfig.DEBUG` false. It published no APK, installed nothing and collected no native acceptance evidence. Successful lint is diagnostic evidence, not a completed immutable acceptance build.
3. The affected host scope reportedly passed **45 plugin/tooling tests across 5 suites plus 10 generated-source assertions**, with typecheck and **470 boundary tests** passing. No execution receipt was produced by this reviewer and these counts are not reclassified as device observations.

**Native acceptance remains pending:** a fresh final-source immutable build and acceptance execution under one exclusive device lease are still required. This report provides no native PASS, compiled-artifact certification, timing certification, release approval or authorization to reuse the failed build's consumed claim.

## Read-only preservation

The assignment's sole intentional filesystem write is this new report. Existing modified/untracked reports and the shared `node_modules` symlink were retained. The 13 preexisting dirty status entries and their file-content/symlink fingerprints, excluding this new report, produced preservation digest `2ad237654e2615953fd5dc6b8e09ca821f2282a475b80ec0521a0f79a1a9faf1` before report creation.

**Performed:** local instruction/memory/report/source reads, targeted searches, read-only git identity/diff/status inspection and metadata fingerprints, plus creation of this report.

**Not performed:** branch switching, new worktrees, installs, tests/coverage, CNG/Gradle/build execution, native/ADB/device operations, source edits, commits, pushes, fetch/sync, report overwrites or additional audit agents. Historical memory was consulted only for the host/native acceptance distinction; current conclusions are bound to this exact source delta and the preserved prior review, not historical device/toolchain state.
