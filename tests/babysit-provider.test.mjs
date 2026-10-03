import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { HOST, initialState } from "../evals/fixtures/babysit-ordered/babysit-provider.mjs";

const executable = fileURLToPath(new URL("../evals/fixtures/babysit-ordered/babysit-provider.mjs", import.meta.url));

test("parallel provider CLI observations retain unique ordered sequences and reconciled state", { timeout: 30_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "babysit-provider-parallel-"));
  try {
    fs.writeFileSync(path.join(directory, "state.json"), JSON.stringify(initialState()));
    fs.writeFileSync(path.join(directory, "trace.jsonl"), "");
    const observations = Array.from({ length: 24 }, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [executable, "glab", "api", "projects/101/merge_requests/7", "--hostname", HOST], {
        env: { BABYSIT_FIXTURE_DIR: directory }, stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code !== 0) { reject(new Error(`Fixture CLI exited ${code}: ${stderr}`)); return; }
        try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
      });
    }));
    const results = await Promise.allSettled(observations);
    for (const result of results) assert.equal(result.status, "fulfilled", result.reason?.message);
    const trace = fs.readFileSync(path.join(directory, "trace.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const state = JSON.parse(fs.readFileSync(path.join(directory, "state.json"), "utf8"));
    assert.deepEqual(trace.map((event) => event.sequence), Array.from({ length: observations.length }, (_, index) => index + 1));
    assert.equal(state.sequence, trace.length);
    assert.equal(state.stage, 0);
    assert.deepEqual(state.unsafe_merges, []);
    assert.equal(fs.existsSync(path.join(directory, ".command-lock")), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
