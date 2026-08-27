# Phase 05 — UI Review

**Audited:** 2026-08-26
**Baseline:** 05-UI-SPEC.md, 05-CONTEXT.md, and repository-owned DESIGN.md
**Re-audit scope:** source follow-up through 8ac43a9, including ceb4339, d433c09, 798aa70, d6f5cad, and the restore-preview semantics adjustment
**Screenshots:** not captured (deliberately source-only; no browser, emulator, device, Maestro, build, accessibility service, or visual comparison run)

> This re-audit confirms source-contract changes only. Rendered visual quality, native picker/share behavior, assistive-technology output, and physical interaction remain pending the one final exact-candidate attended gate.

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 3/4 | Required labels, safety copy, preview metadata, exact pending copy, retry copy, and share/cancel states are source-aligned; rendered announcements remain deferred. |
| 2. Visuals | 3/4 | Source provides the intended three-card hierarchy and eight individually accessible, labelled preview facts within a supported list container; rendered hierarchy remains deferred. |
| 3. Color | 3/4 | Approved theme tokens and non-color textual state cues are used; exact-candidate contrast and appearance checks remain deferred. |
| 4. Typography | 3/4 | Approved type tokens and tabular preview values are used; 200% text fit and native label announcement remain unverified. |
| 5. Spacing | 3/4 | Approved spacing rhythm and 48/56dp action minimums are preserved; adaptive and large-text fit remain unverified. |
| 6. Experience Design | 3/4 | Prior source lifecycle and role-mapping gaps are closed; native/assistive reading order and interaction remain deferred. |

**Overall: 18/24 (source-only; not a release approval)**

No source-level BLOCKER or WARNING remains from the prior review. All scored pillars retain WARNING status because the exact candidate has not passed the required attended gate. The preview now uses semantics supported by React Native 0.86.2 under Fabric: a list container with eight individually accessible, labelled native text facts. Source tests cannot replace the required native reading-order observation.

The current source verdict is unchanged at 18/24: preview metadata, accessible naming, and supported role mapping are closed at source level, while actual announcement and reading order remain an attended/native verification item. `d6f5cad` additionally proves that opaque backup-discard failure maps to the bounded safe error contract.

## Prior Findings Re-audit

| Prior finding | Current source verdict | Evidence |
|---|---|---|
| Restore preview omitted version/time and flattened facts | CLOSED AT SOURCE | RestorePreview carries sourceFormatVersion and createdAtMs; the route renders both plus plans, exercises, sessions, settings, and catalog availability as eight individually accessible, labelled text facts in one supported `role="list"` container. The component test verifies the exact labels, list container, accessible state, and native text role; announcement order remains an attended check (src/domains/portability/restoreCommands.ts:73-87,241-250; app/more/data-and-recovery.tsx:130-159,645-656; app/more/__tests__/data-and-recovery.test.tsx:325-340). |
| Rebuild-pending copy diverged | CLOSED | Exact “Backup restored. Recalculating search and progress.” is rendered (app/more/data-and-recovery.tsx:681-685) and asserted (app/more/__tests__/data-and-recovery.test.tsx:317-323). |
| Restore failure had no fresh retry/token invalidation | CLOSED | Failure accepts a new password and exposes Try restore again; selection invalidates the previous token, clears confirmation/password state, and late/unmounted preflights invalidate returned tokens (app/more/data-and-recovery.tsx:310-347,607-630,434-460; src/bootstrap/workoutAppRuntime.tsx:864-870,3557-3560; src/domains/portability/restoreCommands.ts:103-107,361-363). Tests prove first/second tokens differ and late preview invalidation (app/more/__tests__/data-and-recovery.test.tsx:336-384,280-312). |
| Backup sharing reused creation state and lacked duplicate guard | CLOSED | sharing renders Opening share options with a busy Share backup action; backupLatch permits one share call and prevents the password form returning (app/more/data-and-recovery.tsx:274-295,490-509; app/more/__tests__/data-and-recovery.test.tsx:154-183). |
| Backup cancellation/late cleanup was not visible or proven | CLOSED | Cancel backup aborts the controller and advances generation; late archives are discarded, and unmount discards ready handles (app/more/data-and-recovery.tsx:227-272,434-446; src/bootstrap/workoutAppRuntime.tsx:617-622,3554-3556; app/more/__tests__/data-and-recovery.test.tsx:184-238,217-238). |
| Backup discard failure lacked source coverage | CLOSED | The cleanup command maps delete failure to bounded backup_export_failed / GT-BACKUP04, with focused coverage in src/domains/portability/backupCommands.ts:167-173 and src/domains/portability/backupCommands.test.ts:147-173 (d6f5cad). |

## Top 3 Remaining Priority Fixes / Checks

These are deferred release-gate checks, not unaddressed source fixes:

1. **Verify preview reading order**: run the exact candidate with TalkBack and confirm that `Review backup`, the eight individually reachable label/value facts, the destructive warning, and the confirmation control are announced in visual order. Positional `item N of 8` output is not required by the UI contract or promised by React Native 0.86.2.
2. **Run the exact-candidate visual/adaptive pass**: verify light/dark card hierarchy, contrast, focus ring, compact/medium/expanded layouts, line wrapping, and no clipping at specified breakpoints and 200% text.
3. **Run the exact-candidate interaction/lifecycle pass**: verify More → Data and recovery focus order, keyboard/D-pad activation, password visibility announcements, picker/share cancellation and rejection, focus restoration, backup cancellation/late cleanup, fresh restore preflight after failure, pending rebuild/retry wording, reduced-motion transitions, clean-install restore, and candidate identity binding without stale artifacts.

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- More entry and destination task labels remain contract-aligned (app/more/index.tsx:47-58; app/more/data-and-recovery.tsx:470-475,580-587,723-730).
- Required backup, restore, CSV, destructive-confirmation, safe-error, cancellation, retry, share, and rebuild-pending copy is present. Source tests cover exact strings and safe non-leakage (app/more/__tests__/data-and-recovery.test.tsx:143-236,280-384).
- Restore preview exposes Source format version, valid ISO Backup created, and each count/reference fact as a labelled row (app/more/data-and-recovery.tsx:130-164,642-656).
- Remaining limitation is evidence, not an identified copy mismatch: real screen-reader announcement, truncation/wrapping, and native share/picker labels are pending the attended gate.

**Classification:** WARNING — source copy is substantially aligned; native/rendered announcement evidence is deferred.

### Pillar 2: Visuals (3/4)

- More uses separate flat ContentCard surfaces, and Data and recovery keeps secure backup, restore, and CSV as ordered task cards (app/more/index.tsx:32-60; app/more/data-and-recovery.tsx:470-730).
- Restore review is a dedicated supported `role="list"` container with eight individually accessible, labelled native text facts, improving scan hierarchy over the prior concatenated strings without claiming unsupported positional list-item semantics (app/more/data-and-recovery.tsx:130-159,645-656; app/more/__tests__/data-and-recovery.test.tsx:325-340).
- Shared ScreenHeader, ContentCard, PrimaryAction, SecondaryAction, and IconAction remain in use; no parallel local component system was introduced (app/more/data-and-recovery.tsx:27-32; src/ui/components/index.ts:127-177,288-517).
- No rendered candidate was inspected. Actual focal balance, card dimensions, wrapping, dark appearance, visible focus, list semantics as announced, and share-sheet presentation remain pending.

**Classification:** WARNING — source hierarchy and supported semantics are coherent; rendered/native evidence is intentionally unavailable.

### Pillar 3: Color (3/4)

- The route continues to consume theme tokens rather than hardcoded route colors (app/more/data-and-recovery.tsx:85-123,466-730).
- Light/dark canvas, card, action, completed, destructive, divider, and focus tokens match the established design system (src/ui/theme/index.ts:114-163; DESIGN.md:104-138).
- Destructive impact is conveyed with visible warning text and an input border, while success, error, cancellation, pending, and share states retain textual labels (app/more/data-and-recovery.tsx:519-570,657-685).
- Rendered contrast, disabled/pressed treatment, 60/30/10 distribution, and color-blind verification remain deferred.

**Classification:** WARNING — source token usage is aligned; candidate rendering is unverified.

### Pillar 4: Typography (3/4)

- Route copy uses approved screenTitle, sectionTitle, body, bodyStrong, secondary, and label tokens (app/more/data-and-recovery.tsx:89-123,470-730; src/ui/theme/index.ts:61-112).
- Preview values use tabular numerals and wrap-capable row styles (app/more/data-and-recovery.tsx:148-155,755-773).
- The prior single-line preview defect is closed for content and naming: each fact has a visible label/value pair and an accessible name, and the parent is explicitly `role="list"` (app/more/data-and-recovery.tsx:130-159,645-656).
- The current child role is `accessibilityRole="text"`, not the unsupported Android `role="listitem"`. This preserves explicit native text semantics and accessible labels inside the supported list container without overstating positional announcements.
- No route-specific rendered proof establishes 200% text behavior, screen-reader value/label announcement order, or clipping under keyboard/IME constraints.

**Classification:** WARNING — source typography and labelled rows are aligned; large-text behavior and native rendering remain deferred.

### Pillar 5: Spacing (3/4)

- Data and recovery retains approved spacing/radius/target tokens in local styles (app/more/data-and-recovery.tsx:735-773).
- Shared actions remain at least 56dp primary and 48dp secondary/icon targets; cards retain tokenized padding and radius (src/ui/components/index.ts:1300-1338,1457-1463).
- AdaptiveScreen retains compact 16dp, medium 24dp, and expanded 32dp insets and approved gaps (src/ui/layout/AdaptiveScreen.tsx:21-40,108-140,218-256).
- New preview rows use wrapping and tokenized gaps, but actual 200% layout, orientation, IME, and breakpoint fit remain unverified.

**Classification:** WARNING — source spacing is contract-aligned; candidate fit is deferred.

### Pillar 6: Experience Design (3/4)

- Backup lifecycle has distinct preparing, cancelled, ready, sharing, creation-failed, and share-failed states. Cancellation aborts work; stale late archives and unshared ready archives are discarded (app/more/data-and-recovery.tsx:227-295,434-446,519-570; app/more/__tests__/data-and-recovery.test.tsx:184-238).
- Restore lifecycle clears sensitive inputs, invalidates replaced/consumed tokens, invalidates late preflight results after unmount, supports fresh-preflight retry, gates REPLACE, and blocks duplicate commit presses (app/more/data-and-recovery.tsx:310-385,607-630; app/more/__tests__/data-and-recovery.test.tsx:280-384).
- Shared action primitives expose labelled roles, disabled/busy state, focusability, and Enter/Space activation (src/ui/components/index.ts:198-376).
- CSV state and cleanup coverage remains present (app/more/data-and-recovery.tsx:387-426; app/more/__tests__/data-and-recovery.test.tsx:238-340).
- Backup discard failure is bounded rather than leaking native/file details (src/domains/portability/backupCommands.ts:167-173; src/domains/portability/backupCommands.test.ts:159-173, added by d6f5cad).
- Real picker MIME filtering, OS share cancellation/rejection, focus restoration, D-pad behavior, assistive announcements, preview reading order, and reduced-motion behavior remain deferred to the exact candidate.

**Classification:** WARNING — source state coverage is now strong; native and assistive interaction is unverified.

## Deferred Exact-Candidate Attended Gate

This source-only review does not claim visual, native, device, assistive-technology, physical, or release evidence. Before release, one exact production candidate must verify:

- rendered light/dark hierarchy, contrast, focus ring, target sizes, non-color state cues, and preview fact presentation;
- native TalkBack evidence that the `role="list"` parent and eight accessible labelled text facts form a coherent definition/table-style sequence in visual order; positional `item N of 8` output is not required;
- More → Data and recovery → secure backup/restore/CSV focus order, Back behavior, picker cancellation, share cancellation/rejection, and focus restoration;
- MIME-filtered picker behavior and OS share-sheet success, rejection, and cancellation;
- compact <600dp, medium 600–839dp, and expanded >=840dp layouts;
- 200% text scaling with wrapped preview facts/descriptions and stacked actions without clipping;
- keyboard/D-pad Enter/Space activation and assistive announcements, including password visibility, preview facts, and review-heading focus;
- reduced-motion direct state transitions;
- clean-install restore, derivative rebuild pending/retry, late cleanup, and exact candidate identity.

## Files Audited

- .planning/phases/05-recovery-distribution-and-release/05-CONTEXT.md
- .planning/phases/05-recovery-distribution-and-release/05-UI-SPEC.md
- .planning/phases/05-recovery-distribution-and-release/05-01-PLAN.md through 05-07-PLAN.md
- .planning/phases/05-recovery-distribution-and-release/05-01-SUMMARY.md through 05-07-SUMMARY.md
- DESIGN.md
- app/more/index.tsx
- app/more/data-and-recovery.tsx
- app/more/__tests__/data-and-recovery.test.tsx
- src/bootstrap/workoutAppRuntime.tsx
- src/ui/layout/AdaptiveScreen.tsx
- src/ui/theme/index.ts
- src/ui/components/index.ts
- src/ui/__tests__/foundation.test.tsx
- src/domains/portability/restoreCommands.ts
- src/domains/portability/backupCommands.ts
- src/domains/portability/backupCommands.test.ts
- src/platform/files/expoBackupFilePort.ts
- src/platform/files/expoCsvFilePort.ts
- tests/sqlite-host/cleanInstallRestore.test.ts
