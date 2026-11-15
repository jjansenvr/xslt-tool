# XSLT-voorbeelden

Elke map in deze directory is één voorbeeld in de keuzelijst "Voorbeeld laden…" op de XSLT-pagina. De voorbeelden worden bij `npm run build` meegebouwd; tijdens `npm run dev` verschijnen wijzigingen direct.

Een voorbeeld bestaat uit:

| Bestand | Verplicht | Inhoud |
| --- | --- | --- |
| `transform.xsl` | ja | De stylesheet |
| `*.xml` | ja | Een of meer invoerbestanden (alfabetisch; de eerste is actief) |
| `example.json` | nee | `{ "label": "...", "detail": "...", "params": [{ "name": "x", "value": "y" }] }` |

Zonder `example.json` wordt de mapnaam als label gebruikt. De mapnaam bepaalt de volgorde in de lijst.
