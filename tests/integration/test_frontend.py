import re

import pytest


@pytest.mark.parametrize("path", ["/", "/datasonnet", "/settings"])
def test_page_is_served(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert '<div id="root">' in response.text


def test_javascript_bundle_is_served(client):
    html = client.get("/").text
    asset = re.search(r'src="(/assets/[^"]+\.js)"', html).group(1)
    assert client.get(asset).status_code == 200
