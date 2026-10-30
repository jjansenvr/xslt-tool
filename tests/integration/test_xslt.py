import pytest


XML = "<persons><person id='1'><name>Jan</name></person><person id='2'><name>Piet</name></person></persons>"

XSLT = """<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" indent="no"/>
  <xsl:param name="greeting" select="'Hallo'"/>
  <xsl:template match="/persons">
    <greetings>
      <xsl:for-each select="person">
        <greeting id="{@id}"><xsl:value-of select="concat($greeting, ' ', name)"/></greeting>
      </xsl:for-each>
    </greetings>
  </xsl:template>
</xsl:stylesheet>"""


def wrap(body, attributes=""):
    return f'<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" {attributes}>{body}</xsl:stylesheet>'


def transform(client, xslt=XSLT, xml=XML, params=(), **extra):
    response = client.post("/api/transform", json={"xml": xml, "xslt": xslt, "params": list(params), **extra})
    assert response.status_code == 200
    return response.json()


def test_expected_saxon_versions_are_available(saxon_versions):
    assert {"9.9.1-8", "10.9", "11.7", "12.5"} <= set(saxon_versions)


def test_default_saxon_version_is_available(client):
    data = client.get("/api/saxon-versions").json()
    assert data["default"] in data["versions"]


def test_transformation_with_default_version(client):
    data = transform(client)
    assert "error" not in data
    assert data["output"].count("<greeting ") == 2
    assert 'id="1">Hallo Jan</greeting>' in data["output"]
    assert data["messages"] == ""


@pytest.mark.parametrize("version", ["9.9.1-8", "10.9", "11.7", "12.5"])
def test_transformation_with_every_saxon_version(client, version):
    data = transform(client, saxon=version)
    assert "error" not in data, data
    assert 'id="2">Hallo Piet</greeting>' in data["output"]


def test_parameter_value_is_used(client):
    data = transform(client, params=[{"name": "greeting", "value": "Goedemorgen"}])
    assert 'id="1">Goedemorgen Jan</greeting>' in data["output"]


def test_parameter_without_name_is_ignored(client):
    data = transform(client, params=[{"name": "  ", "value": "x"}, {"name": "greeting", "value": "Hoi"}])
    assert 'id="1">Hoi Jan</greeting>' in data["output"]


def test_xsl_message_is_returned_as_message(client):
    xslt = wrap('<xsl:template match="/persons"><xsl:message terminate="no"><xsl:value-of select="person[1]/name"/></xsl:message><ok/></xsl:template>')
    data = transform(client, xslt=xslt)
    assert "error" not in data
    assert data["output"].endswith("<ok/>")
    assert data["messages"].strip() == "Jan"


def test_expand_text_in_xsl_message(client):
    xslt = wrap('<xsl:template match="/persons"><xsl:message>{person[1]/name}</xsl:message><ok/></xsl:template>', 'expand-text="yes"')
    assert transform(client, xslt=xslt)["messages"].strip() == "Jan"


def test_braces_without_expand_text_are_literal(client):
    xslt = wrap('<xsl:template match="/persons"><xsl:message>{person[1]/name}</xsl:message><ok/></xsl:template>')
    assert transform(client, xslt=xslt)["messages"].strip() == "{person[1]/name}"


def test_terminate_yes_returns_error_with_message(client):
    xslt = wrap('<xsl:template match="/persons"><xsl:message terminate="yes">stop hier</xsl:message></xsl:template>')
    data = transform(client, xslt=xslt)
    assert "stop hier" in data["error"]
    assert "output" not in data


def test_stylesheet_syntax_error_returns_error(client):
    data = transform(client, xslt=wrap('<xsl:template match="/"><xsl:bogus/></xsl:template>'))
    assert "xsl:bogus" in data["error"]


def test_stylesheet_that_is_not_xml_returns_error(client):
    assert "error" in transform(client, xslt="dit is geen xslt")


def test_input_that_is_not_xml_returns_error(client):
    assert "error" in transform(client, xml="<persons>")


def test_error_does_not_leak_temporary_directory(client):
    error = transform(client, xslt=wrap('<xsl:template match="/"><xsl:bogus/></xsl:template>'))["error"]
    assert "/tmp/" not in error


def test_unknown_saxon_version_returns_error(client):
    data = transform(client, saxon="1.0")
    assert "1.0" in data["error"]


def test_special_characters_survive_the_roundtrip(client):
    xml = "<tekst>één € ü 日本</tekst>"
    xslt = wrap('<xsl:output method="text"/><xsl:template match="/tekst"><xsl:value-of select="."/></xsl:template>')
    assert transform(client, xslt=xslt, xml=xml)["output"] == "één € ü 日本"


def test_output_method_text(client):
    xslt = wrap('<xsl:output method="text"/><xsl:template match="/persons">count=<xsl:value-of select="count(person)"/></xsl:template>')
    assert transform(client, xslt=xslt)["output"] == "count=2"
