# Phase 20: Native Acceptance - Context

**Gathered:** 2026-10-06
**Status:** Executing focused personal APK corrections; exhaustive native acceptance deferred and incomplete
**Current amendment:** 2026-10-25 — [current implementation and focused verification](20-PERSONAL-UX-UPDATE-20261025.md)

<domain>
## Phase Boundary

Integrate and verify the completed v1.2 system across native fidelity,
accessibility, SQLite migration/portability, lifecycle/offline recovery, Calendar
gestures, self-contained Garmin account sync, performance, and attended Samsung acceptance. Earlier phases
still own component/domain tests; this phase closes cross-phase evidence only.

</domain>

<decisions>
## Implementation Decisions

### Current owner-authorized execution scope — 2026-10-25

- **D20-09:** The owner authorized focused fixes and source-affected verification, a fresh signed personal APK and data-preserving phone updates. The full 172-row native matrix, aggregate coverage closeout, exhaustive attended review and sole final seal remain deferred/incomplete. This changes the immediate execution route without converting unexecuted original tasks into PASS results.
- **D20-10:** Current behavior includes Calendar short months with full accessible names, phone-current timestamp displays, compatible Garmin date acceptance, single-line actions, exercise disclosure/reorder, prepared rest audio and precise background alerts, scoped save reads and stale-response guards. Source `8f77d0d5` completes the native reorder presentation-host repair after `b73b36d2` visual overlap failed; final source/APK/emulator/phone proof remains pending.
- **D20-11:** Preserve the earlier `37226a12` minimal physical/data-preserving update and every failed source-bound run separately. Only the orchestrator may fill the final receipt fields after exact source, APK digest and device binding checks. Full Phase 20 and v1.2 remain incomplete.

### Original evidence contract — retained for full acceptance
- **D20-01:** Every one of the 172 parity-matrix rows receives source-bound automated/native evidence, plus attended evidence only where the requirement explicitly calls for it; no inherited v1.1 evidence, unexecuted technical path, or fixture-only result impersonates v1.2 proof.
- **D20-02:** Screenshot matrix covers Light/Dark/System; 360×800, 390×844, 600×960, 840×1080-equivalent; portrait/landscape; default/200% text; all material states.
- **D20-03:** Verify >=48dp, non-color state, labels, keyboard/D-pad, visible focus, Back/Escape, focus restoration, reduced motion, and adaptive reading order.
- **D20-04:** Real SQLite tests cover fresh/legacy migration, rollback/retry, backup/restore/merge, process death, offline workout, Garmin JSON sync/match idempotency, and immutable history.
- **D20-05:** Calendar evidence captures intermediate 1:1 drag, both sides of 25%, recede/cancel, short-fast snap-back, expand/collapse/adjacent sequence, and reduced motion.
- **D20-06:** Preserve stricter product budgets: warm interactive <=1s, cold no-migration <=2s, root switch p95 <=100ms, input/rest <=50ms, search-after-debounce <=100ms, Calendar <=250ms, useful Progress <=500ms, review-open <=200ms, set+dock <=150ms, plus bounded Garmin JSON sync/normalization memory evidence.
- **D20-07:** Samsung attended review is acceptance observation in addition to automated proof. No build/release/device action occurs until later owner authorization.

### Settled baselines and evidence verdicts
- **D20-08:** MAP-01, TIM-01, DEV-01, DEV-02, and the bundled Android Python/Chaquopy Garmin transport are settled baselines. Their rows may PASS once the selected behavior is implemented and proved. Missing technical proof remains NOT_RUN or REVIEW_REQUIRED; observed mismatch/failure is FAIL, never a missing-owner state. `ACCEPTED_EXCEPTION` is reserved for a later explicit owner-approved deviation and remains non-PASS with deviation ID, owner decision/date, exact scope/configurations, rationale, and evidence hashes. Release readiness may be `CONDITIONALLY_READY` only under an explicit reviewed policy when every remaining non-PASS row is such a valid exception; it must not fabricate closure.

### Claude's Discretion
- Evidence shard organization and synthetic fixture generation, provided privacy-safe source/artifact binding remains fail-closed.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/verification/v1.2-native-verification-matrix.md` — complete NV-* matrix and budgets.
- `.planning/design/v1.2-prototype-parity-matrix.json` — 172-row coverage ledger.
- `.planning/design/v1.2-DEVIATIONS.md` — pending/accepted difference truth.
- `.planning/v1.2-OWNER-BRIEF.md` — completion and stop gates.
- `.planning/v1.2-OWNER-DECISIONS.md` — final MAP/TIM/DEV and self-contained Garmin transport selections.
- `.planning/research/v1.2/PITFALLS.md` — evidence failure modes.
- Existing Phase 8-12 native evidence runners/manifests — patterns only; new evidence identity required.
- `20-PERSONAL-UX-UPDATE-20261025.md` — current implemented behavior, focused execution route, reconciled inventory and pending final-source receipts.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing manifest-bound Maestro runners, migration/effects host tests, coverage gate, evidence validators and signed personal APK workflow.
- Existing Samsung observation checklist pattern and exact-artifact identity tooling.

### Integration Points
- Every Phase 13-19 verification artifact and final cross-phase integration flows.

</code_context>

<specifics>
## Specific Ideas

Final evidence should make every failure attributable: source HEAD, package,
device/emulator, theme, viewport, font scale, state fixture, screenshot/report hash.

</specifics>

<deferred>
## Deferred Ideas

Public release ceremony/Terminal Seal, store distribution, Wear OS, Health Connect.

</deferred>

---
*Phase: 20-native-acceptance*
*Context gathered: 2026-10-06*

## Personal-use acceptance execution approved — 2026-10-27

The owner authorized the concrete reduced gap-only proposal. [Profile](../../verification/personal-closeout-profile-20261027.json) explicitly selects155 UI observations and defers6693 configurations; real SQLite integrity and all112 recovery transitions remain unsampled. Retained passing evidence is reusable only with proved compatible input identity. Personal-profile completion is separate from the unchanged exhaustive final seal. Current outcome: evidence reconciliation in progress, no new native PASS claimed.


## Effective source-precedence correction — 2026-10-27

The separate effective profile is `personal-use-closeout-20261027-v2`:153 required/6695 deferred visual pairs, with172 requirements,208 integrity files, ten SQLite categories,112 recovery transitions and eight provider probes unchanged. BW-099/BW-103 are explicitly deferred superseded FIT prototype states under the existing owner account-JSON selection; they never become PASS. Original155-profile evidence and the exhaustive contract remain preserved. See `../../verification/VERIFICATION-CLOSEOUT-SCOPE-ERRATUM-20261027.md` and the effective profile SHA256 `ecf1c6d08ece2e5b9c56c3d5fdfbc00af47633c51a3d0925a8871f8afcceeee9`. Execution remains in progress.
