import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { initializeLegacyWorkspace } from './workspace-controller.js';
import { initializeDataSonnetWorkspace } from './datasonnet-controller.js';

function Nav() {
  const isDataSonnet = window.location.pathname === '/datasonnet';
  return (
    <nav className="page-nav">
      <a href="/" className={isDataSonnet ? '' : 'active'}>XSLT</a>
      <a href="/datasonnet" className={isDataSonnet ? 'active' : ''}>DataSonnet</a>
    </nav>
  );
}

function Header() {
  return (
    <header>
      <h1>XSLT Tester</h1>
      <Nav />
      <button id="run">▶ Transformeren</button>
      <span className="hint">Ctrl+Enter</span>
      <span id="saveStatus" className="header-status" role="status" />
      <button className="small" id="openHelp" aria-haspopup="dialog" aria-controls="helpDialog">Help</button>
      <a href="/settings" className="settings" title="Instellingen">⚙ Saxon <span id="saxonVersion" /></a>
    </header>
  );
}

function ParametersPanel() {
  return (
    <>
      <h2>Parameters <button className="small" id="addParam" title="Parameter toevoegen">+</button></h2>
      <div id="params" />
    </>
  );
}

function InputPanel() {
  return (
    <>
      <h2>
        Input XML
        <span>
          <button className="small" id="uploadXml" title="Een of meer XML-bestanden openen">XML openen</button>
          <button className="small" id="saveXml" title="Actieve XML-invoer als bestand opslaan">Opslaan</button>
          <input className="file-input" id="xmlFile" type="file" accept=".xml,.txt,application/xml,text/xml" multiple />
          <select className="input-file-select" id="inputFileSelect" aria-label="Actief XML-invoerbestand" />
          <label><input type="checkbox" id="xsdToggle" /> XSD genereren &amp; valideren</label>
        </span>
      </h2>
      <div id="xml" className="editor" />
      <div id="xsdStatus" className="status" />
      <h2 className="xsd hidden">XSD <button className="small" id="generateXsd" title="XSD opnieuw afleiden uit de input XML">Genereer uit XML</button></h2>
      <div id="xsd" className="editor xsd hidden" />
    </>
  );
}

function StylesheetPanel() {
  return (
    <>
      <h2>
        XSLT
        <span>
          <button className="small" id="uploadXslt" title="XSLT-bestand openen">XSLT openen</button>
          <button className="small" id="saveXslt" title="XSLT als bestand opslaan">Opslaan</button>
          <input className="file-input" id="xsltFile" type="file" accept=".xsl,.xslt,.xml,application/xml,text/xml" />
          <button className="small" id="xsltSnippets" title="XSLT-elementen en snippets tonen">Snippets</button>
        </span>
      </h2>
      <div id="xslt" className="editor" />
    </>
  );
}

function HelpDialog() {
  return (
    <dialog id="helpDialog" aria-labelledby="helpTitle">
      <div className="help-header">
        <h2 id="helpTitle">XSLT Tester - Help</h2>
        <button className="small" id="closeHelp" aria-label="Help sluiten">Sluiten</button>
      </div>
      <div className="help-content">
        <h3>Een transformatie uitvoeren</h3>
        <ol>
          <li>Plak XML in <strong>Input XML</strong> of kies <strong>XML openen</strong> om een of meer lokale bestanden te laden. Gebruik de keuzelijst om tussen geladen bestanden te wisselen.</li>
          <li>Plak een stylesheet in <strong>XSLT</strong> of kies <strong>XSLT openen</strong> om een lokaal <code>.xsl</code>- of <code>.xslt</code>-bestand te laden.</li>
          <li>Voeg parameters toe met <strong>+</strong>. Vul hun naam en waarde in. De pijl voegt een globale <code>xsl:param</code>-declaratie toe aan de stylesheet.</li>
          <li>Kies <strong>Transformeren</strong> of druk op <kbd>Ctrl</kbd>+<kbd>Enter</kbd>. De vorige output wordt eerst gewist. Meldingen, fouten en <code>xsl:message</code>-uitvoer verschijnen in de <strong>Console</strong> onder de output; met <strong>Wissen</strong> maak je die leeg.</li>
        </ol>
        <p>Er staan voorbeeld-XML, een XSLT 3.0-stylesheet en de parameter <code>greeting</code> klaar om mee te beginnen.</p>
        <h3>Autocomplete en XSLT-snippets</h3>
        <p>De XML-editor kan element- en attribuutnamen uit de actieve input voorstellen. In de XSLT-editor open je suggesties met <kbd>Ctrl</kbd>+<kbd>Space</kbd> of de knop <strong>Snippets</strong>. Daar vind je veelgebruikte XSLT-elementen, templates en XPath-functies.</p>
        <h3>Debuggen met xsl:message</h3>
        <p>Met <code>xsl:message</code> schrijf je waarden naar de <strong>Console</strong> (gele regels), zonder dat de output verandert:</p>
        <pre>{`<xsl:message terminate="no">
  <xsl:value-of select="persoon/achternaam"/>
</xsl:message>`}</pre>
        <p>In XSLT 3.0 kan het ook met accolades, maar alleen als <code>expand-text="yes"</code> staat (op <code>xsl:stylesheet</code> of op de <code>xsl:message</code> zelf):</p>
        <pre>{`<xsl:stylesheet version="3.0" expand-text="yes" ...>
  <xsl:message terminate="no">
    {persoon/achternaam}
  </xsl:message>`}</pre>
        <p>Zonder <code>expand-text="yes"</code> worden de accolades niet uitgerekend en toont de Console letterlijk <code>{'{persoon/achternaam}'}</code>.</p>
        <ul>
          <li>Zet er een label voor om de regel te herkennen: <code>{'achternaam: <xsl:value-of .../>'}</code>.</li>
          <li><code>terminate="yes"</code> stopt de transformatie op die plek en toont de melding als fout. Zo zie je of een template wel wordt bereikt.</li>
          <li>Een message in een template of <code>xsl:for-each</code> geeft een regel per element.</li>
          <li>Toon <code>count(...)</code> of <code>exists(...)</code> om te zien wat een XPath selecteert. Een lege regel betekent dat er niets is geselecteerd.</li>
          <li>Gebruik <strong>Highlight XML scope</strong> om te zien welke XML-elementen een <code>select</code> of <code>match</code> selecteert.</li>
          <li>Haal de messages weg als je klaar bent: Frank!Framework schrijft ze ook naar het logbestand.</li>
        </ul>
        <h3>Contextmenu's</h3>
        <ul>
          <li>Rechtsklik in de XML-editor en kies <strong>Copy XPath</strong> om het XPath van de element- of attribuutlocatie te kopiëren. Unieke elementen krijgen geen index. Herhaalde elementen gebruiken waar mogelijk een uniek attribuut, anders een index.</li>
          <li>Rechtsklik in een XSLT-<code>select</code> of <code>match</code>-expressie om <strong>Highlight XML scope</strong> te zien en de geselecteerde XML-elementen te markeren.</li>
          <li>Rechtsklik op een parametervoorbeeld zoals <code>$greeting</code> of een parameterdeclaratie voor <strong>Highlight parameter input</strong>. De bijbehorende parameterinvoer wordt gemarkeerd. Ontbreekt invoer, dan meldt de app of de stylesheet een standaardwaarde gebruikt.</li>
          <li>Gebruik <strong>Clear XML scope highlight</strong> in het XML-contextmenu om markeringen te wissen.</li>
        </ul>
        <p>Scope-highlighting gebruikt de XPath 1.0-evaluator van de browser. XPath 2.0/3.0-specifieke expressies kunnen daardoor niet worden gemarkeerd.</p>
        <h3>XML valideren met XSD</h3>
        <ol>
          <li>Schakel <strong>XSD genereren &amp; valideren</strong> in. Er wordt een beginschema afgeleid van de actieve XML.</li>
          <li>Pas het schema aan indien nodig. Wijzigingen in XML en XSD worden automatisch gevalideerd.</li>
          <li>Kies <strong>Genereer uit XML</strong> om het schema opnieuw af te leiden.</li>
        </ol>
        <p>Het gegenereerde schema is gebaseerd op het voorbeeld en is een startpunt; controleer het voordat je het gebruikt voor andere documenten.</p>
        <h3>Opslaan en Saxon</h3>
        <p>Met <strong>Opslaan</strong> bij Input XML, XSLT en Output download je de inhoud als bestand. Geopende bestanden houden hun naam; anders heten ze <code>input.xml</code>, <code>transform.xsl</code> en <code>output.xml</code> (of <code>output.txt</code> bij output die geen XML is).</p>
        <p>XML-bestanden, de actieve input, XSLT, XSD en parameters worden automatisch in deze browser opgeslagen en hersteld bij een volgend bezoek op hetzelfde adres, ook na een Docker-herstart. De opslag wordt niet gedeeld met andere browsers of computers. De transformatie-output wordt niet opgeslagen.</p>
        <p>Kies <strong>Saxon</strong> rechtsboven om een beschikbare Saxon-HE-versie te selecteren. Die keuze wordt ook in deze browser bewaard.</p>
        <p>De editor laadt Monaco vanaf jsDelivr; internettoegang is nodig om de editor te laden.</p>
      </div>
    </dialog>
  );
}

function Console() {
  const [lines, setLines] = useState([]);
  const container = useRef(null);
  const nextId = useRef(0);

  useEffect(() => {
    function log(event) {
      const { message, type } = event.detail;
      if (!message) return;
      const time = new Date().toLocaleTimeString('nl-NL');
      setLines(current => [...current.slice(-499), { id: nextId.current++, time, message, type }]);
    }
    window.addEventListener('app-notification', log);
    return () => window.removeEventListener('app-notification', log);
  }, []);

  useEffect(() => {
    if (container.current) container.current.scrollTop = container.current.scrollHeight;
  }, [lines]);

  return (
    <div className="console">
      <h2>Console <button className="small" type="button" onClick={() => setLines([])} title="Console leegmaken">Wissen</button></h2>
      <div className="console-lines" ref={container} role="log" aria-live="polite">
        {lines.map(line => (
          <div key={line.id} className={`console-line console-${line.type}`}>
            <span className="console-time">{line.time}</span>
            <span className="console-text">{line.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Workspace() {
  useEffect(() => {
    initializeLegacyWorkspace();
  }, []);

  return (
    <>
      <Header />
      <main className="workspace">
        <section>
          <ParametersPanel />
          <InputPanel />
        </section>
        <section>
          <StylesheetPanel />
        </section>
        <section>
          <h2>Output <button className="small" id="saveOutput" title="Output als bestand opslaan">Opslaan</button></h2>
          <div id="output" className="editor" />
          <div id="outStatus" className="hidden" />
          <Console />
        </section>
      </main>
      <HelpDialog />
    </>
  );
}

function SettingsPage() {
  const [versions, setVersions] = useState([]);
  const [selected, setSelected] = useState('');
  const [defaultVersion, setDefaultVersion] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    fetch('/api/saxon-versions')
      .then(response => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
      })
      .then(data => {
        let current = '';
        try {
          current = localStorage.getItem('saxonVersion') || '';
        } catch (storageError) {
          setError(`Browseropslag is niet beschikbaar: ${storageError.message}`);
        }
        const version = data.versions.includes(current) ? current : data.default;
        setVersions(data.versions);
        setDefaultVersion(data.default);
        setSelected(version);
      })
      .catch(fetchError => setError(`Saxon-versies konden niet worden geladen: ${fetchError.message}`));
  }, []);

  function chooseVersion(version) {
    try {
      localStorage.setItem('saxonVersion', version);
      setSelected(version);
      setSaved(`✓ Saxon-HE ${version} wordt gebruikt`);
      setError('');
    } catch (storageError) {
      setError(`Saxon-versie kon niet worden opgeslagen: ${storageError.message}`);
    }
  }

  return (
    <div className="settings-page">
      <header><a href="/">← Terug</a><h1>Instellingen</h1></header>
      <main>
        <h2>Saxon-HE versie voor de mapping</h2>
        <p className="hint">Frank!Framework gebruikt Saxon-HE 10.9 als standaard. Deze tool gebruikt dezelfde versie standaard.</p>
        {versions.map(version => (
          <label key={version}>
            <input type="radio" name="saxon" value={version} checked={selected === version} onChange={() => chooseVersion(version)} />
            Saxon-HE {version}{version === defaultVersion && <span className="hint">(standaard)</span>}
          </label>
        ))}
        {saved && <p className="ok">{saved}</p>}
        {error && <p className="err" role="alert">{error}</p>}
        <p className="hint">Extra versies voeg je toe door een map met de Saxon-HE jar (en eventuele dependencies) in <code>/opt/saxon/&lt;versie&gt;</code> te zetten, bijvoorbeeld via een volume.</p>
      </main>
    </div>
  );
}

const MEDIA_TYPES = [
  ['application/json', 'JSON'],
  ['application/xml', 'XML'],
  ['text/csv', 'CSV'],
  ['application/x-yaml', 'YAML'],
  ['text/plain', 'Tekst']
];

function MediaTypeSelect({ id, label, defaultValue }) {
  return (
    <select className="input-file-select" id={id} aria-label={label} defaultValue={defaultValue}>
      {MEDIA_TYPES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
    </select>
  );
}

function DataSonnetHelpDialog() {
  return (
    <dialog id="helpDialog" aria-labelledby="helpTitle">
      <div className="help-header">
        <h2 id="helpTitle">DataSonnet Tester - Help</h2>
        <button className="small" id="closeHelp" aria-label="Help sluiten">Sluiten</button>
      </div>
      <div className="help-content">
        <h3>Een transformatie uitvoeren</h3>
        <ol>
          <li>Plak de invoer in <strong>Payload</strong> of kies <strong>Payload openen</strong>. Kies het formaat van de invoer (JSON, XML, CSV, YAML of tekst).</li>
          <li>Plak een script in <strong>DataSonnet</strong> of kies <strong>Script openen</strong>. De invoer is in het script beschikbaar als <code>payload</code>.</li>
          <li>Voeg parameters toe met <strong>+</strong>. Elke parameter is in het script beschikbaar als variabele met dezelfde naam, bijvoorbeeld <code>greeting</code>.</li>
          <li>Kies het outputformaat en daarna <strong>Transformeren</strong> of druk op <kbd>Ctrl</kbd>+<kbd>Enter</kbd>.</li>
        </ol>
        <p>Het formaat van payload en output kies je in de keuzelijsten. Een header in het script, zoals <code>/** DataSonnet version=2.0 input payload text/csv; Separator="|" */</code>, stelt alleen opties in voor het formaat dat al gekozen is; het mediatype in de header moet daarom gelijk zijn aan de keuze in de lijst.</p>
        <h3>Voorbeelden</h3>
        <p>Met <strong>Voorbeeld laden…</strong> bij het script kies je een voorbeeld uit het <a href="https://datasonnet.github.io/datasonnet-mapper/datasonnet/latest/cookbook.html" target="_blank" rel="noreferrer">DataSonnet cookbook</a>. Een voorbeeld bestaat uit een payload en een DataSonnet-script die samen werken: beide worden vervangen, de keuzelijsten voor payload en output worden op het juiste formaat gezet en je kunt het voorbeeld direct uitvoeren. Sla je eigen werk eerst op als je het wilt bewaren.</p>
        <h3>Parametertypes</h3>
        <p>Net als de Frank!Framework <code>DataSonnetPipe</code> bepaalt <strong>Automatisch</strong> het type aan de hand van de waarde: begint die met <code>{'{'}</code> of <code>[</code>, dan wordt het JSON; begint die met <code>&lt;</code>, dan XML; anders tekst. Een JSON- of XML-parameter kun je in het script als object gebruiken, bijvoorbeeld <code>klant.naam</code>. Bij XML staat de tekst van een element onder <code>["$"]</code>, bijvoorbeeld <code>klant.root.naam["$"]</code>.</p>
        <p>Kies <strong>JSON</strong> voor getallen en booleans (<code>123</code>, <code>true</code>), <strong>Tekst</strong> om JSON- of XML-achtige waarden juist als string door te geven.</p>
        <p>Meldingen en fouten verschijnen in de <strong>Console</strong> onder de output; met <strong>Wissen</strong> maak je die leeg.</p>
        <p>Voor XML-output moet het resultaat een object met precies één root-element zijn.</p>
        <h3>Contextmenu's</h3>
        <ul>
          <li>Rechtsklik in een JSON-payload en kies <strong>Copy path</strong> om het DataSonnet-pad van die plek te kopiëren, bijvoorbeeld <code>payload.persons[1].name</code>.</li>
          <li>Rechtsklik in het script op een referentie zoals <code>payload.persons</code> of een parameternaam en kies <strong>Highlight referentie in payload/parameter</strong>. De bijbehorende plekken in de payload of de parameterinvoer worden gemarkeerd. Variabelen uit <code>for p in payload.persons</code> en <code>local x = payload.a</code> worden gevolgd, dus <code>p.name</code> markeert de naam van elke persoon.</li>
          <li>Gebruik <strong>Clear highlight</strong> in het contextmenu van de payload om markeringen te wissen.</li>
        </ul>
        <p>Deze functies werken alleen bij een JSON-payload. Referenties via functies, zoals <code>std.map</code>, worden niet herleid.</p>
        <h3>Opslaan</h3>
        <p>Met <strong>Opslaan</strong> bij Payload, DataSonnet en Output download je de inhoud als bestand. Een geopend bestand houdt zijn naam; anders krijgt het bestand een naam met een extensie die past bij het gekozen formaat, zoals <code>payload.json</code>, <code>mapping.ds</code> of <code>output.xml</code>.</p>
        <p>Payload, script, formaten en parameters worden automatisch in deze browser opgeslagen, los van de XSLT-pagina. De transformatie-output wordt niet opgeslagen.</p>
        <p>Deze tool gebruikt datasonnet-mapper 3.0.1.3, dezelfde versie als Frank!Framework.</p>
      </div>
    </dialog>
  );
}

function DataSonnetWorkspace() {
  useEffect(() => {
    initializeDataSonnetWorkspace();
  }, []);

  return (
    <>
      <header>
        <h1>DataSonnet Tester</h1>
        <Nav />
        <button id="run">▶ Transformeren</button>
        <span className="hint">Ctrl+Enter</span>
        <span id="saveStatus" className="header-status" role="status" />
        <button className="small" id="openHelp" aria-haspopup="dialog" aria-controls="helpDialog">Help</button>
      </header>
      <main className="workspace">
        <section>
          <ParametersPanel />
          <h2>
            Payload
            <span>
              <button className="small" id="uploadPayload" title="Invoerbestand openen">Payload openen</button>
              <button className="small" id="savePayload" title="Payload als bestand opslaan">Opslaan</button>
              <input className="file-input" id="payloadFile" type="file" />
              <MediaTypeSelect id="inputType" label="Formaat van de payload" defaultValue="application/json" />
            </span>
          </h2>
          <div id="payload" className="editor" />
        </section>
        <section>
          <h2>
            DataSonnet
            <span>
              <button className="small" id="uploadScript" title="DataSonnet-script openen">Script openen</button>
              <input className="file-input" id="scriptFile" type="file" accept=".ds,.jsonnet,.libsonnet,.txt" />
              <button className="small" id="saveScript" title="DataSonnet-script als bestand opslaan">Opslaan</button>
              <select className="input-file-select" id="exampleSelect" aria-label="Voorbeeld laden" title="Voorbeeld uit het DataSonnet cookbook laden (vervangt payload en script)" defaultValue="">
                <option value="" disabled>Voorbeeld laden…</option>
              </select>
            </span>
          </h2>
          <div id="script" className="editor" />
        </section>
        <section>
          <h2>
            Output
            <span>
              <button className="small" id="saveOutput" title="Output als bestand opslaan">Opslaan</button>
              <MediaTypeSelect id="outputType" label="Formaat van de output" defaultValue="application/json" />
            </span>
          </h2>
          <div id="output" className="editor" />
          <Console />
        </section>
      </main>
      <DataSonnetHelpDialog />
    </>
  );
}

export default function App() {
  const path = window.location.pathname;
  if (['/settings', '/settings.html'].includes(path)) return <SettingsPage />;
  if (path === '/datasonnet') return <DataSonnetWorkspace />;
  return <Workspace />;
}
