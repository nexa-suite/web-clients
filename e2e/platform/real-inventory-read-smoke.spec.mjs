import { expect, test } from '@playwright/test';
import {
  getPlatformAccountCredentials,
  getPlatformWorkspaceSlug,
  platformAccountDefinitions,
} from '../../tooling/playwright/local-environment.mjs';

test.afterEach(async ({ page }) => {
  for (const label of ['Password', 'Work email or user ID', 'Workspace slug']) {
    const field = page.getByLabel(label);
    if (await field.count()) await field.fill('').catch(() => {});
  }
});

test('reads a seeded warehouse inventory lot through scoped inventory UI', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: 'Lots by warehouse' })).toBeVisible();
  const warehouseSelect = page.locator('.inventory-panel').first().getByLabel('Warehouse');
  await expect(warehouseSelect).toContainText('ICISA-COLD-01');
  const warehouseOption = warehouseSelect.locator('option').filter({ hasText: 'ICISA-COLD-01' }).first();
  const warehouseId = await warehouseOption.getAttribute('value');
  if (!warehouseId) throw new Error('The authorized demo warehouse option has no API identifier.');
  await warehouseSelect.selectOption(warehouseId);
  await expect(page.getByRole('cell', { name: /^LOCAL-FOUNDATION-/ }).first()).toBeVisible();
});
