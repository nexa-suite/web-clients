# Web clients foundation

This repository is a native Angular CLI workspace with two independent standalone applications:

- Platform: apps/platform
- Portal: apps/portal

The applications have separate bootstrap, routing, build, test, Docker, and static output targets. They do not import from one another. Both consume shared packages through their public entry points.

## Shared packages

- libs/nexa-ui adopts the reviewed Design Lab component library.
- libs/nexa-api contains the focused HTTP transport, ephemeral access-token store, Problem Details mapping, and auth/session contracts.
- tokens and src/styles are the shared token sources and generated runtime style layers.

The API base is configurable before Angular starts through the Platform runtime configuration and `provideNexaHttp`. The current API's browser refresh cookie is scoped to `/api/v1/authentication`, so Platform accepts the current `/api/v1` path with either the same origin or an absolute HTTPS API origin; absolute HTTP is limited to `localhost`, `127.0.0.1` and `[::1]` development runtimes. The client and container entrypoint reject invalid ports, unsupported host forms and prefixes, protocol-relative URLs, credentials, queries and fragments. The Angular development server proxies `/api/v1` to the local API on `127.0.0.1:8080`. The Platform container can generate `runtime-config.js` from the non-secret `NEXA_PLATFORM_API_BASE_URL` environment variable at startup; configure an API origin when ingress does not route `/api/v1` to the API before it reaches the static container. The client adds the surface header on refresh and sign-out, sends browser-managed cookies on sign-in, refresh and sign-out, and attaches an available in-memory bearer token to API requests.

The browser refresh token remains server-managed in an HttpOnly cookie. The access token is held only in a signal-backed in-memory store. Platform now has a real sign-in route, an authentication-only guard, and an API-backed active-context view. Role and capability data is an informational projection; it does not authorize client actions. The current API does not provide eligible-context listing or post-login context switching.

The error mapper reads Retry-After when the browser exposes it. The current API CORS configuration does not expose that response header, so browser callers must not rely on a retry delay being available.

The contracts reflect the current checked-in OpenAPI baseline. Workspace preview identifies a workspace; sign-in supplies the selected workspace slug and surface. See [Platform access traceability](traceability/platform-access.md) for story scope, current contract coverage, role mapping gaps and the distinction between technical verification and pending Product Acceptance Criteria.

## Local commands

- npm ci installs the shared lockfile.
- npm run validate:design checks generated tokens and architecture boundaries.
- npm run build:all builds both shared packages and both applications.
- npm test runs shared and app unit tests.
- npm run test:e2e runs the local API-backed Platform browser flow; it requires the current local API Compose stack and ignored `api/.env.local` configuration. Credentials are read from Docker Compose's resolved configuration and never printed.
- GitHub Actions separates design/architecture gates, unit tests, Angular builds and app image builds. Its API integration job checks out the recorded API revision and generates ephemeral CI-only keys and identities before running the same real Platform Playwright suite.
- docker compose up --build runs only the two web images.

## Technical verification criteria

- Both standalone apps compile to separate production browser outputs.
- Shared UI imports resolve through the public API and adopted package output.
- Token SCSS matches its source JSON and canonical logo assets are included in both app builds.
- App boundaries, ephemeral auth-token handling, and shared transport boundaries pass the architecture check.
- Platform sign-in, session restoration, current-context display and sign-out use real API contracts; full active-context selection remains blocked by missing API contracts.
- CI builds each production Docker image separately, with SPA fallback and a container health check.

These are technical verification criteria, not Product Acceptance Criteria. Blueprint marks the final Web Acceptance Criteria for `WEB-US-016` and `WEB-US-018` pending; successful builds, tests or API probes do not close those Product gates.
