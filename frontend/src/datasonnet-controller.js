import { DATASONNET_SNIPPETS } from './datasonnet-snippets.js';
import { downloadText } from './download.js';

export function initializeDataSonnetWorkspace() {
  const MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
  window.MonacoEnvironment = {
    getWorkerUrl: () => URL.createObjectURL(new Blob(
      [`self.MonacoEnvironment={baseUrl:'${MONACO}/../'};importScripts('${MONACO}/base/worker/workerMain.js');`],
      { type: 'text/javascript' }))
  };
  require.config({ paths: { vs: MONACO } });

  const $ = id => document.getElementById(id);

  const SAMPLE_PAYLOAD = `{
  "persons": [
    { "id": 1, "name": "Jan" },
    { "id": 2, "name": "Piet" }
  ]
}`;

  const SAMPLE_SCRIPT = `{
  greetings: [
    { id: person.id, greeting: greeting + " " + person.name }
    for person in payload.persons
  ]
}`;

  const STATE_KEY = 'dataSonnetTesterState';
  const LANGUAGES = {
    'application/json': 'json',
    'application/xml': 'xml',
    'application/x-yaml': 'yaml',
    'text/csv': 'plaintext',
    'text/plain': 'plaintext'
  };

  let savedState = null;
  let scheduleSave = () => {};
  try {
    const state = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (state && typeof state === 'object') savedState = state;
  } catch (e) {
    $('saveStatus').textContent = `Eerder opgeslagen sessie kon niet worden geladen: ${e.message}`;
    $('saveStatus').classList.add('err');
  }

  const PARAM_TYPES = [['auto', 'Automatisch'], ['text', 'Tekst'], ['json', 'JSON'], ['xml', 'XML']];

  function addParam(name = '', value = '', type = 'auto') {
    const row = document.createElement('div');
    row.className = 'param';
    row.innerHTML = '<input placeholder="naam"><input placeholder="waarde"><select title="Type van de parameterwaarde"></select><button class="small remove-param" title="Verwijderen">×</button>';
    const [n, v] = row.querySelectorAll('input');
    const t = row.querySelector('select');
    t.replaceChildren(...PARAM_TYPES.map(([key, label]) => new Option(label, key)));
    n.value = name; v.value = value;
    t.value = PARAM_TYPES.some(([key]) => key === type) ? type : 'auto';
    row.querySelector('.remove-param').onclick = () => { row.remove(); scheduleSave(); };
    row.querySelectorAll('input, select').forEach(input => input.addEventListener('input', scheduleSave));
    $('params').appendChild(row);
    scheduleSave();
  }

  function getParams() {
    return [...document.querySelectorAll('.param')]
      .map(r => { const [n, v] = r.querySelectorAll('input'); return { name: n.value.trim(), value: v.value, type: r.querySelector('select').value }; })
      .filter(p => p.name);
  }

  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  function setStatus(text, cls) {
    window.dispatchEvent(new CustomEvent('app-notification', {
      detail: {
        source: 'outStatus',
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
    if (!monaco.languages.getLanguages().some(language => language.id === 'datasonnet')) {
      monaco.languages.register({ id: 'datasonnet' });
      monaco.languages.setMonarchTokensProvider('datasonnet', {
        keywords: ['local', 'function', 'if', 'then', 'else', 'for', 'in', 'import', 'importstr', 'error', 'assert', 'self', 'super', 'true', 'false', 'null', 'tailstrict'],
        tokenizer: {
          root: [
            [/\/\*/, 'comment', '@comment'],
            [/(\/\/|#).*$/, 'comment'],
            [/"([^"\\]|\\.)*"/, 'string'],
            [/'([^'\\]|\\.)*'/, 'string'],
            [/\|\|\|/, 'string', '@textBlock'],
            [/\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],
            [/[A-Za-z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
            [/[{}()[\]]/, '@brackets']
          ],
          comment: [[/\*\//, 'comment', '@pop'], [/./, 'comment']],
          textBlock: [[/\|\|\|/, 'string', '@pop'], [/./, 'string']]
        }
      });
      monaco.languages.setLanguageConfiguration('datasonnet', {
        comments: { lineComment: '//', blockComment: ['/*', '*/'] },
        brackets: [['{', '}'], ['[', ']'], ['(', ')']],
        autoClosingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' }, { open: '"', close: '"' }]
      });
    }

    if (typeof savedState?.inputType === 'string') $('inputType').value = savedState.inputType;
    if (typeof savedState?.outputType === 'string') $('outputType').value = savedState.outputType;

    const opts = { theme: 'vs-dark', automaticLayout: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false };
    const payloadEd = monaco.editor.create($('payload'), {
      ...opts,
      language: LANGUAGES[$('inputType').value],
      value: typeof savedState?.payload === 'string' ? savedState.payload : SAMPLE_PAYLOAD
    });
    const scriptEd = monaco.editor.create($('script'), {
      ...opts,
      language: 'datasonnet',
      value: typeof savedState?.script === 'string' ? savedState.script : SAMPLE_SCRIPT
    });
    const outEd = monaco.editor.create($('output'), { ...opts, language: LANGUAGES[$('outputType').value], value: '', readOnly: true });

    // JSON parser that keeps source offsets, so script references and payload positions can be mapped onto each other.
    function parseJsonWithPositions(source) {
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

    function parsePayload() {
      if ($('inputType').value !== 'application/json') throw new Error('Dit werkt alleen bij een JSON-payload.');
      try {
        return parseJsonWithPositions(payloadEd.getValue());
      } catch (e) {
        throw new Error(`De payload is geen geldige JSON: ${e.message}`);
      }
    }

    const JSONNET_KEYWORDS = new Set(['assert', 'else', 'error', 'false', 'for', 'function', 'if', 'import', 'importstr', 'importbin', 'in', 'local', 'null', 'self', 'super', 'tailstrict', 'then', 'true']);
    const keySegment = key => /^[A-Za-z_]\w*$/.test(key) && !JSONNET_KEYWORDS.has(key) ? `.${key}` : `[${JSON.stringify(key)}]`;

    function jsonPathAt(root, offset) {
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

    let payloadFileName = '';
    let scriptFileName = 'mapping.ds';

    // Runs after a snippet is inserted: loads its example input and selects the media types it needs.
    function applySnippet(_accessor, index) {
      const snippet = DATASONNET_SNIPPETS[index];
      $('inputType').value = snippet.inputType || 'application/json';
      $('inputType').onchange();
      $('outputType').value = snippet.outputType || 'application/json';
      $('outputType').onchange();
      payloadFileName = '';
      payloadEd.setValue(typeof snippet.payload === 'string' ? snippet.payload : JSON.stringify(snippet.payload, null, 2));
      setStatus(`Snippet "${snippet.label}" ingevoegd met voorbeeldinput (payload: ${$('inputType').selectedOptions[0].text}, output: ${$('outputType').selectedOptions[0].text}).`, 'ok');
    }
    monaco.editor.registerCommand('datasonnet.applySnippet', applySnippet);

    monaco.languages.registerCompletionItemProvider('datasonnet', {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        return {
          suggestions: DATASONNET_SNIPPETS.map((snippet, index) => ({
            label: snippet.label,
            detail: snippet.detail,
            documentation: { value: `Voorbeeldinput:\n\n\`\`\`\n${typeof snippet.payload === 'string' ? snippet.payload : JSON.stringify(snippet.payload, null, 2)}\n\`\`\`` },
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: snippet.insertText,
            sortText: String(index).padStart(3, '0'),
            command: { id: 'datasonnet.applySnippet', title: 'Voorbeeldinput laden', arguments: [index] },
            range
          }))
        };
      }
    });
    $('scriptSnippets').onclick = () => {
      scriptEd.focus();
      scriptEd.trigger('datasonnet-snippets', 'editor.action.triggerSuggest', {});
    };

    let payloadContextMenuPosition;
    payloadEd.onContextMenu(event => { payloadContextMenuPosition = event.target.position || payloadEd.getPosition(); });
    payloadEd.addAction({
      id: 'copy-payload-path',
      label: 'Copy path',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: async editor => {
        const position = payloadContextMenuPosition || editor.getPosition();
        payloadContextMenuPosition = null;
        let path;
        try {
          path = jsonPathAt(parsePayload(), editor.getModel().getOffsetAt(position));
        } catch (e) {
          setStatus(e.message, 'err');
          return;
        }
        try {
          await navigator.clipboard.writeText(path);
          setStatus(`Pad gekopieerd: ${path}`, 'ok');
        } catch (e) {
          setStatus(`Pad kopiëren is mislukt: ${e.message}`, 'err');
        }
      }
    });

    const SEGMENT = String.raw`\s*\.\s*[A-Za-z_]\w*|\s*\[\s*(?:-?\d+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*\]`;
    const REFERENCE = String.raw`[A-Za-z_]\w*(?:${SEGMENT})*`;

    function parseReference(text) {
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
    function findDefinition(source, name, offset) {
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

    function resolveReference(source, reference, offset, payloadRoot, depth = 0) {
      if (depth > 10) throw new Error('De referentie kan niet worden herleid.');
      const definition = findDefinition(source, reference.root, offset);
      let nodes;
      if (definition) {
        const resolved = resolveReference(source, parseReference(definition.reference), definition.offset, payloadRoot, depth + 1);
        if (resolved.param) return resolved;
        nodes = definition.each
          ? resolved.nodes.flatMap(node => node.type === 'array' ? node.items : node.type === 'object' ? node.entries.map(entry => entry.node) : [])
          : resolved.nodes;
      } else if (getParams().some(param => param.name === reference.root)) {
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

    let payloadDecorations = [];
    const clearHighlights = () => {
      payloadDecorations = payloadEd.deltaDecorations(payloadDecorations, []);
      document.querySelectorAll('.param.param-highlight').forEach(row => row.classList.remove('param-highlight'));
    };
    payloadEd.onDidChangeModelContent(() => { if (payloadDecorations.length) payloadDecorations = payloadEd.deltaDecorations(payloadDecorations, []); });
    payloadEd.addAction({
      id: 'clear-payload-highlight',
      label: 'Clear highlight',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 2,
      run: clearHighlights
    });

    let scriptContextMenuPosition;
    scriptEd.onContextMenu(event => { scriptContextMenuPosition = event.target.position || scriptEd.getPosition(); });
    scriptEd.addAction({
      id: 'highlight-reference',
      label: 'Highlight referentie in payload/parameter',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: editor => {
        clearHighlights();
        const position = scriptContextMenuPosition || editor.getPosition();
        scriptContextMenuPosition = null;
        const model = editor.getModel();
        const line = model.getLineContent(position.lineNumber);
        const column = position.column - 1;
        const match = [...line.matchAll(new RegExp(REFERENCE, 'g'))]
          .find(item => column >= item.index && column <= item.index + item[0].length);
        if (!match) {
          setStatus('Plaats de cursor op een referentie, bijvoorbeeld payload.persons of een parameternaam.', 'err');
          return;
        }

        // Only use the reference up to the segment under the cursor.
        const reference = parseReference(match[0]);
        reference.segments = reference.segments.filter((segment, index) =>
          index === 0 || match.index + reference.segments[index - 1].end <= column);
        if (column < match.index + reference.root.length) reference.segments = [];
        const text = match[0].slice(0, reference.segments.length ? reference.segments.at(-1).end : reference.root.length);

        let resolved;
        try {
          let payloadRoot;
          resolved = resolveReference(model.getValue(), reference, model.getOffsetAt(position), () => payloadRoot ??= parsePayload());
        } catch (e) {
          setStatus(e.message, 'err');
          return;
        }

        if (resolved.param) {
          const row = [...document.querySelectorAll('.param')].find(item => item.querySelector('input').value.trim() === resolved.param);
          row.classList.add('param-highlight');
          row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          row.querySelectorAll('input')[1].focus({ preventScroll: true });
          setStatus(`Invoer voor parameter "${resolved.param}" gemarkeerd.`, 'ok');
          return;
        }
        if (!resolved.nodes.length) {
          setStatus(`"${text}" komt niet voor in de payload.`, 'err');
          return;
        }

        const payloadModel = payloadEd.getModel();
        const decorations = resolved.nodes.map(node => {
          const start = payloadModel.getPositionAt(node.rangeStart);
          const end = payloadModel.getPositionAt(node.end);
          return {
            range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
            options: { className: 'json-scope-highlight' }
          };
        });
        payloadDecorations = payloadEd.deltaDecorations([], decorations);
        payloadEd.revealRangeInCenter(decorations[0].range);
        setStatus(`${decorations.length} plek(ken) in de payload gemarkeerd voor "${text}".`, 'ok');
      }
    });

    function saveState() {
      try {
        localStorage.setItem(STATE_KEY, JSON.stringify({
          payload: payloadEd.getValue(),
          script: scriptEd.getValue(),
          inputType: $('inputType').value,
          outputType: $('outputType').value,
          params: getParams()
        }));
        $('saveStatus').textContent = 'Automatisch opgeslagen';
        $('saveStatus').classList.remove('err');
      } catch (e) {
        $('saveStatus').textContent = `Opslaan mislukt: ${e.message}`;
        $('saveStatus').classList.add('err');
        setStatus(`Automatisch opslaan is mislukt: ${e.message}`, 'err');
      }
    }

    let saveTimer;
    scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveState, 300);
    };
    [payloadEd, scriptEd].forEach(editor => editor.onDidChangeModelContent(scheduleSave));
    window.addEventListener('pagehide', saveState);
    if (savedState) $('saveStatus').textContent = 'Vorige sessie hersteld';
    else addParam('greeting', 'Goedemorgen');
    if (Array.isArray(savedState?.params)) {
      $('params').replaceChildren();
      savedState.params.forEach(param => {
        if (param && typeof param.name === 'string' && typeof param.value === 'string') addParam(param.name, param.value, param.type);
      });
    }

    $('inputType').onchange = () => {
      monaco.editor.setModelLanguage(payloadEd.getModel(), LANGUAGES[$('inputType').value]);
      scheduleSave();
    };
    $('outputType').onchange = () => {
      monaco.editor.setModelLanguage(outEd.getModel(), LANGUAGES[$('outputType').value]);
      scheduleSave();
    };

    async function loadFile(input, editor, label) {
      const file = input.files[0];
      if (!file) return;
      try {
        editor.setValue(await file.text());
        setStatus(`${label} geladen: ${file.name}`, 'ok');
      } catch (e) {
        setStatus(`Bestand kon niet worden gelezen: ${e.message}`, 'err');
      } finally {
        input.value = '';
      }
    }
    $('uploadPayload').onclick = () => $('payloadFile').click();
    $('uploadScript').onclick = () => $('scriptFile').click();
    $('payloadFile').onchange = () => {
      if ($('payloadFile').files[0]) payloadFileName = $('payloadFile').files[0].name;
      loadFile($('payloadFile'), payloadEd, 'Payload');
    };
    $('scriptFile').onchange = () => {
      if ($('scriptFile').files[0]) scriptFileName = $('scriptFile').files[0].name;
      loadFile($('scriptFile'), scriptEd, 'DataSonnet-script');
    };

    const EXTENSIONS = { 'application/json': 'json', 'application/xml': 'xml', 'text/csv': 'csv', 'application/x-yaml': 'yaml', 'text/plain': 'txt' };
    $('savePayload').onclick = () => {
      const type = $('inputType').value;
      downloadText(payloadFileName || `payload.${EXTENSIONS[type]}`, payloadEd.getValue(), type);
    };
    $('saveScript').onclick = () => downloadText(scriptFileName, scriptEd.getValue());
    $('saveOutput').onclick = () => {
      const output = outEd.getValue();
      if (!output) {
        setStatus('Er is nog geen output om op te slaan. Voer eerst een transformatie uit.', 'err');
        return;
      }
      const type = $('outputType').value;
      downloadText(`output.${EXTENSIONS[type]}`, output, type);
    };

    async function run() {
      outEd.setValue('');
      setStatus('Bezig…');
      try {
        const data = await post('/api/datasonnet', {
          payload: payloadEd.getValue(),
          script: scriptEd.getValue(),
          inputType: $('inputType').value,
          outputType: $('outputType').value,
          params: getParams()
        });
        if (data.error) {
          setStatus(data.error, 'err');
        } else {
          outEd.setValue(data.output);
          setStatus('✓ Transformatie geslaagd' + (data.messages ? '\n' + data.messages : ''), 'ok');
        }
      } catch (e) {
        setStatus(e.message, 'err');
      }
    }

    $('run').onclick = run;
    document.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); run(); } });
    [payloadEd, scriptEd].forEach(ed => ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run));
  });
}
