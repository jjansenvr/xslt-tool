# XSLT Tester

XSLT Tester is a browser-based tool for running XSLT transformations against XML. It also lets you validate XML against an XSD schema and generate a starting schema from an XML document.

## Start the tool

You need Docker Desktop (or Docker Engine with the Compose plugin) running. Download `docker-compose.yml` from this repository into a folder, open a terminal in that folder, and run:

```sh
docker compose up -d
```

Docker downloads the published image from GitHub Container Registry; it does not build the application locally. Open [http://localhost:8080](http://localhost:8080) in your browser.

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

1. Replace the sample XML in **Input XML** with your source document.
2. Replace the sample stylesheet in **XSLT** with your transformation.
3. Add, change, or remove stylesheet parameters in the **Parameters** panel. A parameter name should match an `xsl:param` name in your stylesheet.
4. Select **Transform** or press **Ctrl+Enter** to run the transformation.
5. Read the result in **Output**. Errors and messages from Saxon appear below the output.

The tool starts with example XML, an example XSLT 3.0 stylesheet, and a `greeting` parameter so you can try a transformation immediately. Input is entered or pasted into the editors; there is no file-upload button.

## Validate XML with XSD

1. Enable **Generate & validate XSD** above the input editor.
2. The tool creates a starter XSD from the current input XML and validates the XML against it.
3. Edit the XSD as needed. Validation updates as you edit the XML or schema.
4. Use **Generate from XML** to replace the current schema with a newly generated one.

The generated XSD is inferred from the current XML sample. It is a useful starting point, but review it before relying on it to describe all valid documents.

## Choose a Saxon version

Select **Saxon** in the top-right corner to open settings and choose an available Saxon-HE version. Your choice is saved in this browser. The Docker image includes Saxon-HE versions 9.9.1-8, 10.9, 11.7, and 12.5.

## Image updates

The Compose file uses the `latest` image tag. After a new stable GitHub Release is published, update an existing installation with:

```sh
docker compose pull
docker compose up -d
```

The application loads the Monaco editor from jsDelivr, so the browser needs internet access to load the editor.
