---
name: compliance-report
description: Produce an optional evidence-bound control-mapping triage inventory from normalized security-check output; never represents certification.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Compliance Report

This capability is opt-in. Invoke only when requested, after `/security-check` has produced normalized JSON. It consumes that report and optional accepted-risk records; it does not run scanners, broaden blocking policy, or certify compliance.

Run the deterministic adapter from the collection checkout:

```sh
node --input-type=module -e 'import fs from "node:fs"; import {assessCompliance} from "./skills/delivery/security-check/scripts/compliance.mjs"; const report=assessCompliance(JSON.parse(fs.readFileSync(process.argv[1])), {risks: process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2])) : []}); console.log(JSON.stringify(report))' <normalized-scan.json> [accepted-risks.json]
```

Retain the entire output. It inventories every input finding and reports scanner coverage separately. Each citation binds repository, scan revision, rule ID, and repository-relative path. Missing citation or unmapped scanner/rule remains `unknown`; mapped, cited findings remain `active` unless otherwise dispositioned. A valid unexpired accepted-risk record is `suppressed`; an explicit upstream reviewer disposition of `accepted` is retained as `accepted`. Both remain in the inventory. Expired risk does not suppress.

Catalog version is emitted with every report. Catalog controls provide triage mapping only, not certification, audit evidence, or a compliance attestation. Incomplete tool coverage or citation coverage remains visible and makes overall coverage incomplete. This optional report is not a delivery/publication gate.
