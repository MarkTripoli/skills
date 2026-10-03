---
name: extract-figma-visuals
description: Exports one Figma root frame and selected meaningful descendants through the Figma MCP connector into a read-only local image bundle with a metadata.json node mapping. Use when a ticket names a Figma frame that implementers or reviewers must see as images, or when orchestration needs a design bundle; not for judging implementation fidelity or editing Figma.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Extract Figma Visuals

Use the Figma MCP connector to export a supplied Figma root frame and a small set of independently meaningful descendants. The result is a read-only local image directory and a `metadata.json` mapping every image to its Figma node. This skill does not change Figma, annotate it, implement UI, or assess implementation fidelity. Figma and its nodes are read-only inputs, and you never require or read `FIGMA_TOKEN`, a personal access token, or a REST API credential.

## Inputs

- A Figma design file URL or file key.
- A root frame URL containing `node-id`, or the root node ID separately. A concrete root is required; do not scan a broad page or whole file. Normalize the URL form `node-id=10047-10900` to the canonical MCP/metadata form `10047:10900`; preserve the original URL separately.
- A unique writable output directory. Orchestration uses `.agent-evidence/orchestration/<run-id>/figma/<ticket>/` and passes its absolute path to isolated workers.
- Figma MCP connector access to the supplied file.

The root frame is the unit of extraction. One ticket may name more than one root frame; create one bundle per root.

`<server>` is the name your runtime registered for the Figma MCP server; use the tool name your tool list shows.

| Tool | Use |
| --- | --- |
| `<server>:get_metadata` | Read the hierarchy of the root frame. |
| `<server>:get_screenshot` | Render a node to PNG. |
| `<server>:download_assets` | Download a persistent node render. |

## Output contract

Create `<output>/<root-name>/`:

```text
home/
├── screen.png
├── header.png
├── hero.png
├── recent-activity.png
├── activity-card.png
├── bottom-navigation.png
└── metadata.json
```

`screen.png` always maps to the supplied root. Descendant filenames are collision-safe, for example `activity-card-2.png`. [The metadata schema](references/metadata-schema.md) maps filenames to Figma node IDs, dimensions, ancestry, depth, node URLs, and stable content fingerprints. Consumers use `metadata.json` as the source of truth; a file left behind by an interrupted old run is not a selected image.

## 1. Read the hierarchy through Figma MCP

Call `<server>:get_metadata` for the root frame. It returns the XML hierarchy needed to select nodes; use no write-capable Figma action for this task (for example `use_figma`). A missing root export, inaccessible file, or unavailable Figma MCP connector is an extraction failure: report the safe failure and do not substitute a manual screenshot, recreated mock, or text description.

Export the root at depth `0` unconditionally. At depths one and two, select only visible, independently meaningful `FRAME`, `SECTION`, `COMPONENT`, `COMPONENT_SET`, `INSTANCE`, or visually substantial `GROUP` nodes. Reject individual text, vectors, icons, tiny items, masks, empty containers, decorative wrappers, and repeated instances that show the same visual role.

Use `max_depth=2` by default. `max_depth=1` is appropriate for a coarse screen hierarchy; `0` exports only the root. Keep a conservative cap (normally 24 selected descendants and one representative per repeated visual role). If metadata cannot establish whether a candidate is meaningful, skip it and record the reason in a bounded `skipped` list rather than exporting a node dump.

## 2. Export the selected nodes

Default: call `<server>:get_screenshot` with the file key and node ID for the root and every selected descendant, and save each returned PNG promptly in the bundle. If a persistent render is needed, use `<server>:download_assets` and record `download_assets` as the image source. If the connector URL cannot be downloaded, request base64 and decode it locally.

Screenshot URLs are short-lived. Never put a connector URL, signed image URL, or visual bundle in metadata, task evidence, commits, or a PR description.

Write `metadata.json` with the root, `selected` node IDs in order, and an `images` record per file (node ID, name, type, depth, parent ID, dimensions, URL, source) as the [schema](references/metadata-schema.md) describes. Leave `bytes`, `content_sha256`, and `selection_sha256` to the script in step 3.

## 3. Finalize and validate the bundle

Run `node <skill-dir>/scripts/finalize-bundle.mjs <bundle-dir> --root <root-node-id>`. It computes each image's SHA-256 and the selection hash, writes them to `metadata.json`, and checks that `metadata.json` parses, `screen.png` maps to the supplied root node, every image file exists and is a nonempty PNG, hashes match the saved bytes, and the selection stays small. Fix every reported error and rerun until it exits 0.

Run `node <installed-skills-dir>/extract-figma-visuals/scripts/metadata.mjs validate <bundle-dir> <root-node-id>`. The read-only helper checks local image bytes, canonical node identities, hierarchy, bounded selection, and fingerprints; it never contacts Figma. `fingerprint <bundle-dir>` prints the deterministic selection hash without changing the manifest. Construct `selected` in root-first order, followed by descendants in traversal order and explicit additional nodes in export order.

Open the root image and the descendants relevant to the assigned UI surface. Record the output path, root node ID, depth, and manifest path in orchestration evidence. Do not commit run evidence to product code.

## 4. Export an additional node only when needed

For a supplied node ID, call `<server>:get_screenshot` (or `<server>:download_assets` when appropriate), save it under the existing root bundle using a collision-safe filename, and add its record to `images` and `selected`. Set `depth` and `parent_node_id` to `null` when that node was not selected through this root traversal. Delete `selection_sha256` from `metadata.json` and rerun the script in step 3. This is the equivalent of `export_figma_node(node_id)`; it must not change traversal behavior or Figma.

## Handoff

Pass the root Figma URL, bundle absolute path, manifest absolute path, selected filenames, root node ID, max depth, `selection_sha256`, and extraction warnings. UI implementation and visual-review agents inspect the root plus relevant descendant images before using Figma MCP for a narrower question.

When the caller requests a durable task receipt, resolve `<task-root>` per the conventions and record type `visual-reference` in `design.visual` through the adjacent task-artifact helper or exact manual index contract. The receipt contains canonical Figma node links, local manifest path, selection/content hashes and safe limitations, not images or connector URLs. An indexed receipt is immutable: a later extraction creates the next iteration. Validate the index and use full record paths; legacy numbered selection applies only when the index is absent. Extraction also runs independently without a task record.

## Guardrails

- Figma and its nodes are read-only inputs. Never edit, annotate, or reorganize them.
- Use Figma MCP only; never require or read `FIGMA_TOKEN`, a personal access token, or a REST API credential.
- Do not replace a missing export with a hand-captured screenshot, recreated mock, or text description.
- Do not export all descendants recursively. Root-frame depth and filtering limits protect workers from an unusable image dump.
- Do not put connector URLs, signed image URLs, or visual bundles in commits, task artifacts, or PR descriptions.
