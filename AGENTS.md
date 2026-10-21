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
