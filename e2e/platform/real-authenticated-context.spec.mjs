import { expect, test } from '@playwright/test';
import {
  getPlatformAccountCredentials,
  getPlatformWorkspaceSlug,
  platformAccountDefinitions,
} from '../../tooling/playwright/local-environment.mjs';

test.afterEach(async ({ page }) => {
  // Remove entered credentials before Playwright builds any diagnostic context.
  for (const label of ['Password', 'Work email or user ID', 'Workspace slug']) {
    const field = page.getByLabel(label);
    if (await field.count()) await field.fill('').catch(() => {});
  }
});

test('uses the live API for preview, sign in, restored session, and sign out', async ({ page }) => {
  const companyOwner = platformAccountDefinitions.find((account) => account.key === 'companyOwner');
  if (!companyOwner) throw new Error('The required company owner account definition is missing.');

  const credentials = getPlatformAccountCredentials(companyOwner);
  if (!credentials) throw new Error('The required company owner credentials are unavailable.');
  const workspaceSlug = getPlatformWorkspaceSlug();

  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await expect(page).toHaveTitle('Sign in | Nexa Platform');
  await expect(page.getByLabel('Workspace slug')).toBeVisible();
  await expect(page.locator('#main-content')).toHaveCount(1);
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(horizontalOverflow, `Unexpected sign-in overflow at ${width}px`).toBe(false);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const enlargedTextOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(enlargedTextOverflow, 'Unexpected sign-in overflow at 200% text size').toBe(false);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });

  await page.getByLabel('Workspace slug').fill(workspaceSlug);
  await page.getByRole('button', { name: 'Preview workspace' }).click();
  await expect(page.getByTestId('workspace-preview')).toBeVisible();
  await expect(page.locator('input[autocomplete="username"]')).toHaveCount(1);
  await expect(page.locator('input[autocomplete="current-password"]')).toHaveCount(1);

  await page.getByLabel('Work email or user ID').fill(credentials.identifier);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect.poll(async () => {
    if (new URL(page.url()).pathname === '/') return 'authenticated';
    const messages = await page.getByRole('alert').allInnerTexts();
    return messages[0]?.trim() || 'waiting for API authentication';
  }, { timeout: 15_000 }).toBe('authenticated');
  await expect(page.getByRole('heading', { name: 'Active business context' })).toBeVisible();
  await expect(page).toHaveTitle('Active context | Nexa Platform');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Current session' })).toBeVisible();
  await expect(page.getByTestId('api-roles')).toContainText('COMPANY_OWNER');
  await expect(page.getByTestId('api-roles')).toContainText('TENANT_ADMIN');
  await expect(page.getByTestId('api-permissions').locator('code').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Active business context' })).toBeVisible();
  await expect(page.getByTestId('api-roles').locator('code').first()).toBeVisible();

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Active business context' })).toBeVisible();
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(horizontalOverflow, `Unexpected horizontal overflow at ${width}px`).toBe(false);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const enlargedContextOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(enlargedContextOverflow, 'Unexpected active-context overflow at 200% text size').toBe(false);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });

  const signOut = page.getByRole('button', { name: 'Sign out' });
  await signOut.focus();
  await expect(signOut).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  await expect(page).toHaveTitle('Sign in | Nexa Platform');
  await expect(page.locator('#main-content')).toBeFocused();
});

const roleExpectations = {
  tenantAdministrator: { apiRole: 'TENANT_ADMIN', actorName: 'Tenant Administrator' },
  salesRepresentative: { apiRole: 'SALES', actorName: 'Sales Representative' },
  warehouseOperator: { apiRole: 'WAREHOUSE', actorName: 'Warehouse Operator' },
  apiLogisticsIdentity: { apiRole: 'LOGISTICS', actorName: null },
};

for (const account of platformAccountDefinitions.filter((candidate) => candidate.key !== 'companyOwner')) {
  const expected = roleExpectations[account.key];
  if (!expected) continue;

  test(`shows live API role claims for ${account.label}`, async ({ page }) => {
    const credentials = getPlatformAccountCredentials(account);
    test.skip(!credentials, 'This optional API integration identity is not configured.');

    await page.goto('/sign-in');
    await page.getByLabel('Workspace slug').fill(getPlatformWorkspaceSlug());
    await page.getByRole('button', { name: 'Preview workspace' }).click();
    await expect(page.getByTestId('workspace-preview')).toBeVisible();
    await page.getByLabel('Work email or user ID').fill(credentials.identifier);
    await page.getByLabel('Password').fill(credentials.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
    await expect(page.getByRole('heading', { name: 'Active business context' })).toBeVisible();
    await expect(page.locator('#main-content')).toBeFocused();
    const apiRoles = page.getByTestId('api-roles');
    await expect(apiRoles).toContainText(expected.apiRole);

    const roleItem = apiRoles.locator('li').filter({
      has: page.getByText(expected.apiRole, { exact: true }),
    });
    if (expected.actorName) {
      await expect(roleItem).toContainText(`Label only: ${expected.actorName}`);
    } else {
      await expect(roleItem).toContainText('No canonical Platform actor mapping is defined');
    }
    await expect(page.getByTestId('api-permissions').locator('code').first()).toBeVisible();
  });
}
