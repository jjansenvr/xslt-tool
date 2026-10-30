XSD = """<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="persoon">
    <xs:complexType><xs:sequence><xs:element name="naam" type="xs:string"/><xs:element name="leeftijd" type="xs:integer"/></xs:sequence></xs:complexType>
  </xs:element>
</xs:schema>"""


def validate(client, xml, xsd=XSD):
    response = client.post("/api/validate", json={"xml": xml, "xsd": xsd})
    assert response.status_code == 200
    return response.json()


def test_valid_xml_has_no_errors(client):
    assert validate(client, "<persoon><naam>Jan</naam><leeftijd>42</leeftijd></persoon>") == {"errors": []}


def test_schema_violation_is_reported_with_line_and_message(client):
    data = validate(client, "<persoon>\n  <naam>Jan</naam>\n  <leeftijd>oud</leeftijd>\n</persoon>")
    assert len(data["errors"]) == 1
    assert data["errors"][0]["line"] == 3
    assert "oud" in data["errors"][0]["message"]


def test_missing_element_is_reported(client):
    data = validate(client, "<persoon><naam>Jan</naam></persoon>")
    assert data["errors"]
    assert "leeftijd" in data["errors"][0]["message"]


def test_xml_that_is_not_well_formed_is_reported_with_position(client):
    data = validate(client, "<persoon>\n<naam>Jan</persoon>")
    assert data["errors"][0]["line"] == 2
    assert "schemaError" not in data


def test_invalid_xsd_returns_schema_error(client):
    data = validate(client, "<persoon/>", xsd='<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element/></xs:schema>')
    assert data["schemaError"]
    assert data["errors"] == []


def test_xsd_that_is_not_xml_returns_schema_error(client):
    assert validate(client, "<persoon/>", xsd="geen xsd")["schemaError"]

