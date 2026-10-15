import { expect, test } from '@playwright/test';
import {
  getPlatformAccountCredentials,
  getPlatformWorkspaceSlug,
  getPortalBuyerCredentials,
  platformAccountDefinitions,
} from '../../tooling/playwright/local-environment.mjs';

const apiPrefix = '/api/v1';
const platformOrigin = 'http://localhost:4200';
const portalOrigin = process.env.NEXA_PORTAL_E2E_BASE_URL ?? 'http://localhost:4300';
const expectedWarehouseId = '4c4ebd06-54d6-33ab-8186-1ba45b4539ee';
const apiOriginPattern = /^http:\/\/(?:localhost|127\.0\.0\.1):(?:4200|4300|8080)\/api\/v1\//;
const apiResponseCaptures = new WeakMap();

test.beforeEach(async ({ page }) => {
  await installApiResponseCapture(page);
});

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
      const headers = {};
      const requestHeaders = request.headers();
      for (const name of ['if-match', 'idempotency-key']) {
        if (requestHeaders[name] !== undefined) headers[name] = requestHeaders[name];
      }
      if (upstream.headers()['etag'] !== undefined) {
        headers.etag = upstream.headers()['etag'];
      }

      await route.fulfill({ response: upstream });
      if (parseError) waiter.reject(parseError);
      else waiter.resolve({ status: upstream.status(), body, headers });
    } catch (error) {
      await route.abort('failed').catch(() => {});
      waiter.reject(error);
    }
  });
}

function waitForApiResponse(page, method, path, { parseJson = true } = {}) {
  return waitForMatchingApiResponse(page, (request) =>
    new URL(request.url()).pathname === `${apiPrefix}${path}`
      && request.method() === method, { parseJson });
}

function waitForMatchingApiResponse(page, predicate, { parseJson = true } = {}) {
  const waiters = apiResponseCaptures.get(page);
  if (!waiters) throw new Error('The real API response capture must be installed before waiting.');
  return new Promise((resolve, reject) => {
    waiters.add({ predicate, parseJson, resolve, reject });
  });
}

async function signInBuyer(page) {
  const credentials = getPortalBuyerCredentials();
  await page.goto(`${portalOrigin}/catalog`);
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
  const sessionResponse = waitForApiResponse(page, 'GET', '/session');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const session = await sessionResponse;
  expect(session.status).toBe(200);
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('heading', { name: 'Active business context' })).toBeVisible();
  const membership = page.getByLabel('Eligible business context');
  await expect(membership).toBeVisible();
  expect(await membership.inputValue()).toBeTruthy();
  const selectedContext = waitForApiResponse(page, 'POST', '/me/access-context-selections');
  await page.getByRole('button', { name: 'Use this context' }).click();
  expect((await selectedContext).status).toBe(200);
  return session.body;
}

function futureDeliveryDate(daysAhead = 14) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function futureLocalDateTime(hoursAhead) {
  const value = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}T${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function expectSessionPermissions(session, expectedPermissions) {
  expect(session.surface).toBe('PLATFORM');
  expect(session.membership?.membershipId).toBeTruthy();
  expect(session.membership?.permissions ?? []).toEqual(expect.arrayContaining(expectedPermissions));
  return session.membership.membershipId;
}

function expectVersionedCommand(response, ifMatch, { expectedStatus, expectedHttpStatus = 200, versionField = 'version' } = {}) {
  expect(response.status).toBe(expectedHttpStatus);
  expect(response.headers['if-match']).toBe(ifMatch);
  expect(response.headers['idempotency-key']).toBeTruthy();
  const version = response.body?.[versionField];
  expect(Number.isSafeInteger(version)).toBe(true);
  expect(response.headers.etag).toBe(`"${version}"`);
  if (expectedStatus) expect(response.body.status).toBe(expectedStatus);
  return response.headers.etag;
}

async function runFulfillmentCommand(page, buttonName, path, ifMatch, expectedStatus) {
  const responseWaiter = waitForApiResponse(page, 'POST', path);
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const response = await responseWaiter;
  expectVersionedCommand(response, ifMatch, { expectedStatus });
  return response;
}

test('fulfills a real Buyer order through dispatch, refreshes Buyer tracking, and issues its order summary', async ({ page }) => {
  test.setTimeout(180_000);
  const requestedQuantity = Number(process.env.NEXA_E2E_REQUEST_QUANTITY ?? 1);
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 10) {
    throw new Error('Local E2E fixture quantity must be an integer between one and ten.');
  }
  const companyOwnerDefinition = platformAccountDefinitions.find((account) => account.key === 'companyOwner');
  const salesDefinition = platformAccountDefinitions.find((account) => account.key === 'salesRepresentative');
  const warehouseDefinition = platformAccountDefinitions.find((account) => account.key === 'warehouseOperator');
  const logisticsDefinition = platformAccountDefinitions.find((account) => account.key === 'apiLogisticsIdentity');
  if (!companyOwnerDefinition || !salesDefinition || !warehouseDefinition || !logisticsDefinition) {
    throw new Error('Company Owner, Sales, Warehouse, and Logistics account definitions are required.');
  }
  getPortalBuyerCredentials();
  const companyOwnerCredentials = getPlatformAccountCredentials(companyOwnerDefinition);
  const salesCredentials = getPlatformAccountCredentials(salesDefinition);
  const warehouseCredentials = getPlatformAccountCredentials(warehouseDefinition);
  const logisticsCredentials = getPlatformAccountCredentials(logisticsDefinition);
  if (!companyOwnerCredentials || !salesCredentials || !warehouseCredentials || !logisticsCredentials) {
    throw new Error('The live fulfillment flow requires configured Company Owner, Sales, Warehouse, and Logistics identities.');
  }

  const { account, catalog } = await signInBuyer(page);
  const candidateIndex = catalog.items.findIndex((item) =>
    typeof item.sellableSkuId === 'string'
      && item.sellableSkuId.length > 0
      && Number(item.sellableAvailability) >= requestedQuantity);
  expect(candidateIndex, 'Seeded Buyer catalog needs an active SKU with enough availability for the fixture quantity.').toBeGreaterThanOrEqual(0);
  const catalogItem = catalog.items[candidateIndex];
  const catalogDetailResponse = waitForApiResponse(page, 'GET', `/catalog-items/${catalogItem.catalogItemId}`);
  await page.getByTestId('catalog-item-link').nth(candidateIndex).click();
  const catalogDetail = await catalogDetailResponse;
  expect(catalogDetail.status).toBe(200);
  const sellableItem = catalogDetail.body;
  expect(sellableItem.sellableSkuId).toBe(catalogItem.sellableSkuId);
  expect(Number(sellableItem.sellableAvailability)).toBeGreaterThanOrEqual(requestedQuantity);
  const requestSkuLink = page.getByRole('link', { name: 'Request this SKU', exact: true });
  await expect(requestSkuLink).toBeVisible();
  await expect(requestSkuLink).toHaveAttribute(
    'href',
    `/requests/new?skuId=${encodeURIComponent(sellableItem.sellableSkuId)}`,
  );

  const addressesResponse = waitForApiResponse(page, 'GET', `/client-accounts/${account.id}/addresses`);
  await requestSkuLink.click();
  await expect(page.getByRole('heading', { name: 'Build your request' })).toBeVisible();
  await page.getByLabel('Quantity', { exact: true }).first().fill(String(requestedQuantity));
  const addressesResult = await addressesResponse;
  expect(addressesResult.status).toBe(200);
  const addresses = addressesResult.body.filter((address) => address.active);
  expect(addresses.length, 'Buyer account needs at least one active saved delivery address.').toBeGreaterThan(0);
  const address = addresses.find((candidate) =>
    typeof candidate.latitude === 'number'
      && Number.isFinite(candidate.latitude)
      && typeof candidate.longitude === 'number'
      && Number.isFinite(candidate.longitude));
  test.skip(
    !address,
    'The local Buyer fixture needs an active saved address with synthetic route coordinates.',
  );

  const deliveryDate = futureDeliveryDate();
  await page.getByLabel('Requested delivery date').first().fill(deliveryDate);
  const draftCreated = waitForApiResponse(page, 'POST', '/buyer/purchase-request-drafts');
  const draftLinesSaved = waitForMatchingApiResponse(page, (request) =>
    new URL(request.url()).pathname.match(/^\/api\/v1\/buyer\/purchase-request-drafts\/[^/]+\/lines$/) !== null
      && request.method() === 'PUT');
  await page.getByRole('button', { name: 'Start draft' }).click();
  const [createdResponse, linesResponse] = await Promise.all([draftCreated, draftLinesSaved]);
  expect(createdResponse.status).toBe(201);
  expect(linesResponse.status).toBe(200);
  const draft = createdResponse.body;
  expect(linesResponse.body.lines).toHaveLength(1);
  expect(linesResponse.body.lines[0].skuId).toBe(sellableItem.sellableSkuId);
  expect(Number(linesResponse.body.lines[0].quantity)).toBe(requestedQuantity);

  const destinationResponse = waitForApiResponse(page, 'PUT', `/buyer/purchase-request-drafts/${draft.id}/destination`);
  await page.getByLabel('Delivery destination').selectOption(address.id);
  expect((await destinationResponse).status).toBe(200);
  await page.getByRole('combobox', { name: 'Payment preference', exact: true }).selectOption('BANK_TRANSFER');
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
  const submittedQueueResponse = waitForMatchingApiResponse(page, (request) =>
    new URL(request.url()).pathname === `${apiPrefix}/purchase-requests`
      && new URL(request.url()).searchParams.get('status') === 'SUBMITTED'
      && request.method() === 'GET');
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

  const buyerTrackingPage = await page.context().newPage();
  await installApiResponseCapture(buyerTrackingPage);
  const trackingBuyer = await signInBuyer(buyerTrackingPage);
  expect(trackingBuyer.account.id).toBe(salesOrder.clientAccountId);
  const initialDeliveriesResponse = waitForApiResponse(buyerTrackingPage, 'GET', '/buyer/deliveries');
  await buyerTrackingPage.goto(`${portalOrigin}/deliveries`);
  const initialDeliveries = await initialDeliveriesResponse;
  expect(initialDeliveries.status).toBe(200);
  expect(initialDeliveries.body.items.some((delivery) => delivery.salesOrderNumber === salesOrder.number)).toBe(false);
  await expect(buyerTrackingPage.getByRole('heading', { name: 'My deliveries' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  const warehouseSession = await signInPlatformAccount(page, warehouseCredentials);
  expectSessionPermissions(warehouseSession, ['fulfillment.manage']);
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
  expect(fulfillmentResponse.headers.etag).toBe(`"${fulfillment.version}"`);
  await expect(page.locator('.fulfillment-message--success')).toContainText(salesOrder.number);

  const warehouseWork = page.locator('.fulfillment-list__item').filter({ hasText: salesOrder.id });
  await expect(warehouseWork).toBeVisible();
  const warehouseFulfillmentRead = waitForApiResponse(page, 'GET', `/fulfillments/${fulfillment.id}`);
  const warehouseAllocationRead = waitForApiResponse(page, 'GET', `/fulfillments/${fulfillment.id}/physical-allocation`);
  await warehouseWork.getByRole('button', { name: 'Inspect', exact: true }).click();
  const [warehouseFulfillmentResult, warehouseAllocationResult] = await Promise.all([
    warehouseFulfillmentRead,
    warehouseAllocationRead,
  ]);
  expect(warehouseFulfillmentResult.status).toBe(200);
  expect(warehouseAllocationResult.status).toBe(200);
  expect(warehouseFulfillmentResult.body.id).toBe(fulfillment.id);
  expect(warehouseFulfillmentResult.body.status).toBe('ALLOCATED');
  expect(warehouseFulfillmentResult.headers.etag).toBe(`"${warehouseFulfillmentResult.body.version}"`);
  const physicalAllocation = warehouseAllocationResult.body;
  expect(physicalAllocation.allocationId).toBe(fulfillment.physicalAllocationId);
  expect(physicalAllocation.lines.length).toBeGreaterThan(0);
  expect(
    physicalAllocation.lines.every((line) => line.warehouseId === expectedWarehouseId),
    'The allocation must remain inside the Logistics membership warehouse grant.',
  ).toBe(true);
  const allocationLines = physicalAllocation.lines;

  let fulfillmentEtag = warehouseFulfillmentResult.headers.etag;
  const pickingStarted = await runFulfillmentCommand(
    page,
    'Start picking',
    `/fulfillments/${fulfillment.id}/picking-starts`,
    fulfillmentEtag,
    'PICKING',
  );
  fulfillmentEtag = pickingStarted.headers.etag;
  const pickingRows = page.locator('.fulfillment-inspection').filter({ hasText: fulfillment.id }).locator('fieldset.fulfillment-observation');
  await expect(pickingRows).toHaveCount(allocationLines.length);
  for (const line of allocationLines) {
    expect(Number(line.remainingQuantity)).toBeGreaterThan(0);
    expect(line.lotId).toBeTruthy();
    expect(line.warehouseId).toBe(expectedWarehouseId);
    const row = pickingRows.filter({ hasText: line.physicalAllocationLineId });
    await row.getByLabel(/Actual picked quantity/).fill(String(line.remainingQuantity));
    await row.getByLabel('Observed lot ID').fill(line.lotId);
    await row.getByLabel('Observed warehouse ID').fill(line.warehouseId);
  }
  const pickingConfirmed = await runFulfillmentCommand(
    page,
    'Confirm picking',
    `/fulfillments/${fulfillment.id}/picking-confirmations`,
    fulfillmentEtag,
    'PICKED',
  );
  fulfillmentEtag = pickingConfirmed.headers.etag;
  const packed = await runFulfillmentCommand(
    page,
    'Pack fulfillment',
    `/fulfillments/${fulfillment.id}/packing`,
    fulfillmentEtag,
    'PACKED',
  );
  fulfillmentEtag = packed.headers.etag;
  const staged = await runFulfillmentCommand(
    page,
    'Stage fulfillment',
    `/fulfillments/${fulfillment.id}/staging`,
    fulfillmentEtag,
    'STAGED',
  );
  fulfillmentEtag = staged.headers.etag;
  const readyForDispatch = await runFulfillmentCommand(
    page,
    'Mark ready for dispatch',
    `/fulfillments/${fulfillment.id}/ready-for-dispatch`,
    fulfillmentEtag,
    'READY_FOR_DISPATCH',
  );
  fulfillmentEtag = readyForDispatch.headers.etag;

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  const logisticsSession = await signInPlatformAccount(page, logisticsCredentials);
  const logisticsMembershipId = expectSessionPermissions(logisticsSession, [
    'dispatch.read',
    'dispatch.schedule',
    'dispatch.assign',
    'dispatch.complete',
    'logistics.read',
  ]);
  const readinessResponse = waitForApiResponse(page, 'GET', '/dispatch-readiness');
  await page.goto(`${platformOrigin}/fulfillment-delivery`);
  await expect(page.getByRole('heading', { name: 'Fulfillment' })).toBeVisible();
  const readinessResult = await readinessResponse;
  expect(readinessResult.status).toBe(200);
  const readinessCard = page.locator('.dispatch-readiness').filter({ hasText: fulfillment.id });
  await expect(readinessCard).toBeVisible();
  const dispatchFulfillmentRead = waitForApiResponse(page, 'GET', `/fulfillments/${fulfillment.id}`);
  const dispatchAllocationRead = waitForApiResponse(page, 'GET', `/fulfillments/${fulfillment.id}/physical-allocation`);
  const assigneesRead = waitForApiResponse(page, 'GET', '/dispatch-assignees');
  await readinessCard.getByRole('button', { name: 'Inspect dispatch', exact: true }).click();
  const [dispatchFulfillmentResult, dispatchAllocationResult, assigneesResult] = await Promise.all([
    dispatchFulfillmentRead,
    dispatchAllocationRead,
    assigneesRead,
  ]);
  expect(dispatchFulfillmentResult.status).toBe(200);
  expect(dispatchAllocationResult.status).toBe(200);
  expect(assigneesResult.status).toBe(200);
  expect(dispatchFulfillmentResult.body.status).toBe('READY_FOR_DISPATCH');
  expect(dispatchFulfillmentResult.headers.etag).toBe(`"${dispatchFulfillmentResult.body.version}"`);
  expect(dispatchAllocationResult.body.allocationId).toBe(physicalAllocation.allocationId);
  expect(dispatchAllocationResult.body.version).toBe(physicalAllocation.version);
  expect(dispatchAllocationResult.body.lines.every((line) => line.warehouseId === expectedWarehouseId)).toBe(true);
  expect(assigneesResult.body.some((assignee) => assignee.id === logisticsMembershipId)).toBe(true);
  await expect(page.getByRole('heading', { name: `Current fulfillment · ${fulfillment.id}` })).toBeVisible();

  const windowStart = futureLocalDateTime(2);
  const windowEnd = futureLocalDateTime(3);
  await page.getByLabel('Window starts').fill(windowStart);
  await page.getByLabel('Window ends').fill(windowEnd);
  await page.getByLabel('Planning reason').fill('Synthetic local E2E delivery window.');
  const plannedWindowResponse = waitForApiResponse(page, 'POST', `/fulfillments/${fulfillment.id}/dispatch-window-plans`);
  await page.getByRole('button', { name: 'Plan dispatch window', exact: true }).click();
  const plannedWindow = await plannedWindowResponse;
  const plannedWindowEtag = expectVersionedCommand(plannedWindow, dispatchFulfillmentResult.headers.etag, {
    expectedHttpStatus: 201,
    versionField: 'fulfillmentVersion',
  });
  expect(plannedWindow.body.fulfillmentId).toBe(fulfillment.id);
  expect(plannedWindow.body.windowStart).toBeTruthy();
  expect(plannedWindow.body.windowEnd).toBeTruthy();

  await page.getByLabel('Eligible Logistics membership').selectOption(logisticsMembershipId);
  const assignmentResponse = waitForApiResponse(page, 'POST', `/fulfillments/${fulfillment.id}/driver-assignments`);
  await page.getByRole('button', { name: 'Assign driver', exact: true }).click();
  const assignment = await assignmentResponse;
  const assignmentEtag = expectVersionedCommand(assignment, plannedWindowEtag, {
    versionField: 'fulfillmentVersion',
  });
  expect(assignment.body.responsibleMembershipId).toBe(logisticsMembershipId);
  expect(assignment.body.physicalAllocationId).toBe(physicalAllocation.allocationId);
  expect(assignment.body.physicalAllocationVersion).toBe(physicalAllocation.version);
  expect(assignment.body.current).toBe(true);

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  const warehouseSessionForCheck = await signInPlatformAccount(page, warehouseCredentials);
  expectSessionPermissions(warehouseSessionForCheck, ['fulfillment.manage']);
  const checkedWorkPageResponse = waitForApiResponse(page, 'GET', '/fulfillments');
  await page.goto(`${platformOrigin}/fulfillment-delivery`);
  await expect(page.getByRole('heading', { name: 'Fulfillment' })).toBeVisible();
  const checkedWorkPage = await checkedWorkPageResponse;
  expect(checkedWorkPage.status).toBe(200);
  expect(checkedWorkPage.body.items.some((work) => work.fulfillmentId === fulfillment.id)).toBe(true);
  const checkedWork = page.locator('.fulfillment-list__item').filter({ hasText: salesOrder.id });
  await expect(checkedWork).toBeVisible();
  const checkFulfillmentRead = waitForApiResponse(page, 'GET', `/fulfillments/${fulfillment.id}`);
  const checkAllocationRead = waitForApiResponse(page, 'GET', `/fulfillments/${fulfillment.id}/physical-allocation`);
  await checkedWork.getByRole('button', { name: 'Inspect', exact: true }).click();
  const [checkFulfillmentResult, checkAllocationResult] = await Promise.all([
    checkFulfillmentRead,
    checkAllocationRead,
  ]);
  expect(checkFulfillmentResult.status).toBe(200);
  expect(checkAllocationResult.status).toBe(200);
  expect(checkFulfillmentResult.body.version).toBe(assignment.body.fulfillmentVersion);
  expect(checkAllocationResult.body.allocationId).toBe(physicalAllocation.allocationId);
  expect(checkAllocationResult.body.version).toBe(physicalAllocation.version);
  const outgoingRows = page.locator('.fulfillment-inspection').filter({ hasText: fulfillment.id }).locator('fieldset.fulfillment-observation');
  await expect(outgoingRows).toHaveCount(checkAllocationResult.body.lines.length);
  for (const line of checkAllocationResult.body.lines) {
    const quantity = Number(line.remainingQuantity);
    expect(Number.isFinite(quantity)).toBe(true);
    expect(quantity).toBeGreaterThan(0);
    expect(line.warehouseId).toBe(expectedWarehouseId);
    expect(line.lotId).toBeTruthy();
    const row = outgoingRows.filter({ hasText: line.physicalAllocationLineId });
    await row.getByLabel(/Observed quantity/).fill(String(quantity));
    await row.getByLabel('Observed lot ID').fill(line.lotId);
  }
  const outgoingCheckResponse = waitForApiResponse(page, 'POST', `/fulfillments/${fulfillment.id}/outgoing-checks`);
  await page.getByRole('button', { name: 'Record outgoing goods check', exact: true }).click();
  const outgoingCheck = await outgoingCheckResponse;
  expectVersionedCommand(outgoingCheck, checkFulfillmentResult.headers.etag, {
    expectedHttpStatus: 201,
    versionField: 'fulfillmentVersion',
  });
  expect(outgoingCheck.body.fulfillmentId).toBe(fulfillment.id);
  expect(outgoingCheck.body.physicalAllocationId).toBe(physicalAllocation.allocationId);
  expect(outgoingCheck.body.physicalAllocationVersion).toBe(physicalAllocation.version);
  expect(outgoingCheck.body.current).toBe(true);
  expect(outgoingCheck.body.matches).toBe(true);
  expect(outgoingCheck.body.openDiscrepancy).toBe(false);

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();

  const dispatchSession = await signInPlatformAccount(page, logisticsCredentials);
  expectSessionPermissions(dispatchSession, [
    'dispatch.read',
    'dispatch.schedule',
    'dispatch.assign',
    'dispatch.complete',
    'logistics.read',
  ]);
  const finalReadinessResponse = waitForApiResponse(page, 'GET', '/dispatch-readiness');
  await page.goto(`${platformOrigin}/fulfillment-delivery`);
  const finalReadiness = await finalReadinessResponse;
  expect(finalReadiness.status).toBe(200);
  const finalReadinessCard = page.locator('.dispatch-readiness').filter({ hasText: fulfillment.id });
  await expect(finalReadinessCard).toBeVisible();
  await expect(finalReadinessCard.locator('.dispatch-readiness__heading span')).toHaveText('Ready');
  const finalFulfillmentRead = waitForApiResponse(page, 'GET', `/fulfillments/${fulfillment.id}`);
  const finalAllocationRead = waitForApiResponse(page, 'GET', `/fulfillments/${fulfillment.id}/physical-allocation`);
  const finalAssignmentRead = waitForApiResponse(page, 'GET', `/fulfillments/${fulfillment.id}/driver-assignments`);
  const finalOutgoingCheckRead = waitForApiResponse(page, 'GET', `/fulfillments/${fulfillment.id}/outgoing-checks/current-summary`);
  const finalAssigneesRead = waitForApiResponse(page, 'GET', '/dispatch-assignees');
  await finalReadinessCard.getByRole('button', { name: 'Inspect dispatch', exact: true }).click();
  const [finalFulfillment, finalAllocation, finalAssignment, finalOutgoingCheck, finalAssignees] = await Promise.all([
    finalFulfillmentRead,
    finalAllocationRead,
    finalAssignmentRead,
    finalOutgoingCheckRead,
    finalAssigneesRead,
  ]);
  expect(finalFulfillment.status).toBe(200);
  expect(finalAllocation.status).toBe(200);
  expect(finalAssignment.status).toBe(200);
  expect(finalOutgoingCheck.status).toBe(200);
  expect(finalAssignees.status).toBe(200);
  expect(finalFulfillment.body.status).toBe('READY_FOR_DISPATCH');
  expect(finalFulfillment.headers.etag).toBe(`"${finalFulfillment.body.version}"`);
  expect(finalFulfillment.body.version).toBe(assignment.body.fulfillmentVersion);
  expect(finalAllocation.body.allocationId).toBe(physicalAllocation.allocationId);
  expect(finalAllocation.body.version).toBe(physicalAllocation.version);
  expect(finalAllocation.body.lines.every((line) => line.warehouseId === expectedWarehouseId)).toBe(true);
  expect(finalAssignment.body.responsibleMembershipId).toBe(logisticsMembershipId);
  expect(finalAssignment.body.fulfillmentVersion).toBe(finalFulfillment.body.version);
  expect(finalAssignment.body.physicalAllocationId).toBe(finalAllocation.body.allocationId);
  expect(finalAssignment.body.physicalAllocationVersion).toBe(finalAllocation.body.version);
  expect(finalAssignment.body.current).toBe(true);
  expect(finalOutgoingCheck.body.current).toBe(true);
  expect(finalOutgoingCheck.body.matches).toBe(true);
  expect(finalOutgoingCheck.body.openDiscrepancy).toBe(false);
  expect(finalOutgoingCheck.body.fulfillmentVersion).toBe(finalFulfillment.body.version);
  expect(finalOutgoingCheck.body.physicalAllocationVersion).toBe(finalAllocation.body.version);
  expect(finalAssignees.body.some((assignee) => assignee.id === logisticsMembershipId)).toBe(true);
  await expect(page.getByRole('button', { name: 'Record dispatch handoff', exact: true })).toBeEnabled();
  const dispatchResponse = waitForApiResponse(page, 'POST', `/fulfillments/${fulfillment.id}/dispatches`);
  await page.getByRole('button', { name: 'Record dispatch handoff', exact: true }).click();
  const dispatchedFulfillment = await dispatchResponse;
  expectVersionedCommand(dispatchedFulfillment, finalFulfillment.headers.etag, {
    expectedStatus: 'HANDED_OVER',
    expectedHttpStatus: 200,
  });
  expect(dispatchedFulfillment.body.deliveryId).toBeTruthy();

  const buyerRefreshResponse = waitForApiResponse(buyerTrackingPage, 'GET', '/buyer/deliveries');
  await buyerTrackingPage.bringToFront();
  const buyerRefresh = await buyerRefreshResponse;
  expect(buyerRefresh.status).toBe(200);
  const buyerDelivery = buyerRefresh.body.items.find((delivery) => delivery.id === dispatchedFulfillment.body.deliveryId);
  expect(buyerDelivery).toBeTruthy();
  expect(buyerDelivery.salesOrderNumber).toBe(salesOrder.number);
  expect(buyerDelivery.status).toBe('DISPATCHED');
  const buyerDeliveryCard = buyerTrackingPage.getByRole('heading', {
    name: `Order ${salesOrder.number}`,
    exact: true,
  }).locator('xpath=..');
  await expect(buyerDeliveryCard.getByText('Status: DISPATCHED', { exact: true })).toBeVisible();
  await page.bringToFront();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();

  await signInPlatformAccount(page, companyOwnerCredentials);
  const confirmedOrdersResponse = waitForApiResponse(page, 'GET', '/sales-orders');
  await page.goto(`${platformOrigin}/documents/order-summary`);
  await expect(page.getByRole('heading', { name: 'Select a confirmed Sales Order' })).toBeVisible();
  const confirmedOrders = await confirmedOrdersResponse;
  expect(confirmedOrders.status).toBe(200);
  expect(confirmedOrders.body.items.some((order) => order.id === salesOrder.id)).toBe(true);
  const generationLink = page.getByRole('listitem')
    .filter({ hasText: salesOrder.number })
    .getByRole('link', { name: /Request order summary PDF/ });
  await expect(generationLink).toBeVisible();
  const selectedOrderResponse = waitForApiResponse(page, 'GET', `/sales-orders/${salesOrder.id}`);
  await generationLink.click();
  const selectedOrderResponseBody = await selectedOrderResponse;
  expect(selectedOrderResponseBody.status).toBe(200);
  expect(selectedOrderResponseBody.body.confirmedAt).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Request order summary PDF', exact: true })).toBeVisible();
  const generationRequestResponse = waitForApiResponse(page, 'POST', '/business-document-generation-requests');
  await page.getByRole('button', { name: 'Request order summary PDF', exact: true }).click();
  const generationRequest = await generationRequestResponse;
  expect(generationRequest.status).toBe(202);
  expect(generationRequest.body.id).toBeTruthy();
  expect(generationRequest.body.documentId).toBeTruthy();
  expect(generationRequest.body.subjectType).toBe('SALES_ORDER');
  expect(generationRequest.body.subjectId).toBe(salesOrder.id);
  expect(generationRequest.body.documentType).toBe('ORDER_SUMMARY');
  expect(generationRequest.body.format).toBe('PDF');
  expect(generationRequest.body.status).toBe('PENDING');
  expect(generationRequest.headers['idempotency-key']).toBeTruthy();
  const ownerDocumentDetailResponse = waitForApiResponse(page, 'GET', `/business-documents/${generationRequest.body.documentId}`);
  await page.getByRole('link', { name: 'View order summary document' }).click();
  const ownerDocumentDetail = await ownerDocumentDetailResponse;
  expect(ownerDocumentDetail.status).toBe(200);
  expect(ownerDocumentDetail.body.subjectType).toBe('SALES_ORDER');
  expect(ownerDocumentDetail.body.subjectId).toBe(salesOrder.id);

  let orderSummaryPdf;
  await expect.poll(async () => {
    const documentResponse = waitForApiResponse(page, 'GET', `/business-documents/${generationRequest.body.documentId}`);
    await page.reload();
    const result = await documentResponse;
    if (result.status !== 200) return false;
    orderSummaryPdf = result.body;
    return orderSummaryPdf.status === 'GENERATED' && Boolean(orderSummaryPdf.storageObjectKey);
  }, { timeout: 60_000, intervals: [1_000, 2_000, 3_000] })
    .toBe(true, 'The explicitly requested order summary must be generated by the running document worker.');
  expect(orderSummaryPdf.storageObjectKey).toBeTruthy();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  expect(account.id).toBe(salesOrder.clientAccountId);
  await buyerTrackingPage.bringToFront();

  const buyerOrdersResponse = waitForApiResponse(buyerTrackingPage, 'GET', '/sales-orders');
  await buyerTrackingPage.goto(`${portalOrigin}/orders`);
  const buyerOrders = await buyerOrdersResponse;
  expect(buyerOrders.status).toBe(200);
  expect(buyerOrders.body.items.some((order) => order.id === salesOrder.id)).toBe(true);
  await expect(buyerTrackingPage.getByRole('row').filter({ hasText: salesOrder.number })).toBeVisible();

  const firstDocumentsResponse = waitForApiResponse(buyerTrackingPage, 'GET', '/business-documents');
  await buyerTrackingPage.goto(`${portalOrigin}/documents`);
  const firstDocuments = await firstDocumentsResponse;
  expect(firstDocuments.status).toBe(200);
  expect(firstDocuments.body.items.some((document) => document.id === orderSummaryPdf.id)).toBe(true);
  await expect(buyerTrackingPage.getByTestId('portal-business-documents-page')).toBeVisible();

  const documentLink = buyerTrackingPage.locator(`a.document-link[href="/documents/${orderSummaryPdf.id}"]`);
  await expect(documentLink).toBeVisible();
  const documentDetailResponse = waitForApiResponse(buyerTrackingPage, 'GET', `/business-documents/${orderSummaryPdf.id}`);
  await documentLink.click();
  const documentDetail = await documentDetailResponse;
  expect(documentDetail.status).toBe(200);
  expect(documentDetail.body.subjectType).toBe('SALES_ORDER');
  expect(documentDetail.body.subjectId).toBe(salesOrder.id);
  await expect(buyerTrackingPage.getByTestId('portal-business-document-detail')).toBeVisible();
  await expect(buyerTrackingPage.getByRole('heading', { name: 'Sales order document' })).toBeVisible();

  const documentDownloadEvent = buyerTrackingPage.waitForEvent('download');
  const documentDownloadResponse = waitForApiResponse(
    buyerTrackingPage,
    'GET',
    `/business-documents/${orderSummaryPdf.id}/downloads`,
    { parseJson: false },
  );
  await buyerTrackingPage.getByRole('button', { name: 'Download document' }).click();
  const [download, downloadedResponse] = await Promise.all([documentDownloadEvent, documentDownloadResponse]);
  expect(downloadedResponse.status).toBe(200);
  expect(download.suggestedFilename()).toBe(`ORDER_SUMMARY-${orderSummaryPdf.id}.pdf`);
  await buyerTrackingPage.close();
});
