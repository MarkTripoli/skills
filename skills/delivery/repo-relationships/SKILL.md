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

Each root must resolve to the canonical Git toplevel and have an `origin` and commit `HEAD`; roots sharing one Git common directory are rejected. The analyzer reads only regular file blobs reachable from that `HEAD`, never the working tree, ignored files, or other uncommitted content. Git subprocesses disable optional locks, fsmonitor, untracked-cache refresh, split-index refresh, replacement objects, and lazy fetch. Names are unique safe labels supplied by the operator. Output is one JSON report. Exit 2 indicates invalid arguments; skipped roots and traversal problems remain explicit in JSON coverage. Analysis accepts 2–32 roots. Traversal is bounded to 2,000 files, 256 KiB per file, and 16 MiB total per root; symlink blobs, hidden paths, and common dependency/build directories are not analyzed.

The YAML parser is vendored with the skill at `scripts/vendor/yaml/` from `yaml@2.9.0` browser distribution. `scripts/yaml-parser.mjs` exposes only `parseAllDocuments`; its ISC license is included beside the vendored modules. Installed copies require no parent `node_modules`, dependency install, or network access.

## Evidence contract

Schema version 1 records each readable root's operator label, a remote-origin fingerprint, and exact HEAD. A remote `origin` is reported as `<protocol>//<host>#sha256=<digest>`; the digest covers the full remote path, while raw paths, credentials, and query strings are never emitted. `evidence` entries carry repository, origin, HEAD, path, and one-based source line; Kubernetes declarations also carry their namespace, defaulting to `default` when omitted. Package citations are located by JSON object ancestry; duplicate keys and ambiguous citations reduce coverage rather than inventing a line. Only a file whose basename is exactly `package.json` is treated as a manifest. NATS evidence requires a static `connect` import or `require` from the `nats` package, a client assigned from that connection, and a literal publish/subscribe call on that client; comments, strings, arbitrary `.publish` methods, and dynamic subjects are ignored. Cross-root NATS subject relationships are classified as `candidate`, not proof of runtime delivery. Package dependencies matched to another checkout's package identity and Kubernetes Service selectors matched to workload labels in the same namespace are also declaration matches, not runtime proof. No HTTP edge is inferred. Auth and TLS remain `uncertain`; credentials are never output. YAML parse errors, duplicate mapping keys, multi-document files, unsupported documents, and traversal/output limits mark coverage incomplete while retaining evidence from analyzable sources. Per-run output is capped at 10,000 evidence edges and 5,000 relationships, with at most 50,000 Kubernetes relationship candidates examined; exceeding a cap marks coverage incomplete.

Do not paste credentials into labels or treat static matches as runtime proof. The analyzer reports evidence, not a deployment or security verdict.
