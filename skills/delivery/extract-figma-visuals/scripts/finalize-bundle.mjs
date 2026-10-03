#!/usr/bin/env node
// Finalizes an extract-figma-visuals bundle: fills bytes and content_sha256 for every image,
// computes selection_sha256, and checks the bundle. Prints one JSON report; exits 1 on any error.
// Usage: node finalize-bundle.mjs <bundle-dir> [--root <node-id>]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectionSha256} from './metadata.mjs';

const MAX_SELECTED = 25; // Root plus at most 24 additional exports.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const colonForm = (id) => String(id).replace(/^(\d+)-(\d+)$/, '$1:$2');

export function finalizeBundle(dir, {root} = {}) {
  const errors = [];
  const file = path.join(dir, 'metadata.json');
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return {ok: false, errors: [`metadata.json is missing or not JSON: ${error.message}`]};
  }
  const images = meta.images && typeof meta.images === 'object' ? meta.images : {};
  if (!Object.keys(images).length) errors.push('metadata.json has no images');

  const screen = images['screen.png'];
  const wantedRoot = colonForm(root ?? meta.root?.node_id ?? '');
  if (!screen) errors.push('images has no screen.png entry for the root');
  else if (!wantedRoot || colonForm(screen.node_id) !== wantedRoot) errors.push(`screen.png node_id ${screen.node_id} does not equal root ${wantedRoot || '(none)'}`);

  for (const [name, record] of Object.entries(images)) {
    const target = path.resolve(dir, name);
    if (path.dirname(target) !== path.resolve(dir)) { errors.push(`${name}: not a plain file name in the bundle`); continue; }
    let bytes;
    try { bytes = fs.readFileSync(target); } catch { errors.push(`${name}: image file is missing`); continue; }
    if (!bytes.length) { errors.push(`${name}: image file is empty`); continue; }
    if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) { errors.push(`${name}: not a PNG`); continue; }
    const hash = sha256(bytes);
    if (record.content_sha256 && record.content_sha256 !== hash) errors.push(`${name}: content_sha256 does not match the saved bytes`);
    else record.content_sha256 = hash;
    record.bytes = bytes.length;
  }

  const ids = (Array.isArray(meta.selected) ? meta.selected : []).map((item) => colonForm(typeof item === 'object' ? item.node_id : item));
  if (ids.length > MAX_SELECTED) errors.push(`${ids.length} selected nodes exceeds the cap of ${MAX_SELECTED}; this is a node dump, not a visual hierarchy`);
  for (const id of ids) {
    if (!Object.values(images).some((candidate) => colonForm(candidate.node_id) === id)) errors.push(`selected node ${id} has no saved image`);
  }
  if (screen && !errors.length) {
    try {
      const selection = selectionSha256(meta);
      if (meta.selection_sha256 && meta.selection_sha256 !== selection) errors.push('selection_sha256 does not match the selection; delete it from metadata.json and rerun if you changed the selection');
      else meta.selection_sha256 = selection;
    } catch (error) {
      errors.push(`selected nodes do not match the metadata schema: ${error.message}`);
    }
  }
  if (errors.length) return {ok: false, errors};
  fs.writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`);
  return {ok: true, errors: [], selection_sha256: meta.selection_sha256, images: Object.keys(images).length};
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const [dir, flag, root] = process.argv.slice(2);
  if (!dir || (flag && flag !== '--root')) {
    console.error('Usage: node finalize-bundle.mjs <bundle-dir> [--root <node-id>]');
    process.exit(2);
  }
  const report = finalizeBundle(dir, {root});
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
