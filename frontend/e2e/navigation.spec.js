import { expect, test } from '@playwright/test';
import { expectConsole, getValue, open } from './helpers.js';

test('switches between the XSLT and DataSonnet pages', async ({ page }) => {
  await open(page, '/', 4);
  await expect(page.locator('h1')).toHaveText('XSLT Tester');
  await expect(page.locator('.page-nav a.active')).toHaveText('XSLT');

  await page.click('.page-nav a[href="/datasonnet"]');
  await expect(page).toHaveURL(/\/datasonnet$/);
  await expect(page.locator('h1')).toHaveText('DataSonnet Tester');
  await expect(page.locator('.page-nav a.active')).toHaveText('DataSonnet');

  await page.click('.page-nav a[href="/"]');
  await expect(page.locator('h1')).toHaveText('XSLT Tester');
});

test('the settings page lists the Saxon versions with 10.9 selected by default', async ({ page }) => {
  await page.goto('/settings');
  for (const version of ['9.9.1-8', '10.9', '11.7', '12.5']) {
    await expect(page.getByLabel(`Saxon-HE ${version}`)).toBeVisible();
  }
  await expect(page.getByLabel('Saxon-HE 10.9')).toBeChecked();
});

test('a chosen Saxon version is shown in the header and used for the transformation', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Saxon-HE 12.5').check();
  await expect(page.locator('.ok')).toContainText('Saxon-HE 12.5 wordt gebruikt');

  await open(page, '/', 4);
  await expect(page.locator('#saxonVersion')).toHaveText('12.5');
  await page.click('#run');
  await expectConsole(page, 'Transformatie gestart met Saxon-HE 12.5');
  await expect.poll(() => getValue(page, 'output')).toContain('Goedemorgen Jan');
});

test('the settings link in the header opens the settings page and back returns', async ({ page }) => {
  await open(page, '/', 4);
  await page.click('a.settings');
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole('link', { name: '← Terug' }).click();
  await expect(page).toHaveURL(/\/$/);
});
