# Sahay RESCUE delivery report — 15 November 2026

**Local integration verified; live cloud verification requires configuration and approval.**

## Implementation and architecture

Sahay RESCUE is an independent asynchronous recovery-intelligence service. The
reported pre-existing Maritime implementation was absent from this checkout;
the integration was added without fetching upstream or replacing the existing
uncommitted application work.

Persisted case/events → deterministic watchdog → incident plus durable PostgreSQL
outbox → leased worker → Maritime chat agent → contract/freshness validation →
immutable advisory → Admin review → current-state checks → validated Sahay service.

Six incident categories are supported: offer timeout, rejection cascade, hospital
referral failure, ETA deterioration, stale GPS and handoff delay. Thresholds are
configurable. Their mathematical conditions are evaluated locally, never by the
LLM. Synthetic case/event references and bounded operational facts are sent;
patient identifiers, location, symptoms and clinical free text are excluded.

Lifecycle, retries, leases, shared request budget, circuit state, review records,
evidence and post-incident analyses are durable. Duplicates cannot create another
advisory for the same job. Late replies cannot reclaim a newer lease or overwrite
current case state. A recovered lease may repeat a remote request; cloud billing
or provider-side exactly-once delivery is not claimed.

No Maritime request is in the initial SOS, dispatch, hospital matching or routing
request path. The four dashboards, login mechanism, role isolation and primary
orchestration remain in place. The Patient layout was not redesigned. Admin gains
one RESCUE card; the Driver gains an explicitly gated synthetic GPS fault control.

## Agent configuration and connectivity

The agent source is `agents/sahay-rescue`, with a lightweight Node HTTP container,
versioned instructions and the same JSON validator used by the backend. It has
no database, shell or external-action tools. It requires a configured
OpenAI-compatible model connection and returns evidence-backed structured output.
Deployment and server configuration are described in
[Maritime operations](maritime-operations.md), with official source links.

| Item | Actual result |
| --- | --- |
| Normal application | Running at http://127.0.0.1:5174; Maritime disabled by default. |
| Local mock chat endpoint | Passed documented request/response shape, Bearer handling, incident investigation and post-handoff analysis. Responses are labelled `mock_maritime`. |
| Custom agent health/chat server | Passed local HTTP tests with an injected model response; rejected missing model configuration and invalid envelopes. |
| Real Maritime cloud agent | **Not verified**: MARITIME_API_KEY and MARITIME_AGENT_ID are missing. No deployed agent was available. |
| Cloud resource creation | Not performed. Paid deployment requires approval; no paid resource was created. |
| Docker image build | Not run: Docker is unavailable on this laptop. Dockerfile and context exclusions are supplied. |
| Live Gemini | **Not verified**: GEMINI_API_KEY is missing. Both browser flows visibly used deterministic fallback. |

Inspection showed that this checkout ranks eligible vehicles and hospitals
deterministically, with Gemini-related coordination/digest and validated decision
modules. That existing behavior was preserved. A live “Gemini performs primary
matching” step cannot be claimed from these browser runs.

## Files created

- `.dockerignore`
- `agents/sahay-rescue/Dockerfile`, `server.cjs`, `instructions.md`
- `backend/src/integrations/maritime/config.js`, `client.js`, `contract.js`, `events.js`, `worker.js`
- `backend/src/routes/maritime.js`
- `backend/prisma/migrations/20261115000600_maritime_rescue/migration.sql`
- `backend/scripts/mock-maritime.cjs`
- `backend/tests/maritime.test.js`, `backend/tests/helpers/maritimeMock.js`
- `frontend/src/components/MaritimeAdvisories.jsx`, `RescueSimulationControl.jsx`
- `frontend/src/tests/maritime.test.jsx`
- `docs/maritime-operations.md`, this report

## Existing files updated for this integration

- Prisma schema: four additive models and the case-history relationship.
- Backend server: protected Maritime routes and an independent opt-in worker.
- Mock-drive service: controlled interruption and validated simulation recovery.
- SOS serialization: safe interruption metadata for the Patient map.
- Test runner: fresh disposable local database per default run; explicit test databases are retained.
- Backend environment example: original requested variables plus thresholds and worker limits.
- Admin/Driver pages: mount the new components within the existing layout.
- JourneyMap: hold the last reported position during an interruption.
- Dashboard styles, map regression tests and README documentation.

The earlier local changes to authentication, primary orchestration, dashboard
cleanup and other platform features were retained. No commit, push, merge,
rebase or reset was performed.

## Schema migration

`20261115000600_maritime_rescue` adds MaritimeIncident, MaritimeJob,
MaritimeAdvisory and MaritimeRuntime, with episode/job uniqueness, queue indexes
and case-history foreign keys. It was applied to the local development and
browser test databases. Every migration was also applied successfully to a fresh
disposable database during the automated suite. No historical application case,
patient, clinical or advisory record was deleted by the migration.

## Detection and recovery results

All six categories passed deterministic tests and persisted distinct incidents
with evidence and outbox jobs in PostgreSQL tests. The real browser run produced:

| Case | Actual outcome |
| --- | --- |
| `99a1f39d-b794-493c-b1de-036e4fbff7f9` | Mock Maritime enabled; road geometry for both travel legs; GPS interruption detected; Admin reviewed FLAG_GPS_COMMUNICATION_FAILURE; validated mock-drive service restored reports; hospital accepted; clinical observation recorded; handoff completed; ambulance idle. |
| Same case | A pending hospital referral also crossed its configured threshold while roles were being reviewed. HOSPITAL_REFERRAL_FAILURE was recorded and later resolved on acceptance. Both incidents retained separate post-handoff summaries. |
| `c9d611c0-3d5e-4e01-8212-09b4791c2f5e` | Maritime disabled and OSRM endpoint deliberately unreachable; both legs used labelled simulated direct paths; normal role transitions and handoff completed; ambulance idle; no incident/outbox jobs created for this case. |

Admin could inspect evidence IDs, severity, uncertainty, review status, lifecycle
and history. It acknowledged a final analysis without reopening the completed
case. Patient and Driver views reflected restored GPS and normal milestones.
The final case remained complete after refresh. Both browser flows recorded no
console errors. The new Admin panel fit a 390-pixel viewport without horizontal
page overflow (document width 375 pixels).

Actual recommendation examples from the local fixture were:

- STALE_AMBULANCE_GPS → FLAG_GPS_COMMUNICATION_FAILURE, citing the recorded
  watchdog event; underlying cause explicitly unproven; source `mock_maritime`.
- Pending HOSPITAL_REFERRAL_FAILURE → REASSESS_HOSPITAL_OPTIONS. It did not itself
  switch a destination or confirm a bed.
- Post-handoff → GENERATE_INCIDENT_SUMMARY, citing recorded handoff evidence.

These are deterministic fixture responses, not invented claims of live cloud AI.
Exact saved responses and identifiers are included in the browser evidence JSON.
New post-incident jobs also include allowlisted recovery/milestone event references;
this enrichment is covered by the automated envelope/analysis regression test.

## Tests executed

| Check | Baseline | Final result |
| --- | --- | --- |
| Backend Node tests | 26 passed | **46 passed, 0 failed, 0 skipped** |
| Frontend Vitest | 26 passed | **32 passed, 0 failed, 0 skipped**, 8 test files |
| Prisma schema validation | Existing schema | Passed with the new models. |
| Fresh disposable database migrations | Existing migration chain | All 10 migrations applied; only that newly created test database was disposed afterwards. |
| Production Vite build | Existing build | Passed, 7.36 seconds in the recorded final build. |
| Git whitespace check | Existing local work | Passed. |
| Browser emergency recovery | None in this integration baseline | Passed mock-enabled recovery/handoff and disabled-Maritime routing-fallback/handoff through browser automation. |
| Live cloud/paid deployment | No credentials or approved resource | Not run; not counted as passed. |

Reliability coverage includes all categories, duplicate detection, multiple
workers, expired-lease restart recovery, late old-token replies, duplicate result
persistence, changed-case staleness, failed-attempt exhaustion, disabled/missing
configuration, deadline timeout, 429/Retry-After, invalid JSON, missing evidence,
unknown playbooks, unapproved mutations, circuit breaking, shared request budget,
Admin authorization, Patient access denial, real-account exclusion and closed
incident protection. The custom HTTP agent contract is exercised locally.

Gemini regressions cover validated injected output and fallback/timeout behavior
for the existing ambulance, hospital, coordination and journey modules. Original
dispatch, reservation, specialist, shared-care and handoff tests still pass.
OSRM road geometry and outage fallback tests pass. Browser fallback operation was
also observed with the test routing endpoint disabled.

Browser verification used the available computer-use browser automation. The
reproduction sequence is documented; no standalone Playwright dependency/suite
was introduced. Automated backend/frontend checks are repeatable from npm.

## Actual performance observations

| Measurement | Mock Maritime enabled | Maritime disabled / OSRM outage |
| --- | ---: | ---: |
| SOS server acknowledgement | 88.092 ms | 37.546 ms |
| Ambulance offer from case creation | 447 ms | 204 ms |
| Hospital referral from case creation | 327 ms | 159 ms |

Agent processing is measured separately from emergency acknowledgement:

| Job | Processing/persistence | Detection-to-advisory or handoff-to-analysis |
| --- | ---: | ---: |
| GPS recovery recommendation | 154 ms | 228 ms from detection |
| Hospital referral recommendation | 39 ms | 79 ms from detection |
| GPS post-incident summary | 228 ms | 332 ms from handoff |
| Hospital referral post-incident summary | 34 ms | 1,325 ms from handoff |

These are individual local samples using a deterministic mock endpoint, not
live LLM latency or load-test percentiles. The two browser cases are not a
controlled benchmark, so their difference is not attributed to Maritime and no
speedup/no-overhead percentage is claimed. SOS did not await an agent response;
all four agent jobs executed later through the durable worker.

## Execution and remaining actions

The normal start/stop commands remain unchanged. See Maritime operations for
all environment settings, container configuration and the repeatable synthetic
browser scenario. Relevant commands from the repository root:

```powershell
npm.cmd run db:generate --prefix backend
npm.cmd run db:migrate --prefix backend
npm.cmd test --prefix backend
npm.cmd test --prefix frontend
npm.cmd run build --prefix frontend
powershell -ExecutionPolicy Bypass -File ./start-local.ps1
```

Live verification requires a working server-side MARITIME_API_KEY and an existing
approved MARITIME_AGENT_ID, plus a deployed chat-capable agent with a valid model
configuration. No keys belong in React or source control. Keep the feature off
until that integration is actually verified. Building/deploying a paid container
was not authorized and was not performed.

Remaining limits: Docker build and live cloud/model behavior are untested;
real ambulance hardware, real emergency care and multi-host load/soak testing
are outside this synthetic verification. Citation existence is machine-checked;
semantic correctness of a live LLM hypothesis still needs Admin judgment.
Attempt-exhausted jobs remain auditable failures and are not automatically
replayed indefinitely. Connectivity reflects recorded agent attempts, not a
continuous external availability guarantee. No real-world deployment readiness
or clinical validation is claimed.
