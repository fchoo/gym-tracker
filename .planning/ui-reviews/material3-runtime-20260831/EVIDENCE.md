# Material 3 runtime evidence — 2026-08-31

## Candidate identity

- Package: `com.fchoo.gymtracker`
- Version: `0.1.0` (`versionCode=1`)
- Installed candidate APK SHA-256: `3383558069db759a0fe781c0a68f349423576a3953507dbae787df6aba99febd`
- Device: `emulator-5554`, `sdk_gphone64_arm64`, Android 16 / API 36
- Display: 1080 x 2400, 420 dpi
- Normal font scale: 1.0
- Large-text check: 2.0, restored to 1.0 immediately after capture
- Samsung `R5CW12NVRPE`: not enumerated by ADB during this fresh pass; no new Samsung screenshot is claimed

Each listed PNG has a same-basename UI Automator XML hierarchy unless noted. Screenshot binaries are intentionally ignored by the directory `.gitignore`.

## Evidence used by the review

| Evidence | What it establishes |
|---|---|
| `01-today.*` | Normal-scale Today layout and duplicate overflow / full-width More affordances |
| `02-calendar.*` | Blank adjacent-month cells and current month layout |
| `calendar-before-swipe.xml`, `calendar-after-swipe.xml` | Leftward horizontal swipe leaves the month at August 2026 |
| `03-library.*`, `05-library-exercises.*` | Plain outlined Search, detached clear control, crowded Filter/status/Refresh row |
| `06-library-filters.*`, `07-library-filter-selected.*` | Filter row changes accessibility state but has no visible selected treatment |
| `13-library-dark.*` | `No filters selected` renders black on the dark canvas |
| `14-library-exercise-row-dark.*` | Browse rows expose full source, revision, license, and attribution metadata |
| `15-library-favorite-selected-dark.*` | Selected Favorite is green but remains outline-only |
| `17-plan-editor-dark.*` | Reorder handle, label, ordinal, and arrow actions form a tall fragmented layout |
| `18-schedule-editor-dark.*`, `19-date-picker-dark.*` | Schedule context and custom date-picker dialog hierarchy |
| `04-progress.*`, `22-progress-recheck-dark.*`, `23-progress-after-retry-dark.*` | Progress repeatedly remains in its load-error state, including after Retry |
| `09-more.*`, `10-data-and-recovery.*` | More and recovery grouping, copy, targets, and disabled states |
| `11-settings-sheet.*`, `12-appearance-sheet.*` | Rest-alert switch presentation and appearance selection |
| `20-today-font-200.*` | Bottom-navigation labels wrap and clip at 200% font scale |

## Scope limits

- This pass is a UI audit, not owner approval, release promotion, or Terminal Seal.
- No TalkBack session or measured color-contrast run was performed.
- Active workout/rest, history/correction, native picker/share, rotation, and Samsung touch ergonomics still require attended verification after remediation.
- This live pass verifies installed package identity and bytes; signing verification belongs to the retained release evidence, not this screenshot set.
- `08-library-filter-applied.*`, `16-plan-create-dark.*`, and `21-filter-selected-actions.*` are retained exploratory captures but are not used to support scored findings.
