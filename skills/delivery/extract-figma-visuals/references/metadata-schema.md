# Metadata schema

`metadata.json` is the local selected-image mapping. It is a JSON object with these stable fields:

| Field | Meaning |
|---|---|
| `source` | Always `figma-mcp` for this skill. |
| `file_key` | Figma file key used by the MCP request. |
| `root` | Canonical colon-form root node ID, name, and type. |
| `max_depth` | Maximum selected descendant depth. Root depth is `0`. |
| `selection_sha256` | SHA-256 of canonical root/selection structure and selected image fingerprints; excludes local paths and timestamps. |
| `generated_at`, `updated_at` | UTC extraction timestamps. `updated_at` appears after a one-node export. |
| `images` | Filename-keyed mapping of successfully saved local images. |
| `selected` | Root-first ordered node records: `node_id`, `type`, `depth`, `parent_node_id`, `width`, `height`, matching each image exactly once. Descendant parents precede children; explicit extra nodes follow traversal. |
| `skipped` | Bounded diagnostic list of rejected nodes and reasons. |
| `warnings` | Safe export or download warnings that did not prevent the root export. |

Each `images.<filename>` record contains `node_id`, `name`, `type`, `depth`, `parent_node_id`, `width`, `height`, `bytes`, `content_sha256`, `figma_url`, and `source`. Node IDs use canonical colon form (`10047:10900`) even when the original URL used `10047-10900`. `content_sha256` fingerprints the saved image bytes. `source` is either `get_screenshot` or `download_assets`; it is not a URL. A one-node export sets `depth` and `parent_node_id` to `null`.

`screen.png` is the root image record. Consumers select files from `images`; they do not infer selected output from directory contents. To compute `selection_sha256`, serialize canonical JSON containing the root and ordered selected node records (`node_id`, `type`, `depth`, `parent_node_id`, `width`, `height`, and `content_sha256`) and hash those bytes. Never include filenames, paths, timestamps, skipped entries, warnings, transient connector URLs, or signed image URLs in the canonical value. Hash changes trigger visual inspection; they do not by themselves prove a material design change.

## Deterministic serialization and validation

The canonical value is `{root: {node_id, type}, selected: [...]}`. Each selected entry takes `node_id`, `type`, `depth`, `parent_node_id`, `width`, `height`, and `content_sha256` from its corresponding image. Sort object keys lexicographically at every level, preserve array order, and serialize with `JSON.stringify` (UTF-8, no whitespace or trailing newline). The image's display name and the root name are not fingerprint inputs.

`node scripts/metadata.mjs fingerprint <bundle-dir>` prints the hash to place in the manifest; it writes nothing. `node scripts/metadata.mjs validate <bundle-dir> <root-node-id>` validates the manifest and selected local PNG files, prints the root/hash/filenames receipt, and exits nonzero on failure. Both commands are local and read-only, never an alternative Figma exporter. No source-string tests or personal token are needed.

All metadata URLs must be canonical `https://www.figma.com/design/<file-key>/<name>?node-id=<id>` (or `/file/`) links, with no additional query parameters. `figma_url` must identify its image node and file. Never store a download/connector URL even in `warnings` or `skipped`. At most 25 images (root plus 24 additional nodes) and 100 skipped diagnostics are accepted; `max_depth` is `0`, `1`, or `2`. A hash difference signals inspection, not automatic conformance failure.
