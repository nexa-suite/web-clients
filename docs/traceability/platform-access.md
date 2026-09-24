---
status: implementation-evidence
maturity: AS-IS / technical verification
scope: Platform access slice
owner: web
last-reviewed: 2026-09-24
---

# Platform access slice traceability

This document records the current implementation evidence for the Platform
access slice in `web-clients`. It traces the slice to the accepted Web stories,
the current API contract and the adopted Design Lab source. It does not create
Product Acceptance Criteria, close a Product gate or make a production-ready
claim.

## Evidence references

The following revisions were captured on 2026-09-24. The short revisions below
are included only for readability; the full revisions are the evidence refs.

| Source                            | Revision                                   | Relevant evidence                                                                                                                                |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blueprint                         | `812cb4a73ec2ecdef1853acaaeb8ba656e583a42` | Current Product decisions, Web story catalog, BC-01, actor catalog and role-capability matrix                                                    |
| Design Lab                        | `ec590abd4c3c6fae97dd7c14d866443e3f67e1e0` | Reusable Angular UI package, tokens, accessibility styles and authentication pattern evidence                                                    |
| API OpenAPI baseline              | `c59388a7a791425dacdaa0edf2d622f5a3be2919` | Revision recorded by `docs/baselines/source-baselines.json`; `docs/openapi/openapi.json` is v0.17.0                                              |
| API source checkout used by CI    | `9c74f3d01b7a60c7ba3df25e673d76d0e54986c7` | Exact `feature/api-production-foundation` checkout used by the executed API integration; no OpenAPI snapshot diff from the recorded API baseline |
| Web clients foundation checkpoint | `22c151da0d9447568970aa7c6a10f48fde79e090` | Signed `chore(web): establish shared Angular foundation` checkpoint on `feature/platform-production-foundation`                                  |
| Web clients access-slice ref      | Reported in the Git/PR handoff             | The final source revision is captured at branch publication and reported with the handoff.                                                       |

The Platform access files listed below are the current branch implementation
evidence after the foundation checkpoint. The second-phase access, runtime
configuration and Docker changes were validated from the working tree. At the
time this evidence snapshot was recorded, the final branch commit and
GitHub PR/CI were pending; current revisions and check status are reported in
the branch publication handoff.

## Canonical story scope

The current Web catalog is frozen and explicitly records that Acceptance
Criteria remain pending. The relevant stories are in
`blueprint/02-web/requirements/user-stories/WEB-EPIC-03-workforce-access-governance.md`.

| Story                                            | Canonical meaning                                                                                                                    | Slice traceability                                                                                                                                                                                                                                                                                    | Product state                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `WEB-US-016` — Sign in to Nexa                   | Platform / Authorized User / MUST / BC-01. The user enters Nexa with the identity and access context that govern the work.           | `SignInPageComponent` previews a workspace through the API before collecting identity and password, signs in with `surface: PLATFORM`, loads the authenticated session, restores a browser session through refresh, and exposes sign-out.                                                             | `CONFIRMED / V1`; catalog frozen and Product Acceptance Criteria pending. |
| `WEB-US-018` — Select an active business context | Platform / User with multiple relationships / MUST / BC-01. Each action must be evaluated against the intended Tenant and Workspace. | The sign-in request supplies the selected `workspaceSlug`; the active-context view displays the API session's user, Tenant, Workspace, membership, surface, roles and permissions. The current API has no post-login context-switch contract, so this slice records a bounded partial implementation. | `CONFIRMED / V1`; catalog frozen and Product Acceptance Criteria pending. |

`WEB-US-017` (account recovery) and the remaining Workforce & Access
Governance stories are outside this access slice. The epic states that their
final Acceptance Criteria, Business Rules, dependencies and other refinement
fields remain pending.

## Implemented evidence

| Boundary                     | Evidence                                                                                                                                              | Responsibility preserved                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform route boundary      | `apps/platform/src/app/features/access/access.routes.ts`, `apps/platform/src/app/app.routes.ts`                                                       | The sign-in route is public. The Platform shell and child routes require an authenticated session only; role labels are not used as client authorization.                                                   |
| Sign-in flow                 | `apps/platform/src/app/features/access/sign-in-page.component.ts` and its template/styles                                                             | Workspace slug validation and preview precede identity/password submission. API response state drives the form; no mock credentials or synthetic workspace state is introduced.                             |
| Session state                | `apps/platform/src/app/core/platform-session.store.ts` and `platform-authentication.guard.ts`                                                         | Access tokens are held in the shared in-memory store. Refresh-cookie restoration, session loading, sign-in and sign-out remain server-backed. The guard only shapes navigation.                             |
| Shared API transport         | `libs/nexa-api/src/lib/auth/authentication-api.ts`, `authentication.contracts.ts` and `http/nexa-http.ts`                                             | Requests use the current API paths. The interceptor adds `X-Nexa-Surface` to refresh/sign-out, sends browser credentials for browser-session routes and excludes bearer authorization from sign-in/refresh. |
| Current context projection   | `apps/platform/src/app/features/access/platform-active-context.component.*` and `platform-shell-session-wrapper.component.*`                          | The page displays the API-returned context and gives the user an explicit boundary message when the current API cannot switch context after sign-in.                                                        |
| Role/capability presentation | `apps/platform/src/app/features/access/platform-role-presentation.ts` and its spec                                                                    | Canonical Platform actor/capability data is an informational projection. It is not consulted by routes, guards or action authorization. Unknown API role strings remain visible and unmapped.               |
| Design boundary              | `libs/nexa-ui`, `tokens`, `src/styles`, `docs/baselines/design-lab-adoption.md`                                                                       | Production code imports the adopted UI package through its public API. Design Lab documentation, demo routes and synthetic authentication behavior are not promoted into the apps.                          |
| Production/runtime boundary  | `apps/platform/Dockerfile`, `apps/platform/docker-entrypoint.d/40-runtime-config.sh`, `apps/platform/proxy.conf.json`, `apps/platform/src/index.html` | The production image can inject an `/api/v1` API origin at container start, and local development can proxy `/api/v1` to the API. Runtime configuration does not create an API context-switch contract.     |

### Current Platform route inventory

The live Platform route tree currently contains only the access-proving shell:

| Route      | Guard/presentation                                                                                                  | Current state                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `/sign-in` | Public `SignInPageComponent`                                                                                        | Workspace preview, credentials and API-backed Platform sign-in.    |
| `/`        | `requirePlatformAuthentication` and `requirePlatformAuthenticationForChild`; `PlatformShellSessionWrapperComponent` | `PlatformActiveContextComponent` displays the current API session. |
| `/**`      | Redirects to `/`                                                                                                    | No role-specific fallback or authorization policy is introduced.   |

No business navigation or role-specific route is present in this phase. The
guard checks only whether the API session is authenticated.

## Current API contract

The committed API snapshot is OpenAPI `3.1.0`, API version `0.17.0`. The
authentication transport needed by the first slice is present. The broader
access-context contract remains **PARTIAL**: the current snapshot has no
identity-level eligible-context operation and no in-session context switch.
The following operations are the contract used by this slice:

| Operation                              | Request and response used by Platform                                                                                                                                                                                           | Transport boundary                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POST /api/v1/auth/workspace-previews` | Body `{ workspaceSlug }`; the snapshot constrains the slug to 3–80 letters, numbers or hyphens. The response contains `recognized`, `displayName`, `workspaceUrl`, `logoUrl` and `loginAvailable`.                              | Public preview; it does not establish authorization.                                                   |
| `POST /api/v1/authentication/sign-in`  | Body `{ identifier, password, workspaceSlug, surface }`, where `surface` is `PLATFORM` or `PORTAL`. The response contains an access token and session context; browser transport establishes the server-managed refresh cookie. | No bearer header is attached by the shared interceptor. Credentials are never persisted by the client. |
| `POST /api/v1/authentication/refresh`  | No body. Browser refresh uses the surface cookie and requires `X-Nexa-Surface`; the response rotates the session and returns a new access token.                                                                                | Browser credentials are included; bearer authorization is excluded.                                    |
| `GET /api/v1/session`                  | Bearer-authenticated request. The response contains `user`, `tenant`, `workspace`, `membership` and `surface`; membership contains roles, permissions, role-definition IDs and authorization version.                           | API revalidates the current session and membership.                                                    |
| `POST /api/v1/authentication/sign-out` | No body; the Platform surface header is supplied when present. The contract returns `204`.                                                                                                                                      | The API revokes the session and clears the browser cookie where applicable.                            |

Problem Details remain the API error boundary. The API documents `401` for
missing/invalid authentication and `403` for denied surface, membership or
permission decisions. The current browser CORS contract does not expose
`Retry-After`; a client cannot rely on reading a retry delay in the browser.

The API remains authoritative for Tenant, Workspace, membership, roles,
permissions, object scope and business decisions. A client role label or hidden
route is never an authorization decision.

The current API role catalog exposes `TENANT_ADMIN`, `COMPANY_OWNER`, `SALES`,
`WAREHOUSE` and `LOGISTICS` on `PLATFORM`; `BUYER` belongs to `PORTAL`. The
Platform presentation layer maps the first four exact role codes, keeps
`LOGISTICS` raw and unmapped, and does not invent a Business Operations Manager
role.

## Missing API contracts and context boundary

The accepted BC-01 functional contract names `SelectAccessContext` as a
conceptual command and `ListMemberships` / `ReadActiveContext` as conceptual
queries. The current HTTP contract does not expose a self-service equivalent
that lets a signed-in identity list all eligible Tenant/Workspace contexts with
the required membership and capability projection, nor does it expose an
in-session context-switch operation that atomically revalidates the new scope
and returns a replacement session.

The current `GET /api/v1/workspaces` and
`GET /api/v1/workspace-memberships` operations are authenticated organization
administration reads bound to the current access context and `TENANT_READ`
permission. They are not documented as an identity-level eligible-context
selector or a context-switch contract. The current V1 Product decision also
states `Tenant 1:1 Workspace`; that does not close the multi-relationship story
or define the transition semantics for a future 0/1/2+ context flow.

**Open API contracts:**

- Eligible-context listing for a signed-in identity, including relationship
  status, Tenant/Workspace identity and effective membership/capability data.
- Context selection or switch semantics, including reauthentication/session
  replacement, failure behavior, authorization-version handling, audit and
  concurrency rules.
- Exact browser transport for that operation, including surface, cookie/header
  behavior and Problem Details.

Until these contracts are accepted and implemented, the Platform slice treats
the workspace slug supplied at sign-in as the context-selection input and
does not present a false post-login switch control.

## Canonical Platform actor and capability coverage

The source of truth for the actor and capability projection is
`blueprint/01-shared/product/actors.md`,
`blueprint/01-shared/product/surface-role-matrix.md` and
`blueprint/01-shared/product/role-capability-matrix.md`. The implementation
represents each canonical Platform workforce actor in
`CANONICAL_PLATFORM_ACTORS`; capability entries are presentation data only.

| Canonical actor                    | Platform capability projection                                                            | Current API role evidence  | Gap recorded by the slice                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Company Owner                      | `CAP-01` through `CAP-16` as defined by the Blueprint matrix                              | Exact code `COMPANY_OWNER` | Mapping is label-only; server policy remains authoritative.                                                                                            |
| Tenant Administrator               | `CAP-02`, `CAP-03`, `CAP-04`, `CAP-14`, `CAP-15`, `CAP-16`                                | Exact code `TENANT_ADMIN`  | Mapping is label-only; server policy remains authoritative.                                                                                            |
| Business Operations Manager        | Operational oversight/query projection across the relevant capability families            | No exact API role code     | No API role is named `BUSINESS_OPERATIONS_MANAGER`; the client does not invent one.                                                                    |
| Sales Representative               | Blueprint sales, commercial, visibility and traceability capabilities                     | Exact code `SALES`         | Mapping is label-only; server policy remains authoritative.                                                                                            |
| Warehouse Operator                 | Blueprint availability, warehouse, fulfillment, cold-chain and related query capabilities | Exact code `WAREHOUSE`     | Mapping is label-only; server policy remains authoritative.                                                                                            |
| Dispatch Coordinator               | Blueprint dispatch, delivery, cold-chain and operational-visibility capabilities          | No exact API role code     | API role `LOGISTICS` is retained as a raw string and is deliberately not equated to Dispatch Coordinator. Its broader scope needs an accepted mapping. |
| Nexa Commercial & Onboarding Staff | Support boundary for Website/onboarding stories; not a workforce-role column              | No Platform workforce role | No role or capability grant is fabricated.                                                                                                             |

`Driver / Delivery Operator` is not a Platform actor in the canonical surface
matrix; it is an Operations Mobile actor. `Customer Buyer` belongs to the
Buyer Portal surface. Neither is presented as a Platform role. The API's
`BUYER` role is therefore outside this Platform slice.

## Technical verification criteria

These are technical checks derived from current contracts and implementation
boundaries. They are not Product Acceptance Criteria. `SOURCE-VERIFIED` means
the current files and contract were inspected; it does not imply that a build,
test, browser, Docker or CI command passed.

| ID    | Technical criterion                                                                                                                                                                                            | Evidence or gate                                                                                                                                    | Status at this capture                                                                                                                                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TV-01 | Authentication calls match the current OpenAPI paths and payloads; sign-in/refresh do not receive a client bearer; refresh/sign-out carry the Platform surface and browser credentials.                        | `authentication-api.spec.ts`, `nexa-http.spec.ts`, contract snapshot and `NexaAuthenticationApi`.                                                   | **PASS.** Covered by the aggregate `npm test` result: 54 tests across 24 files.                                                                                                                                                                                    |
| TV-02 | Access tokens are memory-only; refresh restoration loads the server session; unauthenticated navigation returns to sign-in; guards do not inspect roles as authorization.                                      | `access-token.store.ts`, `platform-session.store.ts`, `platform-authentication.guard.ts`, foundation architecture gate and browser reload coverage. | **PASS for implemented boundaries.** Proactive token renewal during an already active session is not implemented and remains open.                                                                                                                                 |
| TV-03 | The authenticated view displays actual API user, Tenant, Workspace, membership, surface, roles and permissions; it does not invent context data.                                                               | `platform-active-context.component.*`, `/api/v1/session`, Playwright against the production Platform Nginx image and real API Docker runtime.       | **PASS.** The 5/5 Chromium E2E run exercised the real session projection.                                                                                                                                                                                          |
| TV-04 | Every canonical Platform actor has a tested presentation entry, while unmapped API roles remain raw and no actor label grants access.                                                                          | `platform-role-presentation.ts`, its spec and API authorization docs.                                                                               | **PASS for the current presentation boundary.** E2E observed Company Owner as `COMPANY_OWNER` + `TENANT_ADMIN`, Tenant Admin, `SALES` and `WAREHOUSE`; `LOGISTICS` remained unmapped. BOM and exact Dispatch mapping remain open.                                  |
| TV-05 | Production UI uses the adopted Design Lab public library and token boundary, retains production focus/skip-link behavior and excludes Lab-only routes/evaluation selectors.                                    | `docs/baselines/design-lab-adoption.md`, `npm run validate:design`, app imports and build outputs.                                                  | **PASS.** 301 declarations and 188 references; no unknown, duplicate or cyclic token references; architecture gate PASS.                                                                                                                                           |
| TV-06 | A real local API supports workspace preview, Platform sign-in, session retrieval, browser refresh after reload and sign-out without fake data.                                                                 | Playwright against the production Platform image with runtime API URL `http://localhost:8080/api/v1` and the real API Docker runtime.               | **PASS.** `npm run test:e2e` passed 5/5 Chromium scenarios. The same suite also passed through the Angular development server and proxy.                                                                                                                           |
| TV-07 | The access flow remains usable at 1440, 1024, 768, 390 and 320 px, has no horizontal overflow, and supports keyboard focus/Enter sign-out, skip link, title/autocomplete and 200% text-size smoke coverage.    | Playwright viewport, text-size and keyboard interaction in `e2e/platform/real-authenticated-context.spec.mjs`.                                      | **PASS for the executed 200%/viewport/browser checks.** 400% reflow and human visual review remain pending.                                                                                                                                                        |
| TV-08 | Full clean unit/build/design/architecture, Docker production image, API runtime, browser, accessibility smoke, `git diff --check`, CI and PR checks are executed and reported from the final access-slice ref. | Repository commands, Docker Compose, GitHub Actions and PR checks.                                                                                  | **PARTIAL.** Local checks listed below PASS; GitHub PR/CI remains PENDING.                                                                                                                                                                                         |
| TV-09 | The production container serves the SPA, exposes health, uses safe runtime configuration and rejects invalid entrypoint values.                                                                                | Platform and Portal production images/containers, `healthz`, HTTP route checks and 11 runtime-entrypoint cases.                                     | **PASS locally.** Platform and Portal builds passed; both containers were healthy; Platform sign-in/healthz, Portal root/deep route returned HTTP 200; runtime config used `no-store` and mode `0644`; 4 valid and 7 invalid entrypoint cases behaved as expected. |

## Executed validation evidence

The following results were executed for the current phase. They are technical
verification only; they do not close Product Acceptance or the production gate.

| Check                                | Result                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                             | **PASS** — 429 packages installed; installation audit reported 0 vulnerabilities.                                                                                                                                                                                                                                                               |
| `npm test`                           | **PASS** — 54 tests across 24 files: UI 18, API 14, Platform 21, Portal 1.                                                                                                                                                                                                                                                                      |
| `npm run build:all`                  | **PASS** — both shared libraries and both applications built.                                                                                                                                                                                                                                                                                   |
| `npm run validate:design`            | **PASS** — 301 declarations, 188 references, no unknown/duplicate/cyclic references; architecture PASS.                                                                                                                                                                                                                                         |
| `npm audit`                          | **PASS** — 0 vulnerabilities.                                                                                                                                                                                                                                                                                                                   |
| `npm run test:e2e`                   | **PASS** — 5/5 Chromium scenarios against the production Platform image and real API Docker runtime (`http://localhost:8080/api/v1`); the same suite also passed through the Angular development server/proxy. Company Owner (`COMPANY_OWNER` + `TENANT_ADMIN`), Tenant Admin, `SALES`, `WAREHOUSE` and unmapped `LOGISTICS` coverage recorded. |
| Production Docker and runtime checks | **PASS** — Platform and Portal images built; both containers healthy; Platform sign-in/healthz and Portal root/deep routes returned HTTP 200; runtime-config `no-store`, file mode `0644`; 11 entrypoint cases passed (4 valid, 7 invalid rejected).                                                                                            |
| Compose/action/style/SCM checks      | **PASS** — Compose config, actionlint, Prettier and `git diff --check`.                                                                                                                                                                                                                                                                         |
| GitHub PR and CI                     | **PENDING** — no CI/PR PASS is claimed here.                                                                                                                                                                                                                                                                                                    |

## Open Product Acceptance and unverified gates

- `WEB-US-016` and `WEB-US-018` remain Product stories with pending Product
  Acceptance Criteria. Technical evidence in this document cannot mark either
  story `PRODUCT ACCEPTED`.
- The accepted Product Acceptance gate requires actor, authorized
  Tenant/relationship, expected result, business rejection and recovery path.
  Those story-specific criteria are not authored in the current Blueprint cut.
- Context listing and in-session switch contracts remain open as described
  above. The slice does not claim full `WEB-US-018` completion.
- The first-phase authentication endpoints are contract-bound in the client,
  and the authenticated browser flow passed against the local API Docker
  runtime. The broader API access-context capability remains partial.
- Proactive token renewal during an already active session is not implemented;
  only refresh-cookie restoration after reload is verified.
- Exact API role mappings for Business Operations Manager and Dispatch
  Coordinator remain open. `LOGISTICS` is intentionally not silently mapped.
- The current API still lacks the eligible-context listing and in-session
  context-switch contracts. The slice does not claim full `WEB-US-018`.
- 400% reflow and human visual review remain pending; the executed browser
  smoke covered 200% text size and the required viewport set.
- GitHub PR and CI checks remain pending. Local build, test, design, Docker,
  browser, formatting and SCM checks above do not substitute for those checks.
- Blueprint records authenticated cross-surface proof, tenant/security runtime
  proof and production readiness as open gates. This web client slice does not
  close those gates, and no merge or release is implied.

## Source links for reviewers

- Blueprint story: `blueprint/02-web/requirements/user-stories/WEB-EPIC-03-workforce-access-governance.md`
- Blueprint Product and context decisions: `blueprint/01-shared/product/current-decisions.md`
- Blueprint BC-01 contract: `blueprint/01-shared/product/functional-contracts/BC-01-tenant-access-governance.md`
- Blueprint actor and role sources: `blueprint/01-shared/product/actors.md`, `surface-role-matrix.md`, `role-capability-matrix.md`
- API OpenAPI snapshot: `api/docs/openapi/openapi.json`
- API authentication and authorization boundary: `api/docs/security/authentication.md`, `api/docs/security/authorization.md`
- API cross-client inventory: `api/docs/verification/cross-client-contract-2026-09-24.md`
- Design adoption record: `web-clients/docs/baselines/design-lab-adoption.md`
