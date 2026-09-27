---
name: security-check
description: Run an explicit Semgrep security scan and report versioned findings with repository and revision provenance; incomplete scans never count as clean.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Security Check

This is an opt-in scan. Run only when an operator explicitly requests `/security-check`; normal delivery does not invoke it, upload source, or change the repository.

## Run

From the repository root, execute:

```sh
node <installed-skills-dir>/security-check/scripts/security-check.mjs
```

Or select a checkout explicitly:

```sh
node <installed-skills-dir>/security-check/scripts/security-check.mjs --root <repository-path>
```

The selected directory must be a Git checkout with an `origin` remote. Semgrep must be installed and available as `semgrep` on `PATH`. The adapter invokes `semgrep scan --json --config p/default --metrics=off --disable-version-check .` from that checkout, respecting normal Git ignore rules. Semgrep needs network access to download the default community rules; telemetry is disabled and the adapter does not upload source. It prints one JSON report to stdout and exits 0 only for complete coverage, 1 for incomplete coverage, and 2 for invalid arguments. Never infer cleanliness from a missing report, nonzero exit, or tool failure.

## Report contract

Report schema version is 1. Top-level fields: `schema_version`, `repository`, `revision`, `scanner`, `tool`, `coverage`, and `findings`. `repository` is the normalized origin URL; `revision` is the checked-out Git `HEAD` commit. `tool` reports `name`, `version`, `status` (`ok`, `failed`, or `unavailable`), and `exit_code`. `coverage` is `complete` only when Semgrep exits successfully and its JSON results are structurally valid; otherwise it is `incomplete`.

Each finding has exactly these versioned fields: `schema_version`, `finding_id`, `repository`, `revision`, `rule_id`, `path`, `line`, `severity`, `scanner`, `message`, and `evidence_ref`. IDs are stable SHA-256 identifiers derived from repository, revision, scanner, rule, path, and line. Evidence references are SHA-256 digests; they do not contain source excerpts. Paths are repository-relative. Findings are sorted by path, line, then rule ID.

If the repository identity, revision, Semgrep executable, Semgrep run, or report cannot be obtained and validated, state `coverage: incomplete` and explain the error. A failed scan can include parsed findings, but never present it as a clean result. Report the complete JSON or a faithful summary retaining coverage, tool status/version, repository, revision, and every finding's rule, location, severity, and message.
