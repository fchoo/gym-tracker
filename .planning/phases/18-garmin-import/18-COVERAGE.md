# API Coverage — Garmin Activity API and Local FIT

> Full coverage by default. Opt-outs are explicit, reasoned decisions. `OPT-OUT` rows remain `CONDITIONAL_EXTERNAL`; they are not satisfied by fixtures, local FIT success or simulated provider states.

| capability | decision | reason |
|---|---|---|
| Local original-FIT selection, strict parsing and offline import | INTEGRATE | |
| Provider-independent exact-byte identity and manual/API overlap resolution | INTEGRATE | |
| Truthful approval-needed or capability-unavailable production state | INTEGRATE | |
| Imported history, factual detail and local matching during provider outage | INTEGRATE | |
| Garmin program eligibility, evaluation access and current governing agreement | OPT-OUT | Actual accepted program access and governing partner evidence are not available; Plan 18-13 is a blocking external gate. |
| OAuth2 authorization-code consent with S256 PKCE | OPT-OUT | Current partner endpoints, scopes, redirects, client class and complete exchange contract are unavailable, and public material requires a confidential client secret. |
| Confidential client-secret exchange and token custody | OPT-OUT | A broker changes the local-only architecture and requires a separately approved threat model, deployment and operations decision; this phase authorizes none. |
| Consent failure, cancel and callback recovery | OPT-OUT | Deterministic UI states are covered, but real behavior requires the approved OAuth contract and live entitlement. |
| Connected account, consented-access and last-sync provider facts | OPT-OUT | Local read-model presentation is covered; live provider facts cannot be fabricated without approved access. |
| Ping/pull activity delivery | OPT-OUT | Partner event contract, authenticity, replay, backfill, acknowledgement and retry semantics are unavailable. |
| Push activity delivery | OPT-OUT | Partner callback verification, ingress topology, replay protection and broker authorization are unavailable. |
| Approved-origin activity FIT download | OPT-OUT | Current provider origins, URL contract, body bounds and authentication rules are unavailable; arbitrary download URLs are forbidden. |
| Sync now, no-new and import-result provider operations | OPT-OUT | Deterministic presentation and local receipt behavior are covered; a real provider result requires approved delivery and entitlement. |
| Refresh, reconnect and account-generation fencing | OPT-OUT | Local closed-state contract is covered; live token/session lifecycle needs the approved partner and broker contract. |
| Provider revoke/disconnect | OPT-OUT | UI/local history-retention behavior is covered; reflecting a real provider result requires the approved revoke/deletion contract. |
| Provider-driven deletion or retention obligations | OPT-OUT | Current partner terms are unavailable; no hidden source mutation or deletion policy is invented. |
| Rate limits, quotas, retry/backoff and backfill windows | OPT-OUT | Partner-only limits are unknown and must not be guessed. |
| Partner evaluation, certification and production enablement | OPT-OUT | No evaluation or production entitlement exists; local fixtures cannot substitute for partner approval. |
| Broker implementation or deployment | OPT-OUT | Explicitly outside Phase 18; a later owner/security authorization must create a separate plan before any implementation. |
| Unofficial scraping, password login or reverse-engineered APIs | OPT-OUT | Explicitly prohibited by the phase context and consent/security boundary. |
| Garmin Training API workout push | OPT-OUT | Explicit deferred idea outside the activity-import phase and owner-approved product scope. |

## Closure Contract

- `INTEGRATE` rows are implemented and verified by Plans 18-04 through 18-12.
- Provider presentation fixtures exercise copy, focus, accessibility and retained-history behavior only.
- Every live `OPT-OUT` row remains `CONDITIONAL_EXTERNAL` under GAR-04–GAR-07 until Plan 18-13 records actual program/current-contract evidence and a separately reviewed confidential topology/security/deployment authorization.
- Passing those gates starts a new reviewed implementation plan. It does not retroactively authorize a broker, provider adapter, secret storage or deployment in the current plan set.
