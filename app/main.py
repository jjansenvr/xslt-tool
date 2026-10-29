from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.schema import router as schema_router
from app.api.transform import router as transform_router


app = FastAPI(title="XSLT Tester")
app.include_router(transform_router, prefix="/api")
app.include_router(schema_router, prefix="/api")

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"

if FRONTEND_ASSETS.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_ASSETS), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str):
    index = FRONTEND_DIST / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=503, detail="Frontend assets are not built. Run `npm run build` in frontend.")
    return FileResponse(index)
