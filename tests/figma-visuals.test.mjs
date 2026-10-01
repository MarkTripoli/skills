import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {normalizeNodeId, selectionSha256, validateBundle} from '../skills/delivery/extract-figma-visuals/scripts/metadata.mjs';

const validator = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/delivery/extract-figma-visuals/scripts/metadata.mjs');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-bundle-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const image = (node_id, name, depth, parent_node_id) => ({node_id, name, type: 'FRAME', depth, parent_node_id, width: 320, height: 240, bytes: png.length, content_sha256: hash(png), figma_url: `https://www.figma.com/design/Abc123/Screen?node-id=${node_id.replace(':', '-')}`, source: 'get_screenshot'});
  const images = {'screen.png': image('100:1', 'Screen', 0, null), 'header.png': image('100:2', 'Header', 1, '100:1')};
  const selected = Object.values(images).map(({node_id, type, depth, parent_node_id, width, height}) => ({node_id, type, depth, parent_node_id, width, height}));
  const metadata = {source: 'figma-mcp', file_key: 'Abc123', root: {node_id: '100:1', name: 'Screen', type: 'FRAME'}, max_depth: 2, generated_at: '2026-09-30T00:00:00Z', images, selected, skipped: [], warnings: []};
  for (const filename of Object.keys(images)) fs.writeFileSync(path.join(dir, filename), png);
  const save = () => { metadata.selection_sha256 = selectionSha256(metadata); fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(metadata)); };
  save();
  return {dir, metadata, save};
}

test('actual validator CLI binds the supplied canonical root and exported bytes without mutating metadata', t => {
  const f = fixture(t);
  const manifest = path.join(f.dir, 'metadata.json'); const before = fs.readFileSync(manifest);
  const result = spawnSync(process.execPath, [validator, 'validate', f.dir, '100-1'], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.root_node_id, '100:1');
  assert.equal(receipt.selection_sha256, f.metadata.selection_sha256);
  assert.deepEqual(receipt.images, ['screen.png', 'header.png']);
  assert.deepEqual(fs.readFileSync(manifest), before);
  assert.throws(() => validateBundle(f.dir, '100:99'), /root differs/);
  fs.appendFileSync(path.join(f.dir, 'header.png'), 'changed bytes');
  assert.throws(() => validateBundle(f.dir, '100:1'), /bytes or content hash mismatch/);
});

test('selection fingerprints ignore paths, names, timestamps and warnings but bind identity and render bytes', t => {
  const f = fixture(t); const original = selectionSha256(f.metadata);
  f.metadata.generated_at = 'later'; f.metadata.warnings = ['Safe warning'];
  f.metadata.root.name = 'Renamed display name'; f.metadata.images['header.png'].name = 'New title';
  f.metadata.images['renamed.png'] = f.metadata.images['header.png']; delete f.metadata.images['header.png'];
  assert.equal(selectionSha256(f.metadata), original);
  f.metadata.images['renamed.png'].content_sha256 = hash(Buffer.from('different render'));
  assert.notEqual(selectionSha256(f.metadata), original);
  f.metadata.images['renamed.png'].content_sha256 = hash(png);
  f.metadata.images['renamed.png'].width = 640;
  assert.notEqual(selectionSha256(f.metadata), original);
});

test('signed URLs are rejected even in diagnostics and canonical node URLs remain permitted', t => {
  const f = fixture(t);
  f.metadata.warnings = ['Download https://s3.example.test/render.png?X-Amz-Signature=secret']; f.save();
  assert.throws(() => validateBundle(f.dir), /transient or noncanonical URL/);
  f.metadata.warnings = []; f.metadata.images['header.png'].figma_url += '&token=secret'; f.save();
  assert.throws(() => validateBundle(f.dir), /signed or connector URL/);
  f.metadata.images['header.png'].figma_url = 'https://www.figma.com/design/Abc123/Screen?node-id=100-3'; f.save();
  assert.throws(() => validateBundle(f.dir), /URL node does not match/);
});

test('manifest selection rejects broken ancestry, duplicate nodes and stale fingerprints', t => {
  const f = fixture(t);
  f.metadata.images['header.png'].parent_node_id = '100:9'; f.metadata.selected[1].parent_node_id = '100:9'; f.save();
  assert.throws(() => validateBundle(f.dir), /descendant parent/);
  f.metadata.images['header.png'].parent_node_id = '100:1'; f.metadata.selected[1].parent_node_id = '100:1'; f.save();
  f.metadata.selection_sha256 = 'a'.repeat(64); fs.writeFileSync(path.join(f.dir, 'metadata.json'), JSON.stringify(f.metadata));
  assert.throws(() => validateBundle(f.dir), /selection hash mismatch/);
  f.metadata.images['header.png'].node_id = '100:1'; f.metadata.selected[1].node_id = '100:1'; f.save();
  assert.throws(() => validateBundle(f.dir), /canonical and unique/);
});

test('explicit one-node export preserves null ancestry and unselected stale files are not consumed', t => {
  const f = fixture(t);
  f.metadata.images['header.png'].depth = null; f.metadata.images['header.png'].parent_node_id = null;
  f.metadata.images['header.png'].source = 'download_assets';
  f.metadata.selected[1].depth = null; f.metadata.selected[1].parent_node_id = null;
  f.save(); fs.writeFileSync(path.join(f.dir, 'stale.png'), 'not selected');
  assert.deepEqual(validateBundle(f.dir).images, ['screen.png', 'header.png']);
  assert.equal(normalizeNodeId('100-2'), '100:2'); assert.throws(() => normalizeNodeId('100-2-3'), /invalid/);
});

test('bundle cannot escape through a selected symlink or path-like filename', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.dir, 'header.png')); fs.symlinkSync('screen.png', path.join(f.dir, 'header.png'));
  assert.throws(() => validateBundle(f.dir), /regular local file/);
  f.metadata.images['../outside.png'] = f.metadata.images['header.png']; delete f.metadata.images['header.png']; f.save();
  assert.throws(() => validateBundle(f.dir), /local PNG basename/);
});
