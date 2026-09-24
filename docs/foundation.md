# Web clients foundation

This repository is a native Angular CLI workspace with two independent standalone applications:

- Platform: apps/platform
- Portal: apps/portal

The applications have separate bootstrap, routing, build, test, Docker, and static output targets. They do not import from one another. Both consume shared packages through their public entry points.

## Shared packages

- libs/nexa-ui adopts the reviewed Design Lab component library.
- libs/nexa-api contains the focused HTTP transport, ephemeral access-token store, Problem Details mapping, and auth/session contracts.
- tokens and src/styles are the shared token sources and generated runtime style layers.

The API base is configurable through provideNexaHttp. The skeleton apps use the OpenAPI path prefix /api/v1 as a same-origin base; deployment can supply an absolute API origin when required. The client only adds the surface header on the refresh and sign-out contracts, sends browser-managed cookies on the sign-in, refresh, and sign-out contracts, and attaches an available in-memory bearer token to API requests.

The browser refresh token remains server-managed in an HttpOnly cookie. The access token is held only in a signal-backed in-memory store. Shared code provides no client-side role authority or post-login context-switch behavior. Each app may add its own server-authorized feature navigation.

`NexaHttpClient` is the typed-consumer boundary over the shared HTTP interceptor. Feature adapters use its API-relative `get`, `post`, and `put` methods so bearer transport, browser cookies, timeouts, correlation, and Problem Details mapping stay configured centrally. Portal feature code must not inject Angular `HttpClient` directly.

The error mapper reads Retry-After when the browser exposes it. The current API CORS configuration does not expose that response header, so browser callers must not rely on a retry delay being available.

The contracts reflect the current checked-in OpenAPI baseline. Workspace preview identifies a workspace; sign-in supplies the selected workspace slug and surface. There is no eligible-workspace listing or post-login context-switch endpoint in this contract.

## Local commands

- npm ci installs the shared lockfile.
- npm run validate:design checks generated tokens and architecture boundaries.
- npm run build:all builds both shared packages and both applications.
- npm test runs shared and app unit tests.
- docker compose up --build runs only the two web images.

## Technical verification criteria

- Both standalone apps compile to separate production browser outputs.
- Shared UI imports resolve through the public API and adopted package output.
- Application API adapters use the shared `NexaHttpClient` transport boundary.
- Token SCSS matches its source JSON and canonical logo assets are included in both app builds.
- App boundaries, ephemeral auth-token handling, and shared transport boundaries pass the architecture check.
- CI builds each production Docker image separately, with SPA fallback and a container health check.

Runtime API behavior is not a validation target for this foundation checkpoint.
