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


def test_onboard_sample_patient(client):
    s = client.get("/api/onboard/sample").json()
    r = client.post("/api/onboard", json={"profile": s["profile"], "csv": s["csv"]})
    assert r.status_code == 200, r.text
    pid, summ = r.json()["patient_id"], r.json()["summary"]
    try:
        assert pid.startswith("UP-") and summ["readings"] > 1000 and summ["meals"] > 0
        assert summ["fit_rmse_120"] < summ["prior_rmse_120"], "personalisation should beat the record-only prior"
        p = client.get(f"/api/patients/{pid}").json()
        assert p["uploaded"] and p["upload_summary"]["readings"] == summ["readings"]
        m = summ["replay_minute"]
        assert 0 <= client.get(f"/api/patients/{pid}/risk?minute={m}").json()["probabilities"]["hyper_2h"] <= 1
        rows = client.get(f"/api/cohort?minute={m}").json()["patients"]
        assert any(row["patient_id"] == pid and row["uploaded"] for row in rows)
    finally:
        assert client.delete(f"/api/patients/{pid}").status_code == 200
    assert client.get(f"/api/patients/{pid}").status_code == 404


def test_onboard_rejects_bad_input(client):
    s = client.get("/api/onboard/sample").json()
    r = client.post("/api/onboard", json={"profile": s["profile"], "csv": "foo,bar\n1,2\n"})
    assert r.status_code == 400 and "glucose" in r.json()["detail"]
    assert client.delete("/api/patients/BH-0001").status_code == 400, "cohort patients cannot be removed"
