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
node <installed-skills-dir>/model-endpoint-redteam/scripts/probe.mjs --url https://203.0.113.9/v1/chat/completions --authorization /secure/local/authorization.json --dry-run
```

Remove `--dry-run` only after confirming the locally supplied attestation. Live runs require the artifact to match the exact URL origin and path, include a nonempty operator, and be current. Live hostname targets are refused because this dependency-free CLI cannot pin `fetch` to the address it resolves; only IP-literal URLs are accepted. This avoids DNS rebinding but does not prove control of the IP address. Do not pass credentials to the CLI.

The CLI supports `--probes recon,schema,sensitivity,boundary,evasion,validation,extraction`, `--assessment <assessment.json>`, `--resume <progress.json>`, `--audit <audit.jsonl>`, `--max-attempts N`, `--retries N`, `--timeout-ms N`, and `--rate-ms N`. Resume state must be a report emitted by this CLI, bound to the same endpoint, authorized path, operator digest, and selected probe set. Every completed probe must contain matching response and assessment digests, scope, and probe identity; mismatches are refused. Prior attempts count against the new total attempt ceiling, and over-budget state is refused. An audit-write failure stops execution.

Each assessment entry is `{ "outcome": "pass" | "fail", "basis": "brief human assessment", "evidence_sha256": "sha256:<observed response digest>", "authorized_scope": "<exact origin and path>" }`, keyed by probe name. The digest and scope must match the actual response and current authorization; prewritten or unbound assessment remains `received_unassessed`. A probe becomes complete only when a response was received and its bound assessment says pass; fail remains failed. Without assessment, a response is `received_unassessed` and report status stays incomplete. The assessment is an operator assertion, not an independently verified model judgment. Assessment basis is represented in the report only by SHA-256 digest.

Audit and report records omit request payloads, credentials, and raw model responses. Evidence contains response digest, HTTP status, and response class. Missing or incomplete probes make the report incomplete. Do not claim a probe passed merely because an HTTP response arrived.

## Publication

Treat results as security evidence, not permission to publish. Preserve mandatory hosted recordings and human approval on publication. Never include secrets or raw model output in reports, task artifacts, or public evidence.

