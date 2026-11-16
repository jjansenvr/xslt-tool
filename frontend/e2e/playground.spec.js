import { expect, test } from '@playwright/test';
import { getValue, open, setValue } from './helpers.js';

test('the regular editor has a folder button and no examples', async ({ page }) => {
  await open(page, '/', 4);
  await expect(page.locator('#openFolder')).toBeVisible();
  await expect(page.locator('#exampleSelect')).toHaveCount(0);
  await expect(page.locator('#xsltBar')).toContainText('alleen in de browser');
});

test('the playground is marked, offers examples and does not persist', async ({ page }) => {
  await open(page, '/?playground', 4);
  await expect(page.locator('.playground-badge')).toBeVisible();
  await expect(page.locator('#openFolder')).toHaveCount(0);
  await expect(page.locator('#xsltBar')).toContainText('wordt niet bewaard');

  await page.selectOption('#exampleSelect', { index: 2 });
  await expect.poll(() => getValue(page, 'xslt')).toContain('for-each-group');

  await setValue(page, 'xslt', '<changed/>');
  await page.waitForTimeout(500);

  const fresh = await page.context().newPage();
  await open(fresh, '/?playground', 4);
  expect(await getValue(fresh, 'xslt')).not.toContain('<changed/>');
});

test('the playground does not change the regular editor', async ({ page }) => {
  await open(page, '/?playground', 4);
  await setValue(page, 'xslt', '<playground-only/>');
  await page.waitForTimeout(500);
  await open(page, '/', 4);
  expect(await getValue(page, 'xslt')).not.toContain('playground-only');
});

test('files open as tabs that can be added, switched and closed', async ({ page }) => {
  await open(page, '/?playground', 4);
  await expect(page.locator('#xsltTabs .tab')).toHaveCount(1);

  await page.click('#xsltTabs .tab-new');
  await expect(page.locator('#xsltTabs .tab')).toHaveCount(2);
  await expect(page.locator('#xsltTabs .tab.active')).toContainText('naamloos-2.xsl');
  expect(await getValue(page, 'xslt')).toContain('<xsl:stylesheet');

  await setValue(page, 'xslt', '<second/>');
  await page.locator('#xsltTabs .tab').first().click();
  expect(await getValue(page, 'xslt')).toContain('greeting');
  await page.locator('#xsltTabs .tab').nth(1).click();
  expect(await getValue(page, 'xslt')).toBe('<second/>');

  await page.locator('#xsltTabs .tab.active .tab-close').click({ force: true });
  await expect(page.locator('#xsltTabs .tab')).toHaveCount(1);
  expect(await getValue(page, 'xslt')).toContain('greeting');
});
