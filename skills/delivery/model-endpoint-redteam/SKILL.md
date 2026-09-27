---
name: model-endpoint-redteam
description: Run explicitly authorized, bounded adversarial probes against a model API endpoint and produce redacted evidence.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Model Endpoint Redteam

Run only when an operator explicitly requests this skill and provides a local authorization artifact for the exact target. Private IP addresses and endpoint reachability do not establish ownership. The artifact records operator attestation; the tool does not independently verify ownership.

## Run

Create a local JSON artifact outside the repository and task artifacts:

```json
{"schema_version":1,"origin":"https://203.0.113.9","path":"/v1/chat/completions","operator":"operator identity","authorized_at":"2026-09-27T12:00:00Z","expires":"2026-09-27T13:00:00Z"}
```

Then use:

```sh
node <installed-skills-dir>/model-endpoint-redteam/scripts/probe.mjs --url https://203.0.113.9/v1/chat/completions --dry-run
```

The CLI defaults to dry-run, including when called through the module API without `live: true`. Live execution requires explicit `--live` (or `live: true` through the module API) and the local authorization artifact bound to the exact URL origin/path, operator, and current time. Authorization expiry and identity are rechecked immediately before every request. Live hostname targets are refused because this dependency-free CLI cannot pin `fetch` to a resolved address; only IP-literal URLs are accepted. This avoids DNS rebinding but does not prove IP ownership. Do not pass credentials to the CLI.

The CLI supports probe selection, `--audit <audit.jsonl>`, `--max-attempts N`, `--retries N`, `--timeout-ms N`, and `--rate-ms N`. `--rate-ms` must be positive; live requests are paced at least 100 ms apart using a monotonic clock. Resume and preloaded assessment inputs are not supported. Each fetch attempt has an append-only `attempt-start` event before the request and `attempt-result` event after it, bound by unique run and attempt IDs. Any audit write failure stops execution.

Each response is recorded as `received_unassessed` with a response digest only; even a successful HTTP status never becomes a security pass in this CLI. Reports contain no request payloads, credentials, or raw model responses. Report status stays `incomplete` unless a request fails, in which case it is `failed`. Assess results separately from observed evidence; this CLI does not accept prewritten assessments or produce `complete`.

## Publication

Treat results as security evidence, not permission to publish. Preserve mandatory hosted recordings and human approval on publication. Never include secrets or raw model output in reports, task artifacts, or public evidence.

