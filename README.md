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
- npm test runs library and app unit tests.
- docker compose up --build serves Platform on port 4200 and Portal on port 4300.

Platform includes the first API-backed access slice: workspace preview, sign-in, cookie-based session restoration, an authentication-only route guard, active API context display and sign-out. Portal remains a neutral application shell. Platform has no post-login context-switch route because the current API contract does not provide one; see [the Platform access traceability record](docs/traceability/platform-access.md) for the story and contract boundaries.

The role/capability projection includes all canonical Platform actors as informational data. API role strings remain authoritative inputs from the server, unmapped roles remain unmapped, and UI role labels never grant access.

`npm run test:e2e` exercises the real local API and Chromium browser. It requires the current `api` Docker Compose services and ignored `api/.env.local` credentials. The browser-check helper reads only allowlisted identity variables from the effective `modern-api` Compose configuration, verifies that the running container has the same values, and does not print credentials. GitHub Actions checks out the recorded public API source and creates ephemeral keys and seed credentials for the same real API integration; it stores no API credentials in repository secrets.

For the production Platform image, set the non-secret `NEXA_PLATFORM_API_BASE_URL` at container start to `/api/v1`, an absolute HTTPS API URL, or an HTTP loopback URL for local development. Every absolute URL must end in `/api/v1` and use a valid origin and port. The image writes that value to `runtime-config.js` before Nginx starts. The Angular development server proxies `/api/v1` to `http://127.0.0.1:8080`.

Both production Dockerfiles use independent multi-stage builds and pin their Node and Nginx base manifests by digest.

Blueprint's final Web Acceptance Criteria remain pending. Technical evidence in this repository does not mark stories Product Accepted or the application production ready.
