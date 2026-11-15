# SAHAY operational verification — 15 November 2026

## A. Changes implemented

- Removed CaregiverDashboard, ClinicianDashboard, their exclusive frontend helpers and the unused RolePreview page. Direct retired routes use the existing not-found behavior. Updated navigation, role cards, documentation and regression fixtures.
- Removed exclusive backend routes: `/cases/clinician/queue`, `/cases/caregiver/redeem`, `/cases/caregiver/cases`, `/cases/:id/caregiver` and the clinician-only `/cases/specialist/slots`. Preserved shared clinical observations, hospital specialist availability, invitation records, relationships, migrations and historical incidents.
- Restored the existing administrative command centre at `/admin`, with admin authentication and operational health. Added transactional replacement offers before patient pickup, with vehicle eligibility, driver availability, old reservation release and authorized notifications. Replacements after pickup are rejected and the control explains why it is disabled.
- Restored saved role sessions across refresh. Concurrent expired-token requests share one refresh operation. Resource hooks ignore stale responses, recover on socket reconnect and clean up listeners; leaving a trip now leaves its socket room.
- Removed the artificial SOS processing delay. Added payload-specific idempotency keys, server fingerprints, a per-patient transactional lock and a database unique constraint. Identical retries return the existing case; conflicting payloads with the same key return 409.
- Hid the incident timeline until a persisted SOS exists. Pending ambulance offers are labelled as pending acceptance. Timeline timestamps use recorded milestones. Hospital transport preserves the original driver acceptance timestamp.
- Added authenticated backend OSRM routing with validated coordinates, geometry, distance and duration. Outages return a labelled straight-line fallback. Normal ETA calculations use road duration when available; ETA sources explicitly distinguish road estimates, straight-line estimates and simulated travel.
- Fixed final handoff maps to retain the hospital destination. Fleet updates preserve admin zoom. Disabled Leaflet zoom transitions that could finish after map disposal; corrected duplicate admin component keys found through browser console inspection.
- Added component health for PostgreSQL, Gemini, OSRM and Socket.IO, including module-level Gemini outcomes and degraded fallback notices. OSRM status includes its last check time and becomes degraded after two minutes without a fresh check. Added startup checks for required database/JWT configuration, route rate limiting, coordinate validation and request logs that omit URL query strings.
- Added backward-compatible migrations `20261115000400_sos_idempotency` and `20261115000500_eta_source`; no historical table or patient data was deleted.
- Isolated backend tests into a separate local database ending in `_test`. This prevents the running development worker from consuming test fixtures. Added tracked-process stop support with PID/start-time checks and graceful PostgreSQL shutdown.

## B. Operational status

The application runs locally at **http://127.0.0.1:5174**. These observations describe the local simulation, not clinical or production certification.

| Component | Status | Verification |
| --- | --- | --- |
| Frontend | Healthy | Vite serves the application; production build passes; browser journey and responsive checks completed. |
| Backend | Healthy, overall degraded mode | Express API responds; workflow APIs persist transitions; health reports degraded because Gemini is unavailable. |
| PostgreSQL | Healthy | Real PostgreSQL on loopback port 5433; migrations applied; transactional integration suite passes; history survives service restart. |
| Gemini | Unavailable | GEMINI_API_KEY is not configured. No live model response was verified. Deterministic fallback is visible; injected timeout/invalid-response tests pass. |
| OSRM | Healthy when checked | Real public OSRM requests returned road geometry. A separate test API used an unreachable OSRM URL and completed the workflow with labelled fallback. Status is based on the latest route check, with freshness expiry. |
| Real-time synchronization | Healthy in tested scenarios | Authorized Socket.IO delivery, denied cross-patient joins, no leaked message event, reconnect recovery and browser workflow updates verified. Polling also restores state. |
| Patient Dashboard | Pass | Confirm pickup, choose condition, persist SOS, pending offer, acceptance, transport, hospital/doctor/observation display and final handoff verified. No pre-SOS timeline. |
| Driver Dashboard | Pass | Assigned mock ambulance, acceptance, moving GPS, pickup, hospital leg, final release and session refresh verified. |
| Hospital Dashboard | Pass | Engine referral, receiving acceptance, consistent specialist, recorded clinical observation, hospital arrival and handoff verified. |
| Admin Dashboard | Pass | Existing command centre, fleet counts, active case selection, health, destination/history and replacement restriction verified. Replacement mutation and authorization covered by API tests. |

## C. Test results and evidence

### Automated checks

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Backend Node tests against isolated PostgreSQL | 26 | 0 | 0 |
| Frontend Vitest tests, 7 files | 26 | 0 | 0 |
| Vite production build | Pass | 0 | 0 |
| Prisma generation and migration deployment | Pass | 0 | 0 |
| Git whitespace/error check | Pass | 0 | 0 |

Backend coverage includes Unicode and foreign keys, SOS/dispatch lifecycle, role denial, hospital referral replacement, clinical records, the Hospital ER handoff regression, idempotent concurrent SOS retries, conflicting request keys, transactional replacement, stale writes, rollback, competing reservations, message persistence, Socket.IO isolation/reconnection, specialist slots, routing outage and invalid coordinates.

Frontend coverage includes intake validation and confirmation, cleared query state, retired routes, role navigation, care records, concurrent token refresh, moving-map zoom preservation, travelled-route erasure, completed hospital destination and fleet zoom preservation.

### Browser scenarios

1. Development database case `e1ad6850-2d6d-4924-bbc2-f3c9ce2f3341`: public manual pickup, cardiac condition, persisted offer to DL01-ALS-1001, driver acceptance, OSRM pickup animation, hospital acceptance, synthetic clinical observation, hospital drive, arrival and handoff. Database verification found `handed_off`, one observation and an idle ambulance.
2. Isolated test database case `6bb25f38-de7a-43e9-81cf-ee4c9a9b865f`: full browser journey repeated. The test API was restarted with OSRM_URL pointing to an unreachable local port before hospital travel. The UI reported degraded routing and simulated direct-path travel; handoff still completed. Final case and observation survived refresh, and the ambulance was idle.
3. Final post-cleanup test-database case `85c08c1c-91d7-4b4c-8f6b-57625b7bc00a`: repeated SOS, driver acceptance, both travel legs, hospital acceptance, clinical observation and handoff using the final code. Entered synthetic drop-off, room, doctor contact/instructions and all four readiness checkpoints through the hospital interface. The patient retained those details and the final handoff after refresh. This final tab recorded no console errors.

Patient, driver, hospital and admin sessions were refreshed. The completed case remains accessible by its case URL and history. Driver release and hospital removal from active arrivals were verified after handoff. No frontend state was forced to bypass backend transitions.

A separate short synthetic case exercised admin case selection, zoom and immediate navigation away after the console fixes. It was cancelled through the patient interface. No new console errors appeared during that focused repeat. Earlier console errors were fixed rather than counted as passing checks.

Responsive screenshots were captured at 1440×1000, 768×1024 and 390×844 for all four dashboards. Document widths were 1425, 753 and 375 pixels respectively: no horizontal page overflow. Active workflow controls were exercised on desktop; the responsive captures include the patient completed-case view and the other dashboards after release. This is not exhaustive testing of every expanded form at every breakpoint.

### Actual local measurements

| Measurement | Observed value | Scope |
| --- | --- | --- |
| SOS HTTP acknowledgement | 71.642 ms | Server response-time log for the isolated browser SOS. |
| Ambulance offer from case creation | 99 ms / 100 ms | Development / isolated case event timestamps. |
| Hospital referral from case creation | 75 ms / 57 ms | Development / isolated case event timestamps. |
| PostgreSQL SELECT 1 median | 0.39 ms | Seven warm local queries; range 0.31–1.34 ms. |
| Health HTTP round-trip median | 3.07 ms | Seven local requests; range 2.33–40.67 ms. |
| Latest frontend production build | 7.67 seconds | Vite build output. |

These are small local observations with seeded synthetic resources, not load-test percentiles or real emergency response times. No comparable pre-change timing sample was captured, so no percentage improvement is claimed. The deliberate 60-second mock driving duration remains part of the simulation; SOS acknowledgement has no artificial wait.

## D. Remaining issues and limitations

- Live Gemini model availability, credentials, quotas and rate-limit behavior against the actual provider cannot be verified without a working server-side key. Existing injected failure tests and visible fallback passed. Configure a valid key/model and repeat live verification before claiming all-service readiness.
- Browser GPS success, permission prompts and accuracy depend on the device. Unit tests cover failure/accuracy handling; browser journeys used public synthetic manual pins. Real ambulance GPS hardware was not connected.
- The application still uses explicitly labelled synthetic accounts, ambulance positions, specialist slots and demo health readings. It has not undergone clinical validation, security certification, regulatory review or real dispatch integration.
- Public OSRM and OpenStreetMap availability are external dependencies. Straight-line fallback is an estimate. Matching currently ranks compatible resources by geographic distance, which is distinct from route travel duration.
- Docker/PostGIS, production deployment, horizontal multi-server Socket.IO delivery and sustained load/soak testing were not verified. No real emergency deployment was performed.
- The optional Python triage service was not separately verified in this run. Deterministic condition/equipment matching and Gemini fallback were used.
- There is no configured lint or TypeScript checker. Production compilation and relevant JavaScript tests pass. Browser verification covers the core emergency path and selected operational controls, not every legacy details-page button or every form/breakpoint combination.
- Changes are local and have not been committed or pushed as part of this implementation request.

## E. Exact execution instructions

Run these PowerShell commands from the repository directory:

```powershell
npm.cmd run db:generate --prefix backend
npm.cmd run db:migrate --prefix backend
powershell -ExecutionPolicy Bypass -File ./start-local.ps1
```

Stop all tracked services, including graceful database shutdown:

```powershell
powershell -ExecutionPolicy Bypass -File ./stop-local.ps1
```

Restart the API/frontend while keeping PostgreSQL running:

```powershell
powershell -ExecutionPolicy Bypass -File ./stop-local.ps1 -KeepDatabase
powershell -ExecutionPolicy Bypass -File ./start-local.ps1
```

Inspect logs and health:

```powershell
Get-Content ./backend/.data/logs/api.log -Tail 50 -Wait
Get-Content ./backend/.data/logs/api.error.log -Tail 50
Invoke-RestMethod http://127.0.0.1:5001/api/health | ConvertTo-Json -Depth 8
```

Run automated checks:

```powershell
npm.cmd test --prefix backend
npm.cmd test --prefix frontend
npm.cmd run build --prefix frontend
git diff --check
```

Backend tests create/use a separate local database ending in `_test` and run their API on port 5051. The database account needs permission to create that database, or TEST_DATABASE_URL must refer to a suitable pre-created local test database. Stop any separate test-environment orchestration worker before running the suite. Normal development services can remain running.

| Dashboard | URL | Development account |
| --- | --- | --- |
| Login | http://127.0.0.1:5174/login | Choose a demo role card. |
| Patient | http://127.0.0.1:5174/sos | patient@sahay.org |
| Driver | http://127.0.0.1:5174/driver | driver.ramesh@sahay.local |
| Hospital | http://127.0.0.1:5174/hospital | hospital@sahay.org |
| Admin | http://127.0.0.1:5174/admin | admin@sahay.org |

The existing demo password remains `SahayDemo123!`; development role cards sign in directly. The stop script only stops recorded processes whose start times match; untracked listeners are left unchanged. Both full stop/start and keep-database restart were executed successfully. Historical data was preserved.

## F. Final verdict

**SAHAY — PARTIALLY VERIFIED / ACTION REQUIRED**

The removed dashboards are gone, the local emergency simulation and repaired paths pass the stated checks, and persistent handoff works through a routing outage. Full operational verification is withheld because live Gemini is unavailable and real-world clinical, hardware and production behavior remain unverified. Configure Gemini and validate the actual deployment/integrations before making a broader readiness claim.
