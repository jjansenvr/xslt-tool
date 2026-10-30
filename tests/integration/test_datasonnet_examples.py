import json
from pathlib import Path

import pytest


EXAMPLES = json.loads(Path(__file__).parents[2].joinpath("frontend/src/datasonnet-examples.json").read_text(encoding="utf-8"))


def test_examples_are_present_and_complete():
    assert len(EXAMPLES) >= 25
    assert len({example["label"] for example in EXAMPLES}) == len(EXAMPLES)
    for example in EXAMPLES:
        assert example["label"] and example["detail"] and example["script"].strip()
        assert "payload" in example


@pytest.mark.parametrize("example", EXAMPLES, ids=[example["label"] for example in EXAMPLES])
def test_example_runs_with_its_own_payload(client, example):
    payload = example["payload"] if isinstance(example["payload"], str) else json.dumps(example["payload"])
    response = client.post("/api/datasonnet", json={
        "payload": payload,
        "script": example["script"],
        "inputType": example.get("inputType", "application/json"),
        "outputType": example.get("outputType", "application/json"),
    })
    data = response.json()
    assert "error" not in data, data
    assert data["output"].strip()
