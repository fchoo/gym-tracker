# Current phone timezone for display

Timestamped records use the phone's current IANA timezone across imported activity lists/details, Calendar, workout/history views and Progress. Source timestamps, confirmed/source timezone/date provenance, identities and revisions remain unchanged. No migration or rewriting historical rows.

Calendar and period queries use timestamp boundaries for actual events, including DST and records crossing local midnight/month boundaries. Planned calendar dates and date-only bodyweight/target entries stay on the chosen day because they do not specify an instant. Source-fact correction/editing retains its recorded timezone.

The runtime reads the OS timezone through a fresh Intl formatter. Presentation updates on foreground and checks for changes once per minute while active. Read callbacks change identity with the display timezone so mounted pages reload; cached source facts/calculation authority remain separate from display grouping.

Localized validation only: timezone rollover, DST ranges, source preservation, Calendar filtering, Progress period grouping, history labels and foreground change. Previously passed unrelated tests will not run again. Build and update the signed APK preserving phone data after the scoped changes pass.

## GSTACK REVIEW REPORT

| Review | Scope | Status |
| --- | --- | --- |
| Engineering | Storage/display boundary, reactive refresh, DST queries and localized checks | Reviewed before implementation |

Tradeoffs: binary-search civil-day boundaries avoid assuming every day is 24 hours. Named timezone detection requires the installed Intl implementation; no new native dependency or phone permission. Civil date-only schedules remain civil dates. Display derivatives do not authorize mutation or change matching/recommendation source facts.

NO UNRESOLVED DECISIONS
