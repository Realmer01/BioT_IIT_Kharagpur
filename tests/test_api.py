"""End-to-end smoke test of the REST API (runs once the cohort and models are built)."""
import pytest

from madhutwin.config import MODELS, PROCESSED

pytestmark = pytest.mark.skipif(
    not (MODELS / "assignments.json").exists() or not (PROCESSED / "bharat_predictions.parquet").exists(),
    reason="run scripts/build_bharat.py and scripts/train_deploy.py first",
)


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    from madhutwin.api.main import app
    with TestClient(app) as c:
        yield c


def test_health_and_cohort(client):
    h = client.get("/api/health").json()
    assert h["patients"] >= 6
    c = client.get(f"/api/cohort?minute={h['default_minute']}").json()
    assert len(c["patients"]) == h["patients"]
    assert c["stories"], "featured stories should be discoverable"


def test_patient_views(client):
    pid = "BH-0001"
    m = client.get("/api/health").json()["default_minute"]
    assert client.get(f"/api/patients/{pid}").json()["patient_id"] == pid
    tl = client.get(f"/api/patients/{pid}/timeline?minute={m}").json()
    assert tl["cgm"] and len(tl["forecast"]) == 25
    rk = client.get(f"/api/patients/{pid}/risk?minute={m}").json()
    assert 0 <= rk["probabilities"]["hypo_1h"] <= 1
    assert client.get(f"/api/patients/{pid}/agp?minute={m}").json()["summary"]["tir"] >= 0
    rec = client.get(f"/api/patients/{pid}/recommendations?minute={m}").json()
    assert rec["recommendations"]
    fh = client.get(f"/api/patients/{pid}/fhir?minute={m}").json()
    assert fh["resourceType"] == "Bundle" and len(fh["entry"]) > 5


def test_what_if_walk_lowers_peak(client):
    body = {"minute": 13 * 1440 + 12 * 60, "scenarios": [
        {"label": "rice", "meals": [{"minute": 10, "food_id": "rice_sambar"}]},
        {"label": "rice + walk", "meals": [{"minute": 10, "food_id": "rice_sambar"}],
         "activity": [{"minute": 30, "duration": 20, "mets": 4.0}]},
    ]}
    r = client.post("/api/patients/BH-0002/whatif", json=body).json()
    base, walk = r["scenarios"]
    assert walk["peak"] < base["peak"]


def test_copilot_rule_engine(client):
    r = client.post("/api/patients/BH-0001/copilot", json={"engine": "rule"}).json()
    assert r["engine"] == "rule" and "Snapshot" in r["text"]
