import React, { useEffect } from 'react';
import { initializeJsonataWorkspace } from './jsonata-controller.js';
import { Columns, Console, Logo, Nav, ParametersPanel } from './App.jsx';

function JsonataHelpDialog() {
  return (
    <dialog id="helpDialog" aria-labelledby="helpTitle">
      <div className="help-header">
        <h2 id="helpTitle">JSONata Tester - Help</h2>
        <button className="small" id="closeHelp" aria-label="Help sluiten">Sluiten</button>
      </div>
      <div className="help-content">
        <h3>Een expressie uitvoeren</h3>
        <ol>
          <li>Plak JSON in <strong>Input JSON</strong> of kies <strong>Input openen</strong>.</li>
          <li>Schrijf een expressie in <strong>JSONata</strong>. De input is de context van de expressie.</li>
          <li>Voeg parameters toe met <strong>+</strong>. Een parameter is in de expressie beschikbaar als <code>$naam</code>. Een waarde die geldige JSON is wordt als JSON doorgegeven, anders als tekst.</li>
          <li>Kies <strong>Transformeren</strong> of druk op <kbd>Ctrl</kbd>+<kbd>Enter</kbd>.</li>
        </ol>
        <p>Alles wordt in de browser uitgevoerd; er is geen server nodig. Payload, expressie en parameters worden automatisch in deze browser opgeslagen, los van de andere pagina's.</p>
      </div>
    </dialog>
  );
}

export default function JsonataWorkspace() {
  useEffect(() => {
    initializeJsonataWorkspace();
  }, []);

  return (
    <>
      <header>
        <Logo />
        <h1>JSONata Tester</h1>
        <Nav />
        <button id="run">▶ Transformeren</button>
        <span className="hint">Ctrl+Enter</span>
        <span id="saveStatus" className="header-status" role="status" />
        <button className="small" id="openHelp" aria-haspopup="dialog" aria-controls="helpDialog">Help</button>
      </header>
      <Columns titles={['Input', 'Transform', 'Output']}>
        <>
          <ParametersPanel />
          <h2>
            Input JSON
            <span>
              <button className="small" id="uploadInput" title="Invoerbestand openen">Input openen</button>
              <button className="small" id="saveInput" title="Input als bestand opslaan">Opslaan</button>
              <input className="file-input" id="inputFile" type="file" accept=".json,.txt,application/json" />
            </span>
          </h2>
          <div id="input" className="editor" />
        </>
        <>
          <h2>
            JSONata
            <span>
              <button className="small" id="uploadExpression" title="JSONata-expressie openen">Expressie openen</button>
              <input className="file-input" id="expressionFile" type="file" accept=".jsonata,.txt" />
              <button className="small" id="saveExpression" title="Expressie als bestand opslaan">Opslaan</button>
            </span>
          </h2>
          <div id="expression" className="editor" />
        </>
        <>
          <h2>Output <button className="small" id="saveOutput" title="Output als bestand opslaan">Opslaan</button></h2>
          <div id="output" className="editor" />
          <Console />
        </>
      </Columns>
      <JsonataHelpDialog />
    </>
  );
}
