# XSLT Tester

XSLT Tester is a browser-based tool for running XSLT transformations against XML. It also lets you validate XML against an XSD schema and generate a starting schema from an XML document.

## Start the tool

You need Docker Desktop (or Docker Engine with the Compose plugin) running. Download `docker-compose.yml` from this repository into a folder, open a terminal in that folder, and run:

```sh
docker compose up -d
```

Docker downloads the published image from GitHub Container Registry; it does not build the application locally. Open [http://localhost:8080](http://localhost:8080) in your browser.

To build and test the current source locally before a release, use the separate build Compose file:

```sh
docker compose -f docker-compose.build.yml up --build
```

This builds the `xslt-tool:local` image from the local `Dockerfile` and serves it at [http://localhost:8080](http://localhost:8080). Stop it with `Ctrl+C`, or run `docker compose -f docker-compose.build.yml down`.

## Project structure and development

The frontend is a React application built with Vite. The Python backend uses FastAPI and exposes the transformation, Saxon-version, XSD-generation, and XML-validation APIs. The Docker image builds the frontend first and then serves its static bundle alongside the API.

```text
frontend/
  src/App.jsx                  React workspace and settings UI
  src/workspace-controller.js  Monaco integration and editor interactions
app/
  main.py                      FastAPI application and frontend serving
  api/models.py                API request models
  api/transform.py             Saxon version discovery and transformations
  api/schema.py                XSD generation and validation
```

The workspace controller keeps Monaco's imperative editor features—such as context menus, XPath helpers, snippets, and browser-local workspace state—behind the React UI boundary.

The editor layout uses the available browser height. On narrower screens the panels rearrange into a scrollable layout so the output remains reachable without horizontal overflow.

For frontend development, start the FastAPI backend on port 8080 and run:

```sh
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8080
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Vite serves the frontend on port 5173 and proxies `/api` requests to the backend on port 8080. For a production-like local build, use the Docker Compose command above.

If the image is not publicly accessible, sign in to GitHub Container Registry before starting the service:

```sh
docker login ghcr.io
```

To stop the tool, run this in the same folder:

```sh
docker compose down
```

The application is available only on your computer by default. To use a different local port, change the left-hand port in the `ports` entry in `docker-compose.yml` (for example, `"8081:8080"`), then open `http://localhost:8081`.

## Run a transformation

The main screen has panels for parameters, input XML, XSLT, and output.

Select **Help** in the application header for the interface guide, including transformation steps, editor assistance, context menus, XSD validation, and browser-local saving.

1. Replace the sample XML in **Input XML** with your source document, or select **XML openen** to load one or more local XML files. When multiple files are loaded, use the list beside the button to switch the active input.
2. Replace the sample stylesheet in **XSLT**, or select **XSLT openen** to load a local `.xsl` or `.xslt` file.
3. Add, change, or remove stylesheet parameters in the **Parameters** panel. A parameter name should match an `xsl:param` name in your stylesheet. Select the arrow beside a parameter to add it as a global `<xsl:param name="..."/>` declaration to the stylesheet.
4. Select **Transform** or press **Ctrl+Enter** to run the transformation. The previous output is cleared when a new transformation starts.
5. Read the result in **Output**. Success messages, errors, and `xsl:message` output appear in the **Console** below the output; XSD validation details stay with the XML panel.

The tool starts with example XML, an example XSLT 3.0 stylesheet, and a `greeting` parameter so you can try a transformation immediately. You can also paste content directly into either editor.

The XML and XSLT editors provide completions while typing. The XML editor suggests element and attribute names from the active input. In the XSLT editor, press **Ctrl+Space** or select **Snippets** for common XSLT elements, templates, and XPath functions.

Right-click a position in the XML editor and choose **Copy XPath** to copy an XPath for the element at that location. Unique elements are not numbered; repeated siblings use a unique attribute predicate when possible (for example, `adres[@type="woon"]`), and otherwise use a numeric index. When the cursor is on an attribute, the XPath includes that attribute.

Right-click a position in the XSLT editor to show the relevant context action: **Highlight XML scope** is available inside non-parameter `select` or `match` expressions, while **Highlight parameter input** is available on parameter declarations or `$parameter` references. XML scope highlighting marks the selected XML elements and uses the browser's XPath 1.0 evaluator, so XPath 2.0/3.0-specific expressions are not supported. Choose **Clear XML scope highlight** in the XML editor's context menu to remove the marks.

To find a parameter's value, right-click its name (for example `$greeting`) in the XSLT editor and choose **Highlight parameter input**. If the parameter has no matching entry in the Parameters panel, the tool reports whether the XSLT's default value will be used.

Your XML files, active input selection, XSLT, XSD, parameters, and XSD-validation setting are automatically saved in this browser and restored when you return to the same address. This is browser-local storage, so it remains available when the Docker container restarts, but is not shared with other browsers or computers. The transformation output is not saved.

## Debug with xsl:message

The simplest way to see what a stylesheet is doing is to write values to the **Console** with `xsl:message`. The text appears as a yellow line before the "Transformatie geslaagd" line, and the transformation output is not affected.

```xml
<xsl:message terminate="no">
  <xsl:value-of select="persoon/achternaam"/>
</xsl:message>
```

Use `xsl:value-of` (above) in any stylesheet. In XSLT 3.0 you can instead write the expression in curly braces, but only when text value templates are enabled with `expand-text="yes"` (on `xsl:stylesheet` or on the `xsl:message` itself):

```xml
<xsl:stylesheet version="3.0" expand-text="yes" ...>
  ...
  <xsl:message terminate="no">
    {persoon/achternaam}
  </xsl:message>
```

Without `expand-text="yes"` the braces are not evaluated and the Console shows the literal text `{persoon/achternaam}`.

Tips:

- Add a label to recognise the line: `<xsl:message>achternaam: <xsl:value-of select="persoon/achternaam"/></xsl:message>`.
- `terminate="no"` (the default) continues after the message. With `terminate="yes"` the transformation stops at that point and the message is shown as an error, which is useful to find out whether a template is reached at all.
- Place a message in a template or in a `xsl:for-each` to see the value for every element; each call produces its own line.
- Print `count(...)` or `exists(...)` to check what an XPath expression selects. An empty line means the expression selected nothing.
- Use **Highlight XML scope** in the XSLT editor to see which XML elements a `select` or `match` expression selects.
- Remove the messages when you are done: Frank!Framework writes them to its log too.

## Validate XML with XSD

1. Enable **Generate & validate XSD** above the input editor.
2. The tool creates a starter XSD from the current input XML and validates the XML against it.
3. Edit the XSD as needed. Validation updates as you edit the XML or schema.
4. Use **Generate from XML** to replace the current schema with a newly generated one.

The generated XSD is inferred from the current XML sample. It is a useful starting point, but review it before relying on it to describe all valid documents.

## Choose a Saxon version

Select **Saxon** in the top-right corner to open settings and choose an available Saxon-HE version. Saxon-HE 10.9 is the default in Frank!Framework and is also the default selected by this tool. Your choice is saved in this browser. The Docker image includes Saxon-HE versions 9.9.1-8, 10.9, 11.7, and 12.5.

## Image updates

The Compose file uses the `latest` image tag. After a new stable GitHub Release is published, update an existing installation with:

```sh
docker compose pull
docker compose up -d
```

The application loads the Monaco editor from jsDelivr, so the browser needs internet access to load the editor.
