---
phase: 5
slug: recovery-distribution-and-release
status: planned
shadcn_initialized: false
preset: none
created: 2026-08-24
reviewed_at: 2026-08-24T00:00:00+08:00
---

# Phase 5 — UI Design Contract

> Canonical interface contract for Data and recovery. It extends the existing Gmail-like neutral-grey/white-card light surfaces and graphite/near-black-card dark surfaces. It makes irreversible replacement explicit without exposing sensitive archive contents.

## Contract authority

1. `05-CONTEXT.md` controls source authority, encryption, restore ordering, error safety, and release boundaries.
2. `DATA-01` through `DATA-07` and `REL-03` through `REL-06` control delivered behavior.
3. This UI contract controls hierarchy, copy, interaction, and accessible state presentation.
4. `DESIGN.md` and existing repository-owned theme/components remain the visual authority.

## Included information architecture

`More` adds one `Data and recovery` card with a labelled action. Its destination has three task groups in this order:

1. **Secure backup** — explains that a password protects a portable logical copy; launches password/confirmation and then the explicit system share flow only after archive creation succeeds.
2. **Restore backup** — opens a MIME-filtered picker, then shows a bounded preview: source format version, backup creation time when valid, counts for plans/custom exercises/sessions/settings, and local catalog-reference availability. It says the restore replaces current user-owned data. Final commitment requires the typed phrase `REPLACE` and a labelled `Restore backup` action.
3. **Export CSV** — explains that CSV is readable, not password-protected, includes historical/audit/recommendation fields, and launches the explicit system share flow after creation.

History/Removed sessions remains a distinct More task. No backup action appears in the workout critical path.

## Visual system

| Property | Contract |
|---|---|
| Light canvas/cards | `#F1F3F4` canvas, `#FFFFFF` cards |
| Dark canvas/cards | `#202124` canvas, `#121212` cards |
| Type | Existing Source Sans 3 / IBM Plex Mono tokens; tabular numerals for counts, sizes, timestamps |
| Spacing/radii | Existing 4/8/16/24/32/48/64dp rhythm and 8dp/12dp card radii |
| Actions | Existing primary/secondary/destructive semantic actions, all at least 48dp |
| Icon policy | Lucide icons supplement exact text labels; no icon-only critical action |

Cards group one reading/action task. Do not nest cards, create a dashboard of statistics, introduce a new component system, or hide security/replacement impact behind a chevron-only row.

## Core journeys and state behavior

### Secure backup

- Title: `Create secure backup`.
- Required fields: `Backup password` and `Confirm password`; password visibility controls expose their state and do not write passwords to state intended for diagnostics.
- Valid password proceeds to a non-optimistic progress state: `Preparing secure backup`. Cancellation deletes temporary material and returns to a stable state.
- Success says `Secure backup ready` and offers `Share backup`. It does not claim cloud storage, test restoration automatically, or show the password/key/file payload.
- Failure heading: `Backup could not be created`. Supporting copy: `Your saved workouts and plans were not changed. Check available storage and try again.` Error details are a safe correlation code only.

### Restore backup

- Title: `Restore backup`.
- Before selection: `Choose a Gym Tracker backup` with an accessible description that it replaces current user-owned data only after preview and confirmation.
- Picker cancellation returns to the prior state with `No backup was selected`; it is not an error and writes nothing.
- Wrong password/tamper/unsupported/too-large/malformed states share a safe heading: `Backup could not be opened`. Copy never distinguishes password correctness from authentication failure and says current saved data was not changed.
- Valid preflight moves focus to `Review backup`. Display only validated summary metadata/counts and catalogue reference availability. Do not render individual exercise, plan, session, or correction content here.
- The destructive block says: `Restoring replaces your current plans, workouts, settings, and saved decisions with this backup. This cannot be undone from this screen.` It requires the exact phrase `REPLACE`; the action stays disabled until it matches.
- Commit state is `Restoring backup`; it cannot be cancelled after the serialized source transaction begins. If the following derivative rebuild is pending/retrying, the UI says `Backup restored. Recalculating search and progress.` It never presents old projection totals as final.
- Source replacement failure says `Restore could not be completed` and `Your current saved data was kept.` A retry starts again from the selected archive/preflight; it never reuses a plaintext buffer.

### CSV export

- Title: `Export CSV`.
- Explain: `CSV is a readable spreadsheet file. Share it only with people you trust.`
- Progress: `Preparing CSV export`; success: `CSV export ready` then explicit `Share CSV`.
- Failure says saved data was not changed and offers retry. CSV content is never embedded in UI diagnostics.

## Accessibility and adaptive behavior

- Every navigation/action/control has a programmatic name, role/state, visible focus, Enter/Space/D-pad activation, and a 48dp minimum target.
- Focus order is More heading -> Data and recovery entry -> page heading -> secure backup -> restore -> CSV; sheets/dialogues start at their heading and restore focus to their invoker on dismissal.
- Password show/hide announces `Password visible`/`Password hidden`; confirmation error is text, icon/border, and field association, never color alone.
- Preview uses a semantic definition/table-style list for counts/references. Destructive impact and typed confirmation are readable before the action; busy state exposes `busy` and blocks duplicate activation.
- Compact layout stacks actions. Medium/expanded layouts may use existing `AdaptiveScreen` panes but preserve the same reading/order/focus sequence. At 200% text, descriptions/counts wrap and destructive/secondary actions stack without clipping.
- Loading, picker-cancelled, password mismatch, wrong-password-or-tampered, unsupported version, oversize, malformed, validation error, transaction error, rebuild pending/retry, success, empty data, one/many counts, share unavailable, and CSV error are all explicit textual states. Reduced motion changes states directly.

## Copy contract

| Element | Copy |
|---|---|
| More card title | Data and recovery |
| More card description | Create a secure backup, restore a previous backup, or export readable CSV data. |
| Backup title | Create secure backup |
| Restore title | Restore backup |
| CSV title | Export CSV |
| Preview title | Review backup |
| Final confirmation label | Type REPLACE to continue |
| Restore action | Restore backup |
| Backup failure | Backup could not be created |
| Restore unopened | Backup could not be opened |
| Restore failure | Restore could not be completed |
| Safe failure detail | Your current saved data was not changed. |
| Rebuild pending | Backup restored. Recalculating search and progress. |
| CSV warning | CSV is a readable spreadsheet file. Share it only with people you trust. |

## Scope exclusions

- No cloud-account setup, backup scheduler, passkey/keychain recovery, archive browser, raw SQL/database file picker, or import from CSV.
- No native screenshots, device/emulator verification, attended accessibility/design review, final release approval, or Terminal Seal in this UI slice.

## Inline design review checklist

- Information hierarchy: one discoverable More entry and distinct secure/destructive/readable tasks.
- State coverage: all import, password, confirmation, write, rebuild, share, and retry outcomes are explicit.
- System alignment: existing theme/components and Gmail-like surface contract only.
- Accessibility: text/state/role/focus/keyboard/D-pad/200%/adaptive/reduced-motion coverage is required in component tests.
- Security UX: preflight before confirmation, generic authentication failure, no secret/archive payload in diagnostics, and typed replacement confirmation.
- Final attended design approval is intentionally not recorded by this document.
