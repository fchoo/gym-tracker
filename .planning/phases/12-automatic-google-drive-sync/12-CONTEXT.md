# Phase 12: Automatic Google-Drive Sync - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Let the owner **optionally** sign into their own Google account so the app
automatically keeps **one app-created, client-side-encrypted store** synced
across their personal devices through Google Drive (DATA-10). Sync is built as
**derivative replication over the Phase 11 merge engine**: local SQLite stays
authoritative, the offline workout path is never blocked or mutated, and every
failure is safe and retryable. Reconciles on **app foreground, background/close,
and after a workout/edit commit** (near-real-time, not millisecond-live).

**Out of scope:** the merge engine itself (Phase 11), any change to the offline
workout loop, multi-account/family sharing (single-owner, same account on every
device). No shared backend, no third-party data processor beyond Google Drive
holding ciphertext.
</domain>

<decisions>
## Implementation Decisions

### Key distribution (the P12 gray area)
- **D-01:** The sync encryption key is **passphrase-derived** (Argon2id, same
  crypto family as the GTBK backup password). A new device syncs by signing into
  Google **and** entering the same sync passphrase once. Google/Drive never sees
  the key or passphrase; only ciphertext + sizes/timestamps. The derived key is
  cached in `expo-secure-store` / Android Keystore, never written to Drive,
  logs, analytics, or exports. — **Reversibility:** one-way — the passphrase→key
  derivation defines what already-uploaded ciphertext can be decrypted;
  changing it later requires a re-encrypt/re-upload migration on every device.

### Transport & reuse
- **D-02:** Reuse `helper-payroll-app`'s proven pieces: `react-native-nitro-
  google-signin` (One-Tap + `drive.file` scope), Drive REST v3 client
  (files list/create/update, multipart upload/download), `@noble/ciphers`
  XChaCha20-Poly1305, `expo-secure-store`. **Do NOT adopt its Firestore
  transport** — that existed only for its multi-account family case; single
  account here means the same `drive.file` grant sees the app-created file on
  every device.
- **D-03:** **One app-created Drive file per account** holds the canonical
  encrypted store (+ a change-log for merge). `drive.file` scope only (app can
  only see files it created). Sign-in and "Disconnect sync" are explicit; the
  app is fully usable offline and unsynced without ever signing in.

### Sync as derivative replication
- **D-04:** Sync **replicates over the DATA-08 merge engine** — per-record-class
  conflict rules (Phase 11 D-01), append/merge of a change-log, **never a blind
  overwrite**. Any auth/network/decryption/conflict/write failure leaves local
  data unchanged and is retryable; sync never blocks or delays the live workout
  critical path. — **Reversibility:** one-way (behavioral contract) — sync must
  never be able to corrupt or block local data; a design that could is not
  acceptable.
- **D-05:** New native deps (Google sign-in, Noble ciphers) must pass the repo's
  **dependency-audit gate** before enablement.

### Claude's Discretion
- Change-log format and how deltas are chunked/uploaded, the debounce/coalesce
  policy for the three triggers, conflict-preview surfacing for sync (silent vs
  notify), and the sync-status indicator styling on Today/Settings — planner
  decides, provided client-side encryption, non-blocking, retryable, and
  merge-engine reuse all hold.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — DATA-10 text; the "Architecture note" reuse
  block; "Sync is derivative and non-authoritative" + "Sync security"
  cross-cutting constraints; owner sync decisions (2026-09-15).
- `.planning/ROADMAP.md` §"Phase 12: Automatic Google-Drive Sync" — goal + 5
  success criteria (verification anchor).
- `.planning/design/v1.1-UX-FLOW.md` §8 + "Sync UX (DATA-10)" — Settings → Data
  & recovery states (Not connected / Synced / Paused) and behavior.

### Reuse source (helper-payroll-app — READ before implementing transport)
- `/Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-auth/google-auth.ts`
  — `DRIVE_FILE_SCOPE`, `signInWithGoogle`, `getGoogleDriveAccessToken`,
  `refreshGoogleDriveAccessToken`, `signOutGoogle`, error mapping.
- `/Users/bytedance/Documents/personal/helper-payroll-app/apps/mobile/src/features/google-drive/drive-client.ts`
  — Drive REST v3 paths, file list/create/update, multipart upload, parse/limit
  guards. Adapt from named recovery folder/file to a single app-created store file.
- `/Users/bytedance/Documents/personal/helper-payroll-app/docs/architecture/0001-encrypted-family-sync.md`
  — the ADR whose `drive.file` multi-account limitation does NOT apply here
  (single account); read to avoid repeating its Firestore path.

### Phase 11 dependency
- Phase 11 merge engine (`src/domains/portability/…`) — Phase 12's
  reconciliation primitive; keep it transport-agnostic.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- helper-payroll-app `google-auth.ts` + `drive-client.ts` are directly portable
  (RN + Expo, same One-Tap library, `drive.file`). Main adaptation: single
  app-created store file instead of a named recovery folder, and wiring to the
  gym-tracker merge engine.
- Gym Tracker already ships Argon2id + integrity-protected encryption in the
  GTBK path (`restoreCommands.ts`) — the passphrase→key derivation (D-01) reuses
  that crypto family; XChaCha20-Poly1305 (`@noble/ciphers`) is the payload cipher.
- `expo-secure-store` pattern for key persistence (from helper-payroll-app).

### Established Patterns
- Effects/replication are non-authoritative in this codebase — sync (D-04) is
  the same discipline applied to a remote transport.
- Dependency-audit gate already exists in CI (v1.0) — new native deps go through
  it (D-05).

### Integration Points
- Triggers: app foreground / background-close lifecycle + post-commit hook
  (the same reconcile-after-commit seam the rest timer uses).
- Settings → Data & recovery: Connect/Sync now/Disconnect + status line.
- Local SQLite writer stays the single source of truth; sync reads a decrypted
  snapshot and feeds the merge engine — it never writes the live path directly.
</code_context>

<specifics>
## Specific Ideas

- "Same Google account on every device" is the whole reason `drive.file` works
  here where it failed for helper-payroll-app's family case — keep the design
  single-owner.
- Status line is the only workout-path surface; no blocking spinners.
</specifics>

<deferred>
## Deferred Ideas

- Multi-account / shared sync — explicitly out of scope (single-owner design).
- Real-time (millisecond-live) sync — near-real-time on triggers is the target.
- Non-Google transports (self-host, other clouds) — backlog.

</deferred>

---

*Phase: 12-Automatic Google-Drive Sync*
*Context gathered: 2026-09-15*
