import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { initializeLegacyWorkspace } from './workspace-controller.js';

function Header() {
  return (
    <header>
      <h1>XSLT Tester</h1>
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
          <li>Kies <strong>Transformeren</strong> of druk op <kbd>Ctrl</kbd>+<kbd>Enter</kbd>. De vorige output wordt eerst gewist; resultaten en belangrijke meldingen verschijnen bovenin beeld.</li>
        </ol>
        <p>Er staan voorbeeld-XML, een XSLT 3.0-stylesheet en de parameter <code>greeting</code> klaar om mee te beginnen.</p>
        <h3>Autocomplete en XSLT-snippets</h3>
        <p>De XML-editor kan element- en attribuutnamen uit de actieve input voorstellen. In de XSLT-editor open je suggesties met <kbd>Ctrl</kbd>+<kbd>Space</kbd> of de knop <strong>Snippets</strong>. Daar vind je veelgebruikte XSLT-elementen, templates en XPath-functies.</p>
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
        <p>XML-bestanden, de actieve input, XSLT, XSD en parameters worden automatisch in deze browser opgeslagen en hersteld bij een volgend bezoek op hetzelfde adres, ook na een Docker-herstart. De opslag wordt niet gedeeld met andere browsers of computers. De transformatie-output wordt niet opgeslagen.</p>
        <p>Kies <strong>Saxon</strong> rechtsboven om een beschikbare Saxon-HE-versie te selecteren. Die keuze wordt ook in deze browser bewaard.</p>
        <p>De editor laadt Monaco vanaf jsDelivr; internettoegang is nodig om de editor te laden.</p>
      </div>
    </dialog>
  );
}

function Notifications() {
  const [notification, setNotification] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    function showNotification(event) {
      const { source, message, type, duration } = event.detail;
      clearTimeout(timer.current);
      if (!message) {
        setNotification(current => current?.source === source ? null : current);
        return;
      }

      setNotification({ source, message, type });
      if (duration > 0) timer.current = setTimeout(() => setNotification(null), duration);
    }

    window.addEventListener('app-notification', showNotification);
    return () => {
      window.removeEventListener('app-notification', showNotification);
      clearTimeout(timer.current);
    };
  }, []);

  if (!notification) return null;
  const role = notification.type === 'err' ? 'alert' : 'status';
  return (
    <div className={`notification notification-${notification.type}`} role={role} aria-live={role === 'alert' ? 'assertive' : 'polite'}>
      <span className="notification-icon" aria-hidden="true">
        {notification.type === 'err' ? '!' : notification.type === 'ok' ? '✓' : '…'}
      </span>
      <span className="notification-message">{notification.message}</span>
      <button className="notification-close" type="button" aria-label="Melding sluiten" onClick={() => setNotification(null)}>×</button>
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
          <h2>Output</h2>
          <div id="output" className="editor" />
          <div id="outStatus" className="status" />
        </section>
      </main>
      <HelpDialog />
      <Notifications />
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

export default function App() {
  return ['/settings', '/settings.html'].includes(window.location.pathname) ? <SettingsPage /> : <Workspace />;
}
