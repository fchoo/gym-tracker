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
