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

function apiResponse(page, path) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path &&
      response.request().method() === "GET",
  );
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
    sessionResponse.status(),
    accountResponse.status(),
    catalogResponse.status(),
  ]).toEqual([200, 200, 200]);
  const currentSession = await sessionResponse.json();
  const currentAccount = await accountResponse.json();
  expect(currentSession.surface).toBe("PORTAL");
  expect(
    Boolean(currentAccount.buyerMembershipId) &&
      currentAccount.buyerMembershipId ===
        currentSession.membership?.membershipId,
  ).toBe(true);
  return catalogResponse.json();
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
  expect(response.status()).toBe(200);
  const item = await response.json();
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
  expect((await restoredAccount).status()).toBe(200);
  await expect(page.getByTestId("portal-catalog-detail-heading")).toHaveText(
    item.itemName,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
  await page.goto("/catalog");
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
});
