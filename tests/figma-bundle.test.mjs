import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "delivery", "extract-figma-visuals", "scripts", "finalize-bundle.mjs");
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const PNG = tag => Buffer.concat([png, Buffer.from(tag)]);
const temporary = [];
after(() => { for (const dir of temporary) fs.rmSync(dir, { recursive: true, force: true }); });

function bundle() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "figma-bundle-"));
  temporary.push(dir);
  fs.writeFileSync(path.join(dir, "screen.png"), PNG("root"));
  fs.writeFileSync(path.join(dir, "header.png"), PNG("header"));
  const record = (node_id, name, depth, parent_node_id) => ({ node_id, name, type: "FRAME", depth, parent_node_id, width: 390, height: 100, figma_url: `https://www.figma.com/design/abc/Home?node-id=${node_id.replace(':', '-')}`, source: "get_screenshot" });
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify({
    source: "figma-mcp", file_key: "abc", root: { node_id: "10047:10900", name: "Home", type: "FRAME" }, max_depth: 2,
    images: { "screen.png": record("10047:10900", "Home", 0, null), "header.png": record("10047:10901", "Header", 1, "10047:10900") },
    generated_at: "2026-10-02T00:00:00Z",
    selected: [record("10047:10900", "Home", 0, null), record("10047:10901", "Header", 1, "10047:10900")].map(({ node_id, type, depth, parent_node_id, width, height }) => ({ node_id, type, depth, parent_node_id, width, height })),
    skipped: [], warnings: [],
  }));
  return dir;
}
const run = (dir, ...args) => spawnSync(process.execPath, [script, dir, ...args], { encoding: "utf8" });
const read = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "metadata.json"), "utf8"));

test("finalize-bundle fills hashes and a stable selection hash, and a rerun verifies them", () => {
  const dir = bundle();
  const first = run(dir);
  assert.equal(first.status, 0, first.stdout);
  const meta = read(dir);
  assert.match(meta.selection_sha256, /^[0-9a-f]{64}$/);
  assert.match(meta.images["header.png"].content_sha256, /^[0-9a-f]{64}$/);
  assert.equal(meta.images["header.png"].bytes, PNG("header").length);
  assert.equal(run(dir).status, 0);
  assert.equal(read(dir).selection_sha256, meta.selection_sha256);
});

test("finalize-bundle rejects a tampered PNG after hashing", () => {
  const dir = bundle();
  assert.equal(run(dir).status, 0);
  fs.writeFileSync(path.join(dir, "header.png"), PNG("changed"));
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /content_sha256 does not match/);
});

test("finalize-bundle rejects a wrong root ID, a missing image, and a non-PNG", () => {
  const dir = bundle();
  assert.equal(run(dir, "--root", "1:2").status, 1);
  assert.equal(run(dir, "--root", "10047-10900").status, 0);
  fs.rmSync(path.join(dir, "header.png"));
  assert.match(run(dir).stdout, /header\.png: image file is missing/);
  fs.writeFileSync(path.join(dir, "header.png"), "not a png");
  assert.match(run(dir).stdout, /not a PNG/);
});
