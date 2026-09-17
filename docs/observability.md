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

Grafana Cloud, the short way: the stack's OTLP gateway takes both metrics and events with the credential Grafana shows under Connections, OpenTelemetry: `OTLP_ENDPOINT=https://otlp-gateway-prod-<region>.grafana.net/otlp` and `OTLP_AUTH="Basic <base64 of instance:token>"` (the `Authorization` header value verbatim). Metrics arrive in the stack's Prometheus datasource under their Prometheus names; events arrive in Loki as `{service_name="archon_delivery"}` with `workflow`, `event_type`, `node`, and `run` as structured metadata, so `| json` or `| event_type="approval_received"` selects them. Verified against a live stack with the delivery-lean run.

Other targets: `PROM_PUSHGATEWAY_URL`; Grafana Cloud Influx metrics use `GRAFANA_CLOUD_METRICS_URL` (the Influx endpoint host shown under the stack's Prometheus details; it is not derivable from the datasource URL), `GRAFANA_CLOUD_METRICS_USER` (the Prometheus instance id, the datasource's basic-auth user), and `GRAFANA_CLOUD_TOKEN` (an access-policy token, `glc_...`, with `metrics:write`; also accepted as `GRAFANA_SA_TOKEN`); Loki uses `LOKI_URL` (`https://logs-prod-NNN.grafana.net`), `LOKI_USER` (the Loki instance id), and `LOKI_TOKEN` or `GRAFANA_CLOUD_TOKEN` (`logs:write`).

`--provision` talks to Grafana's HTTP API with `GRAFANA_URL` and `GRAFANA_SA_TOKEN` (a service-account token, `glsa_...`); a Cloud stack works the same way; set `GRAFANA_PROMETHEUS_URL` to create or update the `archon-prometheus` datasource. Grafana Cloud metrics uses Influx line protocol, while self-hosted Grafana reads Prometheus from the served endpoint.

Nothing is sent unless a target variable is configured. Loki and OTLP log pushes keep a cursor at `<db directory>/metrics-cursor.json`; pass `--cursor` to change it, and `--since` bypasses it.

Node 22.13 or later is required for the built-in `node:sqlite` module.
