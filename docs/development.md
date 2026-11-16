# Development and release

## Project structure

The frontend is a React application built with Vite. The Python backend uses FastAPI and exposes the transformation, Saxon-version, XSD-generation, XML-validation and DataSonnet APIs. The Docker image builds the frontend first and then serves its static bundle alongside the API. JSONata runs in the browser and has no backend.

```text
frontend/
  src/App.jsx                  React workspace and settings UI
  src/workspace-controller.js  XSLT page: Monaco integration and editor interactions
  src/datasonnet-controller.js DataSonnet page
  src/jsonata-controller.js    JSONata page
  src/theme.js                 Light/dark mode
app/
  main.py                      FastAPI application and frontend serving
  api/models.py                API request models
  api/transform.py             Saxon version discovery and transformations
  api/schema.py                XSD generation and validation
  api/datasonnet.py            DataSonnet transformations
```

The controllers keep Monaco's imperative editor features (context menus, XPath helpers, snippets, browser-local workspace state) behind the React UI boundary. The editor layout uses the available browser height; on narrower screens the panels rearrange into a scrollable layout.

## Run locally for development

Start the FastAPI backend on port 8080:

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

Vite serves the frontend on port 5173 and proxies `/api` requests to the backend on port 8080. For a production-like local build, use `docker compose -f docker-compose.build.yml up --build`.

## Tests

The tests run in GitHub Actions on every push and pull request, and a release is only published when they pass.

| Layer | Location | Command | Needs |
|---|---|---|---|
| Backend unit tests | `tests/unit` | `pytest tests/unit` | `pip install -r requirements-dev.txt` |
| Frontend unit tests | `frontend/src/*.test.js` | `npm test` (in `frontend`) | `npm ci` |
| Integration tests (real Saxon and DataSonnet) | `tests/integration` | `pytest tests/integration` | a running container |
| End-to-end tests (browser) | `frontend/e2e` | `npx playwright test` (in `frontend`) | a running container, `npx playwright install chromium` |

Start a container for the last two with `docker compose -f docker-compose.build.yml up --build`, or any other way on port 8080. Use `BASE_URL` to test another address, for example `BASE_URL=http://localhost:8081 pytest tests/integration`. The end-to-end tests load the Monaco editor from jsDelivr, so they need internet access.

## Contribute and release

Work on a feature branch and open a pull request targeting `main`. The test workflow runs for pull requests; merging a pull request to `main` runs the tests again and evaluates the commit messages since the previous release. To require this workflow and prevent direct pushes, enable a branch ruleset for `main` in the repository settings that requires pull requests and the test jobs to pass.

Releases use [Conventional Commits](https://www.conventionalcommits.org/):

- `fix: correct XPath generation` creates a patch release.
- `feat: add XML comparison` creates a minor release.
- `feat!: change the parameter format` or a commit with a `BREAKING CHANGE:` footer creates a major release.
- Other commit types do not create a release unless marked as breaking.

Use a Conventional Commit pull-request title, especially when using squash merges, because the squash commit message determines the release type. After the tests pass, qualifying changes merged to `main` automatically create a GitHub Release with a `v`-prefixed semantic version and publish the matching Docker image to GHCR. A merge with no release-worthy commits does not create a release.

## Build the Windows bundle

Install Node, Maven, JDK 17 and Python, then run `./packaging/build-windows.ps1`. The result is `dist/xslt-tool-windows-local.zip`; pass `-Version v1.2.3` to change the name.
