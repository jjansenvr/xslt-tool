import subprocess
from pathlib import Path

import pytest

from tests.unit.conftest import FakeProcess


def post(client, **overrides):
    return client.post("/api/datasonnet", json={"payload": "{}", "script": "{}", **overrides})


def test_output_and_messages_are_returned(client, fake_java):
    fake_java.result = FakeProcess(stdout='{"a":"é"}'.encode(), stderr=b"let op")
    response = post(client)
    assert response.status_code == 200
    assert response.json() == {"output": '{"a":"é"}', "messages": "let op"}


def test_media_types_are_passed_after_the_directory(client, fake_java):
    post(client, inputType="text/csv", outputType="application/xml")
    command = fake_java.commands[0]
    assert command[0] == "java"
    assert command[3] == "DataSonnetRunner"
    assert command[5:7] == ["text/csv", "application/xml"]


def test_default_media_types_are_json(client, fake_java):
    post(client)
    assert fake_java.commands[0][5:7] == ["application/json", "application/json"]


def test_parameters_are_passed_as_name_type_value_triples(client, fake_java):
    post(client, params=[{"name": " a ", "value": "1", "type": "json"}, {"name": "b", "value": "x=y"}, {"name": " ", "value": "z"}])
    assert fake_java.commands[0][7:] == ["a", "json", "1", "b", "auto", "x=y"]


@pytest.mark.parametrize("param_type", ["auto", "text", "json", "xml"])
def test_all_parameter_types_are_accepted(client, fake_java, param_type):
    assert post(client, params=[{"name": "p", "value": "1", "type": param_type}]).status_code == 200


def test_unknown_parameter_type_is_rejected(client, fake_java):
    assert post(client, params=[{"name": "p", "value": "1", "type": "bogus"}]).status_code == 422
    assert fake_java.commands == []


def test_script_and_payload_are_written_to_files(client, monkeypatch):
    seen = {}

    def run(command, **kwargs):
        directory = Path(command[4])
        seen["script"] = (directory / "script.ds").read_text(encoding="utf-8")
        seen["payload"] = (directory / "payload").read_text(encoding="utf-8")
        return FakeProcess(stdout=b"{}")

    monkeypatch.setattr("app.api.datasonnet.subprocess.run", run)
    post(client, script="{ a: 'é' }", payload='{"b":"€"}')
    assert seen == {"script": "{ a: 'é' }", "payload": '{"b":"€"}'}


def test_non_zero_exit_returns_stderr_as_error(client, fake_java):
    fake_java.result = FakeProcess(stderr=b"Unknown variable x", returncode=1)
    assert post(client).json() == {"error": "Unknown variable x"}


def test_non_zero_exit_without_stderr_mentions_exit_code(client, fake_java):
    fake_java.result = FakeProcess(returncode=4)
    assert "exitcode 4" in post(client).json()["error"]


def test_temporary_directory_is_removed_from_error_messages(client, monkeypatch):
    def run(command, **kwargs):
        return FakeProcess(stderr=f"Fout in {command[4]}/script.ds".encode(), returncode=1)

    monkeypatch.setattr("app.api.datasonnet.subprocess.run", run)
    assert post(client).json()["error"] == "Fout in /script.ds"


def test_timeout_returns_error(client, fake_java):
    fake_java.raises = subprocess.TimeoutExpired("java", 60)
    assert "60 seconden" in post(client).json()["error"]
