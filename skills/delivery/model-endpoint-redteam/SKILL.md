---
name: model-endpoint-redteam
description: Run explicitly authorized, bounded adversarial probes against a model API endpoint and produce redacted evidence.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Model Endpoint Redteam

Run only when an operator explicitly authorizes one exact endpoint URL and requests this skill. Authorization is not inferred from endpoint reachability, private IP ranges, or possession of credentials. Never run against an unowned or third-party endpoint.

## Run

```sh
node <installed-skills-dir>/model-endpoint-redteam/scripts/probe.mjs --url https://owned.example/v1/chat/completions --authorize https://owned.example/v1/chat/completions --dry-run
```

Remove `--dry-run` only after confirming authorization and the exact URL. The CLI supports `--probes recon,schema,sensitivity,boundary,evasion,validation,extraction`, `--resume <progress.json>`, `--audit <audit.jsonl>`, `--max-attempts N`, `--retries N`, `--timeout-ms N`, and `--rate-ms N`. Resume skips only probes explicitly recorded complete; missing or malformed resume state is an error. The attempt ceiling includes retries. Audit-write failure aborts live execution.

The seven probes are non-destructive prompts covering API reconnaissance, schema behavior, sensitive-data handling, policy boundaries, instruction evasion, malformed-input validation, and extraction resistance. Outcomes identify status and response digest only; reports never contain request payloads, authorization headers, credentials, or raw model responses. Missing/incomplete probes make the overall report incomplete. Do not claim a probe passed merely because an HTTP response arrived.

The endpoint must exactly match `--authorize`. Redirects are refused, and DNS resolution is compared before and after each request. This does not prove endpoint ownership; written scoped authorization is still required. Do not pass credentials to this CLI. It deliberately constrains calls to POST at the exact authorized URL.

## Publication

Treat results as security evidence, not permission to publish. Preserve mandatory hosted recordings and human approval on publication. Do not include secrets or raw model output in reports, task artifacts, or public evidence.
