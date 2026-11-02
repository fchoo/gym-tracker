---
exact_sha: 4a472d3c32c9264d7e6dc1ebc3b70144fd1902af
base: fc20301d2a81f7a8883a5346f7be7567bbaeff73
branch: agent-p20-atomic-review-4a472d3c
status: issues_found
findings: 2
issues_found: 2
critical: 0
warnings: 2
informational: 2
score: 90
score_scale: 100
source_only: true
scope: targeted two-file private-result publication race closure, read-only source review
prior_batch_review: 20-BATCH-REVIEW-fc20301d.md
prior_warning_status: not_closed
native_status: pending
native_rollback_status: pending
final_same_samsung_acceptance_status: pending
emulator_garmin_probe_status: passed_parent_supplied_non_acceptance
review_worktree: /Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-review
---

# Phase 20 — Targeted result-publication review, 4a472d3c

**Pre-Landing Review: 2 issues (0 Critical, 2 Warnings). Targeted source score: 90/100. The previous publication warning is not cleanly closed; the pre-phone-install source gate is not satisfied.** Five points are deducted for each verified publication-protocol issue, not for pending native acceptance. This is a source-only review, not a native PASS, Samsung installation approval, or milestone acceptance.

## Scope, inherited audit, and isolation

Read root `AGENTS.md`, the full gstack review checklist, and the complete `20-BATCH-REVIEW-fc20301d.md`. Reviewed the entire actual **`fc20301d2a81f7a8883a5346f7be7567bbaeff73..4a472d3c32c9264d7e6dc1ebc3b70144fd1902af` diff: two files, 36 insertions, three deletions**:

- `src/testing/v12NativeRollbackBridge.ts`
- `src/testing/v12NativeRollbackBridge.test.ts`

HEAD and the assigned branch match the exact target. Both reviewed source files and `package.json` / `package-lock.json` independently match the pinned Git blobs byte-for-byte. The existing shared `node_modules` link was used read-only; no dependencies were duplicated or installed.

The prior report audited all 27 files in `a650a4acf68285b9474d153c8dc0ca5ebb7e130e..fc20301d2a81f7a8883a5346f7be7567bbaeff73` and returned one Warning / 95 points. Its other rollback, Garmin, coverage-registration, root-isolation, and tab reviews are retained rather than repeated or independently re-rated here. This review is confined to the publication repair and the exact consumer/dependency source needed to validate it. There are **no schema, crypto, identity, provenance, lease, expiry, host-polling, or authority changes in this diff**.

**No source edit, tests/coverage execution, ADB/device command, build, install, branch switch, new worktree, commit, push, fetch, or sync was performed. The only authored filesystem write is this report.** No worker or native workflow was duplicated, restarted, or otherwise touched. Existing dirty report metadata was left unchanged; review status is not working-tree cleanliness.

## Findings

### R1 — Expo's generic move does not enforce atomic-only publication

**[Warning / P2] (confidence: 9/10) `src/testing/v12NativeRollbackBridge.ts:222-223` — The final publication operation can fall back to copying into the host-polled final pathname, recreating the previous empty/partial visibility interval if the native rename paths fail.** This is a verified conditional dependency path, not a claimed observed failure on the emulator or Samsung. It remains a fail-closed operational/evidence-generation failure, not accepted forged evidence or database corruption.

Application lines, verbatim:

```ts
// src/testing/v12NativeRollbackBridge.ts:222-223
stagedResult.write(JSON.stringify(value));
stagedResult.move(resultFile);
```

The actual local **Expo FileSystem 57.0.7** Android move implementation explicitly permits copy-and-delete. Verbatim `node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/fsops/CopyMoveStrategy.kt:37-46`:

```kt
open suspend fun moveTo(spec: DestinationSpec): Uri {
  val resolved = spec.resolve(file)
  return tryNativeMove(resolved) ?: run {
    resolved.receiveFrom(file).also {
      if (!file.deleteRecursively()) {
        throw UnableToMoveException("Failed to delete source after move")
      }
    }
  }
}
```

The local-file fast path is genuinely a rename **when it succeeds**, but failures are swallowed and returned as `null`. Verbatim `CopyMoveStrategy.kt:101-113`:

```kt
// Fast path: atomic rename (same filesystem)
if (file.renameTo(resolved.target)) {
  return resolved.target.uri
}

if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
  return runCatching {
    moveFileNio(file.toPath(), resolved.target.toPath())
    resolved.target.uri
  }.getOrNull()
}

return null
```

The fallback is a real final-path copy: `DestinationSink.kt:50-55`, verbatim:

```kt
} else {
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    copyFileNio(source.toPath(), target.toPath())
  } else {
    copyFileViaStream(source, target)
```

Verbatim `fsops/NioUtilities.kt:19-27`:

```kt
@RequiresApi(Build.VERSION_CODES.O)
internal fun copyFileNio(source: Path, dest: Path) {
  Files.copy(source, dest, StandardCopyOption.REPLACE_EXISTING)
}

@RequiresApi(Build.VERSION_CODES.O)
internal fun moveFileNio(source: Path, dest: Path) {
  Files.move(source, dest, StandardCopyOption.REPLACE_EXISTING)
}
```

No `ATOMIC_MOVE` or failure-without-copy contract is selected. Same-parent path construction rules out an ordinary application-requested cross-filesystem move; it does **not** disable the dependency's explicit error fallback. The source guards do not prevent that fallback from creating a visible final file before copying is complete, and the host still consumes the first successful existence/read result. Verbatim `scripts/v12-native-rollback-bridge.mjs:110-115`:

```js
const fetched = adb(["exec-out", "run-as", PACKAGE, "sh", "-c", `test -f ${remote}/result.json && cat ${remote}/result.json`], undefined, true);
if (fetched.status === 0) { resultBytes = Buffer.from(fetched.stdout); break; }
await wait(250);
}
if (resultBytes === undefined || now() >= deadline) fail("native_timeout");
const result = JSON.parse(resultBytes);
```

**Required bounded repair:** use a source-owned same-parent, no-clobber, atomic-only rename operation that rejects an unavailable/failed rename without ever copying into `result.json`. Preserve the existing private nonce/path guards, complete staged writes, sanitized success/failure shapes, host polling, and immutable failure retention. `moveSync()` alone is not this repair: its Android binding calls the same `file.move(...)` strategy (`FileSystemModule.kt:217-220`). Add a focused failed-rename/no-final-copy regression. No repair or test was performed here.

### R2 — The new helper drops an asynchronous publication Promise

**[Warning / P2] (confidence: 10/10) `src/testing/v12NativeRollbackBridge.ts:219-223,236-240` — `publishResult` returns `void` while `File.move()` returns a Promise, so collector completion is not publication completion and native move rejections bypass its sanitized error handling.** On a successful restore the diagnostic route can display completion while the result is still absent; if the move rejects, the collector has already resolved and the host eventually times out instead of receiving the intended fixed-code transport outcome. On the failure branch, the original fixed-code throw occurs before publication settles, and the move rejection is likewise detached. Host polling still fails closed; this is not an evidence-authentication bypass.

Motivating application lines, verbatim:

```ts
// src/testing/v12NativeRollbackBridge.ts:219-224
function publishResult(value: unknown): void {
  // The host polls only result.json. Same-directory rename exposes complete bytes,
  // never the empty/partial file created by Expo's synchronous write operation.
  stagedResult.write(JSON.stringify(value));
  stagedResult.move(resultFile);
}
```

```ts
// src/testing/v12NativeRollbackBridge.ts:236-240
  publishResult({ schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm, inspection: result.inspection });
} catch (error) {
  const code = error instanceof Error && /^v12_rollback_[a-z_]+$/u.test(error.message) ? error.message : "v12_rollback_failed";
  publishResult({ schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm, failure: code });
  throw new Error(code);
```

This is the installed public API, not an assumed legacy signature. Verbatim `node_modules/expo-file-system/src/internal/NativeFileSystem.types.ts:250,255`:

```ts
move(destination: PublicDirectory | PublicFile, options?: RelocationOptions): Promise<void>;
moveSync(destination: PublicDirectory | PublicFile, options?: RelocationOptions): void;
```

`src/File.ts:41` extends the native file class and does not override move; `src/ExpoFileSystem.ts:45` resolves the actual native `FileSystem` module. The actual Android binding confirms the asynchronous distinction, verbatim `FileSystemModule.kt:213-220`:

```kt
AsyncFunction("move") Coroutine { file: FileSystemFile, destination: FileSystemPath, options: RelocationOptions? ->
  file.move(destination, options ?: RelocationOptions())
}

Function("moveSync") { file: FileSystemFile, destination: FileSystemPath, options: RelocationOptions? ->
  runBlocking {
    file.move(destination, options ?: RelocationOptions())
  }
```

The bounded consumer consequence is visible in `app/__v12-recovery-archive.tsx:11-15`, verbatim:

```tsx
void collectNativeRollbackBridge(identity, nonce).then(() => {
  if (mounted) setState("Recovery archive verified");
}).catch(() => {
  if (mounted) setState("Recovery archive failed");
});
```

**Required bounded repair:** make the publication helper completion-aware: await a strict atomic-only native publication operation on both branches, or use a genuinely synchronous strict rename whose errors reach the collector. Preserve fixed-code sanitization and no-overwrite/reuse guards, and define the transport-failure path without a detached rejection. Add focused deferred-publication and rejected-publication tests with a Promise-correct native fake. Awaiting the current generic `move()` addresses R2 but does not close R1. This finding is limited to the newly added result-publication call; it does not re-rate unchanged arm consumption or the rest of the prior batch.

## Verified path and write-order proof

**Confidence: 10/10 for the concrete application-selected paths and successful-rename path; no unconditional atomic-publication claim.**

1. `v12NativeRollbackBridge.ts:212` requires the devtest identity and a scalar 32-hex nonce before constructing paths. Lines 216-217 construct both files from `Paths.document`, the identical `v12-rollback-${nonce}` parent, and fixed basenames `result.json` / `result-staged.json`. No caller-selected destination, content URI, SAF tree, cache/document crossing, or external-storage path is accepted here.
2. `expo-file-system/src/Paths.ts:24-25` constructs document from the native document directory. `FileSystemModule.kt:24-25,38-39` selects `appContext.persistentFilesDirectory` and `Uri.fromFile(filesDirectory)`. `expo-modules-core/.../services/AppDirectoriesService.kt:19-20` resolves that property to Android `context.filesDir`. `FileSystemPath.kt:69-74` selects `JavaFile` for this file URI, and `unifiedfile/JavaFile.kt:22,97` selects the local-file move strategy. Thus these exact paths are in the same app-private parent, not merely two generic Expo Files.
3. Public `File` construction joins these fixed segments (`src/File.ts:149-151`). Destination resolution treats the target as File-to-File, verifies the parent, and rejects an existing target when overwrite is false (`CopyMoveStrategy.kt:81-90`). This supports no-clobber on the ordinary selected path, not atomic-only enforcement.
4. The string writer is synchronous (`FileSystemModule.kt:141-149`). It creates the staged file if absent and writes within `outputStream(...).use` (`FileSystemFile.kt:76-84`); therefore the stream is closed before the move is requested. The direct `resultFile.write(...)` operations are gone. Both success and fixed-code failure use the same helper (`v12NativeRollbackBridge.ts:236,239`); the archive write precedes success publication (`235-236`).
5. Existing consumed, final, or staged result claims are rejected at entry (`218`). This is useful reuse protection and the added staged guard is covered by the new test. It is not a final-file readiness guard against native copy fallback and does not await publication.

**Conclusion:** the usual successful `renameTo` path exposes complete closed bytes, and the two fixed paths cannot ordinarily cross filesystems. The implementation nevertheless fails the stronger requested guarantee that a publication failure cannot expose an empty/partial final file or escape the collector's completion/error boundary. The native fallback and Promise semantics prevent declaring R1 cleanly closed.

## Tests and execution-evidence boundary

Inspected the complete affected test file; did not execute tests or coverage. The new regression `"keeps the final result absent until complete staged bytes are moved into place"` (`v12NativeRollbackBridge.test.ts:234-255`) creates an empty staged buffer during the writer spy, verifies final absence, writes the complete failure JSON, then verifies final fixed code and staging removal. `"rejects an existing staged result instead of overwriting it"` (`256-259`) verifies the new guard. The retained success orchestration case (`221-233`) verifies a restored result and consumed-arm reuse rejection; existing final-result/fixed-code cases remain (`275-289`). These prove useful host-only staging order, not the native move guarantee.

The relevant fake is synchronous and unconditional, verbatim `v12NativeRollbackBridge.test.ts:28`:

```ts
move(other: MockFile) { mockFiles.set(other.path, mockFiles.get(this.path)!); mockFiles.delete(this.path); }
```

It cannot expose delayed/rejected publication or the installed native copy fallback. The new test therefore does not disprove either finding, even with complete instrumented coverage.

Parent-supplied execution evidence, **not independently rerun or relabelled as native acceptance**:

| Scope | Supplied result / boundary |
| --- | --- |
| Complete affected bridge tests | 36 passing, zero skips; the complete file was inspected, not rerun |
| Affected guard/bridge coverage | Exact 100% statements, branches, functions, and lines as supplied; no threshold or integrity guard changed |
| Types / boundaries | 475 passing as supplied |
| Actual emulator Garmin CPython probe | runtimeInfo, disconnected connection state, and fixed deterministic JSON PASSED; credential-free, no provider/contact/session reauthentication |
| Preserved tab glyph check | Eight portrait configurations: 360/390dp × Light/Dark × F100/F200; complete single-line labels as supplied |

Garmin and tab sources are unchanged by this two-file repair, so their prior bounded source audit and supplied emulator observations are retained. The older report's historical emulator/native-pending timing is not rewritten. The new supplied successful emulator diagnostic remains **non-acceptance evidence**; it is not a final-source rollback publication observation, a Samsung run, MFA/provider/persistence proof, or final same-device Phase 20 acceptance.

## Final gate and preservation

**Outcome: 0 Critical, 2 Warnings, 90/100 for this exact targeted source review. Previous warning: not closed. Do not advance the required pre-phone-install source gate on this report.** Close the bounded atomic-only and completion/error issues, inspect the actual selected native publication path again, and run only the affected complete focused tests/coverage. Do not accept malformed/partial JSON, change host polling to weaken completion, remove guards, lower coverage thresholds, or extend budgets to hide a failed operation.

Fresh final-source build and exclusive Samsung SM-S916B acceptance remain pending and outside this review's authorization. Preserve failed immutable attempts and their original statuses. No device use, queued-worker intervention, build/install, or broad regression rerun is requested or performed by this reviewer.

The **18 pre-existing review Markdown files**, including the prior batch and modified `20-REVIEW.md`, were left untouched. Their pre-report sorted `filename + NUL + content-SHA256 + newline` manifest SHA-256 was `33c7777953737baabe996f828e91534a25f4fb762868d76f4b9448bf8fce564d`. This report is the sole authorized output.
