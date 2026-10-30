import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


class FakeProcess:
    """Stand-in for subprocess.CompletedProcess that records the command it was started with."""

    def __init__(self, stdout=b"", stderr=b"", returncode=0):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


@pytest.fixture
def fake_java(monkeypatch):
    """Replaces subprocess.run in both API modules; set `fake_java.result` or `fake_java.raises` per test."""

    class Recorder:
        result = FakeProcess(stdout=b"<ok/>")
        raises = None
        commands = []
        files = {}

        def __call__(self, command, **kwargs):
            self.commands.append(command)
            if self.raises:
                raise self.raises
            return self.result

    recorder = Recorder()
    recorder.commands = []
    monkeypatch.setattr("app.api.transform.subprocess.run", recorder)
    monkeypatch.setattr("app.api.datasonnet.subprocess.run", recorder)
    return recorder
