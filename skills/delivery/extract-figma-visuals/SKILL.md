---
name: extract-figma-visuals
description: Export one Figma frame and selected meaningful descendants as a read-only visual reference bundle.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Extract Figma Visuals

Use the Figma MCP connector to export a supplied Figma root frame and a small set of independently meaningful descendants. The result is a read-only local image directory and metadata mapping every image to its Figma node. This skill does not change Figma, annotate it, implement UI, or assess implementation fidelity.

## Inputs

- A Figma design file URL or file key.
- A root frame URL containing `node-id`, or the root node ID separately. A concrete root is required; do not scan a broad page or whole file. Normalize the URL form `node-id=10047-10900` to the canonical MCP/metadata form `10047:10900`; preserve the original URL separately.
- A unique writable output directory. Orchestration uses `.agent-evidence/orchestration/<run-id>/figma/<ticket>/` and passes its absolute path to isolated workers.
- Figma MCP connector access to the supplied file. No personal Figma token, REST client, or local Figma setup is required.

The root frame is the unit of extraction. One ticket may name more than one root frame; create one bundle per root.

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

Call Figma MCP `get_metadata` for the root frame. It returns the XML hierarchy needed to select nodes; do not use `use_figma` or any write-capable action for this task.

Export the root at depth `0` unconditionally. At depths one and two, select only visible, independently meaningful `FRAME`, `SECTION`, `COMPONENT`, `COMPONENT_SET`, `INSTANCE`, or visually substantial `GROUP` nodes. Reject individual text, vectors, icons, tiny items, masks, empty containers, decorative wrappers, and repeated instances that show the same visual role.

Use `max_depth=2` by default. `max_depth=1` is appropriate for a coarse screen hierarchy; `0` exports only the root. Keep a conservative cap (normally 24 selected descendants and one representative per repeated visual role). If metadata cannot establish whether a candidate is meaningful, skip it and record the reason rather than exporting a node dump.

## 2. Export the selected nodes

For the root and every selected descendant, call Figma MCP `get_screenshot` with that file key and node ID. Save each returned PNG promptly in the bundle. Screenshot URLs are short-lived: never record one in metadata, task evidence, commits, or an MR.

Use Figma MCP `download_assets` instead when the connector provides a persistent exported node render or the caller specifically needs an asset-render variant. Save the returned content under the same bundle and record `download_assets` as the image source. If the environment cannot download a connector URL, request the screenshot with its supported base64 response and decode it locally.

For every saved image, calculate its SHA-256 and record it as `content_sha256`. After all selected images are written, calculate `selection_sha256` from canonical JSON containing the root and ordered selected node IDs, types, depths, parent IDs, dimensions, and image content hashes; exclude filenames, local paths, timestamps, skipped candidates, and warnings. These hashes make bundles comparable, but a changed PNG or selection hash is only an inspection signal because re-encoding can change bytes without changing the design. Consumers confirm a material visual or behavioral change from mapped node identity, dimensions, hierarchy, and the rendered images before starting reconciliation. Write or update `metadata.json` using the schema below and record rejected candidates in a bounded `skipped` list. A missing root export, inaccessible file, or unavailable Figma MCP connector is an extraction failure: report the safe failure and do not substitute a manual screenshot, recreated mock, or text description.

## 3. Validate the bundle

Before handoff, check all of these:

1. `metadata.json` exists and parses as JSON.
2. `images.screen.png.node_id` equals the supplied root node ID.
3. Every `images` entry names an existing nonempty local image file.
4. Every image's recorded `content_sha256` matches the saved bytes, and recomputing the canonical selection produces `selection_sha256`.
5. The selected images form a small visual hierarchy rather than a recursive node dump.

Run `node <installed-skills-dir>/extract-figma-visuals/scripts/metadata.mjs validate <bundle-dir> <root-node-id>`. The read-only helper checks local image bytes, canonical node identities, hierarchy, bounded selection, and fingerprints; it never contacts Figma. `fingerprint <bundle-dir>` prints the deterministic selection hash without changing the manifest. Construct `selected` in root-first order, followed by descendants in traversal order and explicit additional nodes in export order.

Open the root image and the descendants relevant to the assigned UI surface. Record the output path, root node ID, depth, and manifest path in orchestration evidence. Do not commit run evidence to product code.

## 4. Export an additional node only when needed

For a supplied node ID, call Figma MCP `get_screenshot` (or `download_assets` when appropriate), save it under the existing root bundle using a collision-safe filename, and append its mapping to `metadata.json`. Set `depth` and `parent_node_id` to `null` when that node was not selected through this root traversal. Record its content SHA-256 and recompute `selection_sha256`. This is the equivalent of `export_figma_node(node_id)`; it must not change traversal behavior or Figma.

## Handoff

Pass the root Figma URL, bundle absolute path, manifest absolute path, selected filenames, root node ID, max depth, `selection_sha256`, and extraction warnings. UI implementation and visual-review agents inspect the root plus relevant descendant images before using Figma MCP for a narrower question.

When the caller requests a durable task receipt, resolve `<task-root>` per the conventions and record type `visual-reference` in `design.visual` through the adjacent task-artifact helper or exact manual index contract. The receipt contains canonical Figma node links, local manifest path, selection/content hashes and safe limitations, not images or connector URLs. An indexed receipt is immutable: a later extraction creates the next iteration. Validate the index and use full record paths; legacy numbered selection applies only when the index is absent. Extraction also runs independently without a task record.

## Guardrails

- Figma and its nodes are read-only inputs. Never edit, annotate, or reorganize them.
- Use Figma MCP only; never require or read `FIGMA_TOKEN`, a personal access token, or a REST API credential.
- Do not replace a missing export with a hand-captured screenshot, recreated mock, or text description.
- Do not export all descendants recursively. Root-frame depth and filtering limits protect workers from an unusable image dump.
- Do not put connector URLs, signed image URLs, or visual bundles in commits, task artifacts, or MR descriptions.
