# Buyer Portal production foundation

## Source checkpoints

| Source | Revision used | Working state observed |
| --- | --- | --- |
| Shared Angular foundation | `22c151da0d9447568970aa7c6a10f48fde79e090` — `chore(web): establish shared Angular foundation` | Exact remote checkpoint used as the Portal branch base; the verified checkpoint diff adds 128 files and 14,289 lines. |
| Blueprint | `812cb4a73ec2ecdef1853acaaeb8ba656e583a42` | Existing local deletions under `91-reference/legacy/` and `tooling/structurizr/README.md` were left untouched. |
| Design Lab | `ec590abd4c3c6fae97dd7c14d866443e3f67e1e0` | Clean at inspection. |
| API | `9c74f3d01b7a60c7ba3df25e673d76d0e54986c7` | Clean at inspection. Relevant Buyer catalog, relationship and sales-commitment contracts have no committed source changes from the foundation baseline `c59388a7a791425dacdaa0edf2d622f5a3be2919`. |

## Product anchors and scope

`WEB-US-043` and `WEB-US-044` are the only story anchors implemented in this slice. Blueprint marks them `CONFIRMED / V1`, with `Customer Buyer` as the actor and final Acceptance Criteria pending requirements refinement. This implementation provides a technical proving path for workspace access, server-authorized Buyer projection, catalog search, and SKU detail. It does not claim either story is accepted or complete.

The Portal keeps workforce membership and the Customer Buyer relationship as separate server projections. Access requires a `PORTAL` session, a server-resolved `/client-accounts/me` response, and a matching `buyerMembershipId` / session `membershipId`. Client role strings do not grant Buyer access. The server remains the authorization authority.

`WEB-US-045..060` remain unimplemented. The feature folders, lazy route boundary, typed adapter, and shared API transport boundary allow later slices to be added without putting draft, Purchase Request, Sales Order, or inventory-reservation behavior into the catalog. A Draft remains distinct from a Purchase Request and Sales Order and must never reserve inventory.

## Design Lab implementation sources

The UI consumes public `nexa-ui` components and generated design tokens. Access uses the Design Lab authentication composition; catalog filters and result cards use its search/filter and catalog patterns; the top navigation uses the active-navigation visual pattern. The Portal owns its shell and navigation. It does not import Design Lab demo state, its documentation shell, mock catalog data, or static application behavior.

Implemented public components: `NexaLogo`, `NexaButton`, `NexaTextField`, `NexaStatusChip`, and `NexaSurface`. Loading, empty, error, retry, and detail states are Portal compositions using the same public package and tokens.

## Runtime API operations

The local modern API runtime reports version `0.17.0` and was exercised through the actual browser-origin path. Portal adapters use these API-relative operations:

| Operation | Portal purpose |
| --- | --- |
| `POST /api/v1/auth/workspace-previews` | Resolve the workspace before showing sign-in fields. |
| `POST /api/v1/authentication/sign-in` | Authenticate the Customer Buyer for `PORTAL`. |
| `POST /api/v1/authentication/refresh` | Restore an expired in-memory access token from the server-managed cookie; retried at most once after `401`. |
| `GET /api/v1/session` | Read the current server session and workforce membership context. |
| `GET /api/v1/client-accounts/me` | Resolve the server-authorized Buyer account projection for the current membership. |
| `GET /api/v1/catalog-items` | Search the Buyer-visible catalog with server-side `q`, `brand`, `category`, `coldChain`, `page`, `size`, `sort`, and `direction` filters. |
| `GET /api/v1/catalog-items/{catalogItemId}` | Load the Buyer-scoped catalog item detail. |
| `POST /api/v1/authentication/sign-out` | Request server session revocation before reporting sign-out as successful. |

The adapter maps only identity and descriptive SKU fields into the Portal model. It does not display the runtime response's price, availability, quantity, or near-expiry fields. The general `/api/v1/skus` operation, `/api/v1/skus/{skuId}/prices`, and `/api/v1/inventory-availability` are not used as substitutes for Buyer commercial or sellable-availability contracts.

## Contract gaps and readiness

The current API supports a useful real-runtime catalog proving slice, but does not satisfy the product story semantics by itself:

- `/catalog-items` filters active and visible SKUs and `buyer_visible`, but does not filter by active product-family state or establish per-Customer-Account SKU eligibility. The UI therefore says “catalog SKUs” and “listed in this workspace catalog”; it does not claim account-specific eligibility or stock availability.
- The response still transmits product/base/effective price and availability/near-expiry fields. The Portal adapter drops them, but the API should return a Buyer-safe projection instead of sending unsupported commercial or inventory assertions to the browser.
- There is no current-price projection resolved through the canonical SKU, Price List, Customer Terms, and promotion rules. `/skus/{skuId}/prices` is not a Buyer pricing contract.
- There is no canonical Sellable Availability projection applying the required stock-protection/Safety Stock rules. `/inventory-availability` exposes physical and safety quantities and is not used.
- There is no Buyer collection/list endpoint to resume saved Purchase Request Drafts, so `WEB-US-047` cannot be completed. Draft read/update/preview/review/submit operations do not fill that gap.
- No Buyer context-switch operation exists. This slice does not add one or derive a Buyer role in the client.

Wave-3 readiness is **partial technical readiness for `WEB-US-043` and `WEB-US-044` only**. The UI/API proving path, auth projection, adapter, and runtime integration can be reviewed. Product readiness and story acceptance are blocked by pending Product AC and the catalog eligibility, current price, and Sellable Availability contracts. Stories `WEB-US-045..060` and later cross-surface Buyer projections remain future work; `WEB-US-047` additionally needs a draft-resume API contract.

## Technical verification boundary

Blueprint currently leaves final Web Acceptance Criteria pending. This document records implementation and engineering checks only; it does not create replacement Product AC. Verification covers production builds, shared and app tests, architecture and token gates, real API browser requests, Portal Docker image health, responsive overflow, keyboard skip navigation, active navigation semantics, touch target size, and `git diff --check` as each gate is run.

## Executed validation

- `npm test` passed: shared UI 18/18, shared API 13/13, Platform 1/1, Portal 15/15 (47 tests total).
- `npm run build:all` passed: shared UI and API packages, Platform production build, Portal production build.
- `npm run validate:design` passed: token artifacts current; 301 token declarations and 188 references valid; architecture boundaries valid with Platform kept neutral and Portal routes checked.
- API Docker build from the current API checkout passed: Maven ran 486 tests with 0 failures, 0 errors, and 152 skipped; Spring Boot package completed. The modern API container reports healthy and runtime OpenAPI version `0.17.0`.
- Playwright against the Docker API passed workspace preview and the access-page responsive/label smoke at 1440, 1024, 768, 390, and 320 px. The configured development Buyer identity returned HTTP 401 in the authenticated scenario, which was recorded as skipped; no alternate password was attempted. Therefore authenticated session/account/catalog/detail/sign-out requests, Buyer-shell responsive layout, keyboard skip navigation, active-route semantics, and touch-target size were not browser-verified. Shell skip-link and `aria-current` semantics and the exact-workspace-preview rule are covered by Portal component tests.
- Portal Docker image built; the local container returned HTTP 200 for `/`, `ok` for `/healthz`, and Docker health `healthy`.
- `git diff --check` passed.

The earlier direct API smoke against the then-running local API image is superseded for current authenticated acceptance by the HTTP 401 from the API rebuilt at the current API source revision. The configured local identity was not accepted, and no alternate password was attempted.

The following remain product or acceptance review decisions rather than locally verifiable claims: final behavior for `WEB-US-043/044`; whether the current catalog semantics meet their eligibility wording; approved price and availability projections; buyer/account eligibility and family activation policy; authenticated Portal-shell responsive, accessibility, and security review; final design and Product acceptance gates; and whether later Buyer projections share a cross-surface contract.
