import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildTrees, plan } from "../scripts/install.mjs";
import { buildPortable } from "../scripts/lib/build.mjs";

const temps = [];

function tmpdir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "portable-build-parity-"));
  temps.push(dir);
  return dir;
}

function treeEntries(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) {
        return [{ path: `${relative}/`, type: "directory" }, ...treeEntries(root, absolute)];
      }
      return [{ path: relative, type: "file", bytes: fs.readFileSync(absolute).toString("base64") }];
    });
}

after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

test("portable CLI and installer builders produce identical selected skill trees", () => {
  // Given: two selected skills and independent CLI and installer destinations.
  const skillNames = ["setup-repository", "show-me"];
  const cliRoot = path.join(tmpdir(), "cli");
  const installerWork = tmpdir();
  const planned = plan({ targets: ["portable"], skillNames, cwd: "/project", home: "/home", env: { PATH: "" } });

  // When: each public builder creates its portable tree.
  const cliResult = buildPortable(cliRoot, { skillNames });
  const installerRoot = buildTrees(planned, installerWork).get("portable");

  // Then: every path and file byte agrees, with no worker tree or unselected skill.
  assert.deepEqual(cliResult, { skills: skillNames, workers: 0 });
  assert.deepEqual(treeEntries(installerRoot), treeEntries(cliRoot));
  assert.equal(fs.existsSync(path.join(installerRoot, "agents")), false);
  assert.deepEqual(fs.readdirSync(path.join(installerRoot, "skills")).sort(), [...skillNames].sort());
});
