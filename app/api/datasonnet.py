import os
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter

from app.api.models import DataSonnetRequest
from app.config import DATASONNET_DIR


router = APIRouter()


@router.post("/datasonnet")
def datasonnet(req: DataSonnetRequest):
    with tempfile.TemporaryDirectory() as temporary_directory:
        Path(temporary_directory, "script.ds").write_text(req.script, encoding="utf-8")
        Path(temporary_directory, "payload").write_text(req.payload, encoding="utf-8")

        classpath = os.pathsep.join([str(DATASONNET_DIR / "lib" / "*"), str(DATASONNET_DIR / "classes")])
        command = ["java", "-cp", classpath, "DataSonnetRunner", temporary_directory, req.inputType, req.outputType]
        for param in req.params:
            if param.name.strip():
                command += [param.name.strip(), param.type, param.value]
        try:
            result = subprocess.run(command, capture_output=True, timeout=60)
        except subprocess.TimeoutExpired:
            return {"error": "Transformatie duurde langer dan 60 seconden"}

    stderr = result.stderr.decode("utf-8", errors="replace").replace(temporary_directory, "")
    if result.returncode != 0:
        return {"error": stderr or f"DataSonnet stopte met exitcode {result.returncode}"}
    return {"output": result.stdout.decode("utf-8", errors="replace"), "messages": stderr}
