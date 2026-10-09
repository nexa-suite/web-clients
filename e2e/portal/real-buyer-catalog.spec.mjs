import { expect, test } from "@playwright/test";
import {
  getPortalBuyerCredentials,
  getPlatformWorkspaceSlug,
} from "../../tooling/playwright/local-environment.mjs";

test.afterEach(async ({ page }) => {
  for (const label of ["Password", "Email", "Workspace address"]) {
    const field = page.getByLabel(label);
    if (await field.count()) await field.fill("").catch(() => {});
  }
});

async function apiResponse(page, path) {
  const response = await page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path &&
      response.request().method() === "GET",
  );
  return { status: response.status(), body: await response.json() };
}

async function signInBuyer(page) {
  const credentials = getPortalBuyerCredentials();
  await page.goto("/catalog");
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await page.getByLabel("Workspace address").fill(getPlatformWorkspaceSlug());
  const previewResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/auth/workspace-previews" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const preview = await previewResponse;
  expect(preview.status()).toBe(200);
  expect((await preview.json()).recognized).toBe(true);
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
