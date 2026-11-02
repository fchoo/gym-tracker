# Phase 11: Portable History & Merge Restore - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Give the owner **one canonical, portable, versioned, encrypted backup** carrying
stable owner-scoped record identities, which any personal device can either
**restore-clean** (today's path) or **merge into existing data** — authenticated,
conflict-ruled, previewed, all-or-nothing, with deterministic derivative rebuild
(DATA-08 merge + DATA-09 portable canonical backup). This is the merge engine
that Phase 12 sync replicates over.

**Out of scope:** Google sign-in / Drive transport / automatic sync (Phase 12).
Phase 11 delivers the manual export/import + merge fallback and the identity +
conflict foundation; sign-in is not required for any Phase 11 behavior.
</domain>

<decisions>
## Implementation Decisions

### Conflict resolution (DATA-08) — confirms owner Q12
- **D-01:** Per-record-class conflict rule, now **locked**:
  - **Sessions / set corrections / void state:** newest-by-timestamp wins.
  - **Settings:** existing (local) wins.
  - **Distinct custom exercises & plans:** keep both, deduped by stable
    owner-scoped identity.
  — **Reversibility:** costly — the rule is baked into the merge engine and,
  transitively, Phase 12 sync; changing a class's rule later means re-validating
  both merge and sync reconciliation.

### Stable identity & portability (DATA-09)
- **D-02:** Records carry **stable owner-scoped identities** so the same
  session/plan/exercise is recognized across devices and reinstalls (dedup key
  for D-01 keep-both/newest-wins). — **Reversibility:** one-way — once backups
  are written with an identity scheme, changing it breaks cross-device
  recognition of already-exported data.
- **D-03:** Reuse the **v1.0 GTBK logical-backup format** (versioned,
  integrity-protected, Argon2id password-encrypted). Extend, don't fork: bump the
  format/schema version additively so older backups still restore-clean.
- **D-04:** Merge is **authenticate/decrypt → parse → detect duplicates by
  identity → apply conflict rules → preview → commit in one all-or-nothing
  transaction**. Any auth/validation/conflict/cancel/insert failure leaves the
  existing DB **unchanged** with a safe, actionable error; success rebuilds FTS
  and all projections deterministically. — **Reversibility:** one-way — the
  fail-closed atomicity is a data-safety contract; a partial-write path could
  corrupt the owner's only history.

### Claude's Discretion
- Preview UI shape (counts per record class, conflict summary), the exact
  identity-column scheme, and whether merge lives beside
  `restoreCommands.ts` or in a new `mergeCommands.ts` — planner decides,
  provided decrypt-before-parse, identity dedup, preview-before-commit, and
  all-or-nothing hold.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — DATA-08, DATA-09 text; owner Q12 conflict rule
  (now confirmed here); the "SQLite authoritative; derivatives rebuildable"
  and fail-closed cross-cutting constraints.
- `.planning/ROADMAP.md` §"Phase 11: Portable History & Merge Restore" — goal +
  4 success criteria (verification anchor).
- `.planning/design/v1.1-UX-FLOW.md` §8 — Settings → Data & recovery layout
  (restore-clean vs merge-into-existing vs manual export/import).

### v1.0 backup/restore contracts to extend
- `src/domains/portability/backupContracts.ts` — `LOGICAL_BACKUP_FORMAT_VERSION`,
  `LOGICAL_BACKUP_TABLE_DEFINITIONS`, `LOGICAL_BACKUP_TABLES`, snapshot parse +
  version guard. The GTBK format to extend (D-03).
- `src/domains/portability/restoreCommands.ts` — `RestoreCommands`,
  `LOGICAL_BACKUP_SUPPORTED_SCHEMA_VERSIONS` (currently [15,16,17,18]),
  `LOGICAL_BACKUP_REFERENCE_DEFINITIONS` (FK graph), `RestoreCommandError`,
  Argon2id descriptor, preflight-token store. Merge extends this module's
  decrypt→validate→commit discipline.
- `src/domains/portability/restoreCommands.test.ts` /
  `backupContracts.test.ts` — coverage patterns the merge path must match.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `restoreCommands.ts` already does authenticate/decrypt → schema-version guard →
  reference-integrity validation → all-or-nothing commit with a preflight token.
  Merge (D-04) is a superset: add identity dedup + per-class conflict resolution
  before the same atomic commit.
- `LOGICAL_BACKUP_REFERENCE_DEFINITIONS` is the full owner-owned FK graph —
  reuse it to drive identity matching and cascade-safe merge ordering.
- Argon2id password encryption + integrity protection already exist in the GTBK
  path — the same crypto backs the portable backup (and the Phase 12
  passphrase-derived sync key, D-01 there).

### Established Patterns
- Restore is fail-closed and rebuilds derivatives deterministically after
  commit — merge inherits both properties.
- Schema versions are an explicit allow-list — extend additively (D-03).

### Integration Points
- Settings → Data & recovery surface (export / import-merge).
- Phase 12 sync consumes this merge engine as its reconciliation primitive —
  keep the merge API transport-agnostic (operate on a decrypted snapshot +
  local DB, not on Drive).
</code_context>

<specifics>
## Specific Ideas

- One canonical encrypted store the owner carries between their own devices;
  restore-clean OR merge, never a blind overwrite.
- Preview before commit is mandatory (no silent merges), matching v1.0's
  confirmation-token discipline.
</specifics>

<deferred>
## Deferred Ideas

- Automatic/near-real-time reconciliation and Google Drive transport — Phase 12
  (DATA-10).
- Selective/partial restore (only plans, only history) — backlog.

</deferred>

---

*Phase: 11-Portable History & Merge Restore*
*Context gathered: 2026-09-15*
