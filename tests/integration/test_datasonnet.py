import json

import pytest


def run(client, script, payload="{}", input_type="application/json", output_type="application/json", params=()):
    response = client.post("/api/datasonnet", json={
        "payload": payload,
        "script": script,
        "inputType": input_type,
        "outputType": output_type,
        "params": list(params),
    })
    assert response.status_code == 200
    return response.json()


def run_json(client, script, **kwargs):
    data = run(client, script, **kwargs)
    assert "error" not in data, data
    return json.loads(data["output"])


PERSONS = json.dumps({"persons": [{"id": 1, "name": "Jan"}, {"id": 2, "name": "Piet"}]})
GREETINGS = '{ greetings: [ { id: p.id, greeting: greeting + " " + p.name } for p in payload.persons ] }'


def test_json_to_json_with_parameter(client):
    result = run_json(client, GREETINGS, payload=PERSONS, params=[{"name": "greeting", "value": "Hoi"}])
    assert result == {"greetings": [{"id": 1, "greeting": "Hoi Jan"}, {"id": 2, "greeting": "Hoi Piet"}]}


def test_json_to_xml(client):
    data = run(client, "{ out: { n: payload.persons[0].name } }", payload=PERSONS, output_type="application/xml")
    assert "<out><n>Jan</n></out>" in data["output"]


def test_json_to_yaml(client):
    data = run(client, "payload", payload=PERSONS, output_type="application/x-yaml")
    assert "persons:" in data["output"]
    assert "name: " in data["output"]


def test_json_to_csv(client):
    data = run(client, '[{ first: "William", last: "Shakespeare" }]', output_type="text/csv")
    assert data["output"].splitlines() == ["first,last", "William,Shakespeare"]


def test_xml_to_json(client):
    result = run_json(client, '{ naam: payload.root.naam["$"] }', payload="<root><naam>Jan</naam></root>", input_type="application/xml")
    assert result == {"naam": "Jan"}


def test_csv_to_json(client):
    result = run_json(client, "{ first: payload[0].first_name }", payload="first_name,last_name\nJan,Jansen", input_type="text/csv")
    assert result == {"first": "Jan"}


def test_csv_header_options(client):
    script = """/** DataSonnet
version=2.0
input payload text/csv; UseHeader=false; Separator="|"
*/
{ first: payload[0][0], last: payload[0][1] }"""
    assert run_json(client, script, payload="Jan|Jansen", input_type="text/csv") == {"first": "Jan", "last": "Jansen"}


def test_csv_output_options(client):
    script = """/** DataSonnet
version=2.0
output text/csv; UseHeader=false; Quote="'"; Separator="|"
*/
[["William", "Shakespeare"]]"""
    assert run(client, script, output_type="text/csv")["output"].strip() == "'William'|'Shakespeare'"


def test_xml_namespace_output(client):
    script = """/** DataSonnet
version=2.0
output application/xml; NamespaceSeparator="%"; AttributeCharacter="*"; NamespaceDeclarations.ns="http://example.com"
*/
{ "ns%root": { "*xmlns": { "ns": "http://example.com" }, "ns%child": { "*version": "1.0", "$": "x" } } }"""
    output = run(client, script, output_type="application/xml")["output"]
    assert '<ns:root xmlns:ns="http://example.com">' in output
    assert 'version="1.0"' in output


def test_plain_text_output(client):
    assert run(client, '"hallo"', output_type="text/plain")["output"] == "hallo"


@pytest.mark.parametrize("value,param_type,expression,expected", [
    ('{"bar":123}', "auto", "p.bar", 123),
    ("<root><naam>Jan</naam></root>", "auto", 'p.root.naam["$"]', "Jan"),
    ("123", "auto", "p", "123"),
    ("hallo", "auto", "p", "hallo"),
    ('{"bar":1}', "text", "p", '{"bar":1}'),
    ("41", "json", "p + 1", 42),
    ("true", "json", "p", True),
    ('{"bar":123}', "json", "p.bar", 123),
    ("<root><naam>Jan</naam></root>", "xml", 'p.root.naam["$"]', "Jan"),
])
def test_parameter_types(client, value, param_type, expression, expected):
    result = run_json(client, expression, params=[{"name": "p", "value": value, "type": param_type}])
    assert result == expected


def test_parameter_type_defaults_to_auto(client):
    assert run_json(client, "p.bar", params=[{"name": "p", "value": '{"bar":7}'}]) == 7


def test_parameter_without_name_is_ignored(client):
    assert run_json(client, "p", params=[{"name": " ", "value": "x"}, {"name": "p", "value": "y"}]) == "y"


def test_invalid_parameter_type_is_rejected(client):
    response = client.post("/api/datasonnet", json={"payload": "{}", "script": "{}", "params": [{"name": "p", "value": "1", "type": "bogus"}]})
    assert response.status_code == 422


def test_special_characters_survive_the_roundtrip(client):
    payload = json.dumps({"tekst": "één € ü 日本"}, ensure_ascii=False)
    assert run_json(client, "payload", payload=payload) == {"tekst": "één € ü 日本"}


def test_unknown_variable_returns_error(client):
    assert "Unknown variable bogus" in run(client, "{ a: bogus }")["error"]


def test_invalid_payload_returns_error(client):
    assert "error" in run(client, "payload", payload="{niet geldig")


def test_assert_failure_returns_error(client):
    assert "f moet 10 zijn" in run(client, '{ f: 1, assert self.f == 10 : "f moet 10 zijn" }')["error"]


def test_error_function_returns_message(client):
    assert "name ontbreekt" in run(client, 'error "name ontbreekt"')["error"]


@pytest.mark.parametrize("script,explanation", [
    ("[1, 2]", "Het resultaat is nu een array"),
    ('"tekst"', "Het resultaat is nu een tekst"),
    ("{ a: 1, b: 2 }", "2 velden op het hoogste niveau (a, b)"),
    ("{ a: [1, 2] }", "Het root-element 'a' is nu een array"),
    ('{ a: "x" }', "Het root-element 'a' is nu een tekst"),
    ("{ a: { b: [[1]] } }", "array direct in een array"),
])
def test_xml_output_with_wrong_shape_explains_the_problem(client, script, explanation):
    error = run(client, script, output_type="application/xml")["error"]
    assert explanation in error
    assert "Oorspronkelijke melding" in error


def test_valid_xml_output_has_no_error(client):
    assert "error" not in run(client, "{ root: { a: 1 } }", output_type="application/xml")


def test_array_of_values_in_xml_output_is_allowed(client):
    output = run(client, "{ a: { b: [1, 2] } }", output_type="application/xml")["output"]
    assert "<b>1</b><b>2</b>" in output


def test_script_error_with_xml_output_is_not_replaced_by_shape_explanation(client):
    error = run(client, "{ a: bogus }", output_type="application/xml")["error"]
    assert "Unknown variable bogus" in error
    assert "Oorspronkelijke melding" not in error
