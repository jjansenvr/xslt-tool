import pytest

from app import main


@pytest.fixture
def dist(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<div id='root'></div>", encoding="utf-8")
    monkeypatch.setattr(main, "FRONTEND_DIST", tmp_path)
    return tmp_path


@pytest.mark.parametrize("path", ["/", "/datasonnet", "/settings", "/willekeurig/pad"])
def test_every_page_path_serves_index_html(client, dist, path):
    response = client.get(path)
    assert response.status_code == 200
    assert "id='root'" in response.text


def test_missing_build_gives_service_unavailable(client, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "FRONTEND_DIST", tmp_path)
    response = client.get("/")
    assert response.status_code == 503
    assert "npm run build" in response.json()["detail"]


def test_api_routes_take_precedence_over_the_page_route(client, dist, monkeypatch):
    monkeypatch.setattr("app.api.transform.saxon_versions", lambda: ["10.9"])
    assert client.get("/api/saxon-versions").json()["versions"] == ["10.9"]
