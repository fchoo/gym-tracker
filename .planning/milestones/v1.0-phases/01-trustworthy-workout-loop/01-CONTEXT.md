# Phase 1: Trustworthy Workout Loop - Context

**Gathered:** 2026-08-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver one repeatedly usable Full Body Foundation workout loop on an installable Android development-test build while proving the integrity kernel and cross-cutting foundations that every later phase depends on. This phase includes the four-tab shell and intentional empty states for later destinations, one copied starter plan, one `load_reps` progression path, transactional working sets, recoverable rest, basic session detail, native verification, and early release/security seams. It does not include the full exercise catalog/editor, full calendar correction flows, overall Progress, user-facing backup/restore, or final public release.

</domain>

<decisions>
## Implementation Decisions

### Delivery and Native Foundation
- **D-01:** Use the pinned Expo SDK 57 compatibility family, strict TypeScript, Expo Router, CNG, and an uncommitted generated `android/` directory.
- **D-02:** Configure the Android SDK, adb, pinned supported Java/Node/npm toolchain, clean prebuild, development-test APK, and artifact hashing before feature implementation proceeds.
- **D-03:** Encode Android Auto Backup and device-to-device exclusions from Phase 1 so clean-install and manual-backup semantics are trustworthy.
- **D-04:** Build a private development-test artifact path now; signed candidate promotion remains Phase 5.

### Persistence Integrity
- **D-05:** SQLite source facts are authoritative; notifications, projections, recommendations, FTS, and UI query caches are disposable, replayable, or rebuildable derivatives.
- **D-06:** Do not use `withExclusiveTransactionAsync()` as the integrity kernel. Prove and implement one private preconfigured writer connection, FIFO write queue, separate WAL reader, connection-local foreign keys, bounded busy timeout, and explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`. — **Reversibility:** costly — all source mutations and migration guarantees depend on this write contract.
- **D-07:** Screens and hooks never execute SQL. Domain commands own narrow repository ports and return authoritative committed state.
- **D-08:** Source writes and typed pending-effect rows commit atomically; notifications, haptics, query invalidation, file IO, and UI updates run only after commit.
- **D-09:** Durable pending effects use stable IDs, unique idempotency keys, leases, stale-claim recovery, bounded retry, and source-revision checks.
- **D-10:** Migrations are numbered, forward-only, exclusive, fixture-tested, and launch-blocking on failure; destructive/long migrations require validated logical recovery before mutation.

### Workout and Rest Behavior
- **D-11:** Activating Full Body Foundation clones it into user-owned copied rows; schedule, target revisions, sessions, and recommendations bind to the copy.
- **D-12:** Today keeps the Start action primary and shows next target plus comparable history; pending suggestions are visible but never replace an unaccepted target.
- **D-13:** Warm-ups use full-size W rows, can be added/copied/skipped, collapse when complete, remain visible in history, and never affect working-set completion, records, or progression.
- **D-14:** Set completion is the active row's one primary Complete action plus equivalent touch/keyboard/D-pad activation. Complete and Skip share one compact row; the command validates, commits exactly once, advances, creates Undo/rest state, then triggers post-commit effects.
- **D-15:** A failed set save preserves values, does not advance or start rest, and transforms the dock to `Set not saved · Retry`.
- **D-16:** Undo is available for eight seconds and restores the serialized prior active-set and rest state transactionally.
- **D-17:** Automatic rest starts only when another working set or explicit between-exercise rest exists. Manual rest is available from Active Workout using the exercise's configured duration even without a just-completed set.
- **D-18:** Rest state is `idle`, `running`, `paused`, or `expired`, derived from timestamps. Controls are pause/resume, minus 15 seconds, plus 15 seconds, and skip.
- **D-19:** SQLite rest state is authoritative. One reconciler repairs Android notifications after relevant commits, launch, foreground, permission changes, Undo, finish, and supported boot handling; late or denied notifications never alter workout truth.
- **D-20:** The app guarantees launch recovery after reboot. Stronger exact delivery or boot rescheduling ships only if the focused Android spike proves and justifies the native permission/configuration.
- **D-21:** Explicit session outcomes distinguish in-progress, completed, partial, discarded, skipped exercise, zero-set outcome, and manual visit; completing as partial requires user intent rather than an inferred threshold.

### Design and Accessibility
- **D-22:** Use the approved precision-instrument system: Source Sans 3, IBM Plex Mono numerals, card-light sections, semantic cobalt/green/amber/red, and System/Light/Dark.
- **D-23:** Root navigation is Today, Calendar, Library, Progress; Active Workout hides root navigation. Phase 1 may show intentional empty states for destinations not implemented yet.
- **D-24:** Build compact, medium, and expanded layout primitives, safe areas, 200% text, meaningful labels, focus restoration, keyboard/D-pad access, reduced motion, and non-color cues from the first screen.
- **D-25:** Set completion and rest controls remain at least 48dp and adjacent to the active work at every width class.

### Contracts, Testing, and Diagnostics
- **D-26:** Use schema-first Zod contracts at persistence/platform boundaries and pure validated values inside domain rules.
- **D-27:** Use vertical domain modules, explicit application ports, adapter-only platform code, route-only `app/`, and import-boundary enforcement.
- **D-28:** Use TanStack Query only for disposable reads. Do not optimistically commit workout source facts.
- **D-29:** Use typed application errors and redacted bounded diagnostics; never log passwords, keys, backup plaintext, notes, set payloads, or SQL parameters.
- **D-30:** Establish Jest/jest-expo, React Native Testing Library, host SQLite semantics, actual Expo SQLite device contracts, and Maestro Android smoke in the reviewed CI order.
- **D-31:** Integrity-critical domain/application code requires complete branch coverage; remaining testable TypeScript uses the reviewed high global thresholds.
- **D-32:** PR smoke includes fresh launch, copied starter activation, workout start, one set commit, rest transition, `killApp`, and recovery.
- **D-33:** Spike the app-owned Argon2id native path in Phase 1 for known-answer support, off-interaction execution, CNG registration, ABI/page-size compatibility, and minimum-device timing; user-facing backup remains Phase 5.

### Claude's Discretion
- Exact internal naming within the locked module boundaries.
- Exact choice of icon family matching the approved outlined 2dp style.
- Exact implementation of test-only seed installation, provided it uses supported public test seams rather than arbitrary Maestro SQL.
- Exact dev diagnostic presentation behind the approved redaction boundary.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and Requirements
- `.planning/PROJECT.md` — core value, active requirements, constraints, key decisions, and milestone contract.
- `.planning/REQUIREMENTS.md` — Phase 1 atomic requirements and Definition of Done.
- `.planning/ROADMAP.md` §Phase 1 — locked goal, success criteria, plan slices, research flags, and exit gates.
- `.planning/STATE.md` — current blockers, especially Android SDK/adb and SQLite/Argon2 proof.

### Research
- `.planning/research/SUMMARY.md` — reconciled stack, architecture, acceptance gaps, and phase gates.
- `.planning/research/STACK.md` — exact current versions, compatibility gates, CNG/native implications, and rejected technologies.
- `.planning/research/ARCHITECTURE.md` — private writer correction, component boundaries, data flow, effects, projections, and build order.
- `.planning/research/PITFALLS.md` — false-proof traps and Phase 1 prevention/verification requirements.
- `.planning/research/FEATURES.md` — table stakes, differentiators, anti-features, and acceptance details.

### Approved Product and Engineering Contracts
- `~/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md` — complete design- and engineering-cleared source contract.
- `~/.gstack/projects/gym_tracker/pre-git-eng-review-test-plan-20260815-224500.md` — QA routes, interactions, edge cases, and critical paths.
- `~/.gstack/projects/gym_tracker/designs/approved-20260815/core-workout-flow.png` — approved workout interaction hierarchy.
- `~/.gstack/projects/gym_tracker/designs/system-review-20260815/app-system-reference.png` — approved app shell, Today context, Library, Progress, and dark workout system reference.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- No application code exists yet.
- `.githooks/commit-msg` and `scripts/install-git-hooks.sh` provide the required commit-trailer safety.
- `AGENTS.md` and `.trae/rules/rules.md` provide project and spawned-agent instructions.
- GSD research and approved mockups provide implementation patterns and acceptance evidence.

### Established Patterns
- Tracked planning docs and atomic commits are already enabled.
- GSD uses adaptive models, research, plan checks, verifier, Nyquist validation, source grounding, and automatic advancement.
- The project instruction file is `.trae/rules/rules.md`.

### Integration Points
- Expo Router shell starts under `app/`.
- Vertical domains and shared contracts start under `src/domains/`.
- SQLite/native adapters start under `src/platform/`.
- Design primitives start under `src/ui/`.
- Phase 1 tests start under non-route test directories and Maestro flows.

</code_context>

<specifics>
## Specific Ideas

- The workout should require almost no typing while lifting.
- Progress feedback is calm and evidence-first, never guilt-based or pseudo-medical.
- `8 / 8 / 7 at 60 kg` must recommend holding 60 kg and targeting `8 / 8 / 8`, not increasing load.
- Today owns plan-aware history; Progress remains overall and period-based.
- The active workout must feel trustworthy under sweaty hands, accidental taps, app interruption, denied notifications, and weak connectivity.

</specifics>

<deferred>
## Deferred Ideas

- Full reviewed 300+ catalog, custom exercises, full plan editor, and complete schedules belong to Phase 2.
- Calendar corrections and reversible session removal belong to Phase 3.
- Overall Progress and complete progression breadth belong to Phase 4.
- User-facing encrypted backup/restore, CSV, signed promotion, and final release matrix belong to Phase 5.
- Wear OS, Health Connect, cluster-set timers, cloud sync, social features, AI coaching, nutrition, measurements, and unverified exercise media remain outside v1.

### Reviewed Todos (not folded)
- `TODOS.md` post-implementation visual QA remains a Phase 5 release gate because no implemented UI exists yet.

</deferred>

---
*Phase: 01-trustworthy-workout-loop*
*Context gathered: 2026-08-16*
