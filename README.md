# Sahay local development

The application uses React/Vite, Express/Socket.IO, PostgreSQL and Prisma.
MongoDB and Mongoose are no longer required.

## Start on this laptop

Run from the repository folder:

    powershell -ExecutionPolicy Bypass -File ./start-local.ps1

Open http://127.0.0.1:5174. The API is at http://127.0.0.1:5001/api/health.
The script starts hidden local services and writes logs under backend/.data/logs.
It leaves any existing listeners alone; check the logs if a port belongs to another application.

PostgreSQL listens only on 127.0.0.1:5433. Its persistent files are in
backend/.data/postgres. This is an actual PostgreSQL server launched with the
embedded-postgres development package; Docker is not required.
The example database password is for local development only.
Do not delete .data to restart the app.

## First setup on another machine

Use Node.js 20 or newer (Node 24 was tested).

    cd backend
    npm install
    Copy-Item .env.example .env
    npm run db:generate
    npm run db:local

Leave the database terminal running. In another terminal:

    cd backend
    npm run db:migrate
    npm run seed
    $env:PORT = "5001"
    npm start

Set two different random JWT secrets in backend/.env. Set CLIENT_URL to
http://127.0.0.1:5174. In frontend/.env.local set:

    VITE_API_URL=http://127.0.0.1:5001/api
    VITE_SOCKET_URL=http://127.0.0.1:5001

Then run:

    cd frontend
    npm install
    npm run dev -- --host 127.0.0.1 --port 5174 --strictPort

Authentication uses self-contained JWT and role-based sessions without external
OAuth dependencies. Sign in directly from the login page or select a quick demo role.

The optional Python triage service can be started from ai-service using its
requirements.txt and app.py. SOS creation continues if that service is unavailable.

## PostgreSQL model and compatibility

Prisma schema: backend/prisma/schema.prisma.
Versioned SQL migrations: backend/prisma/migrations.
Users, operators, ambulances, hospitals, coverage zones, trips and waitlist entries
have separate tables. Foreign keys link users, vehicles, fleets, destinations and trips.
Nested profiles, crew, coordinates, messages and events use JSONB columns.
Equipment and specialty lists use PostgreSQL arrays.

backend/src/data/repository.js translates the subset of the old model query API
used by controllers into Prisma queries. The frontend still receives _id fields,
GeoJSON coordinates and populated relations. It is not a MongoDB driver.
Unknown query operators fail explicitly. It is not a general Mongoose replacement.

Transactions commit ambulance and trip reservations together. Partial unique
indexes prevent multiple active trips sharing an ambulance and multiple active
ambulances sharing a driver. Optimistic versions reject stale document saves.
Event and message arrays retain their existing API format.

The seeder can be replayed without duplicating demo fleets, hospitals and zones.
There was no configured MongoDB database in this checkout, so no existing patient
records were copied. For an existing deployment, export and transform its data
before cutover; the included migration creates the PostgreSQL schema only.
Back up production data and test an import separately.

## PostGIS option

The native development database uses the existing Haversine coverage calculation.
For PostGIS, use the included compose.yaml with Docker installed. Stop the native
database first because both configurations use port 5433.

    $env:POSTGRES_PASSWORD = "choose-a-password"
    docker compose up -d db

Set DATABASE_URL in backend/.env to that database and password, then run:

    cd backend
    npm run db:migrate
    npm run db:postgis
    npm run seed

The PostGIS setup creates geographic expression indexes for ambulances, hospitals
and coverage zones. Coverage uses ST_DWithin when the extension is installed.
Restart the API after enabling PostGIS. Fleet ranking retains the existing
distance and capability scoring; geographic distance is not a road travel ETA.
Docker/PostGIS was not available on the implementation laptop, so that optional
configuration has not been integration-tested.

## Validation

    cd backend
    npm test
    npm run db:generate
    npm run db:migrate
    cd ../frontend
    npm run build

Backend tests create a random disposable local database ending in `_test` using
the DATABASE_URL server. TEST_DATABASE_URL can override it with another local database.
The runner applies migrations, seeds on first use and starts an API on port 5051.
It drops only its newly created random database; an explicit TEST_DATABASE_URL
is retained. RESCUE authorization tests additionally use port 5053.
They create uniquely named synthetic records and remove those records afterward.
Do not run another orchestration worker against that database while tests run.

The baseline backend tests cover foreign keys, Unicode, API compatibility, dispatch,
GPS, cancellation, relations, messages, demand aggregation, stale saves,
transaction rollback and competing reservations.

## Useful commands

From the repository folder, stop tracked services with
`powershell -ExecutionPolicy Bypass -File ./stop-local.ps1`.
Use `-KeepDatabase` to leave PostgreSQL running, then run `start-local.ps1` again
to restart the API and frontend. The stop script checks recorded process start
times; untracked processes are left running. It preserves database files.

Inspect logs with `Get-Content ./backend/.data/logs/api.log -Tail 50 -Wait`.
Inspect component health with
`Invoke-RestMethod http://127.0.0.1:5001/api/health | ConvertTo-Json -Depth 8`.
HTTP 200 means database readiness; overall operationalStatus may be degraded.
Gemini, OSRM and Socket.IO have separate statuses. OSRM status is degraded when
the last route check is older than two minutes. Socket status describes the
running transport and connected clients, not continuous delivery verification.

Gemini was unavailable because its key was not configured. Deterministic
fallback is visibly identified. OSRM geometry and road duration come through
the authenticated backend route endpoint. Failures return labelled straight-line
geometry and estimates. ETA labels distinguish road estimates, straight-line
estimates and simulated travel. Public routing and map tiles have no application
availability guarantee. This remains a synthetic, unvalidated emergency prototype.

The current demo login cards include admin@sahay.org. Existing demo passwords
are unchanged. Operator and dispatcher accounts have no dashboard login.
No lint or TypeScript check is configured in this JavaScript repository.

- npm run db:studio (in backend): inspect tables with Prisma Studio.
- npm run db:migrate: apply checked-in migrations.
- npm run db:generate: regenerate Prisma Client after schema changes.
- npm run seed: replay the synthetic fleet/coverage fixture.

## Sahay dashboard design

The homepage now follows the supplied patient dashboard reference: navy role
navigation, SOS / medical-help cards, three-step intake, incident details, OSM map,
case summary, response timeline and equipment/crew/hospital summary cards.
Responsive styles reorganize these panels for tablet and mobile widths.

Anonymous visitors are redirected to sign-in. Signed-in patients see their own
API-backed cases, with socket updates and a 10-second recovery refresh. SOS pickup,
symptoms and the requested ambulance tier are persisted. The tier is a preference
for capability matching, not clinically validated triage. GPS without a recent timestamp is
labelled stale or unavailable. No road route is invented for real cases.
The sample preview route is dashed and labelled illustrative.

The active dashboards are Patient (`/sos`), Driver (`/driver`), Hospital
(`/hospital`) and the existing Admin command centre (`/admin`). Caregiver and
clinician dashboards, role previews and exclusive APIs have been removed.
Shared clinical observations, specialist records and historical data remain.
Sessions survive refresh; backend authorization remains authoritative.
Non-emergency medical services display an availability explanation rather than
pretending to book care. Existing trip messaging/cancellation controls are
accessible from the case dashboard's Trip controls & messages link.

Map components use OpenStreetMap tiles when Google Maps is not configured.
Network tile failures show an offline indication. Signed-in users can drag the
pickup marker or explicitly request geolocation before submitting an SOS.

Run frontend checks with npm test and npm run build from frontend.
The frontend tests cover submission validation, stored request preferences,
preview isolation, role navigation, notifications, unavailable service handling,
API errors, token refresh, retired routes, map zoom and completed journey maps.
Three complete browser journeys, including an OSRM outage, were verified locally.
Desktop, tablet and mobile layouts were inspected for all four active roles.
See docs/operational-verification.md for evidence and remaining limits.

## Sahay RESCUE

The Admin command centre includes optional, simulation-only incident intelligence.
Maritime stays disabled by default and never blocks the primary emergency workflow.
Its watchdog, durable queue, cloud container contract, safe recovery review and
configuration are documented in [Maritime operations](docs/maritime-operations.md).
Live integration requires server-side credentials and an approved deployed agent;
the local mock is explicitly labelled. No paid cloud resource is created by startup.

## Brand assets

The supplied Sahay heart-and-heartbeat logo is used throughout the shared header
and browser favicon. frontend/public/sahay-logo.png preserves the original uploaded
image. SVG viewport compositions provide the horizontal header lockup
(sahay-header.svg), full logo (sahay-logo.svg), and icon (sahay-mark.svg) without
redrawing or changing the original artwork.
