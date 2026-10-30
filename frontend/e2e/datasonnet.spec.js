import { expect, test } from '@playwright/test';
import { download, expectConsole, getValue, open, placeCursor, runAction, setValue } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await open(page, '/datasonnet', 3);
});

test('transforms the sample payload and logs success in the console', async ({ page }) => {
  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).toContain('Goedemorgen Jan');
  await expectConsole(page, 'Transformatie geslaagd');
});

test('Ctrl+Enter in an editor runs the transformation', async ({ page }) => {
  await page.click('#script');
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => getValue(page, 'output')).toContain('Goedemorgen Piet');
});

test('uses a parameter with an explicit type', async ({ page }) => {
  await page.click('#addParam');
  const row = page.locator('.param').last();
  await row.locator('input').first().fill('getal');
  await row.locator('input').nth(1).fill('41');
  await row.locator('select').selectOption('json');
  await setValue(page, 'script', '{ som: getal + 1 }');
  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).toBe('{"som":42}');
});

test('shows a script error in the console', async ({ page }) => {
  await setValue(page, 'script', '{ a: bogus }');
  await page.click('#run');
  await expect(page.locator('.console-err')).toContainText('Unknown variable bogus');
  expect(await getValue(page, 'output')).toBe('');
});

test('explains why a result cannot be written as XML', async ({ page }) => {
  await page.selectOption('#outputType', 'application/xml');
  await setValue(page, 'script', '{ greetings: [1, 2] }');
  await page.click('#run');
  await expect(page.locator('.console-err')).toContainText("Het root-element 'greetings' is nu een array");
});

test('writes XML output when the result has the right shape', async ({ page }) => {
  await page.selectOption('#outputType', 'application/xml');
  await setValue(page, 'script', '{ root: { naam: payload.persons[0].name } }');
  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).toContain('<root><naam>Jan</naam></root>');
});

test('loads an example as a whole: payload, script and formats', async ({ page }) => {
  await page.selectOption('#exampleSelect', { label: 'Reading XML' });
  await expect(page.locator('#inputType')).toHaveValue('application/xml');
  await expect(page.locator('#outputType')).toHaveValue('application/json');
  expect(await getValue(page, 'payload')).toContain('<test:root');
  expect(await getValue(page, 'script')).toContain('NamespaceSeparator');
  await expect(page.locator('#exampleSelect')).toHaveValue('');
  await expectConsole(page, 'Voorbeeld "Reading XML" geladen');

  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).toContain('Hello World');
});

test('loads an example that needs another output format', async ({ page }) => {
  await page.selectOption('#exampleSelect', { label: 'Writing CSV' });
  await expect(page.locator('#outputType')).toHaveValue('text/csv');
  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).toContain("'William'|'Shakespeare'|'Hamlet'");
});

test('lists every example', async ({ page }) => {
  expect(await page.locator('#exampleSelect option').count()).toBeGreaterThanOrEqual(26);
});

test('copies the path of the value under the cursor', async ({ page }) => {
  await placeCursor(page, 'payload', 'Piet', 1);
  await runAction(page, 'payload', 'copy-payload-path');
  await expectConsole(page, 'Pad gekopieerd: payload.persons[1].name');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('payload.persons[1].name');
});

test('copy path refuses a payload that is not JSON', async ({ page }) => {
  await page.selectOption('#inputType', 'application/xml');
  await runAction(page, 'payload', 'copy-payload-path');
  await expectConsole(page, 'Dit werkt alleen bij een JSON-payload');
});

test('highlights where a script reference points in the payload', async ({ page }) => {
  await placeCursor(page, 'script', 'person.name', 8);
  await runAction(page, 'script', 'highlight-reference');
  await expectConsole(page, '2 plek(ken) in de payload gemarkeerd voor "person.name"');
  await expect(page.locator('#payload .json-scope-highlight').first()).toBeVisible();

  await runAction(page, 'payload', 'clear-payload-highlight');
  await expect(page.locator('#payload .json-scope-highlight')).toHaveCount(0);
});

test('highlights the input of a parameter from the script', async ({ page }) => {
  await placeCursor(page, 'script', 'greeting + ', 2);
  await runAction(page, 'script', 'highlight-reference');
  await expect(page.locator('.param-highlight')).toHaveCount(1);
  await expectConsole(page, 'Invoer voor parameter "greeting" gemarkeerd');
});

test('reports a reference that does not exist in the payload', async ({ page }) => {
  await setValue(page, 'script', 'payload.bestaatniet');
  await placeCursor(page, 'script', 'bestaatniet', 3);
  await runAction(page, 'script', 'highlight-reference');
  await expect(page.locator('.console-err')).toContainText('komt niet voor in de payload');
});

test('saves payload, script and output as files', async ({ page }) => {
  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).not.toBe('');

  const payload = await download(page, '#savePayload');
  expect(payload.name).toBe('payload.json');
  expect(payload.content).toBe(await getValue(page, 'payload'));

  const script = await download(page, '#saveScript');
  expect(script.name).toBe('mapping.ds');
  expect(script.content).toBe(await getValue(page, 'script'));

  const output = await download(page, '#saveOutput');
  expect(output.name).toBe('output.json');
  expect(output.content).toBe(await getValue(page, 'output'));
});

test('uses the extension of the selected format when saving', async ({ page }) => {
  await page.selectOption('#inputType', 'text/csv');
  expect((await download(page, '#savePayload')).name).toBe('payload.csv');
  await page.selectOption('#inputType', 'application/json');
  await page.selectOption('#outputType', 'application/x-yaml');
  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).not.toBe('');
  expect((await download(page, '#saveOutput')).name).toBe('output.yaml');
});

test('does not save an empty output', async ({ page }) => {
  await page.click('#saveOutput');
  await expectConsole(page, 'Er is nog geen output om op te slaan');
});

test('opens a payload and a script file and saves them under their own names', async ({ page }) => {
  await page.setInputFiles('#payloadFile', { name: 'invoer.json', mimeType: 'application/json', buffer: Buffer.from('{"x": 5}') });
  await page.setInputFiles('#scriptFile', { name: 'mijn.ds', mimeType: 'text/plain', buffer: Buffer.from('{ y: payload.x * 2 }') });
  await expect.poll(() => getValue(page, 'payload')).toBe('{"x": 5}');
  await expect.poll(() => getValue(page, 'script')).toBe('{ y: payload.x * 2 }');
  expect((await download(page, '#savePayload')).name).toBe('invoer.json');
  expect((await download(page, '#saveScript')).name).toBe('mijn.ds');

  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).toBe('{"y":10}');
});

test('restores the previous session after a reload', async ({ page }) => {
  await page.selectOption('#outputType', 'application/x-yaml');
  await setValue(page, 'script', '{ bewaard: true }');
  await page.locator('.param select').first().selectOption('text');
  await expect(page.locator('#saveStatus')).toHaveText('Automatisch opgeslagen');

  await open(page, '/datasonnet', 3);
  expect(await getValue(page, 'script')).toBe('{ bewaard: true }');
  await expect(page.locator('#outputType')).toHaveValue('application/x-yaml');
  await expect(page.locator('.param select').first()).toHaveValue('text');
});

test('keeps the DataSonnet session separate from the XSLT session', async ({ page }) => {
  await setValue(page, 'script', '{ alleen: "datasonnet" }');
  await expect(page.locator('#saveStatus')).toHaveText('Automatisch opgeslagen');
  await open(page, '/', 4);
  expect(await getValue(page, 'xslt')).toContain('xsl:stylesheet');
});

test('opens the help dialog', async ({ page }) => {
  await page.click('#openHelp');
  await expect(page.locator('#helpDialog')).toContainText('Voorbeelden');
  await page.click('#closeHelp');
  await expect(page.locator('#helpDialog')).toBeHidden();
});
