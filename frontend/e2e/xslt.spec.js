import { expect, test } from '@playwright/test';
import { download, expectConsole, getValue, open, placeCursor, runAction, setValue } from './helpers.js';

const stylesheet = body => `<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">${body}</xsl:stylesheet>`;

test.beforeEach(async ({ page }) => {
  await open(page, '/', 4);
});

test('transforms the sample input and logs success in the console', async ({ page }) => {
  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).toContain('Goedemorgen Jan');
  await expectConsole(page, 'Transformatie geslaagd');
  await expect(page.locator('.console-ok')).toBeVisible();
});

test('Ctrl+Enter in an editor runs the transformation', async ({ page }) => {
  await page.click('#xml');
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => getValue(page, 'output')).toContain('Goedemorgen Piet');
});

test('uses the value of a parameter', async ({ page }) => {
  await page.locator('.param input').nth(1).fill('Hoi');
  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).toContain('Hoi Jan');
});

test('shows xsl:message output as its own console line', async ({ page }) => {
  await setValue(page, 'xslt', stylesheet('<xsl:template match="/persons"><xsl:message>debug: <xsl:value-of select="person[1]/name"/></xsl:message><ok/></xsl:template>'));
  await page.click('#run');
  await expect(page.locator('.console-message')).toContainText('debug: Jan');
  await expect.poll(() => getValue(page, 'output')).toContain('<ok/>');
});

test('shows a stylesheet error in the console and clears the output', async ({ page }) => {
  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).not.toBe('');
  await setValue(page, 'xslt', stylesheet('<xsl:template match="/"><xsl:bogus/></xsl:template>'));
  await page.click('#run');
  await expect(page.locator('.console-err')).toContainText('xsl:bogus');
  expect(await getValue(page, 'output')).toBe('');
});

test('console can be cleared', async ({ page }) => {
  await page.click('#run');
  await expectConsole(page, 'Transformatie geslaagd');
  await page.getByRole('button', { name: 'Wissen' }).click();
  await expect(page.locator('.console-line')).toHaveCount(0);
});

test('adds a parameter as xsl:param to the stylesheet', async ({ page }) => {
  await page.click('#addParam');
  await page.locator('.param').last().locator('input').first().fill('extra');
  await page.locator('.param').last().locator('.add-to-xslt').click();
  expect(await getValue(page, 'xslt')).toContain('<xsl:param name="extra"/>');
});

test('highlights the input of a parameter from the stylesheet', async ({ page }) => {
  await placeCursor(page, 'xslt', '$greeting', 3);
  await runAction(page, 'xslt', 'find-parameter-input');
  await expect(page.locator('.param-highlight')).toHaveCount(1);
  await expectConsole(page, 'Invoer voor parameter "greeting" gemarkeerd');
});

test('copies the XPath of the element under the cursor', async ({ page }) => {
  await placeCursor(page, 'xml', 'Piet', 1);
  await runAction(page, 'xml', 'copy-xml-xpath');
  await expectConsole(page, 'XPath gekopieerd: /persons/person[@id="2"]/name');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/persons/person[@id="2"]/name');
});

test('highlights the XML scope of a select expression', async ({ page }) => {
  await placeCursor(page, 'xslt', 'select="person"', 10);
  await runAction(page, 'xslt', 'highlight-xml-scope');
  await expectConsole(page, '2 XML-element(en) gemarkeerd');
  await expect(page.locator('#xml .xml-scope-highlight').first()).toBeVisible();
});

test('generates an XSD and validates the input against it', async ({ page }) => {
  await page.check('#xsdToggle');
  await expect.poll(() => getValue(page, 'xsd')).toContain('xs:schema');
  await expect(page.locator('#xsdStatus')).toContainText('Geldig volgens XSD');

  await setValue(page, 'xml', '<persons><person id="x"><name>Jan</name></person></persons>');
  await expect(page.locator('#xsdStatus')).toHaveClass(/err/);
  await expect(page.locator('#xsdStatus')).not.toBeEmpty();
});

test('reports an invalid XSD', async ({ page }) => {
  await page.check('#xsdToggle');
  await expect.poll(() => getValue(page, 'xsd')).toContain('xs:schema');
  await setValue(page, 'xsd', 'geen xsd');
  await expect(page.locator('#xsdStatus')).toContainText('Ongeldig XSD');
});

test('saves input, stylesheet and output as files', async ({ page }) => {
  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).not.toBe('');

  const output = await download(page, '#saveOutput');
  expect(output.name).toBe('output.xml');
  expect(output.content).toBe(await getValue(page, 'output'));

  const xslt = await download(page, '#saveXslt');
  expect(xslt.name).toBe('transform.xsl');
  expect(xslt.content).toBe(await getValue(page, 'xslt'));

  const xml = await download(page, '#saveXml');
  expect(xml.name).toBe('input.xml');
  expect(xml.content).toBe(await getValue(page, 'xml'));
});

test('does not save an empty output', async ({ page }) => {
  await page.click('#saveOutput');
  await expectConsole(page, 'Er is nog geen output om op te slaan');
});

test('opens XML files, switches between them and saves under the file name', async ({ page }) => {
  await expect(page.locator('#inputFileSelect')).toBeHidden();
  await page.setInputFiles('#xmlFile', [
    { name: 'eerste.xml', mimeType: 'application/xml', buffer: Buffer.from('<persons><person id="9"><name>Eerste</name></person></persons>') },
    { name: 'tweede.xml', mimeType: 'application/xml', buffer: Buffer.from('<persons><person id="8"><name>Tweede</name></person></persons>') }
  ]);
  await expect(page.locator('#inputFileSelect')).toBeVisible();
  expect(await getValue(page, 'xml')).toContain('Eerste');
  expect((await download(page, '#saveXml')).name).toBe('eerste.xml');

  await page.selectOption('#inputFileSelect', { label: 'tweede.xml' });
  expect(await getValue(page, 'xml')).toContain('Tweede');

  await page.click('#run');
  await expect.poll(() => getValue(page, 'output')).toContain('Goedemorgen Tweede');
});

test('opens an XSLT file', async ({ page }) => {
  const content = stylesheet('<xsl:template match="/"><geladen/></xsl:template>');
  await page.setInputFiles('#xsltFile', { name: 'mijn.xsl', mimeType: 'application/xml', buffer: Buffer.from(content) });
  await expect.poll(() => getValue(page, 'xslt')).toBe(content);
  expect((await download(page, '#saveXslt')).name).toBe('mijn.xsl');
});

test('restores the previous session after a reload', async ({ page }) => {
  const marker = stylesheet('<xsl:template match="/"><hersteld/></xsl:template>');
  await setValue(page, 'xslt', marker);
  await page.locator('.param input').nth(1).fill('Bewaard');
  await expect(page.locator('#saveStatus')).toHaveText('Automatisch opgeslagen');

  await open(page, '/', 4);
  expect(await getValue(page, 'xslt')).toBe(marker);
  await expect(page.locator('.param input').nth(1)).toHaveValue('Bewaard');
  await expect(page.locator('#saveStatus')).toHaveText('Vorige sessie hersteld');
});

test('offers XSLT elements as completions', async ({ page }) => {
  await page.click('#xsltSnippets');
  await page.keyboard.type('xsl:temp');
  await expect(page.locator('.suggest-widget')).toContainText('xsl:template');
});

test('opens and closes the help dialog', async ({ page }) => {
  await page.click('#openHelp');
  await expect(page.locator('#helpDialog')).toBeVisible();
  await expect(page.locator('#helpDialog')).toContainText('xsl:message');
  await page.click('#closeHelp');
  await expect(page.locator('#helpDialog')).toBeHidden();
});
