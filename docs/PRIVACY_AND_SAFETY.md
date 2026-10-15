# Privacy, safety and regulatory notes

## Data protection (Digital Personal Data Protection Act, 2023)

MadhuTwin is designed so that a deployment can meet the DPDP Act's core obligations. This prototype only processes open de-identified data (CGMacros) and fictional synthetic patients.

| DPDP principle | How the design supports it |
|---|---|
| Consent for a specified purpose (s.6) | Each record carries a consent object: purpose ("remote glycaemic monitoring and clinical decision support"), date, recipients and retention period. The dashboard shows it on the patient header. |
| Notice in a language the person understands (s.5) | Consent notice language is recorded per patient (Kannada, Tamil, Telugu, Hindi and others). |
| Purpose limitation and data minimisation | The twin needs only CGM, basic wearable signals, meal logs and routine labs. No location, contacts or free-text notes are collected. |
| Storage limitation | A retention period is recorded per patient. Raw streams can be summarised into the twin's parameters and AGP metrics after the retention window. |
| Rights to access, correction and erasure (s.11–13) | Each record exports as a standard FHIR R4 bundle; the twin can be rebuilt or deleted from the source record. A patient onboarded from an upload is stored only on the server that built the twin and is erased with one action from the patient page (record, streams, twin parameters and predictions). |
| Security safeguards (s.8) | Deployment guidance: encryption in transit and at rest, role-based access for the care team, audit logs of who viewed which twin. |

**Interoperability.** Records are exchanged as HL7 FHIR R4 bundles with LOINC, SNOMED CT, ICD-10 and WHO ATC codes, plus CGM summary codes from the HL7 CGM implementation guide. This is the same building block used by India's Ayushman Bharat Digital Mission (ABDM) health-information exchange.

## Clinical safety

- **Decision support, not autonomous care.** The system never issues dosing instructions. Medication points are phrased for clinician review ("consider reviewing the sulfonylurea dose").
- **Uncertainty is always shown.** Every forecast carries a 90 % conformal prediction interval with validated empirical coverage, and alerts report a probability, not just a yes/no.
- **Explanations.** Every alert lists its main drivers in plain language and the share of evidence from each data stream (CGM, wearable, meals, EHR, twin), computed with exact TreeSHAP.
- **Asymmetric alert thresholds.** The hypoglycaemia alert fires at 25 % probability; the hyperglycaemia alert at 50 %. Missing a hypoglycaemia event is more harmful than a false alarm.
- **No leakage, honest metrics.** Patient-level cross-validation; every prediction shown for a patient comes from a model that never saw that patient. Synthetic results are always labelled and never mixed with real-data evidence.
- **Simulations are labelled as model estimates.** What-if results support shared decision-making; they are not observed outcomes.
- **Copilot guardrails.** The copilot is grounded only in the twin's computed data, works offline through a deterministic rule engine, and states what it cannot answer.

## Regulatory pathway (if productised)

In India, clinical decision-support software that informs treatment decisions would likely be regulated as Software as a Medical Device under the Medical Devices Rules, 2017 (CDSCO). A product version would need:

1. a quality management system (ISO 13485) and software lifecycle processes (IEC 62304);
2. risk management (ISO 14971), including alert-fatigue and automation-bias analysis;
3. prospective clinical validation in Indian patients, comparing alert-guided care with standard care on time in range and hypoglycaemia;
4. post-market performance monitoring for drift (new CGM models, diet changes, new drugs).

This repository is a research prototype and is **not** a medical device.
