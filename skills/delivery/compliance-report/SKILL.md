---
name: compliance-report
description: Produce an optional evidence-bound control-mapping triage inventory from normalized security-check output; never represents certification.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Compliance Report

This capability is opt-in. Invoke only when requested, after `/security-check` has produced normalized JSON. It consumes that report and optional accepted-risk records; it does not run scanners, broaden blocking policy, or certify compliance.

Resolve this skill's installed directory from its `SKILL.md` location and pass its parent as `<skills-root>`. A selective install of `compliance-report` also installs the sibling `security-check` skill containing its executable adapter and accepted-risk helper. Run the deterministic adapter from either an installed skill root or the collection checkout:

```sh
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; import {pathToFileURL} from "node:url"; const {assessCompliance}=await import(pathToFileURL(path.join(process.argv[1],"security-check","scripts","compliance.mjs")).href); const report=assessCompliance(JSON.parse(fs.readFileSync(process.argv[2])), {risks: process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3])) : []}); console.log(JSON.stringify(report))' <skills-root> <normalized-scan.json> [accepted-risks.json]
```

Retain the entire output. It inventories both line-cited findings and line-less Trivy `file_findings`, counting the latter as unknown with a file location and unavailable source line rather than omitting them. Scanner coverage is recorded per executable-backed lane; `trivy_config` and `trivy_fs` both use the `trivy` binary. Each current-source citation binds repository, scan revision, rule ID, repository-relative path, source line, and normalized evidence reference. Gitleaks scans Git history, so its location remains `historical-unverified` and never claims a verified HEAD citation without a historical commit. Missing or duplicate finding identity remains `unknown`; mapped, fully cited current-source findings remain `active` unless a valid, unexpired accepted-risk record suppresses them. Suppressions retain reason and expiry; rejected risk entries expose validation coverage and errors.
Historical Gitleaks findings may retain a validated, unexpired accepted-risk suppression with its reason and expiry while their HEAD source-line citation remains `historical-unverified`; that status never makes coverage complete. Contradictory per-lane and aggregate scanner inventories, missing lane finding arrays, and findings assigned to a mismatched scanner lane reject the scan instead of reporting a false clean inventory.

Catalog version is emitted with every report. Catalog controls provide triage mapping only, not certification, audit evidence, or a compliance attestation. Incomplete tool coverage or citation coverage remains visible and makes overall coverage incomplete. This optional report is not a delivery/publication gate.
