import subprocess
from pathlib import Path

import pytest

from app.api import transform as transform_module
from tests.unit.conftest import FakeProcess


@pytest.fixture
def versions(monkeypatch):
    monkeypatch.setattr(transform_module, "saxon_versions", lambda: ["9.9.1-8", "10.9", "12.5"])


def post(client, **overrides):
    body = {"xml": "<a/>", "xslt": "<xsl:stylesheet/>", **overrides}
    response = client.post("/api/transform", json=body)
    assert response.status_code == 200
    return response.json()


def test_output_and_messages_are_returned(client, versions, fake_java):
    fake_java.result = FakeProcess(stdout="<ok>é</ok>".encode(), stderr=b"melding\n")
    assert post(client) == {"output": "<ok>é</ok>", "messages": "melding\n"}


def test_default_saxon_version_is_used_when_none_given(client, versions, fake_java, monkeypatch):
    monkeypatch.setattr(transform_module, "DEFAULT_SAXON", "10.9")
    post(client, saxon="")
    assert fake_java.commands[0][2].replace("\\", "/").endswith("/10.9/*")


def test_selected_saxon_version_is_used(client, versions, fake_java):
    post(client, saxon="12.5")
    assert fake_java.commands[0][2].replace("\\", "/").endswith("/12.5/*")


def test_command_runs_saxon_transform_on_temporary_files(client, versions, fake_java):
    post(client)
    command = fake_java.commands[0]
    assert command[0] == "java"
    assert "net.sf.saxon.Transform" in command
    assert any(argument.startswith("-s:") and argument.endswith("input.xml") for argument in command)
    assert any(argument.startswith("-xsl:") and argument.endswith("transform.xsl") for argument in command)


def test_input_files_contain_the_posted_content(client, versions, monkeypatch):
    seen = {}

    def run(command, **kwargs):
        seen["xml"] = Path(command[4][3:]).read_text(encoding="utf-8")
        seen["xsl"] = Path(command[5][5:]).read_text(encoding="utf-8")
        return FakeProcess(stdout=b"<ok/>")

    monkeypatch.setattr("app.api.transform.subprocess.run", run)
    post(client, xml="<a>é</a>", xslt="<xsl:stylesheet>€</xsl:stylesheet>")
    assert seen == {"xml": "<a>é</a>", "xsl": "<xsl:stylesheet>€</xsl:stylesheet>"}


def test_parameters_are_passed_as_name_value_arguments(client, versions, fake_java):
    post(client, params=[{"name": " greeting ", "value": "a b=c"}, {"name": "  ", "value": "x"}, {"name": "n", "value": ""}])
    assert fake_java.commands[0][-2:] == ["greeting=a b=c", "n="]
    assert len([a for a in fake_java.commands[0] if "=" in a and not a.startswith("-")]) == 2


def test_unknown_version_is_rejected_without_running_java(client, versions, fake_java):
    assert "'3.0'" in post(client, saxon="3.0")["error"]
    assert fake_java.commands == []


def test_non_zero_exit_returns_stderr_as_error(client, versions, fake_java):
    fake_java.result = FakeProcess(stderr=b"Fout op regel 1", returncode=2)
    assert post(client) == {"error": "Fout op regel 1"}


def test_non_zero_exit_without_stderr_mentions_exit_code(client, versions, fake_java):
    fake_java.result = FakeProcess(returncode=3)
    assert "exitcode 3" in post(client)["error"]


def test_temporary_directory_is_removed_from_error_messages(client, versions, monkeypatch):
    def run(command, **kwargs):
        directory = str(Path(command[4][3:]).parent)
        return FakeProcess(stderr=f"Error in {directory}/transform.xsl".encode(), returncode=2)

    monkeypatch.setattr("app.api.transform.subprocess.run", run)
    assert post(client)["error"] == "Error in /transform.xsl"


def test_timeout_returns_error(client, versions, fake_java):
    fake_java.raises = subprocess.TimeoutExpired("java", 60)
    assert "60 seconden" in post(client)["error"]


def test_saxon_versions_endpoint_returns_versions_and_default(client, versions, monkeypatch):
    monkeypatch.setattr(transform_module, "DEFAULT_SAXON", "10.9")
    assert client.get("/api/saxon-versions").json() == {"versions": ["9.9.1-8", "10.9", "12.5"], "default": "10.9"}


def test_saxon_versions_are_sorted_numerically_and_need_a_jar(tmp_path, monkeypatch):
    for name, has_jar in [("10.9", True), ("9.9.1-8", True), ("12.5", True), ("11.7", True), ("leeg", False)]:
        (tmp_path / name).mkdir()
        if has_jar:
            (tmp_path / name / "saxon.jar").touch()
    (tmp_path / "losbestand.txt").touch()
    monkeypatch.setattr(transform_module, "SAXON_DIR", tmp_path)
    assert transform_module.saxon_versions() == ["9.9.1-8", "10.9", "11.7", "12.5"]


def test_no_saxon_directory_gives_no_versions(tmp_path, monkeypatch):
    monkeypatch.setattr(transform_module, "SAXON_DIR", tmp_path / "bestaat-niet")
    assert transform_module.saxon_versions() == []
