import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(new URL("../src/decimal.mjs", import.meta.url));
for (const [args, expected] of [
  [["1.5", "2.25"], "3.75"],
  [["-1.5", "0.25"], "-1.25"],
  [["0", "4"], "4"],
  [["1e2", "0.5"], "100.5"],
]) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), expected, `decimal ${args.join(" ")}`);
}
const invalid = spawnSync(process.execPath, [cli, "not-a-number"], { encoding: "utf8" });
assert.equal(invalid.status, 2);
assert.match(invalid.stderr, /Usage:/);
console.log("decimal CLI behavior passed");
