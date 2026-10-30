import pytest
from lxml import etree


XS = "{http://www.w3.org/2001/XMLSchema}"


def generate(client, xml):
    response = client.post("/api/generate-xsd", json={"xml": xml})
    assert response.status_code == 200
    return response.json()


def schema_of(client, xml):
    data = generate(client, xml)
    assert "error" not in data, data
    return etree.fromstring(data["xsd"].encode())


def validates(schema_root, xml):
    return etree.XMLSchema(schema_root).validate(etree.fromstring(xml.encode()))


def find(schema_root, name):
    return schema_root.xpath(f"//xs:element[@name='{name}']", namespaces={"xs": XS[1:-1]})[0]


@pytest.mark.parametrize("value,expected", [
    ("42", "xs:integer"),
    ("-7", "xs:integer"),
    ("3.14", "xs:decimal"),
    ("true", "xs:boolean"),
    ("2024-05-01", "xs:date"),
    ("2024-05-01T10:00:00Z", "xs:dateTime"),
    ("hallo", "xs:string"),
    ("", "xs:string"),
])
def test_simple_element_types_are_inferred(client, value, expected):
    schema = schema_of(client, f"<root><waarde>{value}</waarde></root>")
    assert find(schema, "waarde").get("type") == expected


def test_type_falls_back_to_string_when_values_differ(client):
    schema = schema_of(client, "<root><a><w>1</w><w>x</w></a></root>")
    assert find(schema, "w").get("type") == "xs:string"


def test_repeated_element_is_unbounded(client):
    schema = schema_of(client, "<root><item>1</item><item>2</item></root>")
    assert find(schema, "item").get("maxOccurs") == "unbounded"


def test_element_missing_in_some_occurrences_is_optional(client):
    schema = schema_of(client, "<root><p><a>1</a><b>2</b></p><p><a>3</a></p></root>")
    assert find(schema, "b").get("minOccurs") == "0"
    assert find(schema, "a").get("minOccurs") is None


def test_attribute_present_everywhere_is_required(client):
    schema = schema_of(client, '<root><p id="1" extra="x"/><p id="2"/></root>')
    attributes = {a.get("name"): a for a in schema.iter(XS + "attribute")}
    assert attributes["id"].get("use") == "required"
    assert attributes["id"].get("type") == "xs:integer"
    assert attributes["extra"].get("use") is None


def test_element_with_text_and_attribute_uses_simple_content(client):
    schema = schema_of(client, '<root><prijs valuta="EUR">9.95</prijs></root>')
    extension = find(schema, "prijs").find(f"{XS}complexType/{XS}simpleContent/{XS}extension")
    assert extension.get("base") == "xs:decimal"
    assert extension.find(XS + "attribute").get("name") == "valuta"


def test_mixed_content_is_marked_mixed(client):
    schema = schema_of(client, "<root><p>tekst <b>vet</b> meer</p></root>")
    assert find(schema, "p").find(XS + "complexType").get("mixed") == "true"


def test_namespace_becomes_target_namespace(client):
    schema = schema_of(client, '<root xmlns="http://example.com/ns"><a>1</a></root>')
    assert schema.get("targetNamespace") == "http://example.com/ns"
    assert schema.get("elementFormDefault") == "qualified"


@pytest.mark.parametrize("xml", [
    "<persons><person id='1'><name>Jan</name><age>42</age></person><person id='2'><name>Piet</name></person></persons>",
    '<root xmlns="http://example.com/ns"><a>1</a><a>2</a><b x="true"/></root>',
    "<root><prijs valuta='EUR'>9.95</prijs><datum>2024-05-01</datum></root>",
    "<root><p>tekst <b>vet</b> meer</p></root>",
])
def test_generated_schema_accepts_its_source_document(client, xml):
    assert validates(schema_of(client, xml), xml)


def test_generated_schema_rejects_a_different_document(client):
    schema = schema_of(client, "<root><getal>1</getal></root>")
    assert not validates(schema, "<root><getal>x</getal></root>")


def test_xml_that_is_not_well_formed_returns_error(client):
    assert "niet well-formed" in generate(client, "<root>")["error"]
