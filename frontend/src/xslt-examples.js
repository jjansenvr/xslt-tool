const files = import.meta.glob('../examples/xslt/*/*', { query: '?raw', import: 'default', eager: true });

const folders = {};
for (const [path, content] of Object.entries(files)) {
  const [, folder, name] = path.match(/examples\/xslt\/([^/]+)\/([^/]+)$/);
  (folders[folder] ??= {})[name] = content;
}

export const XSLT_EXAMPLES = Object.keys(folders).sort().flatMap(folder => {
  const files = folders[folder];
  if (!files['transform.xsl']) return [];
  let meta = {};
  try { meta = JSON.parse(files['example.json'] || '{}'); } catch { /* ongeldige example.json: mapnaam als label */ }
  const inputs = Object.keys(files).filter(name => name.endsWith('.xml')).sort()
    .map(name => ({ id: `example-${folder}-${name}`, name, content: files[name] }));
  if (!inputs.length) return [];
  return [{
    label: meta.label || folder,
    detail: meta.detail || '',
    params: meta.params || [],
    xslt: files['transform.xsl'],
    inputs
  }];
});
