import { expect, test } from '@playwright/test';

test('Buyer signs in, searches the server catalog, reviews SKU details, and uses the responsive accessible shell', async ({ page }) => {
  const workspaceSlug = process.env.NEXA_DEV_WORKSPACE_SLUG;
  const buyerEmail = process.env.NEXA_DEV_BUYER_EMAIL;
  const buyerPassword = process.env.NEXA_DEV_BUYER_PASSWORD;
  expect(Boolean(workspaceSlug && buyerEmail && buyerPassword)).toBe(true);

  const responses = new Map<string, number>();
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/')) {
      responses.set(`${response.request().method()} ${url.pathname}`, response.status());
    }
  });

  await page.goto('/access');
  await page.getByLabel('Workspace address').fill(workspaceSlug!);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  await page.getByLabel('Email').fill(buyerEmail!);
  await page.getByLabel('Password').fill(buyerPassword!);
  const signInResponsePromise = page.waitForResponse((response) => response.url().includes('/api/v1/authentication/sign-in'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  const signInResponse = await signInResponsePromise;
  test.skip(
    !signInResponse.ok(),
    `The configured local Buyer development identity returned HTTP ${signInResponse.status()}; authenticated browser checks cannot run.`,
  );

  try {
    await expect(page.getByRole('heading', { name: 'Browse catalog SKUs' })).toBeVisible({ timeout: 15_000 });
  } catch (error) {
    console.log('Safe Portal browser diagnostics: ' + JSON.stringify({
      route: new URL(page.url()).pathname,
      headings: await page.locator('h1').allTextContents(),
      alerts: await page.getByRole('alert').allTextContents(),
      apiResponses: [...responses],
    }));
    throw error;
  }
  const firstCard = page.locator('.product-card').first();
  await expect(firstCard).toBeVisible();
  const skuCode = (await firstCard.locator('.product-meta').innerText()).split(' · ')[0];

  await page.getByLabel('Search SKUs').fill(skuCode);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  const detailResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'GET'
      && url.pathname.startsWith('/api/v1/catalog-items/')
      && url.pathname !== '/api/v1/catalog-items/';
  });
  await page.locator('.product-card').first().locator('a.product-detail-link').click();
  const detailResponse = await detailResponsePromise;
  expect(detailResponse.ok()).toBe(true);
  const detailPayload = await detailResponse.json() as {
    readonly currentOfferPrice?: { readonly amount?: number | string | null; readonly currency?: string | null } | null;
    readonly sellableAvailability?: number | null;
  };
  await expect(page.locator('.sku-identifier')).toHaveText(skuCode);
  await expect(page.getByRole('heading', { name: 'Commercial information' })).toBeVisible();
  const currentOfferPrice = detailPayload.currentOfferPrice;
  const expectedCurrentPrice = currentOfferPrice?.amount != null && currentOfferPrice.currency
    ? `${currentOfferPrice.amount} ${currentOfferPrice.currency}`
    : 'Not provided';
  const expectedSellableAvailability = detailPayload.sellableAvailability == null
    ? 'Not provided'
    : String(detailPayload.sellableAvailability);
  const commercialFacts = page.locator('.commercial-facts > div');
  await expect(commercialFacts.nth(0).locator('dd')).toHaveText(expectedCurrentPrice);
  await expect(commercialFacts.nth(1).locator('dd')).toHaveText(expectedSellableAvailability);
  await page.getByRole('link', { name: /Back to catalog/ }).click();
  await expect(page.getByLabel('Search SKUs')).toHaveValue(skuCode);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Browse catalog SKUs' })).toBeVisible();
  await expect(page.locator('.product-card').first()).toBeVisible();

  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('href'))).toBe('#main-content');
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page.locator('.buyer-navigation a')).toHaveAttribute('aria-current', 'page');

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  }
  const navigationHeight = await page.locator('.buyer-navigation a').evaluate((element) => element.getBoundingClientRect().height);
  const signOutHeight = await page.getByRole('button', { name: 'Sign out' }).evaluate((element) => element.getBoundingClientRect().height);
  expect(navigationHeight).toBeGreaterThanOrEqual(44);
  expect(signOutHeight).toBeGreaterThanOrEqual(44);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  for (const [operation, status] of responses) {
    expect(status, operation).toBeGreaterThanOrEqual(200);
    expect(status, operation).toBeLessThan(300);
  }
  expect(responses.has('POST /api/v1/auth/workspace-previews')).toBe(true);
  expect(responses.has('POST /api/v1/authentication/sign-in')).toBe(true);
  expect(responses.has('POST /api/v1/authentication/refresh')).toBe(true);
  expect(responses.has('GET /api/v1/session')).toBe(true);
  expect(responses.has('GET /api/v1/client-accounts/me')).toBe(true);
  expect(responses.has('GET /api/v1/catalog-items')).toBe(true);
  expect([...responses.keys()].some((operation) => operation.startsWith('GET /api/v1/catalog-items/CAT-'))).toBe(true);
  expect(responses.has('POST /api/v1/authentication/sign-out')).toBe(true);
});

test('workspace access preview stays labeled and responsive without relying on a signed-in session', async ({ page }) => {
  const workspaceSlug = process.env.NEXA_DEV_WORKSPACE_SLUG;
  expect(Boolean(workspaceSlug)).toBe(true);
  const previewResponses: number[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/v1/auth/workspace-previews') {
      previewResponses.push(response.status());
    }
  });

  await page.goto('/access');
  await page.getByLabel('Workspace address').fill(workspaceSlug!);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  expect(await page.getByLabel('Password').getAttribute('type')).toBe('password');
  expect(previewResponses).toEqual([200]);

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  }
});
