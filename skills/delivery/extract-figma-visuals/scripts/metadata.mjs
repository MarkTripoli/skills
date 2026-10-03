#!/usr/bin/env node
// Validate local MCP exports without credentials, downloads, or metadata mutation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const nodePattern = /^\d+:\d+$/;
const digestPattern = /^[a-f0-9]{64}$/;
const fields = ['node_id', 'type', 'depth', 'parent_node_id', 'width', 'height', 'content_sha256'];
const meaningful = new Set(['FRAME', 'SECTION', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP']);
export function normalizeNodeId(value) {
  const normalized = String(value).replace(/^(\d+)-(\d+)$/, '$1:$2');
  if (!nodePattern.test(normalized)) throw new Error(`invalid Figma node id: ${value}`);
  return normalized;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function selectionValue(metadata) {
  const images = new Map(Object.values(metadata.images).map(image => [image.node_id, image]));
  return {root: {node_id: metadata.root.node_id, type: metadata.root.type}, selected: metadata.selected.map(node => {
    const image = images.get(node.node_id);
    if (!image) throw new Error(`selected node has no image: ${node.node_id}`);
    return Object.fromEntries(fields.map(field => [field, image[field]]));
  })};
}
export function selectionSha256(metadata) {
  return sha256(JSON.stringify(canonical(selectionValue(metadata))));
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function validateUrls(value, fileKey) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/https?:\/\/[^\s<>"']+/g)) {
      const url = new URL(match[0]);
      assert(url.protocol === 'https:' && url.hostname === 'www.figma.com' && !url.username && !url.password && !url.hash && !url.port, 'transient or noncanonical URL in metadata');
      assert(new RegExp(`^/(?:design|file)/${fileKey}(?:/[^/]*)?$`).test(url.pathname), 'Figma URL must refer to the selected file');
      assert([...url.searchParams.keys()].every(key => key === 'node-id') && url.searchParams.getAll('node-id').length <= 1, 'signed or connector URL in metadata');
      if (url.searchParams.has('node-id')) normalizeNodeId(url.searchParams.get('node-id'));
    }
  } else if (Array.isArray(value)) value.forEach(item => validateUrls(item, fileKey));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => validateUrls(item, fileKey));
}
export function validateBundle(bundleDir, expectedRoot) {
  assert(!fs.lstatSync(bundleDir).isSymbolicLink(), 'bundle directory must not be symlinked');
  const manifest = path.join(bundleDir, 'metadata.json');
  assert(!fs.lstatSync(manifest).isSymbolicLink(), 'manifest must not be symlinked');
  const metadata = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  assert(metadata.source === 'figma-mcp', 'source must be figma-mcp');
  assert(typeof metadata.file_key === 'string' && /^[a-zA-Z0-9_-]+$/.test(metadata.file_key), 'invalid Figma file key');
  assert(metadata.root && nodePattern.test(metadata.root.node_id), 'root requires canonical colon-form node id');
  if (expectedRoot !== undefined) assert(metadata.root.node_id === normalizeNodeId(expectedRoot), 'root differs from supplied frame');
  assert(Number.isInteger(metadata.max_depth) && metadata.max_depth >= 0 && metadata.max_depth <= 2, 'max_depth must be 0, 1, or 2');
  assert(metadata.images && !Array.isArray(metadata.images) && typeof metadata.images === 'object', 'images must be a filename mapping');
  const entries = Object.entries(metadata.images);
  assert(entries.length >= 1 && entries.length <= 25, 'selection must contain root and at most 24 additional images');
  assert(Array.isArray(metadata.selected) && metadata.selected.length === entries.length, 'selected must map every image exactly once');
  assert(Array.isArray(metadata.skipped) && metadata.skipped.length <= 100 && Array.isArray(metadata.warnings) && metadata.warnings.length <= 100, 'skipped and warnings must be bounded diagnostic lists');
  validateUrls(metadata, metadata.file_key);
  const nodes = new Map();
  for (const [filename, image] of entries) {
    assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.png$/.test(filename), 'image filename must be a local PNG basename');
    assert(image && nodePattern.test(image.node_id) && !nodes.has(image.node_id), 'image node ids must be canonical and unique');
    assert(meaningful.has(image.type), 'selected image type must be a meaningful container');
    assert(typeof image.name === 'string' && image.name.trim(), 'image name is required');
    assert(['get_screenshot', 'download_assets'].includes(image.source), 'image source must name a read-only MCP export');
    assert(Number.isFinite(image.width) && image.width > 0 && Number.isFinite(image.height) && image.height > 0, 'image dimensions must be positive');
    assert(image.depth === null ? image.parent_node_id === null : Number.isInteger(image.depth) && image.depth >= 0 && image.depth <= metadata.max_depth, 'invalid hierarchy depth');
    const imageUrl = new URL(image.figma_url);
    assert(imageUrl.protocol === 'https:' && imageUrl.hostname === 'www.figma.com', 'image URL must be a canonical Figma link');
    assert(imageUrl.searchParams.has('node-id') && normalizeNodeId(imageUrl.searchParams.get('node-id')) === image.node_id, 'image URL node does not match mapping');
    const local = path.join(bundleDir, filename);
    assert(!fs.lstatSync(local).isSymbolicLink() && fs.statSync(local).isFile(), 'image must be a regular local file');
    const bytes = fs.readFileSync(local);
    assert(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.subarray(12, 16).toString() === 'IHDR', 'image must contain a PNG render');
    assert(image.bytes === bytes.length && digestPattern.test(image.content_sha256) && image.content_sha256 === sha256(bytes), 'image bytes or content hash mismatch');
    nodes.set(image.node_id, image);
  }
  const root = metadata.images['screen.png'];
  assert(root && root.node_id === metadata.root.node_id && root.type === metadata.root.type && root.depth === 0 && root.parent_node_id === null, 'screen.png must map to the supplied root at depth 0');
  assert(metadata.selected[0]?.node_id === root.node_id, 'selected order must begin with the root');
  const selectedIds = new Set();
  for (const node of metadata.selected) {
    assert(node && nodes.has(node.node_id) && !selectedIds.has(node.node_id), 'selected nodes must map images without duplicates');
    const image = nodes.get(node.node_id);
    for (const field of fields.filter(field => field !== 'content_sha256')) assert(node[field] === image[field], `selected ${field} differs from image mapping`);
    if (image.depth !== null && image.depth > 0) {
      const parent = nodes.get(image.parent_node_id);
      assert(parent && selectedIds.has(parent.node_id) && parent.depth === image.depth - 1, 'descendant parent must precede child at the preceding depth');
    } else if (image.depth === 0) assert(image.node_id === root.node_id, 'only the root may have depth 0');
    selectedIds.add(node.node_id);
  }
  assert(digestPattern.test(metadata.selection_sha256) && metadata.selection_sha256 === selectionSha256(metadata), 'selection hash mismatch');
  return {root_node_id: root.node_id, selection_sha256: metadata.selection_sha256, images: entries.map(([filename]) => filename)};
}
export function main(argv = process.argv.slice(2)) {
  const [command, bundle, expectedRoot] = argv;
  try {
    if (!bundle || !['validate', 'fingerprint'].includes(command)) throw new Error('usage: metadata.mjs validate|fingerprint <bundle-dir> [root-node-id]');
    if (command === 'fingerprint') console.log(selectionSha256(JSON.parse(fs.readFileSync(path.join(bundle, 'metadata.json'), 'utf8'))));
    else console.log(JSON.stringify(validateBundle(bundle, expectedRoot)));
    return 0;
  } catch (error) { console.error(error.message); return 1; }
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
