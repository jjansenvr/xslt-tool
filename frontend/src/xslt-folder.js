export const folderSupported = () => typeof window.showDirectoryPicker === 'function';

export async function openFolder() {
  const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
  const xslts = [];
  const xmls = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue;
    const lower = name.toLowerCase();
    const list = /\.(xsl|xslt)$/.test(lower) ? xslts : lower.endsWith('.xml') ? xmls : null;
    if (list) list.push({ name, handle, content: await (await handle.getFile()).text() });
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  return { name: dir.name, dir, xslts: xslts.sort(byName), xmls: xmls.sort(byName) };
}

export async function writeFile(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function createFile(dir, name, text) {
  try {
    await dir.getFileHandle(name);
    throw new Error(`${name} bestaat al in de map.`);
  } catch (e) {
    if (e.name !== 'NotFoundError') throw e;
  }
  const handle = await dir.getFileHandle(name, { create: true });
  await writeFile(handle, text);
  return handle;
}
