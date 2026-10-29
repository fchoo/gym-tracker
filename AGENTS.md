## Skill routing

When the user's request matches an available skill, invoke it. When in doubt, invoke the skill.

Key routing rules:
- Product ideas or brainstorming -> invoke `gstack-office-hours`
- Strategy or scope -> invoke `gstack-plan-ceo-review`
- Architecture -> invoke `gstack-plan-eng-review`
- Design system or plan review -> invoke `gstack-design-consultation` or `gstack-plan-design-review`
- Full review pipeline -> invoke `gstack-autoplan`
- Bugs or errors -> invoke `gstack-investigate`
- QA or testing site behavior -> invoke `gstack-qa` or `gstack-qa-only`
- Code review or diff checks -> invoke `gstack-review`
- Visual polish -> invoke `gstack-design-review`
- Shipping, deployment, or pull requests -> invoke `gstack-ship` or `gstack-land-and-deploy`
- Save progress -> invoke `gstack-context-save`
- Resume context -> invoke `gstack-context-restore`
- Author a backlog-ready spec or issue -> invoke `gstack-spec`

## Current personal-release verification scope — 2026-10-30

- Follow [the test necessity reassessment](.planning/verification/TEST-NECESSITY-REASSESSMENT-20261030.md). The owner removed unnecessary acceptance obligations rather than postponing them. The installed personal APK is accepted; no required checks remain.
- The old all-module coverage, exhaustive recovery/visual/configuration, immutable-native-producer and final-seal obligations do not apply to this personal release. Plans 20-08–20-12 and the old personal-closeout profiles are historical, not a work queue.
- Require a concrete changed app behavior or saved-data risk before running another check. Reuse applicable passing evidence. Documentation and host verification-tool changes alone do not justify app rebuilds, installation or repeated phone tests.
- Preserve integrity guards, actual historical verdicts and production Garmin/workout data. This scope change does not manufacture full native/Nyquist/milestone PASS. The orchestration rules below apply only when their work has a separately justified need.

## Subagent orchestration

- Give every implementation subagent an explicit worktree, branch, file or subsystem ownership boundary, and tell it other agents may be working in parallel.
- Keep read-only reviewers pinned to an exact commit so implementation in another worktree cannot change their audit target.
- Treat `provider_queue`, `local_capacity`, `awaiting_model`, and quiet tool/model turns as normal waiting states, not failures.
- Report meaningful queue pressure or position changes while waiting, and use long wait windows before intervening.
- Do not duplicate, replace, or restart a queued or quiet subagent unless it returns a concrete error, loses its required state, or exceeds an explicit task timeout.
- When a subagent fails after editing, inspect and preserve its worktree and commits before assigning recovery; continue from existing state instead of restarting from scratch.
- For final-gate repairs, use at most two independent read-only audit agents at once, pin both to the same completed source SHA, and allow queue time separately from their execution budget.
- Run only tests and coverage affected by a repair; do not repeat an already passing aggregate or old-SHA audit without source-based invalidation. Native evidence still requires a fresh final-source build and one exclusive device lease.
- Avoid duplicating dependencies in new worktrees. When lockfiles match, reuse the active workspace's dependency environment; read-only audits should not install packages or run broad suites.
- Retire obsolete worktrees after preserving their needed reports and uncommitted metadata. Keep branches and commits available, and never remove an active or pending-work checkout merely to relieve disk pressure.
- Provision and validate pinned tools plus every required internal device binding before invoking an immutable native producer. A missing local binding is an automation preflight issue, not a human decision; preserve the failed receipt and create a fresh validated run instead of overwriting it.
- Parallel regression fixes must have disjoint ownership: SQLite/restore source integrity in one stream, UI/Garmin contract alignment in another. Keep native execution serialized and run performance measurements only after host-heavy gates finish.
- Assign coverage-only work separately from behavioral repairs: runtime/executor tests and repository edge tests must not share files with the merge-writer repair. Never remove integrity guards or lower coverage thresholds to close a gap; run focused coverage until all four metrics are exactly 100%.
- Give final coverage agents the complete affected test scope and enough actual execution time in addition to provider queue time. Partial improvements or name-filtered runs with skipped tests are progress, not closure; continue the same active assignment rather than launching duplicates.
- For immutable receipt merge repairs, trace every identifier-bearing result field, including invalidation scopes, through keep-both remapping and replay. Independently validate receipt ownership and JSON binding at the exclusive transaction writer when SQLite foreign keys cannot enforce them.
- Treat ADB as a shared cross-session bridge. Select the exact review device explicitly for every command; never restart/kill the ADB server, clear global logs, stop another session's processes, or change device state without an exclusive device-use window. If ownership is uncertain, continue local/read-only work until coordinated.
- Diagnose native marker timeouts using nonce-bound progress and actual case transitions. Do not invent heartbeat progress or extend budgets to conceal a stalled operation. Preserve failed immutable runs; diagnostic observations are non-acceptance evidence and cannot be relabelled as a successful retry.
- Keep bottom-navigation labels on one line and fit their font to the available column width. Preserve complete text and accessibility labels, minimum targets, approved font faces, and app-wide font scaling; never solve tab clipping by wrapping, abbreviation, or disabling scaling globally.
- Delegate bounded UI repairs while the orchestrator advances disjoint native diagnostics or release prerequisites. Keep subagent source edits isolated, device work exclusive, and distinguish installed old-source diagnostics from fresh final-source acceptance; batch completed corrections into one subsequent acceptance build.
- Keep native dependency packaging repairs separate from Garmin client/auth diagnostics and UI repairs. A passing metadata/dictionary bridge probe does not prove actual client or native transport readiness; require credential-free selected-client/import checks and reject host-built Mach-O/PE binaries in Android Python archives. Bind inspected APK bytes to the installed digest before attributing a packaging defect to a device failure.
- If resumed agent messaging loses its routing path, preserve active worktrees and assignments, record the coordination failure, and do not restart or duplicate their scope. Continue disjoint work and allow the existing agent notification to arrive. A returned concrete blocker may authorize recovery in the same preserved checkout, not a duplicate of still-running work.
- Keep source inputs frozen throughout an immutable native producer, including orchestration documentation included by the source-tree digest. Queue AGENTS.md updates with the next source batch rather than editing them during device execution.
- Preserve actual safe-area insets in custom native navigation, including the loading paths; never replace navigator/context insets with fixed padding or count the Android system gesture handle as label ink in visual checks. Delegate inset plumbing separately from Garmin/native packaging and keep failed emulator crops for diagnosis.
- Reserve credential and Keychain access for the orchestrator. During private Garmin testing, subagents must not use ADB, inspect sign-in fields, capture screens, or retrieve credentials; advance disjoint host/source work and prepare native commands for a later exclusive device window. Preserve source-bound failed attempts and distinguish UI-preparation retries from provider login attempts.
