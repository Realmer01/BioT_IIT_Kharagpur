"""FHIR R4 export of a twin's static record and recent CGM summary.

Produces a ``collection`` Bundle with Patient, Condition, MedicationStatement,
Observation (labs, vitals, CGM summary) and a RiskAssessment carrying the twin's
current 2-hour forecast. India's Ayushman Bharat Digital Mission (ABDM) exchanges
health records as FHIR R4 bundles (NRCeS profiles), so a twin built on this
structure can plug into ABHA-linked records. Codes: LOINC (observations),
SNOMED CT + ICD-10 (conditions), WHO ATC (medications).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

LOINC = {
    "hba1c": ("4548-4", "Hemoglobin A1c/Hemoglobin.total in Blood", "%"),
    "fpg": ("1558-6", "Fasting glucose [Mass/volume] in Serum or Plasma", "mg/dL"),
    "fasting_insulin": ("20448-7", "Insulin [Units/volume] in Serum or Plasma", "u[IU]/mL"),
    "tg": ("2571-8", "Triglyceride [Mass/volume] in Serum or Plasma", "mg/dL"),
    "hdl": ("2085-9", "Cholesterol in HDL [Mass/volume] in Serum or Plasma", "mg/dL"),
    "ldl": ("13457-7", "Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation", "mg/dL"),
    "total_chol": ("2093-3", "Cholesterol [Mass/volume] in Serum or Plasma", "mg/dL"),
    "egfr": ("62238-1", "Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI)", "mL/min/{1.73_m2}"),
    "bmi": ("39156-5", "Body mass index (BMI) [Ratio]", "kg/m2"),
    "weight_kg": ("29463-7", "Body weight", "kg"),
    "height_cm": ("8302-2", "Body height", "cm"),
    "waist_cm": ("8280-0", "Waist Circumference at umbilicus by Tape measure", "cm"),
    "sbp": ("8480-6", "Systolic blood pressure", "mm[Hg]"),
    "dbp": ("8462-4", "Diastolic blood pressure", "mm[Hg]"),
}
# Codes verified against the HL7 FHIR CGM Implementation Guide example resources
# (build.fhir.org/ig/HL7/cgm, "Times in Ranges" panel 106793-3).
CGM_LOINC = {
    "mean_glucose": ("97507-8", "Mean glucose [Mass/volume] in Interstitial fluid", "mg/dL"),
    "gmi": ("97506-0", "Glucose management indicator", "%"),
    "cv": ("104638-2", "Coefficient of variation of glucose in Interstitial fluid", "%"),
    "tbr_l2": ("104642-4", "Time very low (< 54 mg/dL)", "%"),
    "tbr_l1": ("104641-6", "Time low (54-69 mg/dL)", "%"),
    "tir": ("97510-2", "Time in range (70-180 mg/dL)", "%"),
    "tar_l1": ("104640-8", "Time high (181-250 mg/dL)", "%"),
    "tar_l2": ("104639-0", "Time very high (> 250 mg/dL)", "%"),
    "active_pct": ("104637-4", "Sensor active percentage", "%"),
}


def _ref(res):
    return {"reference": f"urn:uuid:{res['id']}"}


def _obs(pid_ref, code, display, value, unit, when, system="http://loinc.org", category="laboratory"):
    return {
        "resourceType": "Observation", "id": str(uuid.uuid4()), "status": "final",
        "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": category}]}],
        "code": {"coding": [{"system": system, "code": code, "display": display}], "text": display},
        "subject": pid_ref, "effectiveDateTime": when,
        "valueQuantity": {"value": round(float(value), 2), "unit": unit, "system": "http://unitsofmeasure.org", "code": unit},
    }


def to_bundle(ehr: dict, cgm_summary: dict | None = None, risk: dict | None = None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    name = ehr.get("name", ehr["patient_id"]).split(" ")
    patient = {
        "resourceType": "Patient", "id": str(uuid.uuid4()),
        "identifier": [{"system": "urn:madhutwin:patient", "value": ehr["patient_id"]}],
        "name": [{"given": name[:-1] or name, "family": name[-1] if len(name) > 1 else ""}],
        "gender": {"M": "male", "F": "female"}.get(ehr.get("sex"), "unknown"),
        "address": [{"city": ehr.get("city"), "state": ehr.get("state"), "country": "IN"}] if ehr.get("city") else [],
        "communication": [{"language": {"text": ehr.get("language")}}] if ehr.get("language") else [],
        "extension": [{"url": "urn:madhutwin:synthetic", "valueBoolean": "synthetic" in str(ehr.get("source", "")).lower()}],
    }
    pref = _ref(patient)
    entries = [patient]
    for dx in ehr.get("diagnoses", []):
        entries.append({
            "resourceType": "Condition", "id": str(uuid.uuid4()), "subject": pref,
            "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]},
            "code": {"coding": [{"system": "http://snomed.info/sct", "code": dx["snomed"], "display": dx["display"]},
                                {"system": "http://hl7.org/fhir/sid/icd-10", "code": dx["code"]}], "text": dx["display"]},
            **({"onsetDateTime": dx["onset"]} if dx.get("onset") else {}),
        })
    for rx in ehr.get("regimen", []) + ehr.get("other_medications", []):
        dose = rx.get("daily_dose_mg") or rx.get("daily_units")
        unit = "U" if "daily_units" in rx else "mg"
        entries.append({
            "resourceType": "MedicationStatement", "id": str(uuid.uuid4()), "status": "active", "subject": pref,
            "medicationCodeableConcept": {"coding": [{"system": "http://www.whocc.no/atc", "code": rx.get("atc"), "display": rx["drug"]}],
                                          "text": rx["drug"]},
            "dosage": [{"text": f"{dose} {unit} {rx.get('frequency', '')}".strip(),
                        "doseAndRate": [{"doseQuantity": {"value": dose, "unit": f"{unit}/day"}}]}],
        })
    when = ehr.get("hba1c_history", [{}])[-1].get("date") or now[:10]
    for key, (code, disp, unit) in LOINC.items():
        if ehr.get(key) is not None:
            cat = "vital-signs" if key in ("bmi", "weight_kg", "height_cm", "waist_cm", "sbp", "dbp") else "laboratory"
            entries.append(_obs(pref, code, disp, ehr[key], unit, when, category=cat))
    for h in ehr.get("hba1c_history", [])[:-1]:
        entries.append(_obs(pref, *LOINC["hba1c"][:2], h["hba1c"], "%", h["date"]))
    if cgm_summary:
        for key, (code, disp, unit) in CGM_LOINC.items():
            if cgm_summary.get(key) is not None:
                entries.append(_obs(pref, code, disp, cgm_summary[key], unit, now, category="survey"))
    if risk:
        entries.append({
            "resourceType": "RiskAssessment", "id": str(uuid.uuid4()), "status": "final", "subject": pref,
            "occurrenceDateTime": risk.get("time", now),
            "method": {"text": "MadhuTwin hybrid physiological-AI digital twin"},
            "prediction": [{"outcome": {"text": k}, "probabilityDecimal": round(float(v), 3),
                            "whenRange": {"high": {"value": 120, "unit": "min"}}} for k, v in risk.get("probabilities", {}).items()],
        })
    return {"resourceType": "Bundle", "id": str(uuid.uuid4()), "type": "collection", "timestamp": now,
            "entry": [{"fullUrl": f"urn:uuid:{e['id']}", "resource": e} for e in entries]}
