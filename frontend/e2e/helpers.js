import { expect } from '@playwright/test';

const editor = (page, id, body, arg) => page.evaluate(
  ([id, body, arg]) => {
    const found = monaco.editor.getEditors().find(item => item.getContainerDomNode().id === id);
    return new Function('editor', 'arg', body)(found, arg);
  },
  [id, body, arg]
);

// Opens a page and waits until Monaco has created all its editors.
export async function open(page, path, editors) {
  await page.goto(path);
  await page.waitForFunction(count => window.monaco && monaco.editor.getEditors().length >= count, editors);
}

export const setValue = (page, id, value) => editor(page, id, 'editor.setValue(arg)', value);
export const getValue = (page, id) => editor(page, id, 'return editor.getValue()');

// Puts the cursor at the first occurrence of `text` (plus `shift` characters) in an editor.
export const placeCursor = (page, id, text, shift = 1) => editor(page, id, `
  const model = editor.getModel();
  const offset = model.getValue().indexOf(arg.text);
  if (offset < 0) throw new Error('Tekst niet gevonden: ' + arg.text);
  editor.setPosition(model.getPositionAt(offset + arg.shift));
  editor.focus();
`, { text, shift });

export const runAction = (page, id, action) => editor(page, id, 'return editor.getAction(arg).run()', action);

export const consoleText = page => page.locator('.console-lines').innerText();

export const expectConsole = (page, text) => expect(page.locator('.console-lines')).toContainText(text);

export async function download(page, buttonSelector) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click(buttonSelector)]);
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { name: file.suggestedFilename(), content: Buffer.concat(chunks).toString('utf-8') };
}
