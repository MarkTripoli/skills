---
name: repo-relationships
description: Analyze operator-selected Git checkouts for evidence-backed NATS, package, and Kubernetes relationships without modifying repositories.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Repository Relationships

Explicit, read-only relationship analysis across operator-named Git checkouts. Never run implicitly and never change any checkout. Do not infer HTTP communication from imports or service names; this analyzer intentionally reports no HTTP relationships.

## Run

```sh
node <installed-skills-dir>/repo-relationships/scripts/analyze.mjs \
  --repo orders=/path/to/orders \
  --repo billing=/path/to/billing
```

Each root must be a Git checkout with an `origin`, resolvable `HEAD`, and clean working tree; dirty or unreadable roots are skipped and mark coverage incomplete so mutable files are never attributed to a commit. Names are unique safe labels supplied by the operator. Output is one JSON report. Exit 2 indicates invalid arguments; skipped roots and traversal problems remain explicit in JSON coverage. Analysis accepts 2–32 roots. Traversal is bounded to 2,000 files, 256 KiB per file, and 16 MiB total per root; symlinks, hidden entries, and common dependency/build directories are not traversed.

## Evidence contract

Schema version 1 records every readable root's operator label, credential-stripped origin, and exact HEAD. `evidence` entries carry repository, origin, HEAD, path, and one-based source line. Relationships include only literal NATS publish/subscribe subject matches across different roots; package dependency declarations matched to another checkout's package identity; and Kubernetes Service selectors matching workload labels across roots. These are static declaration matches, not proof of runtime connectivity. No HTTP edge is inferred. Auth and TLS remain `uncertain`; do not upgrade those fields without direct evidence. Credentials are never output. The `coverage` field is `incomplete` whenever a root cannot be read completely, and `skipped_roots` identifies affected operator labels.

Do not paste credentials into labels or treat static matches as runtime proof. The analyzer reports evidence, not a deployment or security verdict.
