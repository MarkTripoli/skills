# Observability

`scripts/metrics.mjs` reads `~/.archon/archon.db` read-only. Set `ARCHON_HOME` or pass `--db` to use another database.

Measured metrics:

- `archon_runs_total`, `archon_run_duration_seconds`
- `archon_node_duration_seconds`, `archon_node_failures_total`
- `archon_gate_wait_seconds`, `archon_gate_decisions_total`
- `archon_loop_iterations`
- `archon_tokens_total`, `archon_cost_usd_total`
- `archon_metrics_runs_scanned`, `archon_metrics_db_mtime_seconds`

Run modes:

- `node scripts/metrics.mjs --print` writes Prometheus text. `--since 7d` or `--since <iso>` bounds the scan.
- `node scripts/metrics.mjs --serve 9464` serves `/metrics` and `/healthz`, recomputing on every scrape.
- `node scripts/metrics.mjs --push` sends configured targets once. `--provision` imports the Grafana dashboard.

Targets use `PROM_PUSHGATEWAY_URL`; Grafana Cloud uses `GRAFANA_CLOUD_METRICS_URL`, `GRAFANA_CLOUD_METRICS_USER`, and `GRAFANA_SA_TOKEN`; Loki uses `LOKI_URL`, optional `LOKI_USER`, and `LOKI_TOKEN` or `GRAFANA_SA_TOKEN`.

Self-hosted Grafana uses `GRAFANA_URL` and `GRAFANA_SA_TOKEN`; set `GRAFANA_PROMETHEUS_URL` to create or update the `archon-prometheus` datasource. Grafana Cloud metrics uses Influx line protocol, while self-hosted Grafana reads Prometheus from the served endpoint.

Nothing is sent unless a target variable is configured. Loki pushes keep a cursor at `<db directory>/metrics-cursor.json`; pass `--cursor` to change it, and `--since` bypasses it.

Node 22.13 or later is required for the built-in `node:sqlite` module.
