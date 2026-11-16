import { monacoTheme } from './theme.js';
import { createFileTabs } from './file-tabs.js';
import jsonata from 'jsonata';
import { downloadText } from './download.js';
import { stateStorage } from './playground.js';
import JSONATA_EXAMPLES from './jsonata-examples.json';

export function initializeJsonataWorkspace() {
  const MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
  window.MonacoEnvironment = {
    getWorkerUrl: () => URL.createObjectURL(new Blob(
      [`self.MonacoEnvironment={baseUrl:'${MONACO}/../'};importScripts('${MONACO}/base/worker/workerMain.js');`],
      { type: 'text/javascript' }))
  };
  require.config({ paths: { vs: MONACO } });

  const $ = id => document.getElementById(id);

  const SAMPLE_INPUT = `{
  "persons": [
    { "id": 1, "name": "Jan" },
    { "id": 2, "name": "Piet" }
  ]
}`;
  const SAMPLE_EXPRESSION = `{
  "greetings": persons.{ "id": id, "greeting": $greeting & " " & name }
}`;

  const STATE_KEY = 'jsonataTesterState';
  let savedState = null;
  let scheduleSave = () => {};
  try {
    const state = JSON.parse(stateStorage().getItem(STATE_KEY) || 'null');
    if (state && typeof state === 'object') savedState = state;
  } catch (e) {
    $('saveStatus').textContent = `Eerder opgeslagen sessie kon niet worden geladen: ${e.message}`;
    $('saveStatus').classList.add('err');
  }

  function addParam(name = '', value = '') {
    const row = document.createElement('div');
    row.className = 'param';
    row.innerHTML = '<input placeholder="naam"><input placeholder="waarde (JSON of tekst)"><button class="small remove-param" title="Verwijderen">×</button>';
    const [n, v] = row.querySelectorAll('input');
    n.value = name; v.value = value;
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

  function setStatus(text, cls) {
    window.dispatchEvent(new CustomEvent('app-notification', {
      detail: { source: 'outStatus', message: text, type: cls || 'info' }
    }));
  }

  $('openHelp').onclick = () => $('helpDialog').showModal();
  $('closeHelp').onclick = () => $('helpDialog').close();
  $('helpDialog').addEventListener('click', event => {
    if (event.target === $('helpDialog')) $('helpDialog').close();
  });
  $('addParam').onclick = () => addParam();

  require(['vs/editor/editor.main'], () => {
    const opts = { theme: monacoTheme(), automaticLayout: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false };
    const inputEd = monaco.editor.create($('input'), {
      ...opts, language: 'json', value: typeof savedState?.input === 'string' ? savedState.input : SAMPLE_INPUT
    });
    const exprEd = monaco.editor.create($('expression'), {
      ...opts, language: 'plaintext', value: typeof savedState?.expression === 'string' ? savedState.expression : SAMPLE_EXPRESSION
    });
    const outEd = monaco.editor.create($('output'), { ...opts, language: 'json', value: '', readOnly: true });
    const inputTabs = createFileTabs({ container: $('inputTabs'), editor: inputEd, saved: savedState?.inputTabs, label: 'JSON', onChange: () => scheduleSave() });
    const exprTabs = createFileTabs({ container: $('expressionTabs'), editor: exprEd, saved: savedState?.expressionTabs, label: 'JSONata', onChange: () => scheduleSave() });

    function saveState() {
      try {
        stateStorage().setItem(STATE_KEY, JSON.stringify({
          input: inputEd.getValue(), expression: exprEd.getValue(), inputTabs: inputTabs.getState(), expressionTabs: exprTabs.getState(), params: getParams()
        }));
        $('saveStatus').textContent = 'Automatisch opgeslagen';
        $('saveStatus').classList.remove('err');
      } catch (e) {
        $('saveStatus').textContent = `Opslaan mislukt: ${e.message}`;
        $('saveStatus').classList.add('err');
      }
    }
    let saveTimer;
    scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveState, 300);
    };
    [inputEd, exprEd].forEach(editor => editor.onDidChangeModelContent(scheduleSave));
    window.addEventListener('pagehide', saveState);
    if (savedState) $('saveStatus').textContent = 'Vorige sessie hersteld';
    else addParam('greeting', 'Goedemorgen');
    if (Array.isArray(savedState?.params)) {
      $('params').replaceChildren();
      savedState.params.forEach(p => {
        if (p && typeof p.name === 'string' && typeof p.value === 'string') addParam(p.name, p.value);
      });
    }

    async function loadFile(input, tabs, label) {
      const file = input.files[0];
      if (!file) return;
      try {
        tabs.add(file.name, await file.text());
        setStatus(`${label} geladen: ${file.name}`, 'ok');
      } catch (e) {
        setStatus(`Bestand kon niet worden gelezen: ${e.message}`, 'err');
      } finally {
        input.value = '';
      }
    }
    $('uploadInput').onclick = () => $('inputFile').click();
    $('uploadExpression').onclick = () => $('expressionFile').click();
    $('inputFile').onchange = () => {
      loadFile($('inputFile'), inputTabs, 'Input');
    };
    $('expressionFile').onchange = () => {
      loadFile($('expressionFile'), exprTabs, 'JSONata-expressie');
    };
    $('saveInput').onclick = () => downloadText(inputTabs.activeName() || 'input.json', inputEd.getValue(), 'application/json');
    $('saveExpression').onclick = () => downloadText(exprTabs.activeName() || 'expression.jsonata', exprEd.getValue());
    $('saveOutput').onclick = () => {
      const output = outEd.getValue();
      if (!output) {
        setStatus('Er is nog geen output om op te slaan. Voer eerst een transformatie uit.', 'err');
        return;
      }
      downloadText('output.json', output, 'application/json');
    };

    $('exampleSelect').append(...JSONATA_EXAMPLES.map((example, index) => {
      const option = new Option(example.label, index);
      option.title = example.detail;
      return option;
    }));
    $('exampleSelect').onchange = () => {
      const example = JSONATA_EXAMPLES[$('exampleSelect').value];
      $('exampleSelect').value = '';
      if (!example) return;
      inputTabs.reset('', JSON.stringify(example.input, null, 2));
      exprTabs.reset('', example.expression);
      outEd.setValue('');
      $('params').replaceChildren();
      (example.params || []).forEach(p => addParam(p.name, p.value));
      setStatus(`Voorbeeld "${example.label}" geladen: ${example.detail}.`, 'ok');
    };

    async function run() {
      outEd.setValue('');
      setStatus('Evaluatie gestart…');
      try {
        let input;
        try {
          input = JSON.parse(inputEd.getValue());
        } catch (e) {
          throw new Error(`De input is geen geldige JSON: ${e.message}`);
        }
        const bindings = {};
        for (const { name, value } of getParams()) {
          try { bindings[name] = JSON.parse(value); } catch { bindings[name] = value; }
        }
        const result = await jsonata(exprEd.getValue()).evaluate(input, bindings);
        outEd.setValue(result === undefined ? '' : JSON.stringify(result, null, 2));
        setStatus(result === undefined ? '✓ Evaluatie geslaagd (geen resultaat)' : '✓ Evaluatie geslaagd', 'ok');
      } catch (e) {
        setStatus(e.position !== undefined ? `${e.message} (positie ${e.position})` : e.message, 'err');
      }
    }

    $('run').onclick = run;
    document.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); run(); } });
    [inputEd, exprEd].forEach(ed => ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run));
  });
}
