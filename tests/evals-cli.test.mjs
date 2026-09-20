import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

const cases = [
  { name: "unknown options", args: ["setup-repository-basic", "--unknown", "--grade", "missing"], message: /unknown option --unknown/ },
  { name: "missing model value", args: ["setup-repository-basic", "--model"], message: /--model needs a value/ },
  { name: "flag-valued model", args: ["setup-repository-basic", "--model", "--keep"], message: /--model needs a value/ },
  { name: "missing max-time value", args: ["setup-repository-basic", "--max-time"], message: /--max-time needs a value/ },
  { name: "flag-valued max-time", args: ["setup-repository-basic", "--max-time", "--keep"], message: /--max-time needs a value/ },
  { name: "invalid max-time", args: ["setup-repository-basic", "--max-time", "NaN"], message: /positive number/ },
  { name: "scenario after options", args: ["--keep", "setup-repository-basic", "--grade", "missing"], message: /scenario names must precede options/ },
  { name: "tokens after grade directory", args: ["setup-repository-basic", "--grade", "missing", "--keep"], message: /--grade must be the final option/ },
];

for (const cliCase of cases) {
  test(`eval CLI rejects ${cliCase.name}`, () => {
    // Given / When
    const result = spawnSync(process.execPath, ["evals/run.mjs", ...cliCase.args], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    // Then
    assert.equal(result.status, 2);
    assert.match(result.stderr, cliCase.message);
  });
}
