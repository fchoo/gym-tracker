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
