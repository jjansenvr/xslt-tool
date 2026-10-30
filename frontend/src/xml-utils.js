export const XSLT_NS = 'http://www.w3.org/1999/XSL/Transform';

// Source position of the element or attribute at `offset`, as an XPath. Unique siblings get no index.
export function getXPathAt(source, offset) {
  const limit = Math.min(offset, source.length);
  const roots = [];
  const stack = [];

  function tagEnd(start) {
    let quote = '';
    let subsetDepth = 0;
    for (let i = start + 1; i < source.length; i++) {
      const char = source[i];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '[') {
        subsetDepth++;
      } else if (char === ']') {
        subsetDepth = Math.max(0, subsetDepth - 1);
      } else if (char === '>' && subsetDepth === 0) {
        return i;
      }
    }
    return source.length - 1;
  }

  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start + 4);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', start)) {
      const end = source.indexOf(']]>', start + 9);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }

    const end = tagEnd(start);
    const tag = source.slice(start, end + 1);
    if (tag.startsWith('<?') || tag.startsWith('<!')) {
      cursor = end + 1;
      continue;
    }
    if (tag.startsWith('</')) {
      const closing = /^<\/([^\s>]+)/.exec(tag);
      if (closing) {
        while (stack.length) {
          const element = stack.pop();
          element.end = end + 1;
          if (element.name === closing[1]) break;
        }
      }
      cursor = end + 1;
      continue;
    }

    const opening = /^<([^\s/>]+)/.exec(tag);
    if (!opening) {
      cursor = end + 1;
      continue;
    }
    const element = {
      name: opening[1],
      start,
      openEnd: end + 1,
      end: source.length,
      attributes: {},
      children: []
    };
    const parent = stack[stack.length - 1];
    (parent ? parent.children : roots).push(element);
    const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    for (const match of tag.matchAll(attributePattern)) {
      element.attributes[match[1]] = match[2] ?? match[3] ?? '';
      const valueStart = start + match.index;
      const valueEnd = valueStart + match[0].length;
      if (limit >= valueStart && limit <= valueEnd) element.activeAttribute = match[1];
    }
    if (/\/\s*>$/.test(tag)) {
      element.end = end + 1;
    } else {
      stack.push(element);
    }
    cursor = end + 1;
  }

  const parsed = new DOMParser().parseFromString(source, 'application/xml');
  if (!parsed.querySelector('parsererror')) {
    const parsedElements = [...parsed.getElementsByTagName('*')];
    let index = 0;
    const addDecodedAttributes = element => {
      const parsedElement = parsedElements[index++];
      if (parsedElement && parsedElement.nodeName === element.name) {
        element.attributes = Object.fromEntries([...parsedElement.attributes].map(attribute => [attribute.name, attribute.value]));
      }
      element.children.forEach(addDecodedAttributes);
    };
    roots.forEach(addDecodedAttributes);
  }

  function quoteXPath(value) {
    if (!value.includes('"')) return `"${value}"`;
    if (!value.includes("'")) return `'${value}'`;
    return `concat(${value.split("'").map(part => `'${part}'`).join(`, "'", `)})`;
  }

  function segmentFor(element, siblings) {
    const sameName = siblings.filter(sibling => sibling.name === element.name);
    if (sameName.length < 2) return element.name;
    for (const [attribute, value] of Object.entries(element.attributes)) {
      if (sameName.every(sibling => sibling.attributes[attribute] !== undefined) &&
          sameName.filter(sibling => sibling.attributes[attribute] === value).length === 1) {
        return `${element.name}[@${attribute}=${quoteXPath(value)}]`;
      }
    }
    return `${element.name}[${sameName.indexOf(element) + 1}]`;
  }

  function findElement(elements, ancestors = []) {
    for (const element of elements) {
      if (limit >= element.start && limit <= element.end) {
        const segment = segmentFor(element, elements);
        const segments = [...ancestors.map(item => item.segment), segment];
        const elementPath = `/${segments.join('/')}`;
        if (element.activeAttribute && limit < element.openEnd) return `${elementPath}/@${element.activeAttribute}`;
        const child = findElement(element.children, [...ancestors, { segment }]);
        return child || elementPath;
      }
    }
    return '';
  }

  return findElement(roots) || '/';
}

// Maps each element of the parsed `doc` to its start/end offsets in the original `source`.
export function getElementSourceRanges(source, doc) {
  const elements = [...doc.getElementsByTagName('*')];
  const ranges = new Map();
  const stack = [];
  let elementIndex = 0;
  let cursor = 0;

  function tagEnd(start) {
    let quote = '';
    let subsetDepth = 0;
    for (let i = start + 1; i < source.length; i++) {
      const char = source[i];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '[') {
        subsetDepth++;
      } else if (char === ']') {
        subsetDepth = Math.max(0, subsetDepth - 1);
      } else if (char === '>' && subsetDepth === 0) {
        return i;
      }
    }
    return source.length - 1;
  }

  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start + 4);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', start)) {
      const end = source.indexOf(']]>', start + 9);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }

    const end = tagEnd(start);
    const tag = source.slice(start, end + 1);
    if (tag.startsWith('<?') || tag.startsWith('<!')) {
      cursor = end + 1;
      continue;
    }
    if (tag.startsWith('</')) {
      const closing = /^<\/([^\s>]+)/.exec(tag);
      if (closing) {
        while (stack.length) {
          const element = stack.pop();
          const range = ranges.get(element);
          range.end = end + 1;
          if (element.nodeName === closing[1]) break;
        }
      }
      cursor = end + 1;
      continue;
    }

    const opening = /^<([^\s/>]+)/.exec(tag);
    const element = elements[elementIndex++];
    if (opening && element && element.nodeName === opening[1]) {
      ranges.set(element, { start, openEnd: end + 1, end: end + 1 });
      if (!/\/\s*>$/.test(tag)) stack.push(element);
    }
    cursor = end + 1;
  }
  return ranges;
}

// Where and what to insert to declare a global xsl:param, or { exists: true } when it is already declared.
export function buildParamInsertion(source, name) {
  if (!/^[A-Za-z_][A-Za-z0-9._-]*(?::[A-Za-z_][A-Za-z0-9._-]*)?$/.test(name)) {
    throw new Error('Vul een geldige XML-naam in voor de parameter.');
  }

  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.namespaceURI !== XSLT_NS || !['stylesheet', 'transform'].includes(root.localName)) {
    throw new Error('De XSLT moet een geldige stylesheet of transform zijn om een parameter toe te voegen.');
  }
  if ([...root.children].some(child => child.namespaceURI === XSLT_NS && child.localName === 'param' && child.getAttribute('name') === name)) {
    return { exists: true };
  }

  const prefix = root.lookupPrefix(XSLT_NS);
  const outputTag = `${prefix ? `${prefix}:` : ''}output`;
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const outputPattern = new RegExp(
    `<${escapeRegExp(outputTag)}(?=[\\s/>])(?:[^>"']|"[^"]*"|'[^']*')*(?:\\/\\s*>|>\\s*<\\/${escapeRegExp(outputTag)}\\s*>)`
  );
  const outputMatch = outputPattern.exec(source);
  let insertionIndex;
  let indent;
  if (outputMatch) {
    insertionIndex = outputMatch.index + outputMatch[0].length;
    const lineStart = source.lastIndexOf('\n', outputMatch.index - 1) + 1;
    indent = /^[ \t]*/.exec(source.slice(lineStart, outputMatch.index))[0];
  } else {
    const rootPattern = new RegExp(
      `<${escapeRegExp(root.tagName)}(?=[\\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>`
    );
    const rootMatch = rootPattern.exec(source);
    if (!rootMatch) throw new Error('De openingstag van de stylesheet is niet gevonden.');
    insertionIndex = rootMatch.index + rootMatch[0].length;
    indent = '';
  }
  const paramTag = `${prefix ? `${prefix}:` : ''}param`;
  const paramLine = `<${paramTag} name="${name}"/>`;
  const followingContent = source.slice(insertionIndex);
  const insertion = `\n${indent}  ${paramLine}${/^\s/.test(followingContent) ? '' : `\n${indent}`}`;
  return { index: insertionIndex, text: insertion };
}
