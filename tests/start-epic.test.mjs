import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { after } from "node:test";
import { readArtifactIndex } from "../shared/task-artifacts.mjs";

const temporary = [];
after(() => { for (const dir of temporary) fs.rmSync(dir, { recursive: true, force: true }); });
const script = path.resolve("skills/delivery/start-epic-delivery/scripts/start-epic.mjs");
const children = [
  { name: "Export a report", workflow: "oneshot", slice: "vertical", depends_on: [], acceptance: ["WHEN the user requests an export, the system shall return a CSV file."], prompt: "Add the export endpoint." },
  { name: "Download it", workflow: "lean", slice: "vertical", depends_on: ["Export a report"], acceptance: ["The system shall offer the file for download."], prompt: "Add the button.", flag: "export_download" },
];

// A GitHub stub records calls and preserves the real auth/repository/issue protocol.
function setup(kids = children) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epic-"));
  temporary.push(dir);
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, "gh"),
    `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(path.join(dir, "calls.log"))}, a.join(" ") + "\\n");
if (a[0] === "auth") { if (process.env.GH_DOWN) { console.error("not logged in"); process.exit(1); } process.exit(0); }
if (a[0] === "repo") { console.log(JSON.stringify({nameWithOwner:"owner/repo"})); process.exit(0); }
if (a.some(arg => arg.endsWith("/labels")) && !a.includes("POST")) { console.log("[]"); process.exit(0); }
if (a.some(arg => arg.endsWith("/issues"))) {
  const f = ${JSON.stringify(path.join(dir, "n"))};
  const n = (fs.existsSync(f) ? Number(fs.readFileSync(f, "utf8")) : 40) + 1;
  fs.writeFileSync(f, String(n));
  console.log(JSON.stringify({ number: n, html_url: "https://github.test/owner/repo/issues/" + n }));
  process.exit(0);
}
console.log("{}");
`,
    { mode: 0o755 },
  );
  const epicDir = path.join(dir, ".agents/tasks/the-epic");
  fs.mkdirSync(epicDir, { recursive: true });
  const plan = path.join(epicDir, "01-epic-plan-the-epic.md");
  fs.writeFileSync(plan, `# Epic\n\n## Children\n\n\`\`\`json\n${JSON.stringify(kids)}\n\`\`\`\n`);
  const run = (...extra) => spawnSync("node", [script, plan, "--epic-branch", "mark/the-epic", "--dev-name", "mark", ...extra], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  const calls = () => (fs.existsSync(path.join(dir, "calls.log")) ? fs.readFileSync(path.join(dir, "calls.log"), "utf8") : "");
  const task = (slug) => fs.readFileSync(path.join(dir, ".agents/tasks", slug, "task.md"), "utf8");
  return { dir, run, calls, task, run2: (env) => spawnSync("node", [script, plan, "--epic-branch", "mark/the-epic", "--dev-name", "mark"], { cwd: dir, encoding: "utf8", env: { ...process.env, ...env, PATH: `${bin}:${process.env.PATH}` } }) };
}

test("dry run prints slugs and waves and writes and calls nothing", () => {
  const t = setup();
  const r = t.run("--dry-run");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /wave 1  export-a-report .* would create/);
  assert.match(r.stdout, /wave 2  download-it/);
  assert.equal(fs.existsSync(path.join(t.dir, ".agents/tasks/export-a-report")), false);
  assert.equal(t.calls(), "");
});

test("a real run writes task.md files, creates issues wave by wave, and links dependencies", () => {
  const t = setup();
  const r = t.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const first = t.task("export-a-report");
  assert.match(first, /^parent: the-epic$/m);
  assert.match(first, /^base: mark\/the-epic$/m);
  assert.match(first, /^depends_on: \[\]$/m);
  assert.match(first, /^issue: 41$/m);
  assert.match(first, /^branch: mark\/41-export-a-report$/m);
  const second = t.task("download-it");
  assert.match(second, /^depends_on: \[export-a-report\]$/m);
  assert.match(second, /^issue: 42$/m);
  assert.match(second, /Feature flag: export_download/);
  assert.match(second, /- The system shall offer the file for download\./);
  assert.equal((t.calls().match(/repos\/\S+\/issues/g) ?? []).length, 2);
  assert.match(t.calls(), /--method POST repos\/\S+\/labels .*name=epic:the-epic/);
  for (const slug of ["export-a-report", "download-it"]) {
    const index = readArtifactIndex(path.join(t.dir, ".agents/tasks", slug));
    assert.equal(index.task, slug);
    assert.deepEqual(index.artifactSeries, {});
  }
});

test("a rerun creates nothing twice", () => {
  const t = setup();
  t.run();
  const before = t.calls();
  const r = t.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /export-a-report .* existing/);
  assert.equal((t.calls().match(/repos\/\S+\/issues/g) ?? []).length, 2);
  assert.equal(t.task("download-it").match(/^issue:/gm).length, 1);
  assert.ok(t.calls().startsWith(before));
});

test("GitHub unavailable writes task directories without issues and records the known limit", () => {
  const t = setup();
  const r = t.run2({ GH_DOWN: "1" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /known-limit: GitHub issues were not created: not logged in\./);
  assert.doesNotMatch(t.task("export-a-report"), /^issue:/m);
  assert.match(t.task("export-a-report"), /^branch: mark\/export-a-report$/m);
});

test("a conflicting directory stops the run with nothing created", () => {
  const t = setup();
  fs.mkdirSync(path.join(t.dir, ".agents/tasks/download-it"), { recursive: true });
  const r = t.run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /download-it: directory exists/);
  assert.equal(fs.existsSync(path.join(t.dir, ".agents/tasks/export-a-report")), false);
  assert.equal(t.calls(), "");
});

test("an invalid plan stops before writing", () => {
  const t = setup();
  const plan = path.join(t.dir, ".agents/tasks/the-epic/01-epic-plan-the-epic.md");
  fs.writeFileSync(plan, `## Children\n\n\`\`\`json\n${JSON.stringify([{ ...children[0], workflow: "huge" }])}\n\`\`\`\n`);
  const r = t.run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /workflow must be/);
  assert.equal(fs.existsSync(path.join(t.dir, ".agents/tasks/export-a-report")), false);
});

test("a rerun after a failed issue run ignores body lines that look like frontmatter", () => {
  const kids = [{ ...children[0], prompt: "Fix the crash.\nissue: reported by QA\nparent: the-epic" }, children[1]];
  const t = setup(kids);
  t.run2({ GH_DOWN: "1" });
  const r = t.run2({});
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const slug of ["export-a-report", "download-it"]) assert.equal(t.task(slug).match(/^issue: \d+$/gm).length, 1, t.task(slug));
  assert.doesNotMatch(t.task("download-it"), /reported by QA/);
  assert.equal((t.calls().match(/repos\/\S+\/issues/g) ?? []).length, 2);
});

test("issue bodies leave no temp directories behind", () => {
  const t = setup();
  const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("epic-")).length;
  t.run();
  assert.equal(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("epic-")).length, before);
});

test("an unset git user.name without --dev-name exits 2 instead of writing invalid branches", () => {
  const t = setup();
  const plan = path.join(t.dir, ".agents/tasks/the-epic/01-epic-plan-the-epic.md");
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const r = spawnSync("node", [script, plan, "--epic-branch", "mark/the-epic", "--dry-run"], { cwd: t.dir, encoding: "utf8", env });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /pass --dev-name/);
});

test("an explicitly selected task root cannot traverse a symlink", () => {
  const t = setup();
  const outside = path.join(t.dir, "outside");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(t.dir, "linked"), "dir");
  const result = t.run("--tasks-dir", "linked/tasks");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /not a real directory|symlink/i);
  assert.equal(fs.existsSync(path.join(outside, "tasks")), false);
  assert.equal(t.calls(), "");
});

test("malformed indexed parent and child histories stop before creating issues or resetting artifacts", () => {
  const parent = setup();
  const parentDir = path.join(parent.dir, ".agents/tasks/the-epic");
  fs.writeFileSync(path.join(parentDir, "task.md"), "---\nslug: the-epic\n---\n");
  fs.writeFileSync(path.join(parentDir, "index.json"), "{ invalid");
  const badParent = parent.run();
  assert.equal(badParent.status, 1);
  assert.match(badParent.stderr, /index.*invalid JSON/i);
  assert.equal(parent.calls(), "");
  assert.equal(fs.existsSync(path.join(parent.dir, ".agents/tasks/export-a-report")), false);
  const child = setup();
  assert.equal(child.run().status, 0);
  const priorCalls = child.calls();
  const index = path.join(child.dir, ".agents/tasks/export-a-report/index.json");
  fs.writeFileSync(index, "{ invalid");
  const badChild = child.run();
  assert.equal(badChild.status, 1);
  assert.match(badChild.stderr, /index.*invalid JSON/i);
  assert.equal(child.calls(), priorCalls);
  assert.equal(fs.readFileSync(index, "utf8"), "{ invalid");
});

test("an explicitly selected task root initializes indexed children without default-root copies", () => {
  const t = setup();
  const result = t.run("--tasks-dir", "delivery/tasks");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const slug of ["export-a-report", "download-it"]) {
    const child = path.join(t.dir, "delivery/tasks", slug);
    assert.match(fs.readFileSync(path.join(child, "task.md"), "utf8"), /parent: the-epic/);
    const index = readArtifactIndex(child);
    assert.equal(index.task, slug);
    assert.deepEqual(index.artifactSeries, {});
    assert.equal(fs.existsSync(path.join(t.dir, ".agents/tasks", slug)), false);
  }
});
