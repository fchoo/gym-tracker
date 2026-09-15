# Phase 11: Portable History & Merge Restore - Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md.

**Date:** 2026-09-15
**Phase:** 11-Portable History & Merge Restore
**Areas discussed:** Merge conflict rule (DATA-08 / Q12)

---

## Merge conflict rule (DATA-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm the Q12 rule | Sessions/corrections/void: newest-wins. Settings: existing-wins. Distinct custom exercises/plans: keep-both by owner-scoped identity. | ✓ |
| Uniform newest-wins everywhere | One rule for all classes; simplest but can drop divergent settings / same-named custom items. | |

**User's choice:** Confirm the Q12 rule (Recommended)
**Notes:** Locks DATA-08 (and transitively Phase 12 sync) per-record-class resolution.

## Claude's Discretion

- Preview UI shape, identity-column scheme, merge module placement (beside restoreCommands vs new mergeCommands).

## Deferred Ideas

- Automatic Drive sync → Phase 12; selective/partial restore → backlog.
