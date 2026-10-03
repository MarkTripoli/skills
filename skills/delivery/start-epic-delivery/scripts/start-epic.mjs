#!/usr/bin/env node
// Usage: node start-epic.mjs <epic-plan.md> --epic-branch <branch> [--dry-run] [--epic-slug <slug>] [--tasks-dir <dir>] [--dev-name <name>]
// Validates the epic plan's children, then creates one indexed task directory per child (and one GitHub issue each through
// `gh` on PATH). A rerun resumes: a child directory whose task.md carries this epic as `parent` is reused, and a
// child that already has `issue:` is skipped. `--dry-run` writes and calls nothing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { checkChildren, parseChildren } from "./check-children.mjs";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = async name => import(fs.existsSync(path.join(here, "../references", name)) ? path.join(here, "../references", name) : path.join(here, "../../../../shared", name));
const {resolveTaskRoot, normalizeTaskRoot} = await shared("task-root.mjs");
const {initTaskArtifacts, indexFileExists, observeArtifacts} = await shared("task-artifacts.mjs");

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const planFile = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const dry = args.includes("--dry-run");
const epicBranch = flag("--epic-branch");
if (!planFile || !epicBranch) {
  console.error("usage: node start-epic.mjs <epic-plan.md> --epic-branch <branch> [--dry-run] [--epic-slug <slug>] [--tasks-dir <dir>] [--dev-name <name>]");
  process.exit(2);
}
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const explicitSlug = flag("--epic-slug");
let planDir = path.dirname(path.resolve(planFile));
// Normalize an alias of the calling repository, not symlinked task-root components inside it.
for (let anchor = planDir; ; anchor = path.dirname(anchor)) {
  if (fs.existsSync(anchor) && fs.realpathSync(anchor) === process.cwd()) {
    planDir = path.join(process.cwd(), path.relative(anchor, planDir));
    break;
  }
  if (anchor === path.dirname(anchor)) break;
}
let taskDir = planDir;
while (!fs.existsSync(path.join(taskDir, "task.md")) && taskDir !== path.dirname(taskDir)) taskDir = path.dirname(taskDir);
const hasTask = fs.existsSync(path.join(taskDir, "task.md"));
const epicSlug = explicitSlug ?? path.basename(hasTask ? taskDir : planDir);
const selectedRoot = flag("--tasks-dir");
const tasksDir = selectedRoot === undefined
  ? (hasTask ? path.dirname(taskDir) : resolveTaskRoot(process.cwd()).absoluteRoot)
  : path.resolve(process.cwd(), normalizeTaskRoot(selectedRoot, "--tasks-dir"));
let ancestor = path.resolve(process.cwd());
while (path.relative(ancestor, tasksDir).split(path.sep)[0] === "..") ancestor = path.dirname(ancestor);
let component = ancestor;
for (const segment of path.relative(ancestor, tasksDir).split(path.sep).filter(Boolean)) {
  component = path.join(component, segment);
  try {
    const stat = fs.lstatSync(component);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Task root component ${component} is not a real directory`);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}
function validateTaskIndex(dir) {
  if (!indexFileExists(path.join(dir, "index.json"))) return;
  const problems = [];
  observeArtifacts(dir, problems);
  if (problems.length) throw new Error(`${dir}: ${problems.join("; ")}`);
}
if (hasTask) validateTaskIndex(taskDir);
const devName = flag("--dev-name") ?? kebab(spawnSync("git", ["config", "user.name"], { encoding: "utf8" }).stdout ?? "").join("-");
if (!devName) {
  console.error("git user.name is unset; pass --dev-name <name>");
  process.exit(2);
}

let children;
try {
  children = parseChildren(fs.readFileSync(planFile, "utf8"));
} catch (error) {
  console.log(`plan: ${error.message}`);
  process.exit(1);
}
const violations = checkChildren(children);
const slugOf = Object.fromEntries(children.map((c) => [c.name, kebab(c.name).slice(0, 4).join("-")]));
if (violations.length === 0) {
  for (const c of children) if (!slugOf[c.name]) violations.push(`${c.name}: name has no letters or digits to slug`);
  const seen = new Map();
  for (const c of children) {
    if (seen.has(slugOf[c.name])) violations.push(`${c.name}: slug ${slugOf[c.name]} repeats ${seen.get(slugOf[c.name])}`);
    seen.set(slugOf[c.name], c.name);
  }
}

const dirOf = (c) => path.join(tasksDir, slugOf[c.name]);
const frontmatter = (c) => {
  const file = path.join(dirOf(c), "task.md");
  return fs.existsSync(file) ? /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(file, "utf8"))?.[1] ?? "" : null;
};
const conflicts = [];
const existing = new Set();
if (violations.length === 0) {
  for (const c of children) {
    if (!fs.existsSync(dirOf(c))) continue;
    if (fs.lstatSync(dirOf(c)).isSymbolicLink()) { conflicts.push(`${slugOf[c.name]}: task directory is symlinked`); continue; }
    const text = frontmatter(c);
    if (text && new RegExp(`^parent: ${epicSlug}\\s*$`, "m").test(text)) {
      validateTaskIndex(dirOf(c));
      existing.add(c.name);
    }
    else conflicts.push(`${slugOf[c.name]}: directory exists and is not a child of ${epicSlug}`);
  }
}
if (violations.length || conflicts.length) {
  for (const v of [...violations, ...conflicts]) console.log(v);
  process.exit(1);
}

// Wave 1 has no dependencies; wave N+1 depends only on waves 1..N.
const wave = {};
for (let n = 1, left = [...children]; left.length; n++) {
  const ready = left.filter((c) => c.depends_on.every((d) => wave[d] && wave[d] < n));
  for (const c of ready) wave[c.name] = n;
  left = left.filter((c) => !ready.includes(c));
}
const ordered = [...children].sort((a, b) => wave[a.name] - wave[b.name]);

const issue = {}; // child name -> GitHub issue number
const branch = {};
const limits = [];
const gh = (cliArgs) => {
  const r = spawnSync("gh", cliArgs, { encoding: "utf8" });
  return { ok: r.status === 0, out: r.stdout ?? "", err: (r.stderr || r.error?.message || "").trim() };
};
const read = (c, key) => new RegExp(`^${key}: (.+)$`, "m").exec(frontmatter(c) ?? "")?.[1].trim();
for (const c of children) {
  const iid = read(c, "issue");
  if (existing.has(c.name) && iid) issue[c.name] = iid;
  branch[c.name] = (existing.has(c.name) && read(c, "branch")) || `${devName}/${slugOf[c.name]}`;
}

function writeTask(c) {
  const dir = dirOf(c);
  fs.mkdirSync(dir, { recursive: true });
  const body = [
    c.prompt,
    "",
    "## Acceptance criteria",
    ...c.acceptance.map((a) => `- ${a}`),
    ...(c.flag ? ["", `Feature flag: ${c.flag}; default keeps today's behavior.`] : []),
  ].join("\n");
  const head = ["slug: " + slugOf[c.name], "title: " + JSON.stringify(c.name), "workflow: " + c.workflow, "created: " + new Date().toISOString().slice(0, 10), "parent: " + epicSlug, "base: " + epicBranch, `depends_on: [${c.depends_on.map((d) => slugOf[d]).join(", ")}]`];
  fs.writeFileSync(path.join(dir, "task.md"), `---\n${head.join("\n")}\nbranch: ${branch[c.name]}\n---\n\n${body}\n`);
  if (!existing.has(c.name)) initTaskArtifacts(dir);
}

function addIssue(c, iid) {
  const file = path.join(dirOf(c), "task.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^(depends_on: .*)$/m, `$1\nissue: ${iid}`));
}

function createIssues() {
  const pre = gh(["auth", "status"]);
  const proj = pre.ok ? gh(["repo", "view", "--json", "nameWithOwner"]) : pre;
  if (!proj.ok) return limits.push(`GitHub issues were not created: ${proj.err || "gh unavailable"}.`);
  const label = `epic:${epicSlug}`;
  const labels = gh(["api", "repos/{owner}/{repo}/labels", "--paginate"]);
  let have;
  try {
    have = JSON.parse(labels.out).some((l) => l.name === label);
  } catch {
    return limits.push(`GitHub issues were not created: could not list labels: ${labels.err || labels.out.slice(0, 200)}.`);
  }
  if (!have) {
    const made = gh(["api", "--method", "POST", "repos/{owner}/{repo}/labels", "--raw-field", `name=${label}`, "--raw-field", "color=6699cc", "--raw-field", `description=Children of epic ${epicSlug}`]);
    if (!made.ok) return limits.push(`GitHub issues were not created: label ${label} failed: ${made.err}.`);
  }
  for (const c of ordered) {
    if (issue[c.name]) continue;
    const deps = c.depends_on.map((d) => (issue[d] ? `#${issue[d]}` : `${d} (issue missing)`));
    const bodyFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "epic-")), "body.md");
    fs.writeFileSync(bodyFile, `${c.prompt}\n\n## Acceptance criteria\n${c.acceptance.map(a => `- ${a}`).join("\n")}\n\nDepends on: ${deps.length ? deps.join(", ") : "none"}\nEpic: ${epicBranch}\nTask directory: ${dirOf(c)}\n`);
    const r = gh(["api", "--method", "POST", "repos/{owner}/{repo}/issues", "--raw-field", `title=${c.name}`, "--raw-field", `labels[]=${label}`, "--field", `body=@${bodyFile}`]);
    fs.rmSync(path.dirname(bodyFile), { recursive: true, force: true });
    let iid;
    try {
      iid = JSON.parse(r.out).number;
    } catch {}
    if (!r.ok || !iid) {
      limits.push(`${slugOf[c.name]}: issue not created: ${r.err || r.out.slice(0, 200)}.`);
      continue;
    }
    issue[c.name] = String(iid);
    branch[c.name] = existing.has(c.name) ? branch[c.name] : `${devName}/${iid}-${slugOf[c.name]}`;
    if (existing.has(c.name)) addIssue(c, iid);
    else {
      writeTask(c);
      addIssue(c, iid);
    }
  }
}

if (!dry) {
  for (const c of ordered) if (!existing.has(c.name)) writeTask(c);
  createIssues();
}
for (const c of ordered) console.log(`wave ${wave[c.name]}  ${slugOf[c.name]}  issue ${issue[c.name] ?? "none"}  branch ${branch[c.name]}  ${existing.has(c.name) ? "existing" : dry ? "would create" : "created"}`);
for (const l of limits) console.log(`known-limit: ${l}`);
if (dry) console.log("dry run: nothing written");
