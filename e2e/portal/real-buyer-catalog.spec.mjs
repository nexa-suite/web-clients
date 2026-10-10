import { expect, test } from "@playwright/test";
import {
  getPortalBuyerCredentials,
  getPlatformWorkspaceSlug,
} from "../../tooling/playwright/local-environment.mjs";

const apiOriginPattern = /^http:\/\/(?:localhost|127\.0\.0\.1):(?:4200|4300)\/api\/v1\//;
const apiResponseCaptures = new WeakMap();

test.beforeEach(async ({ page }) => {
  await installApiResponseCapture(page);
});

test.afterEach(async ({ page }) => {
  for (const label of ["Password", "Email", "Workspace address"]) {
    const field = page.getByLabel(label);
    if (await field.count()) await field.fill("").catch(() => {});
  }
});

async function installApiResponseCapture(page) {
  if (apiResponseCaptures.has(page)) return;

  const waiters = new Set();
  apiResponseCaptures.set(page, waiters);
  await page.route(apiOriginPattern, async (route) => {
    const request = route.request();
    const waiter = [...waiters].find((candidate) => candidate.predicate(request));
    if (!waiter) {
      await route.continue();
      return;
    }
    waiters.delete(waiter);

    try {
      const upstream = await route.fetch();
      let body = null;
      let parseError;
      if (waiter.parseJson && upstream.status() !== 204) {
        try {
          body = await upstream.json();
        } catch (error) {
          parseError = error;
        }
      }

      await route.fulfill({ response: upstream });
      if (parseError) waiter.reject(parseError);
      else waiter.resolve({ status: upstream.status(), body });
    } catch (error) {
      await route.abort("failed").catch(() => {});
      waiter.reject(error);
    }
  });
}

function apiResponse(page, path, method = "GET", { parseJson = true } = {}) {
  const waiters = apiResponseCaptures.get(page);
  if (!waiters) throw new Error("The real API response capture must be installed before waiting.");
  return new Promise((resolve, reject) => {
    waiters.add({
      predicate: (request) =>
        new URL(request.url()).pathname === path && request.method() === method,
      parseJson,
      resolve,
      reject,
    });
  });
}

async function signInBuyer(page) {
  const credentials = getPortalBuyerCredentials();
  await page.goto("/catalog");
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await page.getByLabel("Workspace address").fill(getPlatformWorkspaceSlug());
  const previewResponse = apiResponse(
    page,
    "/api/v1/auth/workspace-previews",
    "POST",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const preview = await previewResponse;
  expect(preview.status).toBe(200);
  expect(preview.body.recognized).toBe(true);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(credentials.identifier);
  await page.getByLabel("Password").fill(credentials.password);
  const session = apiResponse(page, "/api/v1/session");
  const account = apiResponse(page, "/api/v1/client-accounts/me");
  const catalog = apiResponse(page, "/api/v1/catalog-items");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const [sessionResponse, accountResponse, catalogResponse] = await Promise.all(
    [session, account, catalog],
  );
  expect([
    sessionResponse.status,
    accountResponse.status,
    catalogResponse.status,
  ]).toEqual([200, 200, 200]);
  const currentSession = sessionResponse.body;
  const currentAccount = accountResponse.body;
  expect(currentSession.surface).toBe("PORTAL");
  expect(
    Boolean(currentAccount.buyerMembershipId) &&
      currentAccount.buyerMembershipId ===
        currentSession.membership?.membershipId,
  ).toBe(true);
  return catalogResponse.body;
}

test("uses server Buyer eligibility, commercial catalog facts, and cookie-backed restoration", async ({
  page,
}) => {
  const catalog = await signInBuyer(page);
  await expect(
    page.getByRole("heading", { name: "Browse catalog SKUs" }),
  ).toBeVisible();
  expect(catalog.items.length > 0).toBe(true);
  const firstItem = catalog.items[0];
  const detailResponse = apiResponse(
    page,
    `/api/v1/catalog-items/${firstItem.catalogItemId}`,
  );
  await page.getByTestId("catalog-item-link").first().click();
  const response = await detailResponse;
  expect(response.status).toBe(200);
  const item = response.body;
  await expect(page.getByTestId("portal-catalog-detail-heading")).toHaveText(
    item.itemName,
  );
  const fact = (label) =>
    page
      .locator(".commercial-facts > div")
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator("dd");
  await expect(fact("Current offer price")).toHaveText(
    item.currentOfferPrice
      ? `${item.currentOfferPrice.currency} ${item.currentOfferPrice.amount}`
      : "Unavailable",
  );
  await expect(fact("Sellable availability")).toHaveText(
    item.sellableAvailability === null ||
      item.sellableAvailability === undefined
      ? "Unavailable"
      : `${item.sellableAvailability}${item.unitOfMeasure ? ` ${item.unitOfMeasure}` : ""}`,
  );
  await expect(fact("Availability status")).toHaveText(
    item.availabilityStatus || "Unavailable",
  );

  const restoredAccount = apiResponse(page, "/api/v1/client-accounts/me");
  await page.reload();
  expect((await restoredAccount).status).toBe(200);
  await expect(page.getByTestId("portal-catalog-detail-heading")).toHaveText(
    item.itemName,
  );
  const credit = apiResponse(
    page,
    "/api/v1/client-accounts/me/credit-exposure",
  );
  const receivables = apiResponse(page, "/api/v1/receivables");
  await page.getByRole("link", { name: "My wallet", exact: true }).click();
  const [creditResponse, receivablesResponse] = await Promise.all([
    credit,
    receivables,
  ]);
  expect([creditResponse.status, receivablesResponse.status]).toEqual([
    200, 200,
  ]);
  await expect(
    page.getByRole("heading", { name: "My wallet", exact: true }),
  ).toBeVisible();
  const creditFact = (label) =>
    page
      .locator("dl")
      .filter({ has: page.getByText("Credit account", { exact: true }) })
      .locator("dt")
      .filter({ hasText: new RegExp(`^${label}$`) })
      .locator("+ dd");
  await expect(creditFact("Credit limit")).toHaveText(
    `${creditResponse.body.currency} ${creditResponse.body.creditLimit}`,
  );
  await expect(creditFact("Available credit")).toHaveText(
    `${creditResponse.body.currency} ${creditResponse.body.availableCredit}`,
  );
  const documents = apiResponse(page, "/api/v1/business-documents");
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  const documentsResponse = await documents;
  expect(documentsResponse.status).toBe(200);
  expect(Array.isArray(documentsResponse.body.items)).toBe(true);
  await expect(
    page.getByTestId("portal-business-documents-page"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await page.goto("/catalog");
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
});

test("reads Buyer-scoped Delivery tracking without creating delivery facts", async ({
  page,
}) => {
  await signInBuyer(page);
  const pageResponse = apiResponse(page, "/api/v1/buyer/deliveries");
  await page.goto("/deliveries");
  const response = await pageResponse;
  expect(response.status).toBe(200);
  expect(response.body.page).toBe(0);
  expect(response.body.size).toBe(25);
  expect(Array.isArray(response.body.items)).toBe(true);

  const deliveries = response.body.items;
  expect(deliveries.length).toBeGreaterThan(0);

  const selected = deliveries[0];
  expect(typeof selected.id).toBe("string");
  expect(typeof selected.salesOrderNumber).toBe("string");
  expect(typeof selected.status).toBe("string");
  for (const key of ["clientAccountId", "salesOrderId", "fulfillmentId", "driverId", "assignmentId"]) {
    expect(selected).not.toHaveProperty(key);
  }

  const detailResponse = apiResponse(
    page,
    `/api/v1/buyer/deliveries/${selected.id}`,
  );
  const eventResponse = apiResponse(
    page,
    `/api/v1/buyer/deliveries/${selected.id}/events`,
  );
  await page.goto(`/deliveries/${encodeURIComponent(selected.id)}`);
  const [detailResult, eventResult] = await Promise.all([
    detailResponse,
    eventResponse,
  ]);
  expect([detailResult.status, eventResult.status]).toEqual([200, 200]);
  expect(detailResult.body.id).toBe(selected.id);
  expect(typeof detailResult.body.salesOrderNumber).toBe("string");
  expect(typeof detailResult.body.status).toBe("string");
  expect("proofOfDeliveryStatus" in detailResult.body).toBe(true);
  expect(Array.isArray(eventResult.body)).toBe(true);
  expect(eventResult.body.length).toBeGreaterThan(0);
  for (const event of eventResult.body) {
    expect(typeof event.type).toBe("string");
    expect(typeof event.occurredAt).toBe("string");
    expect(event).not.toHaveProperty("actorMembershipId");
    expect(event).not.toHaveProperty("reason");
    expect(event).not.toHaveProperty("driverId");
  }
  await expect(
    page.getByRole("heading", { name: "Delivery tracking" }),
  ).toBeVisible();
  await expect(page.getByText(detailResult.body.status, { exact: true })).toBeVisible();
});
