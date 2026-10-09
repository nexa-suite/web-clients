import { expect, test } from '@playwright/test';
import {
  getPlatformAccountCredentials,
  getPlatformWorkspaceSlug,
  getPortalBuyerCredentials,
  platformAccountDefinitions,
} from '../../tooling/playwright/local-environment.mjs';

const apiPrefix = '/api/v1';
const platformOrigin = 'http://localhost:4200';

test.afterEach(async ({ page }) => {
  for (const label of [
    'Password',
    'Email',
    'Work email or user ID',
    'Workspace address',
    'Workspace slug',
  ]) {
    const field = page.getByLabel(label);
    if (await field.count()) await field.fill('').catch(() => {});
  }
});

function waitForApiResponse(page, method, path) {
  return page.waitForResponse((response) =>
    new URL(response.url()).pathname === `${apiPrefix}${path}`
      && response.request().method() === method).then(parseApiResponse);
}

function waitForMatchingApiResponse(page, predicate) {
  return page.waitForResponse(predicate).then(parseApiResponse);
}

async function parseApiResponse(response) {
  let body = null;
  if (response.status() !== 204) {
    try { body = await response.json(); } catch { body = null; }
  }
  return {
    response,
    status: response.status(),
    body,
    headers: response.request().headers(),
  };
}

async function signInBuyer(page) {
  const credentials = getPortalBuyerCredentials();
  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await page.getByLabel('Workspace address').fill(getPlatformWorkspaceSlug());
  const previewResponse = waitForApiResponse(page, 'POST', '/auth/workspace-previews');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const preview = await previewResponse;
  expect(preview.status).toBe(200);
  expect(preview.body.recognized).toBe(true);

  await page.getByLabel('Email').fill(credentials.identifier);
  await page.getByLabel('Password').fill(credentials.password);
  const sessionResponse = waitForApiResponse(page, 'GET', '/session');
  const accountResponse = waitForApiResponse(page, 'GET', '/client-accounts/me');
  const catalogResponse = waitForApiResponse(page, 'GET', '/catalog-items');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const [session, account, catalog] = await Promise.all([
    sessionResponse,
    accountResponse,
    catalogResponse,
  ]);
  expect([session.status, account.status, catalog.status]).toEqual([200, 200, 200]);
  const sessionBody = session.body;
  const accountBody = account.body;
  const catalogBody = catalog.body;
  expect(sessionBody.surface).toBe('PORTAL');
  expect(accountBody.buyerMembershipId).toBe(sessionBody.membership?.membershipId);
  await expect(page.getByRole('heading', { name: 'Browse catalog SKUs' })).toBeVisible();
  return { account: accountBody, catalog: catalogBody };
}

async function signInPlatformAccount(page, credentials) {
  await page.goto(`${platformOrigin}/sign-in`);
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await page.getByLabel('Workspace slug').fill(getPlatformWorkspaceSlug());
  const previewResponse = waitForApiResponse(page, 'POST', '/auth/workspace-previews');
  await page.getByRole('button', { name: 'Preview workspace' }).click();
  const preview = await previewResponse;
  expect(preview.status).toBe(200);
  expect(preview.body.recognized).toBe(true);
  await page.getByLabel('Work email or user ID').fill(credentials.identifier);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('heading', { name: 'Active business context' })).toBeVisible();
  const membership = page.getByLabel('Eligible business context');
  await expect(membership).toBeVisible();
  expect(await membership.inputValue()).toBeTruthy();
  const selectedContext = waitForApiResponse(page, 'POST', '/me/access-context-selections');
  await page.getByRole('button', { name: 'Use this context' }).click();
  expect((await selectedContext).status).toBe(200);
}

function futureDeliveryDate(daysAhead = 14) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('submits a real Buyer request, converts it through Sales, and starts Warehouse fulfillment', async ({ page }) => {
  test.setTimeout(180_000);
  const salesDefinition = platformAccountDefinitions.find((account) => account.key === 'salesRepresentative');
  const warehouseDefinition = platformAccountDefinitions.find((account) => account.key === 'warehouseOperator');
  if (!salesDefinition || !warehouseDefinition) throw new Error('Sales and Warehouse account definitions are required.');
  getPortalBuyerCredentials();
  const salesCredentials = getPlatformAccountCredentials(salesDefinition);
  const warehouseCredentials = getPlatformAccountCredentials(warehouseDefinition);
  if (!salesCredentials || !warehouseCredentials) {
    throw new Error('The live Buyer order flow requires configured Sales Representative and Warehouse Operator credentials.');
  }

  const { account, catalog } = await signInBuyer(page);
  const candidateIndex = catalog.items.findIndex((item) =>
    typeof item.sellableSkuId === 'string'
      && item.sellableSkuId.length > 0
      && Number(item.sellableAvailability) >= 1);
  expect(candidateIndex, 'Seeded Buyer catalog needs an active sellable SKU with at least one available unit.').toBeGreaterThanOrEqual(0);
  const catalogItem = catalog.items[candidateIndex];
  const catalogDetailResponse = waitForApiResponse(page, 'GET', `/catalog-items/${catalogItem.catalogItemId}`);
  await page.getByTestId('catalog-item-link').nth(candidateIndex).click();
  const catalogDetail = await catalogDetailResponse;
  expect(catalogDetail.status).toBe(200);
  const sellableItem = catalogDetail.body;
  expect(sellableItem.sellableSkuId).toBe(catalogItem.sellableSkuId);
  expect(Number(sellableItem.sellableAvailability)).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Request this SKU' })).toBeVisible();

  const addressesResponse = waitForApiResponse(page, 'GET', `/client-accounts/${account.id}/addresses`);
  await page.getByRole('button', { name: 'Request this SKU' }).click();
  await expect(page.getByRole('heading', { name: 'Build your request' })).toBeVisible();
  const addressesResult = await addressesResponse;
  expect(addressesResult.status).toBe(200);
  const addresses = addressesResult.body.filter((address) => address.active);
  expect(addresses.length, 'Buyer account needs at least one active saved delivery address.').toBeGreaterThan(0);
  const address = addresses.find((candidate) => candidate.defaultAddress) ?? addresses[0];

  const deliveryDate = futureDeliveryDate();
  await page.getByLabel('Requested delivery date').first().fill(deliveryDate);
  const draftCreated = waitForApiResponse(page, 'POST', '/buyer/purchase-request-drafts');
  const draftLinesSaved = waitForMatchingApiResponse(page, (response) =>
    new URL(response.url()).pathname.match(/^\/api\/v1\/buyer\/purchase-request-drafts\/[^/]+\/lines$/) !== null
      && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Start draft' }).click();
  const [createdResponse, linesResponse] = await Promise.all([draftCreated, draftLinesSaved]);
  expect(createdResponse.status).toBe(201);
  expect(linesResponse.status).toBe(200);
  const draft = createdResponse.body;
  expect(linesResponse.body.lines).toHaveLength(1);
  expect(linesResponse.body.lines[0].skuId).toBe(sellableItem.sellableSkuId);

  const destinationResponse = waitForApiResponse(page, 'PUT', `/buyer/purchase-request-drafts/${draft.id}/destination`);
  await page.getByLabel('Delivery destination').selectOption(address.id);
  expect((await destinationResponse).status).toBe(200);
  await page.getByLabel('Payment preference').selectOption('BANK_TRANSFER');
  const preferencesResponse = waitForApiResponse(page, 'PUT', `/buyer/purchase-request-drafts/${draft.id}/preferences`);
  await page.getByRole('button', { name: 'Save details' }).click();
  expect((await preferencesResponse).status).toBe(200);
  const routeResponse = waitForApiResponse(page, 'POST', `/buyer/purchase-request-drafts/${draft.id}/route-previews`);
  await page.getByRole('button', { name: 'Preview route' }).click();
  expect((await routeResponse).status).toBe(200);

  const reviewResponse = waitForApiResponse(page, 'GET', `/buyer/purchase-request-drafts/${draft.id}/review`);
  await page.getByRole('button', { name: 'Refresh checks' }).click();
  const review = await reviewResponse;
  expect(review.status).toBe(200);
  const reviewBody = review.body;
  expect(reviewBody.readyToSubmit, `The current seeded request is not eligible: ${(reviewBody.missing ?? []).join(', ')}`).toBe(true);

  const submissionResponse = waitForApiResponse(page, 'POST', `/buyer/purchase-request-drafts/${draft.id}/submissions`);
  const submittedRequestResponse = waitForApiResponse(page, 'GET', `/purchase-requests/${draft.id}`);
  await page.getByRole('button', { name: 'Submit purchase request' }).click();
  const [submission, submittedRequest] = await Promise.all([submissionResponse, submittedRequestResponse]);
  expect(submission.status).toBe(200);
  expect(submittedRequest.status).toBe(200);
  const submittedDraft = submission.body;
  const purchaseRequest = submittedRequest.body;
  expect(submittedDraft.status).toBe('SUBMITTED');
  // The accepted API implementation uses the draft UUID as the resulting Purchase Request UUID.
  expect(purchaseRequest.id).toBe(draft.id);
  expect(purchaseRequest.status).toBe('SUBMITTED');
  expect(submission.headers['if-match']).toBe(`"${reviewBody.draft.version}"`);
  expect(submission.headers['idempotency-key']).toBeTruthy();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await signInPlatformAccount(page, salesCredentials);
  const submittedQueueResponse = waitForMatchingApiResponse(page, (response) =>
    new URL(response.url()).pathname === `${apiPrefix}/purchase-requests`
      && new URL(response.url()).searchParams.get('status') === 'SUBMITTED'
      && response.request().method() === 'GET');
  await page.goto(`${platformOrigin}/sales/purchase-requests`);
  await expect(page.getByRole('heading', { name: 'Purchase request inbox' })).toBeVisible();
  expect((await submittedQueueResponse).status).toBe(200);
  const requestRow = page.getByRole('row').filter({ hasText: purchaseRequest.code || purchaseRequest.id });
  const purchaseRequestDetail = waitForApiResponse(page, 'GET', `/purchase-requests/${purchaseRequest.id}`);
  await requestRow.getByRole('link', { name: 'Review request' }).click();
  expect((await purchaseRequestDetail).status).toBe(200);
  await expect(page.getByTestId('platform-purchase-request-review')).toBeVisible();
  const conversionResponse = waitForApiResponse(page, 'POST', `/purchase-requests/${purchaseRequest.id}/order-conversions`);
  await page.getByRole('button', { name: 'Convert to order' }).click();
  const converted = await conversionResponse;
  expect(converted.status).toBe(201);
  const salesOrder = converted.body;
  expect(salesOrder.status).toBe('CONFIRMED');
  expect(salesOrder.sourcePurchaseRequestId).toBe(purchaseRequest.id);
  expect(converted.headers['if-match']).toBe(`"${purchaseRequest.version}"`);
  expect(converted.headers['idempotency-key']).toBeTruthy();
  await expect(page.getByText('Sales order created')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await signInPlatformAccount(page, warehouseCredentials);
  const candidateResponse = waitForApiResponse(page, 'GET', '/order-fulfillment-candidates');
  await page.goto(`${platformOrigin}/fulfillment-delivery`);
  await expect(page.getByRole('heading', { name: 'Fulfillment' })).toBeVisible();
  const candidatesResponse = await candidateResponse;
  expect(candidatesResponse.status).toBe(200);
  const candidatePage = candidatesResponse.body;
  const orderCandidate = candidatePage.items.find((candidate) => candidate.id === salesOrder.id);
  expect(
    Boolean(orderCandidate),
    'Warehouse candidates must include the converted confirmed order. Seed an active warehouse grant with inventory backing for this sellable SKU.',
  ).toBe(true);
  const selectedOrder = page.getByRole('listitem').filter({ hasText: salesOrder.number });
  await selectedOrder.click();
  const startResponse = waitForApiResponse(page, 'POST', `/sales-orders/${salesOrder.id}/fulfillments`);
  await page.getByRole('button', { name: 'Start fulfillment' }).click();
  const fulfillmentResponse = await startResponse;
  expect(fulfillmentResponse.status).toBe(201);
  const fulfillment = fulfillmentResponse.body;
  expect(fulfillment.salesOrderId).toBe(salesOrder.id);
  expect(fulfillment.id).toBeTruthy();
  expect(fulfillmentResponse.headers['if-match']).toBe(`"${orderCandidate.version}"`);
  expect(fulfillmentResponse.headers['idempotency-key']).toBeTruthy();
  await expect(page.locator('.fulfillment-message--success')).toContainText(salesOrder.number);

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  const { account: buyerAccount } = await signInBuyer(page);
  expect(buyerAccount.id).toBe(salesOrder.clientAccountId);

  const buyerOrdersResponse = waitForApiResponse(page, 'GET', '/sales-orders');
  await page.goto('/orders');
  const buyerOrders = await buyerOrdersResponse;
  expect(buyerOrders.status).toBe(200);
  expect(buyerOrders.body.items.some((order) => order.id === salesOrder.id)).toBe(true);
  await expect(page.getByRole('row').filter({ hasText: salesOrder.number })).toBeVisible();

  const firstDocumentsResponse = waitForApiResponse(page, 'GET', '/business-documents');
  await page.goto('/documents');
  expect((await firstDocumentsResponse).status).toBe(200);
  await expect(page.getByTestId('portal-business-documents-page')).toBeVisible();

  let orderSummaryPdf;
  await expect.poll(async () => {
    const documentsResponse = waitForApiResponse(page, 'GET', '/business-documents');
    await page.reload();
    const result = await documentsResponse;
    if (result.status !== 200) return false;
    orderSummaryPdf = result.body.items.find((document) =>
      document.subjectType === 'SALES_ORDER'
        && document.subjectId === salesOrder.id
        && document.documentType === 'ORDER_SUMMARY'
        && document.format === 'PDF'
        && document.status === 'GENERATED');
    return Boolean(orderSummaryPdf);
  }, { timeout: 60_000, intervals: [1_000, 2_000, 3_000] })
    .toBe(true, 'A running canonical outbox/document worker and active private object storage must produce a downloadable order summary for a confirmed order.');
  expect(orderSummaryPdf.storageObjectKey).toBeTruthy();

  const documentLink = page.locator(`a.document-link[href="/documents/${orderSummaryPdf.id}"]`);
  await expect(documentLink).toBeVisible();
  const documentDetailResponse = waitForApiResponse(page, 'GET', `/business-documents/${orderSummaryPdf.id}`);
  await documentLink.click();
  const documentDetail = await documentDetailResponse;
  expect(documentDetail.status).toBe(200);
  expect(documentDetail.body.subjectType).toBe('SALES_ORDER');
  expect(documentDetail.body.subjectId).toBe(salesOrder.id);
  await expect(page.getByTestId('portal-business-document-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sales order document' })).toBeVisible();

  const documentDownloadEvent = page.waitForEvent('download');
  const documentDownloadResponse = waitForApiResponse(page, 'GET', `/business-documents/${orderSummaryPdf.id}/downloads`);
  await page.getByRole('button', { name: 'Download document' }).click();
  const [download, downloadedResponse] = await Promise.all([documentDownloadEvent, documentDownloadResponse]);
  expect(downloadedResponse.status).toBe(200);
  expect(download.suggestedFilename()).toBe(`ORDER_SUMMARY-${orderSummaryPdf.id}.pdf`);
});
