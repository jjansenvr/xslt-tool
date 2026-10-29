import re

from fastapi import APIRouter
from lxml import etree

from app.api.models import GenerateXsdRequest, ValidateRequest
from app.config import XML_SCHEMA_NAMESPACE


router = APIRouter()


def _parser():
    return etree.XMLParser(resolve_entities=False, no_network=True)


@router.post("/validate")
async def validate(req: ValidateRequest):
    try:
        schema = etree.XMLSchema(etree.fromstring(req.xsd.encode(), _parser()))
    except (etree.XMLSyntaxError, etree.XMLSchemaParseError) as error:
        return {"schemaError": str(error), "errors": []}

    try:
        document = etree.fromstring(req.xml.encode(), _parser())
    except etree.XMLSyntaxError as error:
        line, column = error.position
        return {"errors": [{"line": line, "column": column, "message": error.msg}]}

    schema.validate(document)
    return {
        "errors": [
            {"line": error.line, "column": error.column, "message": error.message}
            for error in schema.error_log
        ]
    }


class _ElementInfo:
    """Aggregated observations for one element path across its occurrences."""

    def __init__(self):
        self.count = 0
        self.attrs = {}
        self.children = {}
        self.child_counts = []
        self.texts = []
        self.mixed = False


def _local(tag):
    return etree.QName(tag).localname


def _collect(element, info):
    info.count += 1
    for name, value in element.attrib.items():
        if not name.startswith("{"):
            info.attrs.setdefault(name, []).append(value)

    counts = {}
    for child in element:
        if not isinstance(child.tag, str):
            continue
        name = _local(child.tag)
        counts[name] = counts.get(name, 0) + 1
        _collect(child, info.children.setdefault(name, _ElementInfo()))
    info.child_counts.append(counts)

    text = (element.text or "") + "".join(child.tail or "" for child in element)
    if counts:
        info.mixed = info.mixed or bool(text.strip())
    else:
        info.texts.append(element.text or "")


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
            if all(pattern.fullmatch(value.strip()) for value in values):
                return xs_type
    return "xs:string"


def _add_attributes(parent, info):
    for name, values in info.attrs.items():
        attribute = etree.SubElement(parent, f"{{{XML_SCHEMA_NAMESPACE}}}attribute", name=name, type=_infer_type(values))
        if len(values) == info.count:
            attribute.set("use", "required")


def _build_element(parent, name, info, min_occurs=1, max_occurs=1):
    element = etree.SubElement(parent, f"{{{XML_SCHEMA_NAMESPACE}}}element", name=name)
    if min_occurs == 0:
        element.set("minOccurs", "0")
    if max_occurs > 1:
        element.set("maxOccurs", "unbounded")

    has_text = any(text.strip() for text in info.texts)
    if not info.children and not info.attrs:
        element.set("type", _infer_type(info.texts))
        return

    complex_type = etree.SubElement(element, f"{{{XML_SCHEMA_NAMESPACE}}}complexType")
    if info.children:
        if info.mixed:
            complex_type.set("mixed", "true")
        sequence = etree.SubElement(complex_type, f"{{{XML_SCHEMA_NAMESPACE}}}sequence")
        for child_name, child_info in info.children.items():
            occurrences = [counts.get(child_name, 0) for counts in info.child_counts]
            _build_element(sequence, child_name, child_info, min(occurrences), max(occurrences))
        _add_attributes(complex_type, info)
    elif has_text:
        content = etree.SubElement(complex_type, f"{{{XML_SCHEMA_NAMESPACE}}}simpleContent")
        extension = etree.SubElement(content, f"{{{XML_SCHEMA_NAMESPACE}}}extension", base=_infer_type(info.texts))
        _add_attributes(extension, info)
    else:
        _add_attributes(complex_type, info)


@router.post("/generate-xsd")
async def generate_xsd(req: GenerateXsdRequest):
    try:
        root = etree.fromstring(req.xml.encode(), _parser())
    except etree.XMLSyntaxError as error:
        return {"error": f"XML is niet well-formed: {error.msg}"}

    info = _ElementInfo()
    _collect(root, info)

    namespace = etree.QName(root).namespace
    namespace_map = {"xs": XML_SCHEMA_NAMESPACE, **({None: namespace} if namespace else {})}
    schema = etree.Element(f"{{{XML_SCHEMA_NAMESPACE}}}schema", nsmap=namespace_map)
    if namespace:
        schema.set("targetNamespace", namespace)
        schema.set("elementFormDefault", "qualified")
    _build_element(schema, _local(root.tag), info)

    xsd = etree.tostring(schema, pretty_print=True, xml_declaration=True, encoding="UTF-8").decode()
    return {"xsd": xsd}
