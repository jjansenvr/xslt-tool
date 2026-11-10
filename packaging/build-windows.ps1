# Builds dist\xslt-tool-windows.zip. Needs: Node, Maven, a JDK 17 (javac, jlink) and Python 3.
param(
    [string]$PythonVersion = "3.12.8",
    [string]$SaxonVersions = "9.9.1-8 10.9 11.7 12.5"
)
$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."
$work = Join-Path $root "dist\bundle"
$out = Join-Path $work "xslt-tool"
if (Test-Path (Join-Path $root "dist")) { Remove-Item -Recurse -Force (Join-Path $root "dist") }
New-Item -ItemType Directory -Force $out | Out-Null

function Run($exe, $arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "$exe failed with exit code $LASTEXITCODE" }
}

# Frontend
Push-Location "$root\frontend"
Run npm.cmd @("ci")
Run npm.cmd @("run", "build")
Pop-Location
Copy-Item -Recurse "$root\frontend\dist" "$out\frontend\dist"  -ErrorAction Stop

# App
Copy-Item -Recurse "$root\app" "$out\app"
Get-ChildItem "$out\app" -Recurse -Directory -Filter __pycache__ | Remove-Item -Recurse -Force

# Saxon
foreach ($v in $SaxonVersions.Split(" ")) {
    $tmp = Join-Path $work "saxon-build-$v"
    New-Item -ItemType Directory -Force $tmp | Out-Null
    "<project><modelVersion>4.0.0</modelVersion><groupId>x</groupId><artifactId>x</artifactId><version>1</version><dependencies><dependency><groupId>net.sf.saxon</groupId><artifactId>Saxon-HE</artifactId><version>$v</version></dependency></dependencies></project>" | Set-Content -Encoding ascii "$tmp\pom.xml"
    Push-Location $tmp
    Run mvn.cmd @("-q", "-B", "dependency:copy-dependencies", "-DincludeScope=runtime", "-DoutputDirectory=$out\saxon\$v")
    Pop-Location
}

# DataSonnet
$ds = Join-Path $work "datasonnet-build"
Copy-Item -Recurse "$root\datasonnet" $ds
Remove-Item -Recurse -Force "$ds\target" -ErrorAction SilentlyContinue
Push-Location $ds
Run mvn.cmd @("-q", "-B", "dependency:copy-dependencies", "-DincludeScope=runtime", "-DoutputDirectory=$out\datasonnet\lib")
Run javac @("--release", "17", "-encoding", "UTF-8", "-cp", "$out\datasonnet\lib\*", "-d", "$out\datasonnet\classes", "DataSonnetRunner.java")
Pop-Location

# Java runtime
Run jlink @("--add-modules", "java.se,jdk.unsupported,jdk.crypto.ec,jdk.localedata", "--strip-debug", "--no-header-files", "--no-man-pages", "--output", "$out\jre")

# Python (embeddable) with dependencies
$zip = Join-Path $work "python-embed.zip"
Invoke-WebRequest "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip" -OutFile $zip
Expand-Archive $zip "$out\python"
$minor = ($PythonVersion.Split(".")[0..1]) -join ""
@("python$minor.zip", ".", "..", "Lib\site-packages", "import site") | Set-Content -Encoding ascii "$out\python\python$minor._pth"
Run python @("-m", "pip", "install", "--no-cache-dir", "--target", "$out\python\Lib\site-packages", "--platform", "win_amd64", "--python-version", ($PythonVersion.Split(".")[0..1] -join "."), "--only-binary=:all:", "-r", "$root\requirements.txt")

Copy-Item "$PSScriptRoot\start.bat" $out

Compress-Archive -Path $out -DestinationPath (Join-Path $root "dist\xslt-tool-windows.zip")
Write-Host "Built dist\xslt-tool-windows.zip"
