# Phase 18: Garmin Import - Context

**Gathered:** 2026-10-06
**Status:** Ready for UI specification and planning; external connectivity gated

<domain>
## Phase Boundary

Deliver a complete local original-FIT import journey, factual outdoor/treadmill
details, dedupe/revision handling, and explicit matching to Phase 17 opportunities.
Represent official Garmin consent/sync truthfully, but do not implement or deploy
a broker without separate owner/security review and actual program access.

</domain>

<decisions>
## Implementation Decisions

### Local import
- **D18-01:** Manual original-file FIT import is independently usable offline. Reuse a bounded read-only file port; cancellation writes nothing.
- **D18-02:** Hash exact bytes before normalization. Validate header/length/CRC, bound bytes/messages/laps/samples/output, and reject unsupported/multisport/corrupt input without partial facts.
- **D18-03:** Use independent provider-subject/external-ID and exact-content-hash indexes. Changed source revisions stage review; fuzzy similarity never auto-merges.
- **D18-04:** Outdoor shows only available route/HR/elapsed/moving/distance/pace/laps. Treadmill explicitly says No route and retains factual totals. Lap table is Lap, Time, Pace.
- **D18-05:** Candidate selection binds exact stable Running session slot/revision. Confirm commits one match; cancel/back remains unmatched; unmatch/reassign is audited.

### Official connectivity gate
- **D18-06:** Garmin Activity API + OAuth2 PKCE is intended only after real program access and current partner documentation.
- **D18-07:** Public PKCE material requires a client secret; never embed it in Expo/APK/SecureStore. A confidential broker is a separately reviewed architecture/deployment decision, not implicitly authorized here.
- **D18-08:** Until the gate passes, native UI reports unavailable/approval-needed truthfully while local FIT remains fully usable. Mocks cannot close GAR-04–07.

### Claude's Discretion
- FIT decoder selection after license and Hermes/Metro validation; existing SVG is preferred for factual route outlines.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/v1.2-OWNER-BRIEF.md` — Garmin product requirements.
- `.planning/architecture/v1.2-garmin-import.md` — identities, security gate, backup and tests.
- `.planning/architecture/v1.2-multi-active-plans.md` — opportunity/slot identity.
- `.planning/research/v1.2/STACK.md` — dated official sources and dependency candidate.
- `.planning/verification/v1.2-native-verification-matrix.md` — NV-IMP evidence.
- `.planning/design/v1.2-prototype-parity-matrix.md` — surface mapping.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `expoBackupFilePort.ts` bounded file-selection pattern; `expo-file-system` and `expo-crypto`.
- Stable owner-scoped portability, logical merge, restore quarantine, generation fencing.
- `react-native-svg` for routes and charts; Phase 14 appearance/sheets.

### Integration Points
- Phase 13 import/match repositories; Phase 17 occurrence candidates; Phase 19 Running evidence.

</code_context>

<specifics>
## Specific Ideas

The prototype's route is illustrative only. Production draws actual imported
coordinates and displays an honest absent-route state.

</specifics>

<deferred>
## Deferred Ideas

In-app recording, unofficial Connect scraping, Training API workout push, and broker deployment.

</deferred>

---
*Phase: 18-garmin-import*
*Context gathered: 2026-10-06*
