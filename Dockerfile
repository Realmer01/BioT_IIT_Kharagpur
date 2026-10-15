# MadhuTwin demo image: builds the dashboard, generates the synthetic Bharat cohort,
# trains demo models and serves API + dashboard on port 8000.
FROM node:20-slim AS web
WORKDIR /app/dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY dashboard/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY madhutwin/ madhutwin/
COPY scripts/ scripts/
COPY reports/ reports/
COPY data/samples/ data/samples/
COPY --from=web /app/dashboard/dist dashboard/dist
# Demo build (~5-10 min): synthetic cohort + quick models. For the full real-data pipeline see README.
RUN python scripts/build_bharat.py && python scripts/train_deploy.py --quick
EXPOSE 8000
CMD ["uvicorn", "madhutwin.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
