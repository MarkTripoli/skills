import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve("skills/delivery/jev-ui/fixture");

function fakeTool(dir, name, body) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/bin/sh\nset -eu\n${body}\n`);
  fs.chmodSync(file, 0o755);
}

function run(script, target, setup, initialName) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jev-ui-fixture-test-"));
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin);
  setup(bin, tmp);
  const args = [target];
  if (initialName !== undefined) args.push(initialName);
  const result = spawnSync(path.join(root, script, "install-authorized.sh"), args, {
    cwd: path.join(root, script),
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp },
    encoding: "utf8",
  });
  return { result, tmp };
}

test("Android fixture keeps Gradle output external and cleans it", () => {
  const { result, tmp } = run("android", "emulator-5560", (bin, work) => {
    fakeTool(bin, "gradle", `
      for arg in "$@"; do case "$arg" in -PjevFixtureBuildDir=*) out="\${arg#*=}";; esac; done
      mkdir -p "$out/app/build/outputs/apk/debug"
      : > "$out/app/build/outputs/apk/debug/app-debug.apk"
      printf '%s\\n' "$out" > "${work}/consumer-path"
    `);
    fakeTool(bin, "adb", `printf '%s\\n' "$*" >> "${work}/adb-args"`);
  });
  assert.equal(result.status, 0, result.stderr);
  const output = fs.readFileSync(path.join(tmp, "consumer-path"), "utf8").trim();
  assert.ok(output.startsWith(tmp));
  assert.match(fs.readFileSync(path.join(tmp, "adb-args"), "utf8"), /app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.equal(fs.existsSync(output), false);
});

