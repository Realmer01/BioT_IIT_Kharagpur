"""MadhuTwin REST API (FastAPI).

Run:  uvicorn madhutwin.api.main:app --port 8000
Docs: http://localhost:8000/docs
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from madhutwin.api.service import TwinService

app = FastAPI(title="MadhuTwin API", version="1.0.0",
              description="Hybrid physiological-AI digital twin for type 2 diabetes (Digital Twin Challenge 2026).")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_svc: TwinService | None = None


def svc() -> TwinService:
    global _svc
    if _svc is None:
        _svc = TwinService()
    return _svc


def _pid(pid: str) -> str:
    if pid not in svc().ehr:
        raise HTTPException(404, f"Unknown patient {pid}")
    return pid


class Meal(BaseModel):
    minute: int = 0
    food_id: str | None = None
    portion: float = 1.0
    carbs: float | None = None
    protein: float | None = None
    fat: float | None = None
    fiber: float | None = None
    gi: float | None = None
    name: str | None = None


class Activity(BaseModel):
    minute: int = 0
    duration: int = 15
    mets: float = 4.0


class Scenario(BaseModel):
    label: str = "Scenario"
    meals: list[Meal] = Field(default_factory=list)
    activity: list[Activity] = Field(default_factory=list)
    sleep_hours: float | None = None
    add_drug: dict | None = None
    remove_class: str | None = None


class WhatIfRequest(BaseModel):
    minute: int | None = None
    horizon: int = Field(240, ge=60, le=480)
    scenarios: list[Scenario]


class CopilotRequest(BaseModel):
    minute: int | None = None
    question: str | None = None
    engine: str = "auto"


@app.on_event("startup")
def _warm():
    svc()


@app.get("/api/health")
def health():
    s = svc()
    return {"status": "ok", "patients": len(s.pids), "default_minute": s.default_minute, "end_minute": s.end_minute,
            "start": s.minute[s.pids[0]]["time"].iloc[0].isoformat()}


@app.get("/api/cohort")
def cohort(minute: int | None = None):
    s = svc()
    return s.cohort_view(s.clamp_minute(minute))


@app.get("/api/patients/{pid}")
def patient(pid: str):
    return svc().patient(_pid(pid))


@app.get("/api/patients/{pid}/timeline")
def timeline(pid: str, minute: int | None = None, hours: float = 24, reveal_future: bool = True):
    s = svc()
    return s.timeline(_pid(pid), s.clamp_minute(minute), hours=hours, reveal_future=reveal_future)


@app.get("/api/patients/{pid}/risk")
def risk(pid: str, minute: int | None = None):
    s = svc()
    return s.risk(_pid(pid), s.clamp_minute(minute))


@app.get("/api/patients/{pid}/recommendations")
def recommendations(pid: str, minute: int | None = None):
    s = svc()
    return s.recommendations(_pid(pid), s.clamp_minute(minute))


@app.post("/api/patients/{pid}/whatif")
def what_if(pid: str, req: WhatIfRequest):
    s = svc()
    scen = []
    for sc in req.scenarios:
        d = sc.model_dump()
        d["meals"] = [{k: v for k, v in m.items() if v is not None} for m in d["meals"]]
        scen.append(d)
    return s.what_if(_pid(pid), s.clamp_minute(req.minute), scen, horizon=req.horizon)


@app.get("/api/patients/{pid}/agp")
def agp(pid: str, minute: int | None = None, days: int = 14):
    s = svc()
    return s.agp(_pid(pid), s.clamp_minute(minute), days=days)


@app.post("/api/patients/{pid}/copilot")
def copilot(pid: str, req: CopilotRequest):
    s = svc()
    return s.copilot(_pid(pid), s.clamp_minute(req.minute), req.question, req.engine)


@app.get("/api/patients/{pid}/fhir")
def fhir_bundle(pid: str, minute: int | None = None):
    s = svc()
    return s.fhir_bundle(_pid(pid), s.clamp_minute(minute))


@app.get("/api/foods")
def foods():
    return svc().foods()


@app.get("/api/validation")
def validation():
    return svc().validation()


# Serve the built dashboard (dashboard/dist) when present: one process for the whole demo.
DIST = Path(__file__).resolve().parents[2] / "dashboard" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = DIST / path
        return FileResponse(f if path and f.is_file() else DIST / "index.html")
