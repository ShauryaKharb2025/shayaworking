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

Backend tests run against DATABASE_URL and start an isolated API on port 5051.
They create uniquely named synthetic records and remove those records afterward.
Use a development/test database for tests. Coverage fixtures come from npm run seed.

Seven integration tests cover foreign keys, Unicode, API compatibility, dispatch,
GPS, cancellation, relations, messages, demand aggregation, stale saves,
transaction rollback and competing reservations.

## Useful commands

- npm run db:studio (in backend): inspect tables with Prisma Studio.
- npm run db:migrate: apply checked-in migrations.
- npm run db:generate: regenerate Prisma Client after schema changes.
- npm run seed: replay the synthetic fleet/coverage fixture.

## Sahay dashboard design

The homepage now follows the supplied patient dashboard reference: navy role
navigation, SOS / medical-help cards, three-step intake, incident details, OSM map,
case summary, response timeline and equipment/crew/hospital summary cards.
Responsive styles reorganize these panels for tablet and mobile widths.

Anonymous visitors see explicitly labelled synthetic preview data. Signed-in
patients see their own API-backed cases, with a 10-second refresh. SOS pickup,
symptoms and the requested ambulance tier are persisted. The tier is a preference
for review, not automatic clinical triage. GPS without a recent timestamp is
labelled stale or unavailable. No road route is invented for real cases.
The sample preview route is dashed and labelled illustrative.

Dispatcher, driver, hospital and operator pages retain their connected operational
tools inside the new design shell. Anonymous visitors can explore sample role
layouts. Clinician and caregiver pages are design previews only; clinical entry,
secure invitations and family summaries still need backend implementation.
Non-emergency medical services display an availability explanation rather than
pretending to book care. Existing trip messaging/cancellation controls are
accessible from the case dashboard's Trip controls & messages link.

Map components use OpenStreetMap tiles when Google Maps is not configured.
Network tile failures show an offline indication. Signed-in users can drag the
pickup marker or explicitly request geolocation before submitting an SOS.

Run frontend checks with npm test and npm run build from frontend.
Nine component tests cover submission validation, stored request preferences,
preview isolation, role navigation, notifications, unavailable service handling,
API errors and unavailable clinical saving. Seven PostgreSQL integration tests
also pass. Browser preview access was declined during implementation; visual
inspection of the running desktop/mobile layouts has not been completed.

## Brand assets

The supplied Sahay heart-and-heartbeat logo is used throughout the shared header
and browser favicon. frontend/public/sahay-logo.png preserves the original uploaded
image. SVG viewport compositions provide the horizontal header lockup
(sahay-header.svg), full logo (sahay-logo.svg), and icon (sahay-mark.svg) without
redrawing or changing the original artwork.
