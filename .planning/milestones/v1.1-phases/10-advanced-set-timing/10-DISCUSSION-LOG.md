# Phase 10: Advanced Set Timing - Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md.

**Date:** 2026-09-15
**Phase:** 10-Advanced Set Timing
**Areas discussed:** Per-rep cadence cue channel

---

## Per-rep cadence cue channel

| Option | Description | Selected |
|--------|-------------|----------|
| Owner-configurable: haptic / audio / both | Owner picks per exercise; reuses haptics + rest-cue audio ports. | ✓ |
| Haptic only | Pulse only; gym-friendly but useless if phone can't be felt. | |
| Audio only | Beep only; familiar but disruptive in shared spaces. | |

**User's choice:** Owner-configurable: haptic / audio / both (Recommended)
**Notes:** Maximizes usability across gym contexts; no new native deps.

## Carried from earlier owner decisions (REQUIREMENTS.md, not re-asked)

- Q10 both per-rep and cluster modes ship in v1.1; Q11 a cluster is one recorded set with advisory intra-rests.

## Claude's Discretion

- Tempo/interval config UI, cluster notation, persistence table shape, default tempo/pattern values.

## Deferred Ideas

- Full tempo notation (eccentric/concentric split), auto rep detection → backlog.
