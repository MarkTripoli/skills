---
name: security-check
description: Run explicit Semgrep and Gitleaks security scans and report versioned, provenance-bound findings; incomplete coverage never counts as clean.
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

The selected directory must be a Git checkout with an `origin` remote. Semgrep and Gitleaks must be installed and available as `semgrep` and `gitleaks` on `PATH`. Semgrep runs `semgrep scan --json --config p/default --metrics=off --disable-version-check .` from the selected checkout and respects normal Git ignore rules. Gitleaks runs `gitleaks git ... .` against the selected checkout's Git history; untracked files and ignored files not committed to that history are outside its scope. Both scanners are limited to the selected repository, and neither runs during normal delivery. Semgrep needs network access to download the default community rules; telemetry is disabled and neither adapter uploads source. The command prints one JSON report to stdout and exits 0 only for complete coverage, 1 for incomplete coverage, and 2 for invalid arguments. Never infer cleanliness from a missing report, nonzero exit, or tool failure.

## Report contract

Report schema version is 1. Top-level fields include `schema_version`, `repository`, `revision`, `scanner`, `tool`, `secret_coverage`, `secret_tool`, `coverage`, and `findings`. `repository` is the normalized origin URL; `revision` is the checked-out Git `HEAD` commit. `tool` and `secret_tool` report `name`, `version`, `status` (`ok`, `failed`, or `unavailable`), and `exit_code`. `secret_coverage` is `complete` only when Gitleaks exits successfully and its JSON results are structurally valid; overall `coverage` is complete only when both scanners complete successfully.

Each finding has exactly these versioned fields: `schema_version`, `finding_id`, `repository`, `revision`, `rule_id`, `path`, `line`, `severity`, `scanner`, `message`, and `evidence_ref`. IDs are stable SHA-256 identifiers derived from repository, revision, scanner, rule, path, and line. Evidence references are SHA-256 digests of finding metadata; they do not contain source excerpts or secret material. Secret messages are fixed generic text, and scanner-provided message text is never copied into findings. Paths are repository-relative. Findings are sorted by path, line, rule ID, and scanner.

If repository identity, either scanner executable/run, or either report cannot be obtained and validated, mark the corresponding coverage incomplete. Never emit raw scanner diagnostics or secret-bearing scanner fields; explain failures with generic safe diagnostics and status/exit code. A failed scan can include parsed findings, but never present it as a clean result. Report the complete JSON or a faithful summary retaining both coverage fields, both tool statuses/versions, repository, revision, and every finding's rule, location, severity, scanner, and safe message.
