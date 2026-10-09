# Nexa web clients

This repository owns the shared Angular foundation and the separate Platform and Portal web applications.

## Workspace

- apps/platform and apps/portal are standalone Angular applications with independent bootstrap, routes, tests, builds, and Docker images.
- libs/nexa-ui is the adopted shared component library.
- libs/nexa-api owns browser API transport primitives and contracts.
- tokens and src/styles contain the shared design-token sources and runtime styles.

## Commands

- npm ci installs the checked-in dependency lock.
- npm run validate:design checks generated token layers and architecture boundaries.
- npm run build:all builds both libraries and both applications.
- `npm run test:ui`, `npm run test:api`, `npm run test:platform`, and `npm run test:portal` run the four unit-test targets separately; the latest runs passed 21 + 62 + 124 + 85 tests (292 total). Two real API browser checks also passed separately, one catalog check and one Buyer order-flow check; exact commands and scope are in the [canonical context coverage map](docs/architecture/canonical-context-coverage.md).
- docker compose up --build serves Platform on port 4200 and Portal on port 4300.

Platform and Portal remain separate experiences over one shared API authority. Platform uses API-backed context listing and selection; Portal validates the Buyer relationship before displaying its API-backed catalog, purchase requests, orders, delivery tracking, commercial credit/receivables, payment history and documents. Platform composes Sales review, fulfillment readiness/start and document access under its authenticated shell. The credit panel depends on the additive API endpoint in [API PR #114](https://github.com/nexa-suite/api/pull/114); rechargeable funds and the internal onboarding/support console remain accepted TARGET scope. Browser context selection uses Bearer authority; the identity-first sign-in and pre-context ticket flow is NATIVE-only. See the [canonical context coverage map](docs/architecture/canonical-context-coverage.md) for current AS-IS coverage, TARGET scope and cross-repository contract boundaries.

The consolidated static `web-clients` application provides the public password
reset route at `/reset-password`. Its API boundary and Pages deployment
contract are recorded in [Access recovery](docs/access-recovery.md).

The role/capability projection includes all canonical Platform actors as informational data. API role strings remain authoritative inputs from the server, unmapped roles remain unmapped, and UI role labels never grant access.

`npm run test:e2e` exercises the real local API and Chromium browser. It requires the current `api` Docker Compose services and ignored `api/.env.local` credentials. The browser-check helper reads only allowlisted identity variables from the effective `modern-api` Compose configuration, verifies that the running container has the same values, and does not print credentials. GitHub Actions checks out the recorded public API source and creates ephemeral keys and seed credentials for the same real API integration; it stores no API credentials in repository secrets. The coverage map records the current Buyer order-flow and catalog browser checks separately from the unit-test results.

For the production Platform or Portal image, set the corresponding non-secret `NEXA_PLATFORM_API_BASE_URL` or `NEXA_PORTAL_API_BASE_URL` at container start to `/api/v1`, an absolute HTTPS API URL, or an HTTP loopback URL for local development. Every absolute URL must end in `/api/v1` and use a valid origin and port. The shared container entrypoint validates and writes that value to `runtime-config.js` before Nginx starts. Both Angular development servers proxy `/api/v1` to `http://127.0.0.1:8080`.

Both production Dockerfiles use independent multi-stage builds and pin their Node and Nginx base manifests by digest.

Blueprint's final Web Acceptance Criteria remain pending. Technical evidence in this repository does not mark stories Product Accepted or the application production ready.

Production images serve static clients and do not forward `/api/` requests. With the default `/api/v1`, an external gateway must route that prefix to the API; standalone containers require the explicit API origin above. API CORS and cookie policies must permit the deployed client origin.

The existing cloud API is `https://nexa-api-69bj.onrender.com/api/v1`. On 2026-10-09 its readiness endpoint returned `UP`, but its published OpenAPI did not include the Buyer credit endpoint from PR #114. Its browser preflight also rejected `http://localhost:4200`; an API URL alone does not establish a permitted browser origin or refresh-cookie compatibility. Use the recorded API revision locally for this integration until the cloud deployment includes the required contracts and the actual Platform/Portal origins are configured. Do not replace browser authentication with Native headers to bypass those requirements.
