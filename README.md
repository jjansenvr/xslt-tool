# XSLT Tester

A browser-based tool for testing data transformations. It has three pages:

- **XSLT**: run XSLT 3.0 transformations with Saxon-HE, validate XML against an XSD, and generate a starting schema.
- **DataSonnet**: run [DataSonnet](https://datasonnet.github.io/datasonnet-mapper/) mappings on JSON, XML, CSV, YAML or text.
- **JSONata**: evaluate [JSONata](https://jsonata.org/) expressions against JSON, entirely in the browser.

See [docs/usage.md](docs/usage.md) for how to use each page. See [docs/development.md](docs/development.md) to develop, test or release the tool.

## Start the tool

You need Docker Desktop (or Docker Engine with the Compose plugin) running. Download `docker-compose.yml` from this repository into a folder, open a terminal in that folder, and run:

```sh
docker compose up -d
```

Docker downloads the published image from GitHub Container Registry; it does not build the application locally. Open [http://localhost:8080](http://localhost:8080) in your browser.

To stop the tool, run this in the same folder:

```sh
docker compose down
```

The application is available only on your computer by default. To use a different local port, change the left-hand port in the `ports` entry in `docker-compose.yml` (for example, `"8081:8080"`), then open `http://localhost:8081`.

If the image is not publicly accessible, sign in to GitHub Container Registry first:

```sh
docker login ghcr.io
```

### Build the current source

To build and test the current source locally before a release:

```sh
docker compose -f docker-compose.build.yml up --build
```

This builds the `xslt-tool:local` image from the local `Dockerfile` and serves it at [http://localhost:8080](http://localhost:8080). Stop it with `Ctrl+C`, or run `docker compose -f docker-compose.build.yml down`.

## Run without Docker (Windows)

Download `xslt-tool-windows-<version>.zip` from the latest [GitHub Release](../../releases/latest), unzip it, and run `start.bat`. The zip includes Python, Java, Saxon and DataSonnet, so nothing else needs to be installed. The tool opens at [http://localhost:8080](http://localhost:8080); close the console window to stop it. Windows SmartScreen may warn about the unsigned download: right-click the zip, choose **Properties**, and select **Unblock** before unzipping.

## Image updates

The Compose file uses the `latest` image tag. After a new stable GitHub Release is published, update an existing installation with:

```sh
docker compose pull
docker compose up -d
```

The application loads the Monaco editor from jsDelivr, so the browser needs internet access to load the editor.
