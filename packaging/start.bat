@echo off
set "ROOT=%~dp0"
set "SAXON_DIR=%ROOT%saxon"
set "DATASONNET_DIR=%ROOT%datasonnet"
set "JAVA_BIN=%ROOT%jre\bin\java.exe"
if not defined PORT set "PORT=8080"
cd /d "%ROOT%"
if not defined NO_BROWSER start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:%PORT%"
echo XSLT Tester draait op http://localhost:%PORT% - sluit dit venster om te stoppen.
"%ROOT%python\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port %PORT%
