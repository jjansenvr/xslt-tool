import { downloadText } from './download.js';

export function initializeLegacyWorkspace() {
const MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
    window.MonacoEnvironment = {
      getWorkerUrl: () => URL.createObjectURL(new Blob(
        [`self.MonacoEnvironment={baseUrl:'${MONACO}/../'};importScripts('${MONACO}/base/worker/workerMain.js');`],
        { type: 'text/javascript' }))
    };
    require.config({ paths: { vs: MONACO } });

    const $ = id => document.getElementById(id);

    const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<persons>
  <person id="1"><name>Jan</name></person>
  <person id="2"><name>Piet</name></person>
</persons>`;

    const SAMPLE_XSLT = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" indent="yes"/>
  <xsl:param name="greeting" select="'Hallo'"/>

  <xsl:template match="/persons">
    <greetings>
      <xsl:for-each select="person">
        <greeting id="{@id}"><xsl:value-of select="concat($greeting, ' ', name)"/></greeting>
      </xsl:for-each>
    </greetings>
  </xsl:template>
</xsl:stylesheet>`;

    const STATE_KEY = 'xsltTesterState';
    const XSLT_NS = 'http://www.w3.org/1999/XSL/Transform';
    let savedState = null;
    let scheduleSave = () => {};
    let addXsltParam = () => { throw new Error('De XSLT-editor wordt nog geladen.'); };
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      if (state && typeof state === 'object') savedState = state;
    } catch (e) {
      $('saveStatus').textContent = `Eerder opgeslagen sessie kon niet worden geladen: ${e.message}`;
      $('saveStatus').classList.add('err');
    }

    // Selected on settings.html; the server falls back to its default when empty.
    let saxon = '';
    try { saxon = localStorage.getItem('saxonVersion') || ''; } catch {}
    fetch('/api/saxon-versions').then(r => r.json()).then(d => {
      if (!d.versions.includes(saxon)) saxon = d.default;
      $('saxonVersion').textContent = saxon;
    });

    function addParam(name = '', value = '') {
      const row = document.createElement('div');
      row.className = 'param';
      row.innerHTML = '<input placeholder="naam"><input placeholder="waarde"><button class="small add-to-xslt" title="Als xsl:param aan XSLT toevoegen">→</button><button class="small remove-param" title="Verwijderen">×</button>';
      const [n, v] = row.querySelectorAll('input');
      n.value = name; v.value = value;
      row.querySelector('.add-to-xslt').onclick = () => {
        try {
          addXsltParam(n.value.trim());
        } catch (e) {
          setStatus($('outStatus'), e.message, 'err');
        }
      };
      row.querySelector('.remove-param').onclick = () => { row.remove(); scheduleSave(); };
      row.querySelectorAll('input').forEach(input => input.addEventListener('input', scheduleSave));
      $('params').appendChild(row);
      scheduleSave();
    }

    function getParams() {
      return [...document.querySelectorAll('.param')]
        .map(r => { const [n, v] = r.querySelectorAll('input'); return { name: n.value.trim(), value: v.value }; })
        .filter(p => p.name);
    }

    async function post(url, body) {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    }

    function setStatus(el, text, cls) {
      el.className = 'status ' + (cls || '');
      const source = el.id || 'app';
      const isValidationMessage = el.id === 'xsdStatus';

      if (isValidationMessage) {
        el.textContent = text;
        if (cls !== 'err') {
          window.dispatchEvent(new CustomEvent('app-notification', {
            detail: { source, message: '', type: 'info', duration: 0 }
          }));
          return;
        }
      } else {
        el.textContent = '';
      }

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          source,
          message: text,
          type: cls || 'info',
          duration: cls === 'ok' ? 4500 : cls === 'err' ? 12000 : 0
        }
      }));
    }

    $('openHelp').onclick = () => $('helpDialog').showModal();
    $('closeHelp').onclick = () => $('helpDialog').close();
    $('helpDialog').addEventListener('click', event => {
      if (event.target === $('helpDialog')) $('helpDialog').close();
    });

    $('addParam').onclick = () => addParam();

    require(['vs/editor/editor.main'], () => {
      const opts = { language: 'xml', theme: 'vs-dark', automaticLayout: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false };
      const xmlEd = monaco.editor.create($('xml'), { ...opts, value: typeof savedState?.xml === 'string' ? savedState.xml : SAMPLE_XML });
      const xsltEd = monaco.editor.create($('xslt'), { ...opts, value: typeof savedState?.xslt === 'string' ? savedState.xslt : SAMPLE_XSLT });
      const xsdEd = monaco.editor.create($('xsd'), { ...opts, value: typeof savedState?.xsd === 'string' ? savedState.xsd : '' });
      const outEd = monaco.editor.create($('output'), { ...opts, value: '', readOnly: true });

      function getXPathAt(source, offset) {
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

      let contextMenuPosition;
      xmlEd.onContextMenu(event => {
        contextMenuPosition = event.target.position || xmlEd.getPosition();
      });
      xmlEd.addAction({
        id: 'copy-xml-xpath',
        label: 'Copy XPath',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1,
        run: async editor => {
          const position = contextMenuPosition || editor.getPosition();
          contextMenuPosition = null;
          const xpath = getXPathAt(editor.getValue(), editor.getModel().getOffsetAt(position));
          if (!xpath || xpath === '/') {
            setStatus($('outStatus'), 'Op deze positie is geen XML-element gevonden.', 'err');
            return;
          }
          try {
            await navigator.clipboard.writeText(xpath);
            setStatus($('outStatus'), `XPath gekopieerd: ${xpath}`, 'ok');
          } catch (error) {
            setStatus($('outStatus'), `XPath kopiëren is mislukt: ${error.message}`, 'err');
          }
        }
      });

      function getElementSourceRanges(source, doc) {
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

      let xsltContextMenuPosition;
      const xsltParamContext = xsltEd.createContextKey('xsltParamContext', false);
      const xsltScopeContext = xsltEd.createContextKey('xsltScopeContext', false);

      function getXsltContextAt(position) {
        const source = xsltEd.getValue();
        const doc = new DOMParser().parseFromString(source, 'application/xml');
        if (doc.querySelector('parsererror')) return { isParam: false, hasScope: false };

        const offset = xsltEd.getModel().getOffsetAt(position);
        const ranges = getElementSourceRanges(source, doc);
        let target = null;
        let targetRange = null;
        for (const [element, range] of ranges) {
          if (offset >= range.start && offset <= range.openEnd &&
              (!targetRange || range.openEnd - range.start < targetRange.openEnd - targetRange.start)) {
            target = element;
            targetRange = range;
          }
        }
        if (!target || target.namespaceURI !== XSLT_NS) return { isParam: false, hasScope: false };

        const startTag = source.slice(targetRange.start, targetRange.openEnd);
        let isParam = target.localName === 'param' || target.localName === 'with-param';
        let hasScope = false;
        const attributePattern = /([^\s=/>]+)\s*=\s*(["'])([\s\S]*?)\2/g;
        for (const match of startTag.matchAll(attributePattern)) {
          const valueStart = targetRange.start + match.index + match[0].indexOf(match[3]);
          const valueEnd = valueStart + match[3].length;
          if (offset < valueStart || offset > valueEnd) continue;

          if (isParam && match[1] === 'name') return { isParam: true, hasScope: false };
          if (['select', 'match'].includes(match[1])) {
            const expressionOffset = offset - valueStart;
            const variablePattern = /\$([A-Za-z_][\w:.-]*(?::[A-Za-z_][\w:.-]*)?)/g;
            for (const variable of match[3].matchAll(variablePattern)) {
              if (expressionOffset >= variable.index && expressionOffset <= variable.index + variable[0].length) {
                return { isParam: true, hasScope: false };
              }
            }
            hasScope = !isParam;
          }
        }
        return { isParam, hasScope: hasScope && !isParam };
      }

      function updateXsltContext(position) {
        xsltContextMenuPosition = position || xsltEd.getPosition();
        const context = getXsltContextAt(xsltContextMenuPosition);
        xsltParamContext.set(context.isParam);
        xsltScopeContext.set(context.hasScope);
      }
      xsltEd.onDidChangeCursorPosition(event => updateXsltContext(event.position));
      xsltEd.onMouseDown(event => {
        if (event.event.rightButton) updateXsltContext(event.target.position);
      });
      xsltEd.onContextMenu(event => updateXsltContext(event.target.position));
      let xmlScopeDecorations = [];
      xmlEd.onDidChangeModelContent(() => {
        if (xmlScopeDecorations.length) xmlScopeDecorations = xmlEd.deltaDecorations(xmlScopeDecorations, []);
      });
      xmlEd.addAction({
        id: 'clear-xml-scope-highlight',
        label: 'Clear XML scope highlight',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 3,
        run: () => {
          xmlScopeDecorations = xmlEd.deltaDecorations(xmlScopeDecorations, []);
        }
      });
      xsltEd.addAction({
        id: 'highlight-xml-scope',
        label: 'Highlight XML scope',
        precondition: 'xsltScopeContext',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 2,
        run: editor => {
          xmlScopeDecorations = xmlEd.deltaDecorations(xmlScopeDecorations, []);
          const position = xsltContextMenuPosition || editor.getPosition();
          xsltContextMenuPosition = null;
          const xsltSource = editor.getValue();
          const stylesheet = new DOMParser().parseFromString(xsltSource, 'application/xml');
          if (stylesheet.querySelector('parsererror')) {
            setStatus($('outStatus'), 'De XSLT is ongeldig XML; de scope kan niet worden bepaald.', 'err');
            return;
          }

          const xsltRanges = getElementSourceRanges(xsltSource, stylesheet);
          const cursorOffset = editor.getModel().getOffsetAt(position);
          let instruction = null;
          for (const [element, range] of xsltRanges) {
            if (cursorOffset >= range.start && cursorOffset <= range.end &&
                element.namespaceURI === XSLT_NS &&
                (element.hasAttribute('select') || element.hasAttribute('match')) &&
                (!instruction || range.start >= xsltRanges.get(instruction).start)) {
              instruction = element;
            }
          }
          if (!instruction) {
            setStatus($('outStatus'), 'Geen xsl:select of xsl:template/@match gevonden op deze plek.', 'err');
            return;
          }

          const xmlSource = xmlEd.getValue();
          const xmlDoc = new DOMParser().parseFromString(xmlSource, 'application/xml');
          if (xmlDoc.querySelector('parsererror')) {
            setStatus($('outStatus'), 'De input-XML is ongeldig; de scope kan niet worden gemarkeerd.', 'err');
            return;
          }

          const namespaces = prefix => stylesheet.documentElement.lookupNamespaceURI(prefix);
          function evaluateNodes(expression, contextNodes) {
            const nodes = [];
            for (const contextNode of contextNodes) {
              const result = xmlDoc.evaluate(expression, contextNode, namespaces, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
              for (let index = 0; index < result.snapshotLength; index++) nodes.push(result.snapshotItem(index));
            }
            return nodes;
          }

          let selectedNodes;
          let expression;
          try {
            const ancestors = [];
            for (let element = instruction; element && element.nodeType === Node.ELEMENT_NODE; element = element.parentElement) {
              ancestors.unshift(element);
            }
            let contextNodes = [xmlDoc];
            for (const element of ancestors) {
              if (element === instruction) break;
              if (element.namespaceURI !== XSLT_NS) continue;
              if (element.localName === 'template' && element.hasAttribute('match')) {
                contextNodes = evaluateNodes(element.getAttribute('match'), [xmlDoc]);
              } else if (['for-each', 'for-each-group'].includes(element.localName) && element.hasAttribute('select')) {
                contextNodes = evaluateNodes(element.getAttribute('select'), contextNodes);
              }
            }
            if (instruction.hasAttribute('match')) {
              expression = instruction.getAttribute('match');
              selectedNodes = evaluateNodes(expression, [xmlDoc]);
            } else {
              expression = instruction.getAttribute('select');
              selectedNodes = evaluateNodes(expression, contextNodes);
            }
          } catch (error) {
            setStatus($('outStatus'), `XPath kan niet worden geëvalueerd: ${error.message}`, 'err');
            return;
          }

          const xmlRanges = getElementSourceRanges(xmlSource, xmlDoc);
          const matched = new Set();
          for (let node of selectedNodes) {
            if (node.nodeType === Node.DOCUMENT_NODE) node = node.documentElement;
            if (node.nodeType === Node.ATTRIBUTE_NODE || node.nodeType === Node.TEXT_NODE) node = node.parentElement;
            if (node.nodeType === Node.ELEMENT_NODE && xmlRanges.has(node)) matched.add(node);
          }
          if (!matched.size) {
            setStatus($('outStatus'), `De expressie "${expression}" heeft geen XML-elementen geselecteerd.`, 'err');
            return;
          }

          const model = xmlEd.getModel();
          const decorations = [...matched].map(element => {
            const range = xmlRanges.get(element);
            return {
              range: new monaco.Range(
                model.getPositionAt(range.start).lineNumber,
                model.getPositionAt(range.start).column,
                model.getPositionAt(range.end).lineNumber,
                model.getPositionAt(range.end).column
              ),
              options: { isWholeLine: true, className: 'xml-scope-highlight' }
            };
          });
          xmlScopeDecorations = xmlEd.deltaDecorations(xmlScopeDecorations, decorations);
          xmlEd.revealRangeInCenter(decorations[0].range);
          setStatus($('outStatus'), `${matched.size} XML-element(en) gemarkeerd voor "${expression}".`, 'ok');
        }
      });
      xsltEd.addAction({
        id: 'find-parameter-input',
        label: 'Highlight parameter input',
        precondition: 'xsltParamContext',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 3,
        run: editor => {
          document.querySelectorAll('.param.param-highlight').forEach(row => row.classList.remove('param-highlight'));
          const position = xsltContextMenuPosition || editor.getPosition();
          xsltContextMenuPosition = null;
          const model = editor.getModel();
          const selection = editor.getSelection();
          const selectedText = selection && !selection.isEmpty() ? model.getValueInRange(selection) : '';
          const line = model.getLineContent(position.lineNumber);
          const columnOffset = position.column - 1;
          let parameterName = '';
          const parameterReference = /\$([A-Za-z_][\w:.-]*(?::[A-Za-z_][\w:.-]*)?)/g;
          for (const match of line.matchAll(parameterReference)) {
            if (columnOffset >= match.index && columnOffset <= match.index + match[0].length) {
              parameterName = match[1];
              break;
            }
          }
          if (!parameterName) {
            const parameterAttribute = /\bname\s*=\s*(["'])([^"']+)\1/g;
            for (const match of line.matchAll(parameterAttribute)) {
              const nameOffset = match.index + match[0].lastIndexOf(match[2]);
              if (columnOffset >= nameOffset && columnOffset <= nameOffset + match[2].length) {
                parameterName = match[2];
                break;
              }
            }
          }
          if (!parameterName && selectedText) {
            parameterName = /^\$?([A-Za-z_][\w:.-]*(?::[A-Za-z_][\w:.-]*)?)$/.exec(selectedText.trim())?.[1] || '';
          }
          if (!parameterName) {
            setStatus($('outStatus'), 'Plaats de cursor op een parameternaam (bijvoorbeeld $naam) of selecteer de naam.', 'err');
            return;
          }

          const parameterRow = [...document.querySelectorAll('.param')].find(row => {
            const nameInput = row.querySelector('input');
            return nameInput.value.trim() === parameterName;
          });
          if (parameterRow) {
            parameterRow.classList.add('param-highlight');
            parameterRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            parameterRow.querySelectorAll('input')[1].focus({ preventScroll: true });
            setStatus($('outStatus'), `Invoer voor parameter "${parameterName}" gemarkeerd.`, 'ok');
            return;
          }

          const stylesheet = new DOMParser().parseFromString(editor.getValue(), 'application/xml');
          if (stylesheet.querySelector('parsererror')) {
            setStatus($('outStatus'), 'De XSLT is ongeldig XML; de parameter kan niet worden gevonden.', 'err');
            return;
          }
          const declaration = [...stylesheet.getElementsByTagName('*')].find(element =>
            element.namespaceURI === XSLT_NS &&
            element.localName === 'param' &&
            element.getAttribute('name') === parameterName
          );
          if (declaration && (declaration.hasAttribute('select') || declaration.childNodes.length)) {
            const defaultValue = declaration.hasAttribute('select')
              ? declaration.getAttribute('select')
              : 'de standaardinhoud';
            setStatus($('outStatus'), `Parameter "${parameterName}" is niet als invoer opgegeven; de standaardwaarde ${defaultValue} wordt gebruikt.`, 'ok');
          } else {
            setStatus($('outStatus'), `Parameter "${parameterName}" is niet als invoer opgegeven en heeft geen standaardwaarde.`, 'err');
          }
        }
      });

      const xsltCompletions = [
        { label: 'xsl:template', detail: 'Template met match-patroon', insertText: 'xsl:template match="${1:/}">\n\t$0\n</xsl:template>' },
        { label: 'xsl:apply-templates', detail: 'Pas templates toe op geselecteerde nodes', insertText: 'xsl:apply-templates select="${1:.}"/>' },
        { label: 'xsl:for-each', detail: 'Loop over geselecteerde nodes', insertText: 'xsl:for-each select="${1:select}">\n\t$0\n</xsl:for-each>' },
        { label: 'xsl:value-of', detail: 'Schrijf de waarde van een XPath-expressie', insertText: 'xsl:value-of select="${1:select}"/>' },
        { label: 'xsl:copy-of', detail: 'Kopieer geselecteerde nodes', insertText: 'xsl:copy-of select="${1:select}"/>' },
        { label: 'xsl:sequence', detail: 'Geef een reeks nodes of waarden terug', insertText: 'xsl:sequence select="${1:select}"/>' },
        { label: 'xsl:if', detail: 'Voorwaardelijk uitvoeren', insertText: 'xsl:if test="${1:test}">\n\t$0\n</xsl:if>' },
        { label: 'xsl:choose', detail: 'Meerdere voorwaarden met when en otherwise', insertText: 'xsl:choose>\n\t<xsl:when test="${1:test}">\n\t\t$0\n\t</xsl:when>\n\t<xsl:otherwise>\n\t</xsl:otherwise>\n</xsl:choose>' },
        { label: 'xsl:variable', detail: 'Declareer een variabele', insertText: 'xsl:variable name="${1:name}" select="${2:select}"/>' },
        { label: 'xsl:param', detail: 'Declareer een parameter zonder standaardwaarde', insertText: 'xsl:param name="${1:name}"/>' },
        { label: 'xsl:with-param', detail: 'Geef een parameter door aan een template', insertText: 'xsl:with-param name="${1:name}" select="${2:select}"/>' },
        { label: 'xsl:attribute', detail: 'Maak een attribuut aan', insertText: 'xsl:attribute name="${1:name}">${2:value}</xsl:attribute>' },
        { label: 'xsl:element', detail: 'Maak een element aan', insertText: 'xsl:element name="${1:name}">\n\t$0\n</xsl:element>' },
        { label: 'xsl:text', detail: 'Schrijf vaste tekst', insertText: 'xsl:text>$0</xsl:text>' },
        { label: 'xsl:stylesheet', detail: 'Volledige XSLT 3.0 stylesheet', insertText: 'xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">\n\t$0\n</xsl:stylesheet>' }
      ];
      const xpathFunctions = [
        'concat', 'contains', 'count', 'empty', 'exists', 'last', 'lower-case', 'matches',
        'normalize-space', 'not', 'number', 'position', 'replace', 'starts-with', 'string',
        'substring', 'sum', 'tokenize', 'upper-case'
      ];

      function xmlNames(source) {
        const elements = new Set();
        const attributes = new Set();
        const doc = new DOMParser().parseFromString(source, 'application/xml');
        if (!doc.querySelector('parsererror')) {
          doc.querySelectorAll('*').forEach(element => {
            elements.add(element.nodeName);
            [...element.attributes].forEach(attribute => attributes.add(attribute.name));
          });
        } else {
          for (const match of source.matchAll(/<([A-Za-z_][\w:.-]*)\b/g)) elements.add(match[1]);
          for (const match of source.matchAll(/\s([A-Za-z_][\w:.-]*)\s*=/g)) attributes.add(match[1]);
        }
        return { elements: [...elements], attributes: [...attributes] };
      }

      monaco.languages.registerCompletionItemProvider('xml', {
        triggerCharacters: ['<', ' ', ':', '$', '@'],
        provideCompletionItems(model, position) {
          const isXslt = model === xsltEd.getModel();
          const line = model.getLineContent(position.lineNumber);
          const beforeCursor = line.slice(0, position.column - 1);
          const ltIndex = beforeCursor.lastIndexOf('<');
          const afterOpen = ltIndex < 0 ? '' : beforeCursor.slice(ltIndex + 1);
          const word = /[\w:.-]*$/.exec(beforeCursor)[0];
          const wordStart = position.column - word.length;
          let items = [];
          let range;

          if (ltIndex >= 0 && !afterOpen.startsWith('/') && !afterOpen.includes('>')) {
            const tagHasAttributes = /\s/.test(afterOpen);
            if (isXslt && !tagHasAttributes) {
              range = new monaco.Range(position.lineNumber, ltIndex + 2, position.lineNumber, position.column);
              items = xsltCompletions.map(completion => ({
                label: completion.label,
                detail: completion.detail,
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: completion.insertText,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range
              }));
            } else if (isXslt && tagHasAttributes) {
              const attrs = ['as', 'match', 'mode', 'name', 'select', 'test', 'tunnel', 'use-when', 'version'];
              range = new monaco.Range(position.lineNumber, wordStart, position.lineNumber, position.column);
              items = attrs.map(attribute => ({
                label: attribute,
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: `${attribute}="$1"`,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range
              }));
            } else if (!isXslt && !tagHasAttributes) {
              const { elements } = xmlNames(xmlEd.getValue());
              range = new monaco.Range(position.lineNumber, ltIndex + 2, position.lineNumber, position.column);
              items = elements.map(element => ({
                label: element,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: `${element}>$0</${element}>`,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range
              }));
            } else if (!isXslt && tagHasAttributes) {
              const { attributes } = xmlNames(xmlEd.getValue());
              range = new monaco.Range(position.lineNumber, wordStart, position.lineNumber, position.column);
              items = attributes.map(attribute => ({
                label: attribute,
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: `${attribute}="$1"`,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range
              }));
            }
          } else if (isXslt) {
            range = new monaco.Range(position.lineNumber, wordStart, position.lineNumber, position.column);
            items = [
              ...xsltCompletions.map(completion => ({
                label: completion.label,
                detail: completion.detail,
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: `<${completion.insertText}`,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range
              })),
              ...xpathFunctions.map(name => ({
                label: name,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: name,
                range
              }))
            ];
          }
          return { suggestions: items };
        }
      });

      let inputFiles = Array.isArray(savedState?.inputFiles)
        ? savedState.inputFiles.filter(file => file && typeof file.id === 'string' && typeof file.name === 'string' && typeof file.content === 'string')
        : [];
      if (!inputFiles.length) {
        inputFiles = [{
          id: 'default-input',
          name: 'Input XML',
          content: typeof savedState?.xml === 'string' ? savedState.xml : SAMPLE_XML
        }];
      }
      let activeInputId = inputFiles.some(file => file.id === savedState?.activeInputId)
        ? savedState.activeInputId
        : inputFiles[0].id;
      const activeInput = () => inputFiles.find(file => file.id === activeInputId);
      xmlEd.setValue(activeInput().content);
      $('xsdToggle').checked = savedState?.xsdEnabled === true;
      document.querySelectorAll('.xsd').forEach(el => el.classList.toggle('hidden', !$('xsdToggle').checked));

      function updateInputSelector() {
        const select = $('inputFileSelect');
        select.replaceChildren(...inputFiles.map(file => {
          const option = document.createElement('option');
          option.value = file.id;
          option.textContent = file.name;
          return option;
        }));
        select.value = activeInputId;
        select.hidden = inputFiles.length < 2;
      }
      function rememberActiveInput() {
        const file = activeInput();
        if (file) file.content = xmlEd.getValue();
      }
      updateInputSelector();

      function saveState() {
        try {
          rememberActiveInput();
          localStorage.setItem(STATE_KEY, JSON.stringify({
            xml: xmlEd.getValue(),
            xslt: xsltEd.getValue(),
            xsd: xsdEd.getValue(),
            params: getParams(),
            xsdEnabled: $('xsdToggle').checked,
            inputFiles,
            activeInputId
          }));
          $('saveStatus').textContent = 'Automatisch opgeslagen';
          $('saveStatus').classList.remove('err');
        } catch (e) {
          $('saveStatus').textContent = `Opslaan mislukt: ${e.message}`;
          $('saveStatus').classList.add('err');
          window.dispatchEvent(new CustomEvent('app-notification', {
            detail: {
              source: 'saveStatus',
              message: `Automatisch opslaan is mislukt: ${e.message}`,
              type: 'err',
              duration: 12000
            }
          }));
        }
      }

      let saveTimer;
      scheduleSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveState, 300);
      };
      [xmlEd, xsltEd, xsdEd].forEach(editor => editor.onDidChangeModelContent(scheduleSave));
      window.addEventListener('pagehide', saveState);
      if (savedState) $('saveStatus').textContent = 'Vorige sessie hersteld';
      else addParam('greeting', 'Goedemorgen');
      if (Array.isArray(savedState?.params)) {
        $('params').replaceChildren();
        savedState.params.forEach(param => {
          if (param && typeof param.name === 'string' && typeof param.value === 'string') addParam(param.name, param.value);
        });
      }

      $('inputFileSelect').onchange = () => {
        rememberActiveInput();
        activeInputId = $('inputFileSelect').value;
        xmlEd.setValue(activeInput().content);
        scheduleSave();
        if ($('xsdToggle').checked) validate();
      };

      addXsltParam = function(name) {
        if (!/^[A-Za-z_][A-Za-z0-9._-]*(?::[A-Za-z_][A-Za-z0-9._-]*)?$/.test(name)) {
          throw new Error('Vul een geldige XML-naam in voor de parameter.');
        }

        const source = xsltEd.getValue();
        const doc = new DOMParser().parseFromString(source, 'application/xml');
        const root = doc.documentElement;
        if (doc.querySelector('parsererror') || root.namespaceURI !== XSLT_NS || !['stylesheet', 'transform'].includes(root.localName)) {
          throw new Error('De XSLT moet een geldige stylesheet of transform zijn om een parameter toe te voegen.');
        }
        if ([...root.children].some(child => child.namespaceURI === XSLT_NS && child.localName === 'param' && child.getAttribute('name') === name)) {
          setStatus($('outStatus'), `De globale parameter "${name}" staat al in de XSLT.`, 'ok');
          return;
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
        const position = xsltEd.getModel().getPositionAt(insertionIndex);
        xsltEd.executeEdits('add-xslt-param', [{
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          text: insertion,
          forceMoveMarkers: true
        }]);
        setStatus($('outStatus'), `Globale parameter "${name}" toegevoegd aan de XSLT.`, 'ok');
      };

      async function loadFile(input, editor, label) {
        const file = input.files[0];
        if (!file) return;
        try {
          editor.setValue(await file.text());
          setStatus($('outStatus'), `${label} geladen: ${file.name}`, 'ok');
        } catch (e) {
          setStatus($('outStatus'), `Bestand kon niet worden gelezen: ${e.message}`, 'err');
        } finally {
          input.value = '';
        }
      }
      $('uploadXml').onclick = () => $('xmlFile').click();
      $('uploadXslt').onclick = () => $('xsltFile').click();
      $('xmlFile').onchange = async () => {
        const files = [...$('xmlFile').files];
        if (!files.length) return;
        try {
          const loaded = await Promise.all(files.map(async file => ({
            id: `input-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            content: await file.text()
          })));
          rememberActiveInput();
          inputFiles.push(...loaded);
          activeInputId = loaded[0].id;
          xmlEd.setValue(loaded[0].content);
          updateInputSelector();
          scheduleSave();
          if ($('xsdToggle').checked) validate();
          setStatus($('outStatus'), `${loaded.length} XML-bestand${loaded.length === 1 ? '' : 'en'} geladen.`, 'ok');
        } catch (e) {
          setStatus($('outStatus'), `XML-bestand kon niet worden gelezen: ${e.message}`, 'err');
        } finally {
          $('xmlFile').value = '';
        }
      };
      let xsltFileName = 'transform.xsl';
      $('xsltFile').onchange = () => {
        if ($('xsltFile').files[0]) xsltFileName = $('xsltFile').files[0].name;
        loadFile($('xsltFile'), xsltEd, 'XSLT');
      };

      $('saveXml').onclick = () => {
        const name = activeInput().id === 'default-input' ? 'input.xml' : activeInput().name;
        downloadText(name, xmlEd.getValue(), 'application/xml');
      };
      $('saveXslt').onclick = () => downloadText(xsltFileName, xsltEd.getValue(), 'application/xml');
      $('saveOutput').onclick = () => {
        const output = outEd.getValue();
        if (!output) {
          setStatus($('outStatus'), 'Er is nog geen output om op te slaan. Voer eerst een transformatie uit.', 'err');
          return;
        }
        const isXml = output.trimStart().startsWith('<');
        downloadText(isXml ? 'output.xml' : 'output.txt', output, isXml ? 'application/xml' : 'text/plain');
      };

      async function run() {
        outEd.setValue('');
        setStatus($('outStatus'), 'Bezig…');
        try {
          const data = await post('/api/transform', { xml: xmlEd.getValue(), xslt: xsltEd.getValue(), params: getParams(), saxon });
          if (data.error) {
            outEd.setValue('');
            setStatus($('outStatus'), data.error, 'err');
          } else {
            outEd.setValue(data.output);
            setStatus($('outStatus'), '✓ Transformatie geslaagd' + (data.messages ? '\n' + data.messages : ''), 'ok');
          }
        } catch (e) {
          setStatus($('outStatus'), e.message, 'err');
        }
      }

      let timer;
      async function validate() {
        const model = xmlEd.getModel();
        if (!$('xsdToggle').checked) {
          monaco.editor.setModelMarkers(model, 'xsd', []);
          setStatus($('xsdStatus'), '');
          return;
        }
        try {
          const data = await post('/api/validate', { xml: xmlEd.getValue(), xsd: xsdEd.getValue() });
          monaco.editor.setModelMarkers(model, 'xsd', data.errors.map(e => ({
            severity: monaco.MarkerSeverity.Error,
            message: e.message,
            startLineNumber: e.line || 1,
            startColumn: Math.max(e.column, 1),
            endLineNumber: e.line || 1,
            endColumn: model.getLineMaxColumn(Math.min(e.line || 1, model.getLineCount()))
          })));
          if (data.schemaError) setStatus($('xsdStatus'), 'Ongeldig XSD: ' + data.schemaError, 'err');
          else if (data.errors.length) setStatus($('xsdStatus'), data.errors.map(e => `Regel ${e.line}: ${e.message}`).join('\n'), 'err');
          else setStatus($('xsdStatus'), '✓ Geldig volgens XSD', 'ok');
        } catch (e) {
          setStatus($('xsdStatus'), e.message, 'err');
        }
      }
      const validateSoon = () => { clearTimeout(timer); timer = setTimeout(validate, 400); };

      async function generateXsd() {
        try {
          const data = await post('/api/generate-xsd', { xml: xmlEd.getValue() });
          if (data.error) setStatus($('xsdStatus'), data.error, 'err');
          else xsdEd.setValue(data.xsd);
        } catch (e) {
          setStatus($('xsdStatus'), e.message, 'err');
        }
      }
      $('generateXsd').onclick = generateXsd;
      $('xsltSnippets').onclick = () => {
        xsltEd.focus();
        xsltEd.trigger('xslt-snippets', 'editor.action.triggerSuggest', {});
      };

      $('xsdToggle').onchange = async () => {
        document.querySelectorAll('.xsd').forEach(el => el.classList.toggle('hidden', !$('xsdToggle').checked));
        scheduleSave();
        if ($('xsdToggle').checked && !xsdEd.getValue().trim()) await generateXsd();
        validate();
      };
      xmlEd.onDidChangeModelContent(validateSoon);
      xsdEd.onDidChangeModelContent(validateSoon);

      $('run').onclick = run;
      document.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); run(); } });
      [xmlEd, xsltEd, xsdEd].forEach(ed => ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run));
      if ($('xsdToggle').checked) validate();
    });
}
