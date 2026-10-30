// JSON parser that keeps source offsets, so script references and payload positions can be mapped onto each other.
export function parseJsonWithPositions(source) {
  let i = 0;
  const fail = message => { throw new Error(`${message} (positie ${i})`); };
  const skipWhitespace = () => { while (i < source.length && /\s/.test(source[i])) i++; };
  function string() {
    const start = i++;
    while (i < source.length && source[i] !== '"') i += source[i] === '\\' ? 2 : 1;
    if (i >= source.length) fail('Onafgesloten string');
    i++;
    return JSON.parse(source.slice(start, i));
  }
  function value() {
    skipWhitespace();
    const start = i;
    if (source[i] === '{') {
      i++;
      const entries = [];
      skipWhitespace();
      if (source[i] === '}') { i++; return { type: 'object', start, rangeStart: start, end: i, entries }; }
      for (;;) {
        skipWhitespace();
        if (source[i] !== '"') fail('Sleutel verwacht');
        const keyStart = i;
        const key = string();
        skipWhitespace();
        if (source[i] !== ':') fail("':' verwacht");
        i++;
        const node = value();
        node.rangeStart = keyStart;
        entries.push({ key, node });
        skipWhitespace();
        if (source[i] === ',') { i++; continue; }
        if (source[i] === '}') { i++; return { type: 'object', start, rangeStart: start, end: i, entries }; }
        fail("',' of '}' verwacht");
      }
    }
    if (source[i] === '[') {
      i++;
      const items = [];
      skipWhitespace();
      if (source[i] === ']') { i++; return { type: 'array', start, rangeStart: start, end: i, items }; }
      for (;;) {
        items.push(value());
        skipWhitespace();
        if (source[i] === ',') { i++; continue; }
        if (source[i] === ']') { i++; return { type: 'array', start, rangeStart: start, end: i, items }; }
        fail("',' of ']' verwacht");
      }
    }
    if (source[i] === '"') {
      string();
      return { type: 'value', start, rangeStart: start, end: i };
    }
    const scalar = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(source.slice(i));
    if (!scalar) fail('Ongeldige waarde');
    i += scalar[0].length;
    return { type: 'value', start, rangeStart: start, end: i };
  }
  const root = value();
  skipWhitespace();
  if (i < source.length) fail('Onverwachte tekst na de JSON');
  return root;
}

export const JSONNET_KEYWORDS = new Set(['assert', 'else', 'error', 'false', 'for', 'function', 'if', 'import', 'importstr', 'importbin', 'in', 'local', 'null', 'self', 'super', 'tailstrict', 'then', 'true']);
export const keySegment = key => /^[A-Za-z_]\w*$/.test(key) && !JSONNET_KEYWORDS.has(key) ? `.${key}` : `[${JSON.stringify(key)}]`;

export function jsonPathAt(root, offset) {
  let path = 'payload';
  let node = root;
  for (;;) {
    let next = null;
    if (node.type === 'object') {
      const entry = node.entries.find(item => offset >= item.node.rangeStart && offset <= item.node.end);
      if (entry) { path += keySegment(entry.key); next = entry.node; }
    } else if (node.type === 'array') {
      const index = node.items.findIndex(item => offset >= item.start && offset <= item.end);
      if (index >= 0) { path += `[${index}]`; next = node.items[index]; }
    }
    if (!next) return path;
    node = next;
  }
}

// Resolves a script reference to payload nodes (or a parameter name), following `for x in ...` and `local x = ...` variables.
export const SEGMENT = String.raw`\s*\.\s*[A-Za-z_]\w*|\s*\[\s*(?:-?\d+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*\]`;
export const REFERENCE = String.raw`[A-Za-z_]\w*(?:${SEGMENT})*`;

export function parseReference(text) {
  const root = /^[A-Za-z_]\w*/.exec(text)[0];
  const segments = [];
  const pattern = new RegExp(SEGMENT, 'gy');
  pattern.lastIndex = root.length;
  let match;
  while ((match = pattern.exec(text))) {
    const part = match[0].trim();
    if (part.startsWith('.')) segments.push({ key: part.slice(1).trim(), end: pattern.lastIndex });
    else {
      const inner = part.slice(1, -1).trim();
      if (/^-?\d+$/.test(inner)) segments.push({ index: Number(inner), end: pattern.lastIndex });
      else segments.push({ key: inner.startsWith("'") ? inner.slice(1, -1).replace(/\\(.)/g, '$1') : JSON.parse(inner), end: pattern.lastIndex });
    }
  }
  return { root, segments };
}

// Finds the variable definition (`local x = ...` or `for x in ...`) that a reference root most likely refers to.
export function findDefinition(source, name, offset) {
  const definitions = [];
  const patterns = [
    { regex: new RegExp(String.raw`\bfor\s+(${'[A-Za-z_]\\w*'})\s+in\s+(${REFERENCE})`, 'g'), each: true },
    { regex: new RegExp(String.raw`\blocal\s+(${'[A-Za-z_]\\w*'})\s*=\s*(${REFERENCE})\s*[;,]`, 'g'), each: false }
  ];
  for (const { regex, each } of patterns) {
    for (const match of source.matchAll(regex)) {
      if (match[1] === name) definitions.push({ reference: match[2], offset: match.index, each });
    }
  }
  definitions.sort((a, b) => a.offset - b.offset);
  return definitions.filter(definition => definition.offset < offset).pop() || definitions.find(definition => definition.offset > offset);
}

export function resolveReference(source, reference, offset, payloadRoot, paramNames, depth = 0) {
  if (depth > 10) throw new Error('De referentie kan niet worden herleid.');
  const definition = findDefinition(source, reference.root, offset);
  let nodes;
  if (definition) {
    const resolved = resolveReference(source, parseReference(definition.reference), definition.offset, payloadRoot, paramNames, depth + 1);
    if (resolved.param) return resolved;
    nodes = definition.each
      ? resolved.nodes.flatMap(node => node.type === 'array' ? node.items : node.type === 'object' ? node.entries.map(entry => entry.node) : [])
      : resolved.nodes;
  } else if (paramNames.includes(reference.root)) {
    return { param: reference.root };
  } else if (reference.root === 'payload') {
    nodes = [payloadRoot()];
  } else {
    throw new Error(`"${reference.root}" is geen payload, parameter of herleidbare variabele.`);
  }

  for (const segment of reference.segments) {
    nodes = nodes.flatMap(node => {
      if ('index' in segment) return node.type === 'array' && node.items.at(segment.index) ? [node.items.at(segment.index)] : [];
      if (node.type !== 'object') return [];
      const entry = node.entries.find(item => item.key === segment.key);
      return entry ? [entry.node] : [];
    });
  }
  return { nodes };
}
