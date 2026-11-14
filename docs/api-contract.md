# Sahay dashboard API contract

Paths are relative to `/api`. Unless marked public, send an access token as `Authorization: Bearer …`. List responses use named arrays. Legacy model routes return records with `_id`; the new case coordination routes return Prisma records with `id`. Error responses use `{ message }`. Treat 401 as a session failure, 403 as denied, 404 as missing and 409 as an eligibility or concurrent-state conflict.

| Consumer | Method and path | Request and response |
|---|---|---|
| Sign-in | POST `/auth/google` (public) | Google `idToken`; returns `accessToken` and `user`, sets refresh cookie. New accounts have patient permissions. |
| Session | POST `/auth/refresh`, POST `/auth/logout`, GET `/auth/me` | Refresh uses the cookie; logout clears it; me returns the authenticated account. |
| Patient | POST `/sos` | `lng`, `lat`, optional `address`, `symptoms` and `requestedAmbulanceTier`; 201 with `trip`, status and persistent `_id`. |
| Case and history | GET `/sos`, GET `/sos/:id` | Own cases or authorised case detail. Detail returns `trip.proposedHospital`, `trip.hospital`, and accepted vehicle data. |
| Dispatcher | GET `/dispatch/fleet`, `/dispatch/drivers`, `/dispatch/trips` | Returns `ambulances`, `drivers` and `trips`. |
| Dispatch offer | PATCH `/dispatch/trip/:id/assign` | Dispatcher/admin, `ambulanceId` and `driverId`; returns reserved `trip` and `ambulance`. Patient sees an awaiting-acceptance state. |
| Driver | GET `/dispatch/driver-trip`, GET `/ambulances?mine=true` | Returns active assigned case/vehicle or null and the driver's own vehicles. |
| Location | POST `/dispatch/ambulance/:id/location` | Assigned driver or dispatcher/admin; `lng`, `lat`, optional `heading`; stores position and updates simulated ETA for applicable stages. |
| Case stages | PATCH `/dispatch/trip/:id/status` | Assigned driver sends `dispatched`, `rejected`, `en_route`, `arrived_pickup`, `picked_up`, `en_route_hospital` or `arrived_hospital` in sequence. Matching hospital records `handed_off`. Owner and dispatcher/admin can cancel. |
| Case contacts | GET `/dispatch/trip/:id/contacts` | Own patient and assigned driver; vehicle contact becomes visible to the patient on acceptance. |
| Destinations | GET `/cases/:id/destinations`; POST `/cases/:id/referrals` | Dispatcher/admin. Lists ranked hospitals, referrals and confirmed destination. Creates proposal with `hospitalId`. |
| Hospital referrals | GET `/cases/hospital/referrals`; PATCH `/cases/:id/referrals/:referralId` | Linked hospital sees its own referrals and sends `action: accepted\|rejected`. Dispatcher/admin sends `confirmed\|withdrawn`. Acceptance reserves one free bed. |
| Hospital console | GET `/hospitals` (public), GET `/hospitals/:id/incoming`, PATCH `/hospitals/:id/beds` | Incoming and writes are hospital-scoped. Update `bedsAvailable` and optionally `receivingReady` and `specialties`. |
| Fleet operator | GET/POST `/ambulances`, PATCH `/ambulances/:id` | Operator scoped to linked fleet. Onboard or update vehicle number, tier, equipment and crew. Idle/offline changes use `status`. Admin sets compliance, verified crew and driver linkage. |
| Fleet operations | GET `/ambulances/:id/operations` | Linked operator or admin; returns recent vehicle assignments and operational timestamps without clinical or patient details. |
| Family invitation | GET/POST `/cases/:id/invitations`, DELETE `/cases/:id/invitations/:invitation` | Patient owner; POST accepts `email` and returns a one-time token and expiry. DELETE revokes the grant. |
| Caregiver | POST `/cases/caregiver/redeem`, GET `/cases/caregiver/cases`, GET `/cases/:id/caregiver`, POST `/cases/:id/caregiver/summary` | Redeem with `token` from the matching account. Case-scoped views include approved milestones and family-visible observations. Read and summary require an active grant on every call. |
| Clinician / EMT | GET/POST `/cases/:id/observations` | Clinician linked to confirmed hospital or certified assigned driver. POST takes `type`, `note`, `familyVisible`; returns recorded actor and timestamp. |
| Intelligence | POST `/intelligence/trips/:id/{ambulance,hospital,coordination,journey}` | Admin diagnostics. Inputs come from the database; no request data required. Returns input facts and `{source:"gemini", output}` or `{source:"deterministic", reason}`. |
| Public coverage | GET `/coverage`, POST `/coverage/waitlist` | Returns `zones`; waitlist accepts contact preference, contact, consent and area. |

Gemini output shapes are `{explanation,candidateRefs}`, `{comparison,hospitalRefs}`, `{progress,communicationNeeds}` and `{summary,evidenceRefs}`. Candidate and evidence references resolve only to the supplied input. Timeline inputs currently include observation type and time, with free-text notes kept out of Gemini.

Socket.IO admits authenticated staff to their role/organisation room and checks case access for trip room joins. `dispatch:new`, `trip:assigned`, `trip:status`, `trip:location`, `case:refresh` and `hospital:pre_alert` trigger updates or re-fetches. Caregiver data is fetched through short polling that rechecks the grant on every request.


## Automatic case operations

Covered SOS requests receive a persisted case before the worker evaluates ambulances and hospitals in parallel. The optional `requiredEquipment` and `requiredSpecialties` arrays constrain matching. Pending offers expire after 60 seconds and rejected or expired vehicles are excluded for that case. The backend records the initial destination when the receiving hospital accepts; replacing a confirmed destination requires dispatcher approval.

`GET /cases/:id/journey` returns role-scoped `status`, `events`, `observations`, `highlights`, and `coordination`. Generated highlights reference authoritative records by ID and are stored in a separate projection. An authorised caregiver uses the same endpoint with an active grant and receives only permitted observations. The manual caregiver summary endpoint and normal dashboard generation controls have been removed. `case:refresh` pushes updates to authorised case and staff rooms.
