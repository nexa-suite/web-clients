import { expect, test } from '@playwright/test';
import {
  getPlatformAccountCredentials,
  getPlatformWorkspaceSlug,
  platformAccountDefinitions,
} from '../../tooling/playwright/local-environment.mjs';

const API_PREFIX = '/api/v1';
const RECEIPT_PATH = `${API_PREFIX}/inventory/inbound-receipts`;
const EVIDENCE_PATH = `${API_PREFIX}/business-document-evidence`;
const THERMAL_ZONE_CODE = 'CHILLED-A';

test.afterEach(async ({ page }) => {
  for (const label of ['Password', 'Work email or user ID', 'Workspace slug']) {
    const field = page.getByLabel(label);
    if (await field.count()) await field.fill('').catch(() => {});
  }
});

test('records a temperature-excursion receipt after its warehouse photo is available', async ({ page }) => {
  test.setTimeout(150_000);

  const warehouseOperator = platformAccountDefinitions.find((account) => account.key === 'warehouseOperator');
  if (!warehouseOperator) throw new Error('The local warehouse identity definition is missing.');
  const credentials = getPlatformAccountCredentials(warehouseOperator);
  test.skip(!credentials, 'The optional local warehouse identity is not configured.');

  await page.goto('/sign-in');
  await page.getByLabel('Workspace slug').fill(getPlatformWorkspaceSlug());
  await page.getByRole('button', { name: 'Preview workspace' }).click();
  await expect(page.getByTestId('workspace-preview')).toBeVisible();
  await page.getByLabel('Work email or user ID').fill(credentials.identifier);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');

  await page.goto('/inventory');
  await expect(page.getByRole('heading', { name: 'Inventory and receiving' })).toBeVisible();
  const inventoryPanels = page.locator('.inventory-panel');
  const stockPanel = inventoryPanels.nth(0);
  const receiptPanel = inventoryPanels.nth(1);
  const stockWarehouse = stockPanel.getByLabel('Warehouse');
  await expect(stockWarehouse).toContainText('ICISA-COLD-01');
  const warehouseOption = stockWarehouse.locator('option').filter({ hasText: 'ICISA-COLD-01' }).first();
  const warehouseId = await warehouseOption.getAttribute('value');
  if (!warehouseId) throw new Error('The granted demo warehouse option has no API identifier.');

  const zonesCapture = await installJsonApiResponseCapture(
    page,
    `${API_PREFIX}/warehouses/${warehouseId}/zones`,
  );
  const zonesResponsePromise = zonesCapture.next();
  let zonesResponse;
  try {
    await stockWarehouse.selectOption(warehouseId);
    zonesResponse = await zonesResponsePromise;
  } finally {
    await zonesCapture.dispose();
  }
  expect(zonesResponse.status).toBe(200);
  const zonesPage = zonesResponse.body;
  const zone = zonesPage.items?.find((candidate) => candidate.code === THERMAL_ZONE_CODE);
  expect(zone).toBeTruthy();
  expect(zone.warehouseId).toBe(warehouseId);
  expect(zone.status).toBe('ACTIVE');
  const minimum = zone.temperatureMin;
  const maximum = zone.temperatureMax;
  expect(
    Number.isFinite(minimum) || Number.isFinite(maximum),
    `${THERMAL_ZONE_CODE} must expose a temperature bound to test an excursion using API zone policy.`,
  ).toBe(true);
  const temperature = Number.isFinite(maximum) && maximum < 100
    ? maximum + 0.5
    : minimum - 0.5;
  expect(Number.isFinite(temperature)).toBe(true);
  expect(
    (Number.isFinite(minimum) && temperature < minimum)
      || (Number.isFinite(maximum) && temperature > maximum),
  ).toBe(true);

  const catalogPicker = stockPanel.locator('.catalog-picker');
  const searchCatalog = catalogPicker.getByRole('button', { name: 'Search catalog' });
  const catalogCapture = await installCatalogResponseCapture(page);
  let catalogPage;
  let catalogItem;
  let catalogCapturePromise = catalogCapture.next();
  await searchCatalog.click();
  let { status: catalogStatus, body: firstCatalogPage } = await catalogCapturePromise;
  catalogPage = firstCatalogPage;
  expect(catalogStatus).toBe(200);
  catalogItem = catalogPage.items?.find((item) => item.status === 'ACTIVE'
    && item.coldChainRequirement === 'REFRIGERATED'
    && item.skuCode?.trim() && item.unitOfMeasure?.trim());

  while (!catalogItem && catalogPage.page + 1 < catalogPage.totalPages) {
    catalogCapturePromise = catalogCapture.next();
    await catalogPicker.getByRole('button', { name: 'Next' }).click();
    ({ status: catalogStatus, body: catalogPage } = await catalogCapturePromise);
    expect(catalogStatus).toBe(200);
    catalogItem = catalogPage.items?.find((item) => item.status === 'ACTIVE'
      && item.coldChainRequirement === 'REFRIGERATED'
      && item.skuCode?.trim() && item.unitOfMeasure?.trim());
  }
  await catalogCapture.dispose();

  expect(catalogItem, 'The API catalog must expose an active refrigerated SKU with a unit.').toBeTruthy();
  const catalogSelect = catalogPicker.getByLabel('Catalog item / SKU');
  await catalogSelect.selectOption(catalogItem.catalogItemId);
  await expect(stockPanel.locator('.selected-item')).toContainText(catalogItem.skuCode);
  await expect(receiptPanel.getByLabel('Unit (SKU)')).toHaveValue(catalogItem.unitOfMeasure);

  const receiptWarehouse = receiptPanel.getByLabel('Warehouse');
  const receiptZone = receiptPanel.getByLabel('Zone');
  await expect(receiptWarehouse).toHaveValue(warehouseId);
  await expect(receiptZone).toContainText(THERMAL_ZONE_CODE);
  const zoneId = await receiptZone.locator('option').filter({ hasText: THERMAL_ZONE_CODE }).first().getAttribute('value');
  if (!zoneId) throw new Error('The active thermal test zone option has no API identifier.');
  await receiptZone.selectOption(zoneId);

  const batchNumber = `DEMO-THERMAL-${Date.now()}`;
  const productionDate = utcDateOffset(-1);
  const expirationDate = utcDateOffset(30);
  const receivedAtLocal = await page.evaluate(() => {
    const date = new Date(Date.now() - 60_000);
    const part = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`
      + `T${part(date.getHours())}:${part(date.getMinutes())}`;
  });

  await receiptPanel.getByLabel('Batch / lot number').fill(batchNumber);
  await receiptPanel.getByLabel('Production date').fill(productionDate);
  await receiptPanel.getByLabel('Received at').fill(receivedAtLocal);
  await receiptPanel.getByLabel('Expiration date').fill(expirationDate);
  await receiptPanel.getByLabel('Quantity').fill('1');
  await receiptPanel.getByLabel('Receiving temperature (°C)').fill(String(temperature));

  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==',
    'base64',
  );
  await receiptPanel.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'thermal-receipt.png',
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  await expect(receiptPanel.getByRole('status')).toContainText('Selected thermal-receipt.png');

  const networkEvents = [];
  const responseBodies = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    const method = response.request().method();
    const isEvidenceUpload = url.pathname === EVIDENCE_PATH && method === 'POST';
    const isEvidenceStatus = url.pathname.startsWith(`${EVIDENCE_PATH}/`) && method === 'GET';
    const isReceipt = url.pathname === RECEIPT_PATH && method === 'POST';
    if (!isEvidenceUpload && !isEvidenceStatus && !isReceipt) return;

    let requestBody = null;
    if (isReceipt) {
      try { requestBody = response.request().postDataJSON(); } catch {}
    }
    const event = {
      response,
      sequence: networkEvents.length,
      method,
      pathname: url.pathname,
      status: response.status(),
      requestBody,
      body: null,
      bodyPromise: null,
    };
    networkEvents.push(event);
    const bodyPromise = response.json().then((body) => { event.body = body; return body; }).catch(() => null);
    event.bodyPromise = bodyPromise;
    responseBodies.push(bodyPromise);
  });

  const uploadResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === EVIDENCE_PATH
      && response.request().method() === 'POST');
  const receiptResponsePromise = page.waitForResponse((response) => {
    if (new URL(response.url()).pathname !== RECEIPT_PATH || response.request().method() !== 'POST') {
      return false;
    }
    try {
      return response.request().postDataJSON()?.batchNumber === batchNumber;
    } catch {
      return false;
    }
  }, { timeout: 120_000 });

  await receiptPanel.getByRole('button', { name: 'Record receipt' }).click();
  const uploadResponse = await uploadResponsePromise;
  expect(uploadResponse.status()).toBe(201);
  const uploadEvent = networkEvents.find((event) => event.pathname === EVIDENCE_PATH && event.method === 'POST');
  await Promise.all(responseBodies);
  const uploadedEvidence = uploadEvent?.body;
  expect(uploadedEvidence).toBeTruthy();
  expect(uploadedEvidence.subjectType).toBe('WAREHOUSE');
  expect(uploadedEvidence.subjectId).toBe(warehouseId);
  expect(uploadedEvidence.originalFilename).toBe('thermal-receipt.png');
  expect(uploadedEvidence.lifecycleStatus).toMatch(/^(REQUESTED|UPLOADING|QUARANTINED|SCANNING|AVAILABLE)$/);
  const evidenceId = uploadedEvidence.id;
  expect(evidenceId).toBeTruthy();

  if (uploadedEvidence.lifecycleStatus !== 'AVAILABLE') {
    const availableStatus = await page.waitForResponse(async (response) => {
      if (new URL(response.url()).pathname !== `${EVIDENCE_PATH}/${evidenceId}`
        || response.request().method() !== 'GET'
        || response.status() !== 200) return false;
      const event = networkEvents.find((candidate) => candidate.response === response);
      const body = await event?.bodyPromise;
      return body?.lifecycleStatus === 'AVAILABLE';
    }, { timeout: 120_000 });
    expect(availableStatus.status()).toBe(200);
    const availableEvent = networkEvents.find((event) => event.response === availableStatus);
    await Promise.all(responseBodies);
    expect(availableEvent?.body?.lifecycleStatus).toBe('AVAILABLE');
  }

  const receiptResponse = await receiptResponsePromise;
  expect(receiptResponse.status()).toBe(201);
  expect(receiptResponse.headers().etag).toBeTruthy();
  const receiptRequest = receiptResponse.request().postDataJSON();
  expect(receiptRequest.batchNumber).toBe(batchNumber);
  expect(receiptRequest.warehouseId).toBe(warehouseId);
  expect(receiptRequest.zoneId).toBe(zoneId);
  expect(receiptRequest.catalogItemId).toBe(catalogItem.catalogItemId);
  expect(receiptRequest.skuId).toBeNull();
  expect(receiptRequest.unit).toBe(catalogItem.unitOfMeasure);
  expect(receiptRequest.quantity).toBe(1);
  expect(receiptRequest.temperatureReading).toBe(temperature);
  expect(receiptRequest.temperatureEvidenceObjectId).toBe(evidenceId);
  const inboundEvent = networkEvents.find((event) =>
    event.pathname === RECEIPT_PATH && event.method === 'POST' && event.requestBody?.batchNumber === batchNumber);
  await Promise.all(responseBodies);
  const createdLot = inboundEvent?.body;
  expect(createdLot).toBeTruthy();
  expect(createdLot.status).toBe('HOLD');
  expect(createdLot.available).toBe(0);

  await Promise.all(responseBodies);
  const availableEvent = networkEvents.find((event) =>
    event.body?.id === evidenceId && event.body?.lifecycleStatus === 'AVAILABLE');
  const capturedInboundEvent = networkEvents.find((event) =>
    event.pathname === RECEIPT_PATH && event.requestBody?.batchNumber === batchNumber);
  expect(availableEvent, 'The evidence scanner must report AVAILABLE before receipt creation.').toBeTruthy();
  expect(capturedInboundEvent).toBeTruthy();
  expect(availableEvent.sequence).toBeLessThan(capturedInboundEvent.sequence);

  const refreshedLotsResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.pathname === `${API_PREFIX}/inventory/lots`;
  });
  await page.getByRole('button', { name: 'Refresh lots' }).click();
  expect((await refreshedLotsResponsePromise).status()).toBe(200);

  const lotsPanel = stockPanel;
  const lotRow = lotsPanel.getByRole('row').filter({ hasText: batchNumber });
  const lotPager = lotsPanel.locator('[aria-label="Lot pages"]');
  for (let pageNumber = 0; !(await lotRow.count()) && pageNumber < 20; pageNumber += 1) {
    const pageLabel = await lotPager.locator('p').innerText();
    const currentPage = Number(pageLabel.match(/Page\s+(\d+)/)?.[1] ?? '1');
    const pageCount = Number(pageLabel.match(/·\s+(\d+)\s+lots/)?.[1] ?? '0');
    if (currentPage >= pageCount) break;
    const nextLotsResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'GET' && url.pathname === `${API_PREFIX}/inventory/lots`;
    });
    await lotPager.getByRole('button', { name: 'Next' }).click();
    await nextLotsResponsePromise;
  }

  await expect(lotRow).toBeVisible();
  await expect(lotRow.getByRole('cell').nth(8)).toHaveText(/^0(?:\s|$)/);
  await expect(lotRow.getByRole('cell').nth(9)).toHaveText('HOLD');
});

function utcDateOffset(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function installCatalogResponseCapture(page) {
  return installJsonApiResponseCapture(page, `${API_PREFIX}/catalog-items`);
}

async function installJsonApiResponseCapture(page, path) {
  const pattern = `**${path}**`;
  const waiters = [];
  const handler = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET' || url.pathname !== path) {
      await route.continue();
      return;
    }
    const waiter = waiters.shift();
    if (!waiter) {
      await route.continue();
      return;
    }
    try {
      const upstream = await route.fetch();
      let body;
      try {
        body = await upstream.json();
      } catch (error) {
        await route.abort('failed').catch(() => {});
        waiter.reject(error);
        return;
      }
      await route.fulfill({ response: upstream });
      waiter.resolve({ status: upstream.status(), body });
    } catch (error) {
      await route.abort('failed').catch(() => {});
      waiter.reject(error);
    }
  };
  await page.route(pattern, handler);
  return {
    next: () => new Promise((resolve, reject) => waiters.push({ resolve, reject })),
    dispose: () => page.unroute(pattern, handler),
  };
}
