import os

import httpx
import pytest


BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")


@pytest.fixture(scope="session")
def client():
    with httpx.Client(base_url=BASE_URL, timeout=120) as client:
        yield client


@pytest.fixture(scope="session")
def saxon_versions(client):
    return client.get("/api/saxon-versions").json()["versions"]
