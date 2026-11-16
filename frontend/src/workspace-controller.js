import { monacoTheme } from './theme.js';
import { downloadText } from './download.js';
import { isPlayground, stateStorage } from './playground.js';
import { createFile, folderSupported, openFolder, writeFile } from './xslt-folder.js';
import { XSLT_EXAMPLES } from './xslt-examples.js';
import { XSLT_NS, buildParamInsertion, getElementSourceRanges, getXPathAt } from './xml-utils.js';

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
    let savedState = null;
    let scheduleSave = () => {};
    let addXsltParam = () => { throw new Error('De XSLT-editor wordt nog geladen.'); };
    try {
      const state = JSON.parse(stateStorage().getItem(STATE_KEY) || 'null');
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

    let lastValidationMessage = '';
    function setStatus(el, text, cls) {
      el.className = 'status ' + (cls || '');
      if (el.id === 'xsdStatus') {
        // Validation runs on every edit; only log it to the console when the result changes.
        el.textContent = text;
        if (text === lastValidationMessage) return;
        lastValidationMessage = text;
      } else {
        el.textContent = '';
      }
      if (!text) return;

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: { source: el.id || 'app', message: text, type: cls || 'info' }
      }));
    }

    $('openHelp').onclick = () => $('helpDialog').showModal();
    $('closeHelp').onclick = () => $('helpDialog').close();
    $('helpDialog').addEventListener('click', event => {
      if (event.target === $('helpDialog')) $('helpDialog').close();
    });

    $('addParam').onclick = () => addParam();

    require(['vs/editor/editor.main'], () => {
      const opts = { language: 'xml', theme: monacoTheme(), automaticLayout: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false };
      const xmlEd = monaco.editor.create($('xml'), { ...opts, value: typeof savedState?.xml === 'string' ? savedState.xml : SAMPLE_XML });
      const xsltEd = monaco.editor.create($('xslt'), { ...opts, value: typeof savedState?.xslt === 'string' ? savedState.xslt : SAMPLE_XSLT });
      const xsdEd = monaco.editor.create($('xsd'), { ...opts, value: typeof savedState?.xsd === 'string' ? savedState.xsd : '' });
      const outEd = monaco.editor.create($('output'), { ...opts, value: '', readOnly: true });

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

      let folder = null; // geopende map op disk (alleen reguliere editor)
      const validFiles = list => (Array.isArray(list)
        ? list.filter(file => file && typeof file.id === 'string' && typeof file.name === 'string' && typeof file.content === 'string')
        : []);
      let inputFiles = validFiles(savedState?.inputFiles);
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
      let xsltFiles = validFiles(savedState?.xsltFiles);
      if (!xsltFiles.length) xsltFiles = [{ id: 'default-xslt', name: 'transform.xsl', content: xsltEd.getValue() }];
      let activeXsltId = xsltFiles.some(file => file.id === savedState?.activeXsltId)
        ? savedState.activeXsltId
        : xsltFiles[0].id;
      const activeInput = () => inputFiles.find(file => file.id === activeInputId);
      const activeXslt = () => xsltFiles.find(file => file.id === activeXsltId);
      xmlEd.setValue(activeInput().content);
      xsltEd.setValue(activeXslt().content);
      $('xsdToggle').checked = savedState?.xsdEnabled === true;
      document.querySelectorAll('.xsd').forEach(el => el.classList.toggle('hidden', !$('xsdToggle').checked));

      // Bestanden met een `disk`-eigenschap zijn gekoppeld aan een bestand in de geopende map.
      const isDirty = (file, content) => !!file.disk && file.disk.saved !== content;
      const isDefault = file => file.id.startsWith('default-');

      function renderTabs(containerId, files, activeId, editor, isXslt) {
        const container = $(containerId);
        const tabs = files.map(file => {
          const content = file.id === activeId ? editor.getValue() : file.content;
          const dirty = isDirty(file, content);
          const tab = document.createElement('div');
          tab.className = `tab${file.id === activeId ? ' active' : ''}${dirty ? ' dirty' : ''}`;
          tab.setAttribute('role', 'tab');
          tab.setAttribute('aria-selected', String(file.id === activeId));
          tab.title = file.disk ? `${file.disk.folder}/${file.name}${dirty ? ' (niet opgeslagen)' : ''}` : `${file.name} (alleen in de browser)`;
          const name = document.createElement('span');
          name.className = 'tab-name';
          name.textContent = `${dirty ? '● ' : ''}${file.disk ? '📁 ' : ''}${isDefault(file) ? 'naamloos' : file.name}`;
          const close = document.createElement('button');
          close.className = 'tab-close';
          close.type = 'button';
          close.title = 'Bestand sluiten';
          close.setAttribute('aria-label', `${file.name} sluiten`);
          close.textContent = '×';
          close.onclick = event => { event.stopPropagation(); closeFile(isXslt, file.id); };
          tab.onclick = () => { if (file.id !== activeId) activateFile(isXslt, file.id); };
          tab.append(name, close);
          return tab;
        });
        const add = document.createElement('button');
        add.className = 'tab-new';
        add.type = 'button';
        add.title = folder ? `Nieuw ${isXslt ? 'XSLT' : 'XML'}-bestand in de geopende map` : `Nieuw ${isXslt ? 'XSLT' : 'XML'}-bestand (alleen in de browser)`;
        add.setAttribute('aria-label', add.title);
        add.textContent = '+';
        add.onclick = () => newFile(isXslt);
        container.replaceChildren(...tabs, add);
      }
      function updateBar(barId, file, editor) {
        const bar = $(barId);
        const name = isDefault(file) ? 'Naamloos' : file.name;
        if (isPlayground()) {
          bar.textContent = `Playground — ${name} · wordt niet bewaard, Opslaan downloadt het bestand`;
          bar.className = 'file-bar';
        } else if (file.disk) {
          const dirty = isDirty(file, editor.getValue());
          bar.textContent = `Op disk: ${file.disk.folder}/${file.name} · ${dirty ? '● niet opgeslagen' : 'opgeslagen'}`;
          bar.className = `file-bar ${dirty ? 'dirty' : 'disk'}`;
        } else {
          bar.textContent = `${name} · alleen in de browser, niet gekoppeld aan disk`;
          bar.className = 'file-bar';
        }
      }
      function updateBars() {
        renderTabs('xmlTabs', inputFiles, activeInputId, xmlEd, false);
        renderTabs('xsltTabs', xsltFiles, activeXsltId, xsltEd, true);
        updateBar('xmlBar', activeInput(), xmlEd);
        updateBar('xsltBar', activeXslt(), xsltEd);
      }
      function rememberActiveInput() {
        activeInput().content = xmlEd.getValue();
        activeXslt().content = xsltEd.getValue();
      }
      updateBars();

      function saveState() {
        try {
          rememberActiveInput();
          stateStorage().setItem(STATE_KEY, JSON.stringify({
            xml: xmlEd.getValue(),
            xslt: xsltEd.getValue(),
            xsd: xsdEd.getValue(),
            params: getParams(),
            xsdEnabled: $('xsdToggle').checked,
            inputFiles: inputFiles.map(({ id, name, content }) => ({ id, name, content })),
            activeInputId,
            xsltFiles: xsltFiles.map(({ id, name, content }) => ({ id, name, content })),
            activeXsltId
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
              type: 'err'
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
      [xmlEd, xsltEd].forEach(editor => editor.onDidChangeModelContent(updateBars));
      window.addEventListener('pagehide', saveState);
      if (savedState) $('saveStatus').textContent = 'Vorige sessie hersteld';
      else addParam('greeting', 'Goedemorgen');
      if (Array.isArray(savedState?.params)) {
        $('params').replaceChildren();
        savedState.params.forEach(param => {
          if (param && typeof param.name === 'string' && typeof param.value === 'string') addParam(param.name, param.value);
        });
      }

      function activateFile(isXslt, id) {
        rememberActiveInput();
        if (isXslt) {
          activeXsltId = id;
          xsltEd.setValue(activeXslt().content);
        } else {
          activeInputId = id;
          xmlEd.setValue(activeInput().content);
          if ($('xsdToggle').checked) validate();
        }
        updateBars();
        scheduleSave();
      }

      function closeFile(isXslt, id) {
        const files = isXslt ? xsltFiles : inputFiles;
        if (files.length < 2) {
          setStatus($('outStatus'), 'Het laatste bestand kan niet worden gesloten.', 'err');
          return;
        }
        rememberActiveInput();
        const file = files.find(item => item.id === id);
        if (isDirty(file, file.content) && !confirm(`${file.name} heeft niet-opgeslagen wijzigingen. Toch sluiten?`)) return;
        const index = files.indexOf(file);
        files.splice(index, 1);
        if ((isXslt ? activeXsltId : activeInputId) === id) {
          const next = files[Math.min(index, files.length - 1)];
          if (isXslt) {
            activeXsltId = next.id;
            xsltEd.setValue(next.content);
          } else {
            activeInputId = next.id;
            xmlEd.setValue(next.content);
            if ($('xsdToggle').checked) validate();
          }
        }
        updateBars();
        scheduleSave();
      }

      addXsltParam = function(name) {
        const result = buildParamInsertion(xsltEd.getValue(), name);
        if (result.exists) {
          setStatus($('outStatus'), `De globale parameter "${name}" staat al in de XSLT.`, 'ok');
          return;
        }
        const position = xsltEd.getModel().getPositionAt(result.index);
        xsltEd.executeEdits('add-xslt-param', [{
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          text: result.text,
          forceMoveMarkers: true
        }]);
        setStatus($('outStatus'), `Globale parameter "${name}" toegevoegd aan de XSLT.`, 'ok');
      };

      async function readUploads(input) {
        return Promise.all([...input.files].map(async file => ({
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          content: await file.text()
        })));
      }
      $('uploadXml').onclick = () => $('xmlFile').click();
      $('uploadXslt').onclick = () => $('xsltFile').click();
      $('xmlFile').onchange = async () => {
        try {
          const loaded = await readUploads($('xmlFile'));
          if (!loaded.length) return;
          rememberActiveInput();
          inputFiles.push(...loaded);
          activeInputId = loaded[0].id;
          xmlEd.setValue(loaded[0].content);
          updateBars();
          scheduleSave();
          if ($('xsdToggle').checked) validate();
          setStatus($('outStatus'), `${loaded.length} XML-bestand${loaded.length === 1 ? '' : 'en'} geladen.`, 'ok');
        } catch (e) {
          setStatus($('outStatus'), `XML-bestand kon niet worden gelezen: ${e.message}`, 'err');
        } finally {
          $('xmlFile').value = '';
        }
      };
      $('xsltFile').onchange = async () => {
        try {
          const loaded = await readUploads($('xsltFile'));
          if (!loaded.length) return;
          rememberActiveInput();
          xsltFiles.push(...loaded);
          activeXsltId = loaded[0].id;
          xsltEd.setValue(loaded[0].content);
          updateBars();
          scheduleSave();
          setStatus($('outStatus'), `${loaded.length} XSLT-bestand${loaded.length === 1 ? '' : 'en'} geladen.`, 'ok');
        } catch (e) {
          setStatus($('outStatus'), `XSLT-bestand kon niet worden gelezen: ${e.message}`, 'err');
        } finally {
          $('xsltFile').value = '';
        }
      };

      // Opslaan: naar disk als het bestand uit de geopende map komt, anders als download.
      async function saveActive(file, editor, fallbackName) {
        const content = editor.getValue();
        if (!file.disk) {
          downloadText(isDefault(file) ? fallbackName : file.name, content, 'application/xml');
          return;
        }
        try {
          await writeFile(file.disk.handle, content);
          file.disk.saved = content;
          file.content = content;
          updateBars();
          setStatus($('outStatus'), `Opgeslagen naar disk: ${file.disk.folder}/${file.name}`, 'ok');
        } catch (e) {
          setStatus($('outStatus'), `Opslaan naar disk is mislukt: ${e.message}`, 'err');
        }
      }
      $('saveXml').onclick = () => saveActive(activeInput(), xmlEd, 'input.xml');
      $('saveXslt').onclick = () => saveActive(activeXslt(), xsltEd, 'transform.xsl');
      xmlEd.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => $('saveXml').click());
      xsltEd.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => $('saveXslt').click());

      // Map op disk (alleen reguliere editor)
      const diskFile = (name, content, handle) => ({
        id: `disk-${folder.name}-${name}`,
        name,
        content,
        disk: { handle, folder: folder.name, saved: content }
      });
      const NEW_XSLT = '<?xml version="1.0" encoding="UTF-8"?>\n<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">\n  <xsl:output method="xml" indent="yes"/>\n\n</xsl:stylesheet>\n';
      const NEW_XML = '<?xml version="1.0" encoding="UTF-8"?>\n<root/>\n';
      function addFileEntry(isXslt, file) {
        rememberActiveInput();
        if (isXslt) {
          xsltFiles.push(file);
          activeXsltId = file.id;
          xsltEd.setValue(file.content);
        } else {
          inputFiles.push(file);
          activeInputId = file.id;
          xmlEd.setValue(file.content);
        }
        updateBars();
        scheduleSave();
      }
      // Met een geopende map wordt het bestand op disk aangemaakt, anders alleen in de browser.
      async function newFile(isXslt) {
        const content = isXslt ? NEW_XSLT : NEW_XML;
        const ext = isXslt ? '.xsl' : '.xml';
        if (!folder) {
          const count = (isXslt ? xsltFiles : inputFiles).length + 1;
          addFileEntry(isXslt, { id: `file-${Date.now()}`, name: `naamloos-${count}${ext}`, content });
          return;
        }
        let name = prompt(`Naam van het nieuwe ${isXslt ? 'XSLT' : 'XML'}-bestand in "${folder.name}":`)?.trim();
        if (!name) return;
        if (!(isXslt ? /\.(xsl|xslt)$/i : /\.xml$/i).test(name)) name += ext;
        try {
          addFileEntry(isXslt, diskFile(name, content, await createFile(folder.dir, name, content)));
          setStatus($('outStatus'), `Aangemaakt op disk: ${folder.name}/${name}`, 'ok');
        } catch (e) {
          setStatus($('outStatus'), `Bestand kon niet worden aangemaakt: ${e.message}`, 'err');
        }
      }

      if ($('openFolder')) {
        $('openFolder').onclick = async () => {
          if (!folderSupported()) {
            setStatus($('outStatus'), 'Een map openen wordt alleen ondersteund in Chrome en Edge.', 'err');
            return;
          }
          rememberActiveInput();
          if ([...inputFiles, ...xsltFiles].some(file => isDirty(file, file.content))
            && !confirm('Er zijn niet-opgeslagen wijzigingen in bestanden op disk. Toch een andere map openen?')) return;
          let result;
          try {
            result = await openFolder();
          } catch (e) {
            if (e.name !== 'AbortError') setStatus($('outStatus'), `Map kon niet worden geopend: ${e.message}`, 'err');
            return;
          }
          if (!result.xslts.length && !result.xmls.length) {
            setStatus($('outStatus'), `Geen .xsl-, .xslt- of .xml-bestanden gevonden in "${result.name}".`, 'err');
            return;
          }
          folder = result;
          if (result.xmls.length) {
            inputFiles = result.xmls.map(file => diskFile(file.name, file.content, file.handle));
            activeInputId = inputFiles[0].id;
            xmlEd.setValue(inputFiles[0].content);
          }
          if (result.xslts.length) {
            xsltFiles = result.xslts.map(file => diskFile(file.name, file.content, file.handle));
            activeXsltId = xsltFiles[0].id;
            xsltEd.setValue(xsltFiles[0].content);
          }
          $('folderName').textContent = `📁 ${result.name}`;
          updateBars();
          scheduleSave();
          if ($('xsdToggle').checked) validate();
          setStatus($('outStatus'), `Map "${result.name}" geopend: ${result.xslts.length} XSLT- en ${result.xmls.length} XML-bestand(en).`, 'ok');
        };

      }

      // Voorbeelden (alleen playground)
      if ($('exampleSelect')) {
        $('exampleSelect').append(...XSLT_EXAMPLES.map((example, index) => {
          const option = new Option(example.label, index);
          option.title = example.detail;
          return option;
        }));
        $('exampleSelect').onchange = () => {
          const example = XSLT_EXAMPLES[$('exampleSelect').value];
          $('exampleSelect').value = '';
          if (!example) return;
          inputFiles = example.inputs.map(file => ({ ...file }));
          activeInputId = inputFiles[0].id;
          xsltFiles = [{ id: 'example-xslt', name: 'transform.xsl', content: example.xslt }];
          activeXsltId = xsltFiles[0].id;
          xmlEd.setValue(inputFiles[0].content);
          xsltEd.setValue(example.xslt);
          $('params').replaceChildren();
          example.params.forEach(param => addParam(param.name, param.value));
          $('xsdToggle').checked = false;
          document.querySelectorAll('.xsd').forEach(el => el.classList.add('hidden'));
          updateBars();
          setStatus($('outStatus'), `Voorbeeld "${example.label}" geladen${example.detail ? `: ${example.detail}` : ''}.`, 'ok');
          scheduleSave();
        };
      }
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
        setStatus($('outStatus'), `Transformatie gestart met Saxon-HE ${saxon}…`);
        try {
          const data = await post('/api/transform', { xml: xmlEd.getValue(), xslt: xsltEd.getValue(), params: getParams(), saxon });
          if (data.error) {
            outEd.setValue('');
            setStatus($('outStatus'), data.error, 'err');
          } else {
            outEd.setValue(data.output);
            if (data.messages) setStatus($('outStatus'), data.messages.trimEnd(), 'message');
            setStatus($('outStatus'), '✓ Transformatie geslaagd', 'ok');
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
