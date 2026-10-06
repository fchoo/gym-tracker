# Phase 18: Garmin Import - Pattern Map

**Mapped:** 2026-10-06
**Scope classified:** 28 recommended Phase 18 paths plus 16 integration/security/evidence hotspots
**Direct implementation analogs found:** 26 / 28 recommended paths; boundary-only guidance exists for the FIT protocol and gated live-provider adapter
**Exact analogs:** bounded file intake, transactional command/repository, runtime composition, thin routes, explicit confirmation, contract/evidence runner
**No direct code analog:** FIT protocol decoder and route-SVG renderer

## Planning Boundary First

Phase 18 owns the real local FIT journey, factual detail, and the UI/runtime integration. It does **not** own a second activity identity model or a second Running match ledger.

Phase 13 already reserves these boundaries: `src/domains/activities/importContracts.ts`, `src/domains/activities/activityIdentity.ts`, `src/domains/activities/importCommands.ts`, `src/platform/sqlite/repositories/importedActivityRepository.ts`, `src/domains/running/activityMatchCommands.ts`, and `src/platform/sqlite/repositories/runningActivityMatchRepository.ts` (`13-PATTERNS.md`, new-file table). Those files do not exist in the current checkout. Plan Phase 18 as extensions of the Phase 13 implementations after Phase 13 lands. If they are still absent at execution time, stop on the dependency instead of creating parallel `garmin*` domain/repository abstractions.

Phase 14 owns the shared shell, appearance, header, sheets, toasts, focus behavior, and final semantic tokens; Phase 17 owns stable Running opportunity/slot/revision identity. Phase 18 consumes those contracts and must not recreate them. In particular, do not copy the current v1.1 palette into Garmin screens and do not fall back to date-only or “active plan” matching.

The official provider adapter is different: `src/platform/garmin/garminActivityAdapter.ts` is intentionally conditional. While the activation gate is closed, production exposes a closed capability and must not contain guessed endpoints, embedded secrets, simulated consent, or a live network stub (`18-RESEARCH.md:259`; ADR `v1.2-garmin-import.md:14,61-75`).

No authentication middleware applies to local FIT import. The trust boundaries are the read-only file port, strict decoder/domain validation, owner-scoped SQLite identities, route-param allowlists, and receipt-backed exclusive transactions.

## File Classification

### Recommended Phase 18 files

| New/Modified File | Role | Data Flow | Closest Existing Analog | Match Quality |
|---|---|---|---|---|
| `app/garmin/index.tsx` | route | request-response | `app/session/[sessionId].tsx` | role-match |
| `app/garmin/import.tsx` | route/controller | file-I/O + request-response | `app/session/[sessionId]/correct.tsx` + `src/ui/portability/useManualBackupController.ts` | composite |
| `app/garmin/activity/[activityId].tsx` | route | request-response | `app/session/[sessionId].tsx` | exact structural |
| `app/garmin/activity/[activityId]/restore.tsx` | route | event-driven + request-response | `app/more/removed-sessions.tsx` / `app/session/[sessionId]/correct.tsx` | role-match |
| `app/garmin/match/[activityId].tsx` | route | request-response | `app/library/plan/[planId]/replace/[occurrenceId].tsx` | exact structural |
| `src/bootstrap/garminImportRuntime.tsx` | provider/service | file-I/O + request-response | `src/bootstrap/ownedPlanRuntime.tsx` + `src/bootstrap/workoutAppRuntime.tsx` | exact structural |
| `src/domains/activities/importContracts.ts` | model/config | transform | `src/domains/metrics/contracts.ts` | role-match |
| `src/domains/activities/normalizeFitActivity.ts` | utility | transform | `src/domains/portability/backupContracts.ts` + `src/domains/portability/backupFormat.ts` | role-match |
| `src/domains/activities/activityIdentity.ts` | utility | transform | `src/domains/portability/mergePlan.ts` | role-match |
| `src/domains/activities/importCommands.ts` | service | file-I/O + request-response | `src/domains/scheduling/scheduleCommands.ts` | exact structural |
| `src/domains/activities/activityDetails.ts` | model/utility | transform | `src/domains/workout/sessionDetail.ts` | role-match |
| `src/domains/activities/garminActivitySourcePort.ts` | port | request-response | `src/domains/backup/googleAuthPort.ts` | role-match; closed capability only |
| `src/domains/running/activityMatchCommands.ts` | service | event-driven + request-response | `src/domains/scheduling/scheduleCommands.ts` | exact structural |
| `src/platform/files/expoFitFilePort.ts` | adapter | file-I/O | `src/platform/files/expoBackupFilePort.ts` | exact |
| `src/platform/garmin/fitDecoderAdapter.ts` | adapter | transform | `src/platform/crypto/aesGcmArchivePort.ts` + `src/domains/portability/backupFormat.ts` | boundary-match; protocol semantics new |
| `src/platform/garmin/garminActivityAdapter.ts` | adapter | request-response | `src/platform/google/googleAuthAdapter.ts` + `src/platform/google/driveBackupStoreAdapter.ts` | future-only; do not implement live now |
| `src/platform/sqlite/repositories/importedActivityRepository.ts` | repository | CRUD + batch | `src/platform/sqlite/repositories/scheduleRepository.ts` | exact structural |
| `src/platform/sqlite/repositories/runningActivityMatchRepository.ts` | repository | event-driven | `src/platform/sqlite/repositories/scheduleRepository.ts` | exact structural |
| `src/ui/screens/GarminSyncScreen.tsx` | component | request-response | `src/ui/screens/RemovedSessionsScreen.tsx` | role-match |
| `src/ui/screens/ActivityImportScreen.tsx` | component/controller | file-I/O + request-response | `src/ui/portability/useManualBackupController.ts` | exact state-machine pattern |
| `src/ui/screens/ImportedActivityDetailScreen.tsx` | component | request-response | `src/ui/screens/SessionDetailScreen.tsx` | exact structural |
| `src/ui/screens/ActivityMatchScreen.tsx` | component | request-response | `src/ui/screens/ExerciseReplacementScreen.tsx` | exact structural |
| `src/ui/__tests__/GarminSyncScreen.test.tsx` | test | request-response | `src/ui/__tests__/RemovedSessionsScreen.test.tsx` | role-match |
| `src/ui/__tests__/ActivityImportScreen.test.tsx` | test | file-I/O + request-response | `src/platform/files/expoBackupFilePort.test.ts` + `src/ui/portability/useManualBackupController.test.tsx` | composite |
| `src/ui/__tests__/ImportedActivityDetailScreen.test.tsx` | test | request-response | `src/ui/__tests__/RemovedSessionsScreen.test.tsx` + `app/__tests__/completion-route.test.tsx` | role-match |
| `src/ui/__tests__/ActivityMatchScreen.test.tsx` | test | request-response | `src/ui/__tests__/PlanImpactReplacement.test.tsx` | exact structural |
| `src/testing/contracts/garminImport.contract.ts` | test contract | file-I/O + transform + batch | `src/testing/contracts/sqliteKernel.contract.ts` | exact structural |
| `tests/integration/garmin-import.test.ts` | integration test | file-I/O + CRUD + event-driven | `tests/integration/schedule-commands.test.ts` + `tests/integration/portable-merge.test.ts` | composite |

### Existing integration files and inferred evidence files

| File | Role / Data Flow | Phase 18 use | Pattern authority |
|---|---|---|---|
| `app/_layout.tsx` | config / request-response | Register all five Garmin stack routes explicitly; do not add a tab. | `RootNavigator`, lines 32-74 |
| `src/bootstrap/workoutAppRuntime.tsx` | provider / request-response | Compose Garmin services over the one existing kernel/lifecycle and dispose them with it. | `RuntimeServices`, lines 971-1050; provider init/disposal, lines 2054-2088 and 2143-2289 |
| `src/platform/sqlite/migrations/index.ts` | config / batch | Register only the migration allocated by the Phase 13 foundation. Never renumber/edit an applied migration. | `migrations`, lines 28-60 |
| `src/domains/portability/backupContracts.ts` | config/model / batch | Create a successor logical format and explicit import/match table graph; continue reading v1/v2. | version/table allowlist, lines 1-109; exact parser, lines 392-474 |
| `src/platform/sqlite/repositories/logicalBackupRepository.ts` | repository / batch | Add owner-scoped collection rules for every retained source table. | `LOGICAL_BACKUP_TABLE_FILTERS`, `collectLogicalBackupSnapshot` |
| `src/platform/sqlite/repositories/logicalRestoreRepository.ts` | repository / batch | Extend dependency order, restore verification, and source graph publication. | existing restore transaction and verification pipeline |
| `src/platform/sqlite/repositories/logicalMergeRepository.ts` | repository / batch | Extend aggregate closure, ID remaps, write order, exact read-back, and rebuild state. | current full-plan aggregate pipeline |
| `src/platform/sqlite/repositories/restoreReconciliationRepository.ts` | repository/service | Rebuild `running_opportunity_completions` from match events after restore/merge. | `rebuildSubjects`, `reconcileAndRebuild` |
| `src/testing/contracts/portableMerge.contract.ts` | test contract / batch | Add imported aggregate/source-reference/payload/chunk/match remap and tombstone cases. | ordered case registry + adapter runner |
| `plugins/withAndroidBackupRules.ts` | config/security | Exclude Garmin temporary files and any credential storage from both cloud backup and device transfer. | lines 10-42 |
| `scripts/run-coverage-gate.mjs` | config/test | Register all integrity-critical Phase 18 domain/adapter/command files at 100% branch/line/function/statement coverage. | lines 16-123 and 171-204 |
| `app/__phase18-garmin-import.tsx` *(inferred)* | guarded test route | Run native contract only in the development-test profile with suite + confirmation gates. | `app/__phase12-google-auth-smoke.tsx` |
| `scripts/run-phase18-maestro.mjs` *(inferred)* | test runner | Bind source tree, APK, device, fixture hashes, distinct required stages, and non-skipped reports. | `scripts/run-phase12-maestro.mjs` |
| `scripts/verify-phase18-evidence.mjs` *(inferred)* | evidence validator | Reject stale/missing/duplicate/skipped/mismatched or private evidence. | `scripts/verify-phase12-evidence.mjs` |
| `scripts/phase18-evidence-scripts.test.mjs` *(inferred)* | test | Test every verifier rejection path. | `scripts/phase12-evidence-scripts.test.mjs` |
| `maestro/phase18/garmin-import.yaml` *(inferred)* | native E2E | Drive the approved local import/detail/match states; provider simulations stay test-only. | `maestro/phase12/automatic-drive-backup.yaml` |

The inferred evidence names are not specified upstream. The planner may rename them, but must keep the Phase 12 route → runner → evidence → verifier shape and source/APK/device/fixture identity binding.

## Pattern Assignments

### `src/platform/files/expoFitFilePort.ts` and its unit test

**Analog:** `src/platform/files/expoBackupFilePort.ts` (`SelectedRestoreFile`, `ExpoRestoreFileDriver`, `RestoreFilePortError`, `createExpoRestoreFilePort`, `createProductionExpoRestoreFilePort`).

**Port and privacy shape** (`expoBackupFilePort.ts:18-28,47-67`):

```typescript
type SelectedRestoreFile = Readonly<{
  size: number;
  open(): Readonly<{
    readBytes(length: number): Uint8Array;
    close(): void;
  }>;
}>;

export type ExpoRestoreFileDriver = Readonly<{
  pickSingleArchive(): Promise<SelectedRestoreFile | null>;
}>;

export class RestoreFilePortError extends Error {
  readonly kind = "storage" as const;
  readonly retryable = true;
  readonly correlationCode = "GT-RESTORE03" as const;
}
```

**Bounded read/error/cleanup shape** (`expoBackupFilePort.ts:69-120`):

```typescript
file = await driver.pickSingleArchive();
if (file === null) return null;
if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > maxBytes) {
  throw new RestoreFilePortError("limit_exceeded");
}
try {
  handle = file.open();
  const bytes = handle.readBytes(maxBytes);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxBytes) {
    throw new RestoreFilePortError("limit_exceeded");
  }
  if (bytes.byteLength !== file.size) {
    throw new RestoreFilePortError("read_failed");
  }
  return new Uint8Array(bytes);
} finally {
  handle?.close();
}
```

**Production native seam** (`expoBackupFilePort.ts:172-194`):

```typescript
const selected = await File.pickFileAsync({
  mimeTypes: "application/octet-stream",
  multipleFiles: false,
});
if (selected.canceled) return null;
const handle = selected.result.open(FileMode.ReadOnly);
```

Copy the private-driver/public-port split, cancellation as `null`, typed safe errors, copy-on-return, `finally` close, and production-only dynamic `require`. Improve the FIT port in one important way: request `maxBytes + 1` and reject if the sentinel byte exists. MIME, extension, and declared `size` are early hints only; actual bytes are authoritative. The public result must not contain URI or filename.

**Test analog:** `expoBackupFilePort.test.ts:537-645` creates an injected selected file and proves cancellation, cap checks, lying provider, read failure, close failure, and `FileMode.ReadOnly`. Preserve that table of cases and add exact limit-1/limit/limit+1 plus cleanup after every terminal path.

---

### `src/platform/garmin/fitDecoderAdapter.ts`

**Analogs:** `src/platform/crypto/aesGcmArchivePort.ts` for adapter isolation/copying/error mapping; `src/domains/portability/backupFormat.ts` for strict binary-envelope validation.

**Adapter ownership pattern** (`aesGcmArchivePort.ts:37-50,89-125`):

```typescript
export class ArchiveCryptoError extends Error {
  readonly kind = "crypto" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-BACKUP02" as const;
  // bounded code union only
}

export function createAesGcmArchivePort(driver: AesGcmArchiveDriver) {
  return Object.freeze({
    async encrypt(input) {
      // validate, copy inputs, call driver, validate/copy output
      // map unknown failures to a bounded public error
    },
  });
}
```

**Envelope check pattern** (`backupFormat.ts:267-318,356-365`):

```typescript
if (archive.byteLength > BACKUP_LIMITS.maxArchiveBytes) {
  throw new BackupFormatError("backup_archive_limit_exceeded");
}
if (archive.byteLength < PREFIX_BYTES + AES_GCM_ARCHIVE_TAG_BYTES
  || !MAGIC.every((byte, index) => archive[index] === byte)) {
  invalid();
}
// Parse a bounded header, validate exact structure, then slice payload/tag.
```

Phase 18 must add protocol-specific checks before trusting the SDK: 12/14-byte header, declared data size, **exact** total envelope length, FIT signature, SDK CRC/integrity, explicit decoder options (`legacyArrayMode: false`), definition/message counters, and `errors.length === 0`. Any SDK exception, error entry, or bound breach discards all returned message groups; never normalize a partial decode. Emit only a copied, bounded plain DTO and parser-version/options provenance—no SDK objects, native errors, URI, or path.

There is no same-role FIT parser in the codebase. The code above is a boundary/error pattern only; FIT semantics come from the ADR/research and the selected SDK after the gate.

---

### `src/domains/activities/importContracts.ts`, `normalizeFitActivity.ts`, `activityIdentity.ts`, `activityDetails.ts`

**Contract analog:** `src/domains/metrics/contracts.ts`.

**Strict versioned schema and boundary error** (`metrics/contracts.ts:27-64,76-83`):

```typescript
export const MetricIdentitySchema = z.strictObject({
  profile: z.enum(METRIC_PROFILES),
  contractVersion: z.number().int().positive().safe(),
  exerciseMetricGeneration: z.number().int().positive().safe(),
});

export function parseMetricIdentity(input: unknown): MetricIdentity {
  const result = MetricIdentitySchema.safeParse(input);
  if (!result.success) {
    throw new MetricBoundaryError("validation", "metric_identity_invalid");
  }
  return result.data;
}
```

Use strict, versioned discriminated unions; positive/nonnegative safe integers; SI units; fixed lower-case 64-hex hashes; explicit presence/provenance; and nullable/absent optional facts rather than fabricated zero values. Keep SDK types out of these files.

**Pure identity-decision analog:** `src/domains/portability/mergePlan.ts` (`PortableMergeOperation`, `rootOperations`, `buildPortableMergePlan`). It maps validated facts to an exhaustive immutable decision before writes (`mergePlan.ts:93-146,834-900,1420-1475`). `resolveActivityIdentity` needs equivalent explicit outcomes for new, exact replay, source revision review, verified additional source, identity conflict, possible duplicate, and removed/tombstoned activity. Do not collapse the two keys into one lookup.

**Strict validation analog:** `backupContracts.ts:168-243,311-344,392-474` validates plain objects, exact keys, bounds, identities, and totals before returning the typed object. `normalizeFitActivity` should likewise return nothing until exactly one supported Running session and all subtype/lap/sample/output bounds pass.

**Detail-model analog:** `src/domains/workout/sessionDetail.ts:64-134` defines a read-only source-backed model whose evidence and revision remain explicit. `activityDetails.ts` should project the accepted payload revision only, in source-present order: `Distance`, `Elapsed`, verified `Moving` or `Timer`, `Avg pace`, optional HR, source-order laps, and segmented source coordinates. Do not put formatting, SQL rows, SDK objects, or mutation callbacks into the domain detail model.

---

### `src/domains/activities/importCommands.ts` and `src/platform/sqlite/repositories/importedActivityRepository.ts`

**Command analog:** `src/domains/scheduling/scheduleCommands.ts`.
**Repository analog:** `src/platform/sqlite/repositories/scheduleRepository.ts`.
**Transaction authority:** `src/platform/sqlite/serializedWriter.ts`.

**Command sequence** (`scheduleCommands.ts:600-735`):

```typescript
const requestSha256 = await mutationDigest(context, operation, value);
const replay = await replayMutation(
  context,
  value.requestId,
  requestSha256,
  operation,
);
if (replay !== null) return replay;

const state = assertActionState(
  await context.repository.readActionState({ /* stable identity */ }),
  value,
);
const staged = Object.freeze({
  operation,
  requestId: value.requestId,
  requestSha256,
  expectedScheduleRevision: value.expectedScheduleRevision,
  transition,
});
return postCommit(context, await context.repository.applyOpportunityAction(staged));
```

Copy this order: validate bounded inputs/revisions → canonicalize/hash request → replay matching receipt before mutable reads → read current state → compute a pure decision → stage immutable repository input → run one transaction → invalidate projections only after a committed result.

**Receipt/conflict pattern** (`scheduleRepository.ts:471-508`):

```typescript
if (receipt.requestSha256 !== requestSha256) {
  throw new ScheduleRepositoryError("schedule_request_identity_conflict");
}
return Object.freeze({
  ...receipt.result,
  outcome: "already_committed",
});
```

**Atomic write pattern** (`scheduleRepository.ts:1313-1339,1994-2053`):

```typescript
const receipt = await readReceipt(transaction, input.requestId);
if (receipt !== null) return replayResult(receipt, input.requestSha256);
await assertMutationAggregate(transaction, input);
// Persist facts, revisions, event, and receipt in this transaction.
return result;

return await kernel.write((transaction) =>
  applyOpportunityTransaction(transaction, input)
);
```

The writer itself serializes FIFO `BEGIN IMMEDIATE`, rolls back on every command/commit failure, and resolves only after `COMMIT` (`serializedWriter.ts:27-85`). Never acknowledge import success from inside the transaction callback or from UI state.

Phase 18 repository-specific rules:

- Resolve `(owner, provider, providerSubject, externalActivityId)` and `(owner, SHA-256(exact bytes))` independently inside the same transaction.
- Persist immutable payload revisions and child laps/chunks. Change only the aggregate's accepted-payload pointer after explicit revision acceptance.
- Same hash replays without new facts; same external ID/different hash stages review; external→A/hash→B is a zero-write conflict; fuzzy similarity is review-only.
- Import attempt markers are operational, opaque, non-portable, and cleared in the source transaction. Raw FIT is temporary unless separately approved.
- A test-only observer may inject failure after each aggregate/payload/lap/chunk/reference/decision/receipt insert. It must never change production semantics.

---

### `src/domains/running/activityMatchCommands.ts` and `runningActivityMatchRepository.ts`

**Primary analog:** the same schedule command/repository pair, especially `executeOpportunityAction` and `applyOpportunityTransaction`.

Use `scheduleCommands.ts:575-735` for bounded ID/revision validation, receipt replay, exact current-state read, pure transition, and staged command. Use `scheduleRepository.ts:1126-1147` for in-transaction ownership/revision rechecks and `scheduleRepository.ts:1313-1339` for atomic event + current relation + receipt.

The match command must carry all of: request ID, owner/activity ID, accepted payload revision, opportunity ID, schedule version, plan-day ID, stable Running session slot/revision, and expected current relation state. `listActivityMatchCandidates` is read-only; selecting or preselecting a radio writes nothing. Only `Confirm match` may append the event and update the rebuildable completion overlay. Unmatch/reassign append new audited events; they do not delete history.

**UI match analog:** `ExerciseReplacementScreen.tsx:284-342` latches a stable request by input fingerprint, carries a preview token/revision, preserves review on failure, and refreshes on stale state. Its accessible radio-row pattern is at `ExerciseReplacementScreen.tsx:131-183,423-500`.

```typescript
const fingerprint = JSON.stringify(inputBase);
const requestId = requestRef.current?.fingerprint === fingerprint
  ? requestRef.current.requestId
  : createRequestId?.() ?? /* deterministic fallback */;
requestRef.current = { fingerprint, requestId };
await replaceExercise({ requestId, ...inputBase });
```

Do not copy the Strength-specific session foreign key or date-only/current-active-plan assumptions. Phase 18 binds the Phase 17 stable Running slot and accepted imported payload revision.

---

### `src/bootstrap/garminImportRuntime.tsx`, `workoutAppRuntime.tsx`, and provider capability

**Facade analog:** `src/bootstrap/ownedPlanRuntime.tsx:46-117,120-262`.

```typescript
export function createOwnedPlanRuntimePort(
  kernel: SqliteKernel,
  dependencies: Readonly<{
    nowMs(): number;
    randomUUID(): string;
    sha256(value: string): Promise<string>;
  }>,
) {
  const repository = createOwnedPlanRepository(kernel);
  const commandContext = {
    repository,
    invalidate: async () => undefined,
    sha256: dependencies.sha256,
  };
  return Object.freeze({ /* typed reads/commands only */ });
}
```

**Shared lifecycle analog:** `workoutAppRuntime.tsx:971-1050,2054-2088,2143-2289`. Add a Garmin runtime/service member to the existing dependency graph, create it from the already-open kernel, and close/cancel it with `closeServices`. Do not open a database in `garminImportRuntime.tsx` or any route.

Follow the existing explicit unavailable fallback (`workoutAppRuntime.tsx:2198-2222`): provider capability defaults closed and throws/returns unavailable for gated operations. Local FIT operations remain available. Only a later approved official adapter may copy `googleAuthAdapter.ts:26-71` generation fencing:

```typescript
let generation = 0;
const startedAt = ++generation;
// ... external work ...
if (startedAt !== generation) throw new Error("google_connection_stale");
async disconnect() { ++generation; connected = null; await bridge.signOut(); }
```

This is a generation-fence pattern, not authorization to reuse Google libraries, store Garmin tokens on-device, or implement a broker.

---

### Garmin routes and screens

**Explicit stack registration:** copy `app/_layout.tsx:47-69` and add the five approved Garmin paths. Do not modify `app/(tabs)/_layout.tsx` to add Garmin as a fifth root.

**Thin route:** copy `app/session/[sessionId].tsx:30-56,92-125` or the smaller `app/library/plan/[planId]/replace/[occurrenceId].tsx:14-40`: read params, normalize string/string[] values, obtain runtime, render a screen, and translate screen events to `router.back/push/replace`. Routes may not import `/platform/` or execute SQL; this is enforced by `scripts/check-boundaries.mjs:103-160`.

Add a stricter Phase 18 parser than the existing `?? "unknown"` fallback: accept only an opaque local activity ID and `workout | calendar | library | progress`. Reject arbitrary href/URL, provider URL, filename, account subject, or external activity ID. Use the navigation stack for return behavior rather than passing a caller-provided return URL.

**Loading/error/read-only detail:** `app/session/[sessionId].tsx:37-89` shows a generation-aware load, bounded generic error copy, and skeletons; `SessionDetailScreen.tsx:109-145,214-278` receives a domain snapshot and renders facts without importing a repository. `ImportedActivityDetailScreen` must remain read-only; matching/restoring are separate routes.

**Import state machine:** copy the generation/latch/token cleanup structure from `useManualBackupController.ts:60-121`. Cancellation increments generation, invalidates the precommit token, cleans temporary material, and ignores/discards late work. The key Phase 18 difference is the commit boundary: cancellation exists before `kernel.write` starts and disappears after it starts.

**Match/revision UI:** copy `ExerciseReplacementScreen.tsx:186-239,284-342` for loading, stale refresh, stable request identity, selected-state preservation, and safe failure copy. Copy its radio semantics from lines 131-183. Selection never invokes the mutation.

**Removed restore UI:** copy `RemovedSessionsScreen.tsx:75-131,202-226`: keep the tombstoned card visible, open a separate `ConfirmationSheet`, send the expected revision, and keep source state unchanged on failure.

**Route preview:** there is no existing `react-native-svg` implementation in `src/` or `app/`. Build a new small `RoutePreview` component behind the detail read model. It may only draw validated, segmented, downsampled display coordinates, must have one concise accessible text alternative, and must hide individual SVG points. No map tiles, geocoding, road snapping, or location permission.

---

### Component and route tests

Use React Native Testing Library by role/name/state, not implementation selectors.

**Explicit confirmation and exact payload** (`PlanImpactReplacement.test.tsx:679-724`):

```typescript
await completeReplacementReview();
await fireEvent.press(screen.getByRole("button", { name: "Save replacement" }));
await waitFor(() => expect(replaceExercise).toHaveBeenCalledTimes(1));
expect(replaceExercise).toHaveBeenCalledWith(expect.objectContaining({
  expectedPlanRevision: replacementPreview.planRevision,
  previewToken: replacementPreview.previewToken,
  scope: "all_occurrences",
}));
```

**Safe failure and source retention** (`RemovedSessionsScreen.test.tsx:104-125`) verifies that a failed restore leaves the source-backed item present and leaks no storage detail. `PlanImpactReplacement.test.tsx:726-770` likewise preserves the selected/reviewed state and asserts raw exception text is absent.

Every Garmin screen suite should cover its complete named state machine from the UI spec, exact copy, Back/Escape, focus restoration, duplicate activation, 360/390/600/840 widths, landscape, 200% font, keyboard/D-pad, reduced motion, and Light/Dark/System. Route tests mock `expo-router` and runtime as in `app/__tests__/completion-route.test.tsx:24-57,100-133`.

---

### Domain, repository, and integration tests

**Source-owned contract ledger:** copy `src/testing/contracts/sqliteKernel.contract.ts:14-41,88-110,566-645`: one ordered `as const` case registry, typed adapter, bounded error codes, zero skipped cases, per-case duration, and an aggregate result.

**Failure injection and concurrency:** copy `sqliteKernel.contract.ts:422-517`. It cuts before/after every statement and proves all fixture tables remain empty, proves the command cannot settle before COMMIT, and races duplicate commands through unique constraints. Phase 18 must cut every aggregate/payload/lap/chunk/reference/receipt/decision/match insert plus `beforeCommit`, COMMIT, rollback, and post-commit refresh.

**Receipt/revision matrix:** `tests/integration/schedule-commands.test.ts:1398-1435,1576-1646,1648-1688,1837-1975` proves absent/changed receipts, stale revisions, zero leaked event rows, replay before mutable-state access, and direct repository replay. Mirror it for manual→manual, manual→API, API→manual, same external/different hash, different external/same hash, external→A/hash→B, removed aggregate, and concurrent order.

Use real `node:sqlite`/production kernel for repository and integration proof. Mocks are appropriate at file/decoder/UI seams but cannot prove atomicity, constraints, receipt replay, or portability.

## Shared Patterns

### Error handling and diagnostics

**Source:** `src/domains/shared/diagnostics.ts:3-31,57-100`.

```typescript
export type DiagnosticEntry = Readonly<{
  timestampMs: number;
  operation: string;
  category: AppErrorKind;
  code: string;
  correlationCode: string;
  revision?: number;
  durationMs?: number;
  attempt?: number;
}>;
```

Diagnostics are allowlisted and bounded. Never add URI, filename, path, provider subject, external activity ID, token, FIT bytes, coordinates, heart rate, or raw exception text. Screen copy maps typed codes to fixed messages and always says what remained unchanged.

### Portability and dirty generation

`backupContracts.ts:1-15,26-109` is an explicit versioned allowlist. Add a successor format; preserve v1/v2 reads. Extend owner filtering, graph/reference validation, ID remaps, restore/merge order, capacity preflight, tombstones, and deterministic rebuild together.

Do not rely on the live allowlist to retrofit old migrations. `0023_automatic_drive_backup.ts:27-58` generates INSERT/UPDATE/DELETE triggers from the then-current table set; the successor migration must add and verify triggers for every retained imported/match **source** table after creation. Do not add dirty triggers to rebuildable projections such as `running_opportunity_completions`.

### Android backup boundaries

`plugins/withAndroidBackupRules.ts:10-42` maintains separate `<full-backup-content>`, `<cloud-backup>`, and `<device-transfer>` exclusions. Add Garmin temporary storage and any credential path to all applicable sections, then test the generated XML/manifest. The database remains excluded; logical backup is the explicit portable path.

### Module boundaries

`scripts/check-boundaries.mjs:103-160` forbids platform imports/SQL in routes and UI, cross-domain internal imports, and raw writer imports outside `src/platform/sqlite`. New screens consume domain read models and runtime commands only. New repositories receive `SqliteKernel`; only repository/platform code receives transaction executors.

### Integrity coverage

`scripts/run-coverage-gate.mjs:16-123,171-204` uses an explicit `integrityCriticalFiles` list and requires 100% statements, branches, functions, and lines. Add the file port, decoder adapter, import contracts/normalizer/identity/commands, and match commands. Register repositories too if they carry decision logic not already exercised through integration suites.

## SDK and Provider Gates

1. `@garmin/fitsdk` is absent from `package.json`/`package-lock.json`. Do not edit either before explicit human acceptance of the FIT Protocol License and package legitimacy (`18-RESEARCH.md:79,135,154-166,656-664`).
2. If accepted, pin exactly `21.217.0`; run a release-mode Expo 57 / RN 0.86 Hermes/Metro smoke before writing the production decoder adapter. Prove root-package bundling, `TextDecoder`, BigInt `DataView`, one valid decode, CRC rejection, no Node `Buffer` polyfill, and bounded maximum-fixture time/memory.
3. If that smoke fails, keep `FitDecoderPort` and return for a decoder decision. Do not silently adopt `fit-file-parser`, hand-roll FIT, or move decoding into Reanimated's UI runtime.
4. Numeric byte/message/lap/sample/output/route-point/time/memory limits are not yet authorized. Calibrate from synthetic/public-license fixtures on a release build, lock constants, and add limit-1/limit/limit+1 tests before enabling the picker.
5. `garminActivityAdapter.ts` remains unimplemented while the official activation gates are closed. Local FIT does not imply provider access. Mocks never change production capability and never close GAR-04–GAR-07.
6. A future live adapter requires a separately approved confidential broker and current partner contract. Never embed a client secret in Expo config, JS, APK, or SecureStore; never invent endpoint/scope/callback/webhook behavior.

## Native and Security Evidence Pattern

Use the Phase 12 guarded route and verifier family, not old screenshots or generic logs.

**Guarded route** (`app/__phase12-google-auth-smoke.tsx:14-40`, `src/testing/phase12GoogleAuthSmoke.ts:1-14`): require `development-test`, `nativeContractsEnabled === true`, exact suite, and an explicit confirmation string; otherwise redirect to `/`.

**Runner identity** (`scripts/run-phase12-maestro.mjs:12-55`): validate schema/suite/profile/package, embedded JS bundle, exact Git HEAD, source-tree digest, APK hash, device, ordered distinct stages, zero failures/skips, and hashes for every report.

**Evidence privacy/staleness** (`scripts/verify-phase12-evidence.mjs:40-80,83-98`): reject any identity mismatch, count mismatch, skipped/failed case, stale APK/source/report, or forbidden secret/personal field. Extend the forbidden scan for URI, filename/path, provider subject/external ID, token/secret, FIT bytes, coordinates, HR, and device serial outside the approved manifest identity field.

Phase 18 evidence must bind fixture IDs and SHA-256 values without embedding private FIT content. It must prove native picker cancel/error, exact-byte hashing, Hermes decoding, all supported subtypes, CRC/truncation/trailing bytes/bounds, offline import/detail/match, pre/post-commit process death, focus/Back behavior, and release-mode resource behavior. External provider rows remain explicitly blocked, not skipped-as-passed.

## Anti-Patterns

- Do not decode or hash in a route/screen; do not import platform/SQLite modules from UI.
- Do not trust extension, MIME, declared file size, SDK `checkIntegrity()` alone, or decoder partial output.
- Do not use Node `fs`/`Buffer` parser entry points in the React Native adapter.
- Do not infer treadmill from missing GPS or outdoor from present GPS; subtype comes only from validated sport/sub-sport evidence.
- Do not use the phone's current time zone to place a historical activity; persist source/owner-confirmed provenance.
- Do not dedupe on normalized facts, filename, date, distance, or one composite external-ID/hash key.
- Do not mutate accepted facts on changed-source delivery; stage an immutable revision for explicit review.
- Do not let radio selection, Back, Cancel, view-detail, or possible-duplicate review write a match/import decision.
- Do not synthesize a strength `workout_session` or use an active-plan/date-only lookup for Running matching.
- Do not treat `running_opportunity_completions` as source truth; rebuild it from immutable match events.
- Do not retain raw FIT silently, log health/location facts, or include credentials/jobs/projections in logical backup.
- Do not add a Garmin tab, arbitrary return URL, map SDK, geocoder, route snapping, location permission, or canned route.
- Do not implement a broker/live provider stub, guessed endpoint, embedded secret, or simulated production success.
- Do not mark host-only, mocked, stale, skipped, or identity-mismatched evidence as native closure.

## No Direct Analog Found

| File/Concern | Reason | Planner direction |
|---|---|---|
| `src/platform/garmin/fitDecoderAdapter.ts` protocol semantics | No FIT parser exists in the repository. | Use the adapter/error/envelope patterns above, but derive FIT checks only from the approved SDK and ADR after both gates pass. |
| Route SVG projection inside `ImportedActivityDetailScreen` or a small component | `react-native-svg` is installed (`package.json:121`) but no current `src/`/`app/` SVG implementation exists. | Implement a minimal local static projection from validated segmented coordinates; test accessible text and absence states. |
| `src/platform/garmin/garminActivityAdapter.ts` live implementation | External program access, current partner contract, and confidential-broker architecture are not approved. | Do not implement. Expose closed capability at domain/bootstrap only. |

## Metadata

**Primary search scope:** `app/`, `src/bootstrap/`, `src/domains/`, `src/platform/`, `src/testing/`, `tests/`, `scripts/`, `plugins/`
**Canonical scope files:** `18-CONTEXT.md`, `18-UI-SPEC.md`, `18-RESEARCH.md`, `.planning/architecture/v1.2-garmin-import.md`
**Current dependency state:** `src/domains/activities/` and `src/domains/running/` are absent; Phase 13/17 must land before Phase 18 consumes their boundaries.
**Pattern extraction date:** 2026-10-06
