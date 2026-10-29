import re
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter

from app.api.models import TransformRequest
from app.config import DEFAULT_SAXON, SAXON_DIR


router = APIRouter()


def saxon_versions():
    if not SAXON_DIR.is_dir():
        return []
    directories = [directory.name for directory in SAXON_DIR.iterdir() if directory.is_dir() and any(directory.glob("*.jar"))]
    return sorted(directories, key=lambda version: [int(number) for number in re.findall(r"\d+", version)])


@router.get("/saxon-versions")
def get_saxon_versions():
    return {"versions": saxon_versions(), "default": DEFAULT_SAXON}


@router.post("/transform")
def transform(req: TransformRequest):
    version = req.saxon or DEFAULT_SAXON
    if version not in saxon_versions():
        return {"error": f"Saxon-versie '{version}' is niet beschikbaar"}

    with tempfile.TemporaryDirectory() as temporary_directory:
        xml_file = Path(temporary_directory, "input.xml")
        xsl_file = Path(temporary_directory, "transform.xsl")
        xml_file.write_text(req.xml, encoding="utf-8")
        xsl_file.write_text(req.xslt, encoding="utf-8")

        classpath = str(SAXON_DIR / version / "*")
        command = ["java", "-cp", classpath, "net.sf.saxon.Transform", f"-s:{xml_file}", f"-xsl:{xsl_file}"]
        command += [f"{param.name.strip()}={param.value}" for param in req.params if param.name.strip()]
        try:
            result = subprocess.run(command, capture_output=True, timeout=60)
        except subprocess.TimeoutExpired:
            return {"error": "Transformatie duurde langer dan 60 seconden"}

    stderr = result.stderr.decode("utf-8", errors="replace").replace(temporary_directory, "")
    if result.returncode != 0:
        return {"error": stderr or f"Saxon stopte met exitcode {result.returncode}"}
    return {"output": result.stdout.decode("utf-8", errors="replace"), "messages": stderr}
