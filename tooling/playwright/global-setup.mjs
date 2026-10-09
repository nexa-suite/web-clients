import {
  platformApiBaseUrl,
  getPortalBuyerCredentials,
  requirePlatformIntegrationEnvironment,
} from "./local-environment.mjs";

export default async function globalSetup() {
  requirePlatformIntegrationEnvironment();
  getPortalBuyerCredentials();

  const apiBase = new URL(platformApiBaseUrl);
  if (
    apiBase.protocol !== "http:" ||
    apiBase.hostname !== "127.0.0.1" ||
    apiBase.port !== "8080"
  ) {
    throw new Error("Platform browser checks must target the local Nexa API.");
  }

  let response;
  try {
    response = await fetch(new URL("/v3/api-docs", apiBase));
  } catch {
    throw new Error(
      "The local Nexa API runtime is unavailable at localhost:8080.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `The local Nexa API OpenAPI endpoint returned HTTP ${response.status}.`,
    );
  }

  const contract = await response.json();
  const requiredOperations = [
    ["/api/v1/auth/workspace-previews", "post"],
    ["/api/v1/authentication/sign-in", "post"],
    ["/api/v1/session", "get"],
    ["/api/v1/client-accounts/me", "get"],
    ["/api/v1/client-accounts/{clientAccountId}/addresses", "get"],
    ["/api/v1/client-accounts/me/credit-exposure", "get"],
    ["/api/v1/receivables", "get"],
    ["/api/v1/business-documents", "get"],
    ["/api/v1/business-documents/{documentId}", "get"],
    ["/api/v1/business-documents/{documentId}/downloads", "get"],
    ["/api/v1/buyer/purchase-request-drafts", "post"],
    ["/api/v1/buyer/purchase-request-drafts/{draftId}/lines", "put"],
    ["/api/v1/buyer/purchase-request-drafts/{draftId}/destination", "put"],
    ["/api/v1/buyer/purchase-request-drafts/{draftId}/preferences", "put"],
    ["/api/v1/buyer/purchase-request-drafts/{draftId}/route-previews", "post"],
    ["/api/v1/buyer/purchase-request-drafts/{draftId}/review", "get"],
    ["/api/v1/buyer/purchase-request-drafts/{draftId}/submissions", "post"],
    ["/api/v1/purchase-requests", "get"],
    ["/api/v1/purchase-requests/{id}", "get"],
    ["/api/v1/purchase-requests/{purchaseRequestId}/order-conversions", "post"],
    ["/api/v1/sales-orders", "get"],
    ["/api/v1/sales-orders/{id}", "get"],
    ["/api/v1/order-fulfillment-candidates", "get"],
    ["/api/v1/sales-orders/{salesOrderId}/fulfillments", "post"],
    ["/api/v1/catalog-items", "get"],
    ["/api/v1/catalog-items/{catalogItemId}", "get"],
    ["/api/v1/me/access-contexts", "get"],
    ["/api/v1/me/access-context-selections", "post"],
    ["/api/v1/authentication/refresh", "post"],
    ["/api/v1/authentication/sign-out", "post"],
  ];
  const missingOperations = requiredOperations
    .filter(([path, method]) => !contract.paths?.[path]?.[method])
    .map(([path, method]) => `${method.toUpperCase()} ${path}`);

  if (missingOperations.length) {
    throw new Error(
      `The local Nexa API runtime is missing required browser-check operations: ${missingOperations.join(", ")}.`,
    );
  }
}
