import os
import re
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from lxml import etree
from pydantic import BaseModel

# Every subdirectory of SAXON_DIR is one selectable Saxon version (its name),
# containing the Saxon-HE jar plus its dependencies.
SAXON_DIR = Path(os.environ.get("SAXON_DIR", "/opt/saxon"))
DEFAULT_SAXON = os.environ.get("DEFAULT_SAXON", "10.9")
XS = "http://www.w3.org/2001/XMLSchema"

app = FastAPI(title="XSLT Tester")


class Param(BaseModel):
    name: str
    value: str = ""


class TransformRequest(BaseModel):
    xml: str
    xslt: str
    params: list[Param] = []
    saxon: str = DEFAULT_SAXON


class ValidateRequest(BaseModel):
    xml: str
    xsd: str


class GenerateXsdRequest(BaseModel):
    xml: str


def saxon_versions():
    dirs = [d.name for d in SAXON_DIR.iterdir() if d.is_dir() and any(d.glob("*.jar"))]
    return sorted(dirs, key=lambda v: [int(n) for n in re.findall(r"\d+", v)])


@app.get("/api/saxon-versions")
def get_saxon_versions():
    return {"versions": saxon_versions(), "default": DEFAULT_SAXON}


@app.post("/api/transform")
def transform(req: TransformRequest):
    version = req.saxon or DEFAULT_SAXON
    if version not in saxon_versions():
        return {"error": f"Saxon-versie '{version}' is niet beschikbaar"}

    with tempfile.TemporaryDirectory() as tmp:
        xml_file = Path(tmp, "input.xml")
        xsl_file = Path(tmp, "transform.xsl")
        xml_file.write_text(req.xml, encoding="utf-8")
        xsl_file.write_text(req.xslt, encoding="utf-8")

        classpath = str(SAXON_DIR / version / "*")
        cmd = ["java", "-cp", classpath, "net.sf.saxon.Transform", f"-s:{xml_file}", f"-xsl:{xsl_file}"]
        cmd += [f"{p.name.strip()}={p.value}" for p in req.params if p.name.strip()]
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=60)
        except subprocess.TimeoutExpired:
            return {"error": "Transformatie duurde langer dan 60 seconden"}

    stderr = result.stderr.decode("utf-8", errors="replace").replace(tmp, "")
    if result.returncode != 0:
        return {"error": stderr or f"Saxon stopte met exitcode {result.returncode}"}
    return {"output": result.stdout.decode("utf-8", errors="replace"), "messages": stderr}


def _parser():
    return etree.XMLParser(resolve_entities=False, no_network=True)


@app.post("/api/validate")
async def validate(req: ValidateRequest):
    try:
        schema = etree.XMLSchema(etree.fromstring(req.xsd.encode(), _parser()))
    except (etree.XMLSyntaxError, etree.XMLSchemaParseError) as e:
        return {"schemaError": str(e), "errors": []}

    try:
        doc = etree.fromstring(req.xml.encode(), _parser())
    except etree.XMLSyntaxError as e:
        line, col = e.position
        return {"errors": [{"line": line, "column": col, "message": e.msg}]}

    schema.validate(doc)
    return {
        "errors": [
            {"line": err.line, "column": err.column, "message": err.message}
            for err in schema.error_log
        ]
    }


class _ElementInfo:
    """Everything observed for one element path across all its occurrences."""

    def __init__(self):
        self.count = 0
        self.attrs = {}         # name -> list of values
        self.children = {}      # name -> _ElementInfo, in first-seen order
        self.child_counts = []  # per occurrence: {child name: count}
        self.texts = []
        self.mixed = False


def _local(tag):
    return etree.QName(tag).localname


def _collect(el, info):
    info.count += 1
    for name, value in el.attrib.items():
        if not name.startswith("{"):
            info.attrs.setdefault(name, []).append(value)

    counts = {}
    for child in el:
        if not isinstance(child.tag, str):
            continue
        name = _local(child.tag)
        counts[name] = counts.get(name, 0) + 1
        _collect(child, info.children.setdefault(name, _ElementInfo()))
    info.child_counts.append(counts)

    text = (el.text or "") + "".join(c.tail or "" for c in el)
    if counts:
        info.mixed = info.mixed or bool(text.strip())
    else:
        info.texts.append(el.text or "")


_TYPES = [
    ("xs:boolean", re.compile(r"true|false")),
    ("xs:integer", re.compile(r"[+-]?\d+")),
    ("xs:decimal", re.compile(r"[+-]?(\d+(\.\d*)?|\.\d+)")),
    ("xs:date", re.compile(r"\d{4}-\d{2}-\d{2}")),
    ("xs:dateTime", re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?")),
]


def _infer_type(values):
    if values:
        for xs_type, pattern in _TYPES:
            if all(pattern.fullmatch(v.strip()) for v in values):
                return xs_type
    return "xs:string"


def _add_attributes(parent, info):
    for name, values in info.attrs.items():
        attr = etree.SubElement(parent, f"{{{XS}}}attribute", name=name, type=_infer_type(values))
        if len(values) == info.count:
            attr.set("use", "required")


def _build_element(parent, name, info, min_occurs=1, max_occurs=1):
    el = etree.SubElement(parent, f"{{{XS}}}element", name=name)
    if min_occurs == 0:
        el.set("minOccurs", "0")
    if max_occurs > 1:
        el.set("maxOccurs", "unbounded")

    has_text = any(t.strip() for t in info.texts)
    if not info.children and not info.attrs:
        el.set("type", _infer_type(info.texts))
        return

    complex_type = etree.SubElement(el, f"{{{XS}}}complexType")
    if info.children:
        if info.mixed:
            complex_type.set("mixed", "true")
        sequence = etree.SubElement(complex_type, f"{{{XS}}}sequence")
        for child_name, child_info in info.children.items():
            occurrences = [c.get(child_name, 0) for c in info.child_counts]
            _build_element(sequence, child_name, child_info, min(occurrences), max(occurrences))
        _add_attributes(complex_type, info)
    elif has_text:
        content = etree.SubElement(complex_type, f"{{{XS}}}simpleContent")
        extension = etree.SubElement(content, f"{{{XS}}}extension", base=_infer_type(info.texts))
        _add_attributes(extension, info)
    else:
        _add_attributes(complex_type, info)


@app.post("/api/generate-xsd")
async def generate_xsd(req: GenerateXsdRequest):
    try:
        root = etree.fromstring(req.xml.encode(), _parser())
    except etree.XMLSyntaxError as e:
        return {"error": f"XML is niet well-formed: {e.msg}"}

    info = _ElementInfo()
    _collect(root, info)

    namespace = etree.QName(root).namespace
    nsmap = {"xs": XS, **({None: namespace} if namespace else {})}
    schema = etree.Element(f"{{{XS}}}schema", nsmap=nsmap)
    if namespace:
        schema.set("targetNamespace", namespace)
        schema.set("elementFormDefault", "qualified")
    _build_element(schema, _local(root.tag), info)

    xsd = etree.tostring(schema, pretty_print=True, xml_declaration=True, encoding="UTF-8").decode()
    return {"xsd": xsd}


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")
