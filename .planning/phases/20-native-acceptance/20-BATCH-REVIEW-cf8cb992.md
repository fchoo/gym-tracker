---
exact_sha: cf8cb9927672d77356cbf43982ea8b3042454fcb
base: 4a472d3c32c9264d7e6dc1ebc3b70144fd1902af
branch: agent-p20-ready-review-cf8cb992
status: issues_found
findings: 1
issues_found: 1
critical: 0
warnings: 1
informational: 1
score: 95
score_scale: 100
source_only: true
scope: targeted four-file asynchronous move and private readiness-barrier repair, read-only source review
prior_batch_review: 20-BATCH-REVIEW-fc20301d.md
prior_repair_review: 20-BATCH-REVIEW-4a472d3c.md
prior_warning_status: ordinary_paths_repaired_residual_publication_error_race
native_status: pending
native_rollback_status: pending
final_same_samsung_acceptance_status: pending
emulator_garmin_probe_status: passed_parent_supplied_non_acceptance
review_worktree: /Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p20-final5-review
---

# Phase 20 — Targeted readiness-barrier source review, cf8cb992

**Pre-Landing Review: 1 issue (0 Critical, 1 Warning). Source score: 95/100.** The normal awaited-move/copy completion path addresses the earlier findings, but one verified publication-error path can still expose a changing final file after readiness becomes visible. The five-point deduction is for that source defect, not pending native acceptance. This independent review cannot honestly record 100/100 or declare all publication warnings closed.

## Scope and isolation

Read root `AGENTS.md`, the complete gstack review checklist, and both prior batch reports. Reviewed the full actual **`4a472d3c32c9264d7e6dc1ebc3b70144fd1902af..cf8cb9927672d77356cbf43982ea8b3042454fcb` diff: four files, 58 insertions, nine deletions**:

- `scripts/v12-native-rollback-bridge.mjs`
- `scripts/v12-native-rollback-bridge.test.mjs`
- `src/testing/v12NativeRollbackBridge.ts`
- `src/testing/v12NativeRollbackBridge.test.ts`

The reused checkout's HEAD and assigned branch match the exact target. All four working source/test files and `package.json` / `package-lock.json` independently match their pinned Git blobs byte-for-byte. Used the existing shared dependency environment read-only. Read bounded integration: the actual Expo FileSystem 57.0.7 public signatures and Android write/move/path implementations, the isolated route's Promise handling, and all private-result consumers. Applied both review-checklist passes; no unrelated whole-batch, whole-milestone, Garmin or tab diff was duplicated.

**No source edit, test/coverage execution, build, ADB/device command, install, dependency change, worktree creation, branch switch, fetch/sync, commit or push was performed. This report is the sole authored filesystem write.** Existing dirty report metadata was preserved. No queued agent or native workflow was duplicated, restarted or touched. Review cleanliness is not working-tree cleanliness.

## Finding

### R1 — A readiness-write failure retries publication through the already-moved final File

**[Warning / P2] (confidence: 9/10) `src/testing/v12NativeRollbackBridge.ts:223-225,238-241` and `scripts/v12-native-rollback-bridge.mjs:110-115` — If readiness writing throws after creating `result.ready`, the success-path catch calls `publishResult` again using `stagedResult`, whose native URI has already changed to `result.json`. The retry truncates/rewrites the host-readable final file while readiness exists.** This is a verified conditional native I/O-error path, not a claimed observed emulator or Samsung failure. It can reproduce an empty/partial JSON read and fail-closed operational failure; it is not a forged-evidence or production database-corruption claim.

Application lines, verbatim:

```ts
// src/testing/v12NativeRollbackBridge.ts:220-226
async function publishResult(value: unknown): Promise<void> {
  // Expo move may fall back to copy/delete. Await its completion before exposing
  // the readiness barrier; the host never reads a partially copied result.json.
  stagedResult.write(JSON.stringify(value));
  await stagedResult.move(resultFile);
  resultReady.write("ready");
}
```

```ts
// src/testing/v12NativeRollbackBridge.ts:238-242
  await publishResult({ schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm, inspection: result.inspection });
} catch (error) {
  const code = error instanceof Error && /^v12_rollback_[a-z_]+$/u.test(error.message) ? error.message : "v12_rollback_failed";
  await publishResult({ schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm, failure: code });
  throw new Error(code);
```

This is actual API behavior, not a speculative alias assumption. The installed `expo-file-system/src/internal/NativeFileSystem.types.ts:248-250` documents that move updates the URI; the concrete Android implementation proves it. Verbatim `node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/FileSystemPath.kt:180-186`:

```kt
// moveTo returns the URI of where the file was actually moved to
val finalUri = withContext(Dispatchers.IO) {
  file.moveTo(to.asCopyOrMoveDestination(options.overwrite))
}

// Update URI to reflect the new location
uri = finalUri
```

The synchronous string writer creates the marker separately, before opening/writing its content. Verbatim `FileSystemFile.kt:79-84`:

```kt
if (!exists) {
  create()
}
file.outputStream(append).use { outputStream ->
  outputStream.write(content.toByteArray())
}
```

`create()` calls `javaFile.createNewFile()` at line 57. `FileSystemModule.kt:141-148` defaults `append` to false; `unifiedfile/JavaFile.kt:73-74` returns `FileOutputStream(this, append)`. Thus the retry's `stagedResult.write(...)` acts on the final path and truncates it. There is no rollback/removal of a created readiness marker in the writer or application catch.

The consumer treats marker existence, not its content, as permission to read. Verbatim `scripts/v12-native-rollback-bridge.mjs:110-115`:

```js
const fetched = adb(["exec-out", "run-as", PACKAGE, "sh", "-c", `test -f ${remote}/result.ready && test -f ${remote}/result.json && cat ${remote}/result.json`], undefined, true);
if (fetched.status === 0) { resultBytes = Buffer.from(fetched.stdout); break; }
await wait(250);
}
if (resultBytes === undefined || now() >= deadline) fail("native_timeout");
const result = JSON.parse(resultBytes);
```

Concrete possible sequence:

1. The successful result write and awaited move finish; native `stagedResult.uri` now identifies `result.json`.
2. `resultReady.write("ready")` creates an empty `result.ready`, then its stream open/write/close throws, for example from an I/O or allocation failure. The empty marker remains visible.
3. The enclosing success catch re-enters `publishResult` with the sanitized failure. Its first write now truncates/rewrites **`result.json`**, not the original staged pathname.
4. The independent host shell sees both files, reads the empty/partial rewrite, and stops polling before `JSON.parse` fails. The retry's later move also faces an already-existing destination. None of this restores the intended immutable-after-readiness guarantee.

A synchronous JS writer does not serialize the independent host shell against native file creation/truncation. A complete move before initial marker creation is sufficient only if the final result cannot subsequently be rewritten. The host's existing sanitization and immutable failed-attempt retention remain correct, but they do not make this protocol race disappear.

**Recommended bounded repair:** separate operation-error serialization from publication-error handling and publish the chosen success/failure envelope only once. Never retry through a moved File or modify the final payload once readiness creation may have occurred. Publication failures should reject through the collector and retain the parent's fixed-code failed attempt without a second final-file write. Add a focused failure regression using a Promise-correct, URI-mutating move fake and a readiness writer that creates its marker before throwing; verify no final rewrite and no malformed host read. Do not accept malformed JSON, extend deadlines, remove guards or lower coverage thresholds. No repair or test was performed here.

## Earlier-warning reconciliation

- **Earlier detached-Promise warning — repaired in the ordinary source path, confidence: 10/10.** Both actual native moves are awaited (`v12NativeRollbackBridge.ts:224,228`); the helper is `async` / `Promise<void>` (`220`), and success and sanitized-failure callers await it (`238,241`). Collector/route completion no longer outruns a still-pending move, and move rejections are not detached. The route awaits collector settlement through `.then/.catch` (`app/__v12-recovery-archive.tsx:11-15`). R1 above is a separate re-entrant publication error, not the old unawaited-move finding repeated.
- **Earlier generic-copy/final-visibility warning — repaired for completed moves, confidence: 10/10.** Staged writing is closed before move starts; the helper awaits native move/copy/delete completion before creating readiness (`223-225`). The actual Android `CopyMoveStrategy.kt:37-46` returns only after `receiveFrom` and source deletion, and `FileSystemPath.kt:180-186` awaits that work. Host polling now requires readiness before the final read (`scripts/v12-native-rollback-bridge.mjs:110`). An empty or partially copied final file while move is pending is no longer itself read permission. There is no remaining unconditional atomic-only rename claim. R1 identifies the distinct post-move retry hole; therefore the original complete-publication guarantee is not yet closed on every error path.
- **Stale/reused outputs — preserved and extended, confidence: 10/10.** The native entry guard rejects consumed, final, staged and readiness claims (`v12NativeRollbackBridge.ts:214-219`), before arm reading and moving. Fixed nonce-scoped private paths and identity gates are unchanged. The new stale-readiness case explicitly exercises the added guard (`v12NativeRollbackBridge.test.ts:283-286`).
- **Malformed input/result handling — preserved, confidence: 10/10.** Host JSON parsing, exact producer/schema/arm shape, sanitized failure pattern, archive equality/hashes, canonical inspection and final runtime/lease revalidation are unchanged (`v12-native-rollback-bridge.mjs:115-135`). No alternate parse, trust or evidence verdict path was added. Crypto, source hashes, lease, expiry, device/APK binding, restore/reopen proof and control protocols were not changed by this diff.

## Inspected tests and attributed execution evidence

Read both complete changed test files; executed neither. The new native-unit case **"does not announce readiness or completion while an asynchronous copy fallback is incomplete"** (`v12NativeRollbackBridge.test.ts:256-282`) deliberately creates an empty final while its Promise is pending, verifies no readiness, fulfills copying, then verifies complete failure JSON plus readiness. This is meaningful host-only coverage of the repaired pending-copy interval. The new host case **"host never reads a partially copied result before the private readiness barrier (HOST UNIT ONLY)"** (`scripts/v12-native-rollback-bridge.test.mjs:79-93`) asserts command gating, one absent-readiness poll and eventual complete inspection.

Neither case models the new R1: the base `MockFile.move` keeps its `readonly path` unchanged (`v12NativeRollbackBridge.test.ts:20,28`), and the delayed-move spy delegates to that fake (`263-272`). Native move does mutate its URI. No readiness create-then-throw case is present. This is a concrete behavioral mismatch relevant to R1, not a request to tighten already-sufficient assertions or repeat broad coverage.

Parent-supplied execution results, **not independently rerun or promoted to native acceptance**:

| Scope | Supplied result / boundary |
| --- | --- |
| Complete affected Jest scope | 38 passing; complete critical statements, branches, functions and lines exactly 100% |
| Complete affected Node scope | 72 passing / three critical modules; all four metrics exactly 100% |
| Types / boundaries | 475 passing |
| Real emulator Garmin diagnostic | Actual credential-free Chaquopy/CPython runtime, disconnected connection state and deterministic JSON passed; non-acceptance evidence |
| Preserved tab glyph observations | Eight actual-phone-width emulator portrait configurations, 360/390dp × Light/Dark × F100/F200; complete single-line labels passed |

Garmin and tab sources are unchanged by this readiness repair, so their prior scoped reviews and supplied emulator observations are retained, not duplicated or invalidated. Those observations are **not** final Samsung acceptance, final-source native rollback proof, MFA/provider/persistence proof or a full Phase 20 PASS. Older pending/failed reports retain their original historical meaning.

## Outcome and preservation

**Outcome: 0 Critical, 1 Warning, source-only 95/100 on the exact four-file range. Do not advance a required zero-warning/100-point source gate on this report.** Awaited copying plus readiness is the correct normal-path completion proof, but the final payload must remain unmodified after readiness can exist. The remaining bounded error-path repair needs affected complete tests/coverage, then the parent's fresh final-source build and exclusive Samsung acceptance; this reviewer performed or authorized none of those live actions.

The **19 pre-existing review Markdown files**, including both earlier batch reports and modified `20-REVIEW.md`, were preserved. Their pre-report sorted `filename + NUL + content-SHA256 + newline` manifest SHA-256 is `6ce7e745e8bb245d3c364df5c0a756966ed0d2180019c619c87e8a58e15937a0`. Only `20-BATCH-REVIEW-cf8cb992.md` was authored.
