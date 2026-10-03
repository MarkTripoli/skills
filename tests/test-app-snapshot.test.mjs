import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "delivery", "test-app", "scripts", "snapshot.mjs");
const run = (args, env = {}) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

// A stand-in for Playwright: records calls and returns the last action as the page text.
const stub = `
exports.chromium = { launch: async () => ({
  newPage: async () => {
    let text = "loaded";
    const page = {
      goto: async (url) => { text = "at " + url; },
      click: async (selector) => { if (selector === "boom") throw new Error("no such element\\nstack"); text = "clicked " + selector; },
      fill: async (selector, value) => { text = "filled " + selector + "=" + value; },
      keyboard: { press: async (key) => { text = "pressed " + key; } },
      waitForLoadState: async () => {},
      screenshot: async ({ path: file }) => require("node:fs").writeFileSync(file, "png"),
      locator: () => ({ ariaSnapshot: async () => { if (text === "clicked die") throw new Error("page closed\\nstack"); return text; } }),
    };
    return page;
  },
  close: async () => {},
}) };
`;

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "stub.cjs"), stub);
  return dir;
}

test("snapshot exits nonzero with the install command when Playwright is missing", () => {
  const result = run(["http://localhost:1"], { SNAPSHOT_PLAYWRIGHT: "definitely-not-installed-playwright" });
  assert.equal(result.status, 3);
  assert.match(result.stderr, /echo "\$P" && npm install --prefix "\$P" playwright[\s\S]*printed directory/);
});

test("snapshot rejects a missing URL and an unreadable actions file", t => {
  const dir = fixture(t);
  assert.equal(run([]).status, 2);
  const result = run(["http://localhost:1", "--actions", path.join(dir, "absent.json")]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--actions/);
});

test("snapshot prints the page text after each action and records a failed action", t => {
  const dir = fixture(t);
  const actions = path.join(dir, "actions.json");
  fs.writeFileSync(actions, JSON.stringify([
    { action: "fill", selector: "#name", text: "Ada" },
    { action: "click", selector: "boom" },
    { action: "press", key: "Enter" },
    { action: "screenshot", name: "S1" },
  ]));
  const result = run(["http://app.test", "--actions", actions, "--screenshots", path.join(dir, "shots")], { SNAPSHOT_PLAYWRIGHT: path.join(dir, "stub.cjs") });
  assert.equal(result.status, 0, result.stderr);
  const steps = JSON.parse(result.stdout);
  assert.deepEqual(steps.map(step => step.snapshot), ["at http://app.test", "filled #name=Ada", "filled #name=Ada", "pressed Enter", "pressed Enter"]);
  assert.equal(steps[2].error, "no such element");
  assert.ok(fs.existsSync(path.join(dir, "shots", "S1.png")));
});

test("snapshot records a failed snapshot and still prints every earlier entry", t => {
  const dir = fixture(t);
  const actions = path.join(dir, "actions.json");
  fs.writeFileSync(actions, JSON.stringify([{ action: "click", selector: "die" }, { action: "press", key: "Enter" }]));
  const result = run(["http://app.test", "--actions", actions], { SNAPSHOT_PLAYWRIGHT: path.join(dir, "stub.cjs") });
  assert.equal(result.status, 0, result.stderr);
  const steps = JSON.parse(result.stdout);
  assert.equal(steps[0].snapshot, "at http://app.test");
  assert.equal(steps[1].snapshot_error, "page closed");
  assert.equal(steps[2].snapshot, "pressed Enter");
});

test("snapshot skips a Playwright older than 1.49 and exits 3", t => {
  const dir = fixture(t);
  const old = path.join(dir, "oldpw");
  fs.mkdirSync(old);
  fs.writeFileSync(path.join(old, "index.js"), "exports.chromium = {};");
  fs.writeFileSync(path.join(old, "package.json"), JSON.stringify({ name: "oldpw", version: "1.40.0", main: "index.js" }));
  const result = run(["http://app.test"], { SNAPSHOT_PLAYWRIGHT: old });
  assert.equal(result.status, 3);
});
