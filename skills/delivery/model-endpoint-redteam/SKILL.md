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

The CLI defaults to dry-run, including when called through the module API without `live: true`. Live execution requires explicit `--live` (or `live: true` through the module API) and the local authorization artifact bound to the exact URL origin/path, operator, and current time. Before each request, it rechecks the original authorization deadline and immutable digest of the full grant; extending or editing the artifact during a run stops execution. Live hostname targets are refused because this dependency-free CLI cannot pin `fetch` to a resolved address; only IP-literal URLs are accepted. This avoids DNS rebinding but does not prove IP ownership. Do not pass credentials to the CLI.

The CLI supports probe selection, `--audit <audit.jsonl>`, `--max-attempts N`, `--retries N`, `--timeout-ms N`, and `--rate-ms N`. By default, audit goes to the absolute `$HOME/.local/state/model-endpoint-redteam/audit.jsonl`, outside the checkout. Its directory must be operator-owned mode `0700`; audit files must be operator-owned mode `0600`, regular, and single-link. Parent paths are checked for symlinks and unsafe ownership or write permissions. Newly created directory entries and files are synced, and each appended event is synced before the audit call returns; an unavailable sync barrier stops execution. Each fetch attempt has an append-only `attempt-start` event before the request and `attempt-result` event after it, bound by unique run and attempt IDs and the authorization grant digest. Any audit write failure stops execution.

Each response body is capped at 64 KiB before JSON parsing; the report records a digest of the bounded response bytes, not the body. The exact authorized origin/path and grant remain internal; the report exposes only SHA-256 digests. Reports contain no request payloads, credentials, raw model responses, or path-embedded tokens. Report status stays `incomplete` unless any attempt fails, in which case it is `failed`; recovered probes retain `failed_attempts` and `recovered_after_failure` without a stale error. Assess results separately from observed evidence; this CLI does not accept prewritten assessments or produce `complete`.

## Publication

Treat results as security evidence, not permission to publish. Preserve mandatory hosted recordings and human approval on publication. Never include secrets or raw model output in reports, task artifacts, or public evidence.

