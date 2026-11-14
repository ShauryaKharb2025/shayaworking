# Sahay integration audit

| Issue | Root cause or evidence | Local change | Verification |
|---|---|---|---|
| Fresh PostgreSQL install failed | Prisma applied the short SOS migration name before the initial migration and reported missing relation Trip | Ordered the migration after the base and made repeated DDL idempotent | Clean schema deploy and seed |
| Case creation could leave dispatcher stale | SOS emitted dispatch:new and dispatcher did not subscribe | Connected listener to case list | Chromium two-session SOS |
| Dispatch confirmation preceded acceptance | Baseline API wrote dispatched during assignment | Persisted an offer, separated driver response and hid the vehicle from the patient until acceptance | PostgreSQL HTTP lifecycle |
| Cross-hospital management | Existing HTTP and socket code checked role but accepted a caller-selected hospital ID without membership | Scoped read, write and room joins to linked hospital | Cross-hospital HTTP denial checked; socket membership change reviewed in source |
| Direct status and hospital writes could bypass workflow | Original status handler assigned supplied status and hospital | Validated transitions, moved destination changes through authorised referrals | Lifecycle, destination replacement and forbidden writes in PostgreSQL |
| Fleet data lacked operator ownership checks | Operator ID and update payload were caller-controlled | Scoped queries, restricted profile fields and prevented active vehicle edits | Code inspection; full fleet browser workflow pending |
| Staff role selection was self-declared | Google signup used caller role | New users get patient role; active account and role validated for HTTP and initial sockets | Existing HTTP role checks and source review; Google OAuth itself pending |
| Caregiver and clinician routes were previews | App mounted RolePreview for both routes | Added live invitation/grant and append-only observation endpoints and pages | API redemption, revocation and charted observation; mobile browser invitation |
| Case map threw during browser transitions | Animated Leaflet view changes outlived map teardown | Disabled automatic pan animation and stopped map before removal | Chromium smoke test |
| Model outages could leave operators without context | No Gemini case routes or validated response shapes | Added four probes with deterministic input facts and no model dependency on state changes | Valid, malformed, unknown-reference and timeout unit cases; disabled browser fallback |

Implementation gaps for review include automated destination proposal, team-level readiness, and a browser run that covers every role. The current integration covers live case-scoped data, manually initiated proposals and dispatcher confirmation. Existing staff accounts created through the former self-selection flow require an ownership and role review before use outside the synthetic environment.
