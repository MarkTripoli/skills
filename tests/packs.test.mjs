import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { bashForPrompt, build, convert, listNative, NATIVE_DIR, OMP_DIR } from "../scripts/build-packs.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The first archon on PATH that is 0.10 or later; the dry-run tests skip without one.
function archonBinary() {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, "archon");
    if (!dir || !fs.existsSync(candidate)) continue;
    try {
      const version = /v(\d+)\.(\d+)\./.exec(execFileSync(candidate, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
      if (version && (Number(version[1]) > 0 || Number(version[2]) >= 10)) return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}
const ARCHON = archonBinary();

test("bashForPrompt: refs are hoisted unquoted, inputs read from INPUTS_* env, everything else is literal", () => {
  const lines = bashForPrompt([
    "Feedback: $LOOP_PREV.gate.output.text and $review-code.output.artifact",
    "Read `$INPUTS.skills_dir/$INPUTS.skill/SKILL.md` for $INPUTS.task_dir; user: $LOOP_USER_INPUT; cost $5; a \\ backslash",
  ]);
  assert.equal(lines[0], "set -eu");
  assert.deepEqual(lines.slice(1, 3), ["v1=$LOOP_PREV.gate.output.text", "v2=$review-code.output.artifact"]);
  const body = lines.slice(4, -2).join("\n");
  assert.ok(body.includes("${v1} and ${v2}"));
  assert.ok(body.includes("\\`${INPUTS_SKILLS_DIR}/${INPUTS_SKILL}/SKILL.md\\`"), "inputs come from the environment, backticks are escaped");
  assert.ok(body.includes("${INPUTS_TASK_DIR}; user: ${LOOP_USER_INPUT:-}; cost \\$5; a \\\\ backslash"), "engine variables default to empty under set -u");
  assert.throws(() => bashForPrompt(["fine", "DELIVERY_PROMPT", "fine"]), /close the heredoc early/);
  assert.throws(() => convert(["nodes:", "  - id: b", "    prompt: |", "      Do it.", "    depends_on: [a]", "    output_format:", "      type: object", ""].join("\n")), /output_format must directly follow the prompt block/);
  assert.equal(lines.at(-1), 'omp -p --auto-approve --no-session --max-time=45m "$prompt"');
  // The heredoc opens and closes with the same marker and nothing in the prompt can close it early.
  assert.equal(lines[3], "{ prompt=$(cat); } <<DELIVERY_PROMPT");
  assert.equal(lines.at(-2), "DELIVERY_PROMPT");
});

test("bashForPrompt: the generated bash runs under /bin/bash 3.2 with an unpaired apostrophe and hands omp the expanded prompt", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-omp-bash-"));
  try {
    const record = path.join(dir, "record.json");
    // A fake omp first on PATH: records argv and stdin, answers like a real print-mode run.
    fs.writeFileSync(
      path.join(dir, "omp"),
      `#!/bin/sh\nnode -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ argv: process.argv.slice(2), stdin: require("fs").readFileSync(0, "utf8") }))' "$RECORD" "$@"\necho '{"status":"clean"}'\n`,
      { mode: 0o755 },
    );
    const script = bashForPrompt(["Read $INPUTS.skills_dir/SKILL.md; don't stop early.", "", "Second paragraph."]).join("\n");
    const run = spawnSync("/bin/bash", ["-c", script], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, RECORD: record, INPUTS_SKILLS_DIR: "/tmp/skills" },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '{"status":"clean"}\n');
    const recorded = JSON.parse(fs.readFileSync(record, "utf8"));
    assert.deepEqual(recorded.argv, ["-p", "--auto-approve", "--no-session", "--max-time=45m", "Read /tmp/skills/SKILL.md; don't stop early.\n\nSecond paragraph."]);
    assert.equal(recorded.stdin, "", "the heredoc is consumed by the brace group, not left on omp's stdin");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("convert: renames the workflow and its includes, notes the flavor, turns prompt nodes into bash, moves their output_format into the prompt and drops their session field", () => {
  const source = [
    "name: delivery-thing",
    "description: |",
    "  Does a thing.",
    "  NOT for: other things.",
    "",
    "inputs:",
    "  task_dir:",
    "    required: true",
    "nodes:",
    "  - id: a",
    "    include: delivery-other",
    "  - id: b",
    "    context: fresh",
    "    depends_on: [a]",
    "    prompt: |",
    "      Do it for $INPUTS.task_dir with $a.output.",
    "",
    "      Second paragraph.",
    "    output_format:",
    "      type: object",
    "  - id: c",
    "    bash: \"true\"",
    "    depends_on: [b]",
    "",
  ].join("\n");
  const out = convert(source);
  assert.ok(out.startsWith("name: delivery-thing-omp\n"));
  assert.ok(out.includes("  NOT for: other things.\n  Oh My Pi flavor: every AI phase runs in `omp -p`;"));
  assert.ok(out.includes("    include: delivery-other-omp\n"));
  assert.ok(!out.includes("context: fresh"));
  assert.ok(!out.includes("output_format"), "Archon ignores output_format on bash nodes, so the generated node does not carry it");
  assert.ok(out.includes("    bash: |\n      set -eu\n      v1=$a.output\n      { prompt=$(cat); } <<DELIVERY_PROMPT\n      Do it for ${INPUTS_TASK_DIR} with ${v1}.\n\n      Second paragraph.\n\n      CRITICAL: Respond with ONLY a JSON object matching this schema (JSON Schema, written as YAML). No prose before or after it.\n      type: object\n      DELIVERY_PROMPT\n      answer=$(omp -p --auto-approve --no-session --max-time=45m \"$prompt\")\n      printf '%s\\n' \"$answer\" | awk '\n"), "a schema node captures the answer and filters it down to the JSON object");
  assert.ok(/awk '\n(?: {6}.*\n)+ {6}'\n  - id: c\n/.test(out));
  assert.ok(out.includes('  - id: c\n    bash: "true"\n    depends_on: [b]\n'), "deterministic nodes are untouched");
});

test("the committed Oh My Pi flavor is exactly what the generator produces from the native packs", () => {
  const stale = build({ write: false }).filter((r) => r.stale);
  assert.deepEqual(stale.map((r) => path.relative(REPO, r.target)), []);
  assert.equal(fs.readdirSync(OMP_DIR).length, fs.readdirSync(NATIVE_DIR).length);
});

test("every native pack names its own directory and the skills it runs exist", () => {
  const skills = new Set(fs.readdirSync(path.join(REPO, "skills", "delivery")));
  for (const { dir, file } of listNative()) {
    const content = fs.readFileSync(path.join(NATIVE_DIR, dir, file), "utf8");
    assert.ok(content.includes(`\nname: delivery-${dir}\n`) || content.startsWith(`name: delivery-${dir}\n`), `${file} is named after its directory`);
    for (const [, skill] of content.matchAll(/\$(?:INPUTS|task\.output)\.skills_dir\/([a-z0-9-]+)\/SKILL\.md/g)) assert.ok(skills.has(skill), `${file} names skill ${skill}`);
  }
});

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "T",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "T",
  GIT_COMMITTER_EMAIL: "t@example.com",
};
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...GIT_ENV } }).trim();

// A temp git repository on `main` with one commit holding README.md and the given .gitignore.
function gitRepo(gitignore) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-packs-test-"));
  git(dir, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, "README.md"), "fixture\n");
  fs.writeFileSync(path.join(dir, ".gitignore"), gitignore);
  git(dir, "add", ".");
  git(dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "init");
  return dir;
}

// The task node's bash body, run directly with the environment Archon provides (ARGUMENTS, INPUTS_*). The
// skills directory defaults to the repository's own, which exists, so no warning is printed unless a test asks.
const SKILLS = path.join(REPO, "skills", "delivery");
function runTaskNode(cwd, env) {
  const yaml = fs.readFileSync(path.join(NATIVE_DIR, "task", "delivery-task.yaml"), "utf8");
  const body = /bash: \|\n((?: {6}.*\n|\n)+?) {4}output_format:/.exec(yaml)[1].replace(/^ {6}/gm, "");
  const result = spawnSync("bash", ["-c", body], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: "/home/t", INPUTS_SKILLS_DIR: SKILLS, ...GIT_ENV, ...env } });
  return { code: result.status, out: result.stdout.trim(), err: result.stderr.trim() };
}

test("task node: slugs follow the conventions, task.md carries the workflow, an existing task_dir is reused, a bogus one fails", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "skills-task-node-"));
  try {
    fs.writeFileSync(path.join(cwd, ".gitignore"), "node_modules/");
    const created = runTaskNode(cwd, { ARGUMENTS: "Please make the dashboard load faster for admins\nDetails on line two", INPUTS_WORKFLOW: "lean" });
    assert.equal(created.out, `{"task_dir":".agents/tasks/dashboard-load-faster-admins","skills_dir":"${SKILLS}"}`);
    const taskMd = fs.readFileSync(path.join(cwd, ".agents/tasks/dashboard-load-faster-admins/task.md"), "utf8");
    assert.match(taskMd, /^---\nslug: dashboard-load-faster-admins\ntitle: Please make the dashboard load faster for admins\nworkflow: lean\ncreated: \d{4}-\d{2}-\d{2}\n---\nPlease make the dashboard load faster for admins\nDetails on line two\n$/);
    assert.equal(fs.readFileSync(path.join(cwd, ".gitignore"), "utf8"), "node_modules/", "outside a git work tree nothing else is touched");
    // A one-word request falls back to the raw words; a repeated request gets a numbered directory.
    assert.equal(runTaskNode(cwd, { ARGUMENTS: "Fix the bug", INPUTS_WORKFLOW: "bugfix" }).out, `{"task_dir":".agents/tasks/fix-the-bug","skills_dir":"${SKILLS}"}`);
    assert.equal(runTaskNode(cwd, { ARGUMENTS: "Fix the bug", INPUTS_WORKFLOW: "bugfix" }).out, `{"task_dir":".agents/tasks/fix-the-bug-2","skills_dir":"${SKILLS}"}`);
    // An epic child's pre-created directory is reused untouched.
    fs.mkdirSync(path.join(cwd, ".agents/tasks/child-one"));
    fs.writeFileSync(path.join(cwd, ".agents/tasks/child-one/task.md"), "---\nslug: child-one\nworkflow: lean\nparent: epic\n---\nChild prompt\n");
    const reused = runTaskNode(cwd, { ARGUMENTS: "Child prompt", INPUTS_WORKFLOW: "lean", INPUTS_TASK_DIR: ".agents/tasks/child-one/" });
    assert.equal(reused.out, `{"task_dir":".agents/tasks/child-one","skills_dir":"${SKILLS}"}`);
    assert.equal(fs.readFileSync(path.join(cwd, ".agents/tasks/child-one/task.md"), "utf8"), "---\nslug: child-one\nworkflow: lean\nparent: epic\n---\nChild prompt\n");
    // skills_dir: `~` expands against HOME, a trailing slash is dropped, a missing directory only warns.
    const tilde = runTaskNode(cwd, { ARGUMENTS: "Child prompt", INPUTS_TASK_DIR: ".agents/tasks/child-one", INPUTS_SKILLS_DIR: "~/my/skills/" });
    assert.equal(tilde.out, '{"task_dir":".agents/tasks/child-one","skills_dir":"/home/t/my/skills"}');
    assert.match(tilde.err, /^warning: skills_dir \/home\/t\/my\/skills does not exist/);
    assert.equal(runTaskNode(cwd, { ARGUMENTS: "Child prompt", INPUTS_TASK_DIR: ".agents/tasks/child-one", INPUTS_SKILLS_DIR: "" }).out, '{"task_dir":".agents/tasks/child-one","skills_dir":"/home/t/.agents/skills"}');
    const bogus = runTaskNode(cwd, { ARGUMENTS: "x", INPUTS_TASK_DIR: ".agents/tasks/nope" });
    assert.equal(bogus.code, 1);
    assert.match(bogus.err, /has no task\.md/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("task node: in a git work tree task.md is committed, an exact `.agents/tasks/` ignore line is removed with it, any other ignore rule fails the node", () => {
  const cwd = gitRepo("node_modules/\n.agents/tasks/\n");
  try {
    const created = runTaskNode(cwd, { ARGUMENTS: "Add a --verbose flag to the CLI that prints each command", INPUTS_WORKFLOW: "full" });
    assert.equal(created.code, 0, created.err);
    assert.equal(created.out, `{"task_dir":".agents/tasks/verbose-flag-cli-prints","skills_dir":"${SKILLS}"}`);
    assert.equal(git(cwd, "log", "-1", "--format=%s"), "docs(task): open verbose-flag-cli-prints");
    assert.equal(fs.readFileSync(path.join(cwd, ".gitignore"), "utf8"), "node_modules/\n", "only the exact `.agents/tasks/` line is removed");
    assert.deepEqual(git(cwd, "show", "--name-only", "--format=", "HEAD").split("\n").sort(), [".agents/tasks/verbose-flag-cli-prints/task.md", ".gitignore"]);
    assert.equal(git(cwd, "status", "--porcelain"), "", "the commit leaves the tree clean");
    // A second task in the same repository: nothing left to fix in .gitignore, task.md alone is committed.
    assert.equal(runTaskNode(cwd, { ARGUMENTS: "Fix the bug", INPUTS_WORKFLOW: "bugfix" }).code, 0);
    assert.equal(git(cwd, "show", "--name-only", "--format=", "HEAD"), ".agents/tasks/fix-the-bug/task.md");
    // A reused task_dir is not committed.
    const before = git(cwd, "rev-parse", "HEAD");
    assert.equal(runTaskNode(cwd, { ARGUMENTS: "Fix the bug", INPUTS_TASK_DIR: ".agents/tasks/fix-the-bug" }).out, `{"task_dir":".agents/tasks/fix-the-bug","skills_dir":"${SKILLS}"}`);
    assert.equal(git(cwd, "rev-parse", "HEAD"), before);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
  const other = gitRepo(".agents/\n");
  try {
    const failed = runTaskNode(other, { ARGUMENTS: "Add a --verbose flag", INPUTS_WORKFLOW: "full" });
    assert.equal(failed.code, 1);
    assert.match(failed.err, /^\.agents\/tasks\/verbose-flag\/task\.md is ignored by git; remove the rule that ignores \.agents\/tasks\//);
    assert.equal(fs.readFileSync(path.join(other, ".gitignore"), "utf8"), ".agents/\n", "a rule the node does not own is left alone");
    assert.equal(git(other, "log", "--format=%s"), "init");
  } finally {
    fs.rmSync(other, { recursive: true, force: true });
  }
});

// The implement block's unattended completion check: the `until_bash` of `phases-auto`, with the task
// directory substituted, run against a task directory. Exit 0 ends the loop.
function runPlanCheck(taskDir) {
  const yaml = fs.readFileSync(path.join(NATIVE_DIR, "implement", "delivery-implement.yaml"), "utf8");
  const body = /id: phases-auto\n[\s\S]*?until_bash: \|\n((?: {8}.*\n)+?) {6}nodes:/.exec(yaml)[1].replace(/^ {8}/gm, "").replaceAll("$INPUTS.task_dir", taskDir);
  return spawnSync("bash", ["-c", body], { encoding: "utf8", env: { PATH: process.env.PATH } }).status;
}

test("implement until_bash: the loop ends when every `## Phase N`/`## Step N` box of the newest plan or outline is ticked; checklist and review boxes do not count", () => {
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-plan-check-"));
  const plan = fs.readFileSync(path.join(REPO, "skills", "delivery", "create-plan", "references", "plan_template.md"), "utf8");
  const outline = fs.readFileSync(path.join(REPO, "skills", "delivery", "create-structure-outline", "references", "structure_outline_template.md"), "utf8");
  // Tick the boxes under phase headings only; `## Phase Checklist` and `## Human Review` keep theirs open.
  const tickPhases = (text) => {
    let inPhase = false;
    return text
      .split("\n")
      .map((line) => {
        if (/^## (Phase|Step) [0-9]+/.test(line)) inPhase = true;
        else if (/^## /.test(line)) inPhase = false;
        return inPhase ? line.replace(/^(\s*)- \[ \]/, "$1- [x]") : line;
      })
      .join("\n");
  };
  assert.ok(/^## Phase Checklist\n\n- \[ \]/m.test(outline) && /^## Human Review\n[\s\S]*?- \[ \]/m.test(plan), "the templates keep boxes outside phase sections");
  try {
    assert.notEqual(runPlanCheck(taskDir), 0, "no plan yet: keep looping");
    fs.writeFileSync(path.join(taskDir, "03-plan-slug.md"), plan);
    assert.notEqual(runPlanCheck(taskDir), 0, "template boxes open: keep looping");
    fs.writeFileSync(path.join(taskDir, "03-plan-slug.md"), tickPhases(plan));
    assert.equal(runPlanCheck(taskDir), 0, "every phase box ticked: done, review boxes ignored");
    // A checklist quoted inside a code fence is prose, not a phase box.
    fs.writeFileSync(path.join(taskDir, "03-plan-slug.md"), tickPhases(plan).replace("## Phase 2: [Phase title]\n", "## Phase 2: [Phase title]\n\n```markdown\n- [ ] quoted in a sample\n```\n"));
    assert.equal(runPlanCheck(taskDir), 0, "an open box inside a code fence does not count");
    fs.writeFileSync(path.join(taskDir, "03-plan-slug.md"), tickPhases(plan).replace("## Phase 2: [Phase title]\n", "## Phase 2: [Phase title]\n\n- [ ] one more\n"));
    assert.notEqual(runPlanCheck(taskDir), 0, "one open box in a later phase: keep looping");
    // The newest plan or outline decides: an older ticked outline does not end the loop, a newer one does.
    fs.writeFileSync(path.join(taskDir, "02-structure-outline-slug.md"), tickPhases(outline));
    assert.notEqual(runPlanCheck(taskDir), 0);
    fs.writeFileSync(path.join(taskDir, "04-structure-outline-slug.md"), tickPhases(outline));
    assert.equal(runPlanCheck(taskDir), 0, "ticked outline newest: done, checklist boxes ignored");
  } finally {
    fs.rmSync(taskDir, { recursive: true, force: true });
  }
});

// Archon-backed checks: a temp git repository holding a copy of the packs (fixtures included), dry-run with
// the deterministic nodes executed for real (`--exec-code`) so the task node's slug, task.md and commit are
// exercised in that repository.
function fixture() {
  const dir = gitRepo("node_modules/\n");
  fs.cpSync(path.join(REPO, ".archon", "workflows"), path.join(dir, ".archon", "workflows"), { recursive: true });
  return dir;
}

// Every Archon invocation runs under a scratch HOME, so its database, config, and workspace registry
// never touch the developer's ~/.archon; the directory goes when the process exits.
const ARCHON_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "skills-archon-home-"));
// exec-code fixtures commit inside Archon's own scratch worktree, where only $HOME/.gitconfig supplies an identity.
fs.writeFileSync(path.join(ARCHON_HOME, ".gitconfig"), "[user]\n\tname = T\n\temail = t@example.com\n[commit]\n\tgpgsign = false\n");
process.on("exit", () => fs.rmSync(ARCHON_HOME, { recursive: true, force: true }));
const ARCHON_ENV = { ...process.env, DO_NOT_TRACK: "1", HOME: ARCHON_HOME };

function dryRun(cwd, name, message, extra = []) {
  const result = spawnSync(ARCHON, ["workflow", "run", name, "--cwd", cwd, "--dry-run", "--exec-code", "--default-stubs", "--json", ...extra, message], {
    encoding: "utf8",
    env: ARCHON_ENV,
    timeout: 180000,
  });
  // On failure the CLI prints the trace document followed by a second `{ok:false}` document.
  const raw = result.stdout.trimStart();
  return JSON.parse(raw.slice(0, findJsonEnd(raw)));
}

function findJsonEnd(text) {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return text.length;
}

const ran = (trace) => trace.trace.filter((t) => t.state !== "skipped").map((t) => t.nodeId);
const state = (trace, id) => trace.trace.find((t) => t.nodeId === id)?.state;

// name -> [gated loop ids, unattended twin ids, final join]. `archon workflow run` also resolves names by
// suffix and substring, so a native pack that fails to load silently runs its `-omp` twin: every
// assertion below first checks the resolved workflow name.
const PACKS = {
  "delivery-full": [["design__cycle", "plan__cycle", "implement__phases", "pr__cycle"], ["design__once", "plan__once", "implement__phases-auto", "pr__once"], "pr-done"],
  "delivery-lean": [["outline__cycle", "implement__phases", "pr__cycle"], ["outline__once", "implement__phases-auto", "pr__once"], "pr-done"],
  "delivery-prd": [["prd__cycle", "tdd__cycle", "plan__cycle", "implement__phases", "pr__cycle"], ["prd__once", "tdd__once", "plan__once", "implement__phases-auto", "pr__once"], "pr-done"],
  "delivery-oneshot": [["pr__cycle"], ["pr__once"], "pr-done"],
  "delivery-bugfix": [["reproduce", "pr__cycle"], ["reproduce-auto", "pr__once"], "pr-done"],
  "delivery-epic": [["plan__cycle"], ["plan__once"], "start-done"],
};

test("archon: every pack loads without warnings and dry-runs gated and unattended to its final join", { skip: !ARCHON && "no archon 0.10+ on PATH" }, () => {
  const cwd = fixture();
  try {
    const listed = JSON.parse(execFileSync(ARCHON, ["workflow", "list", "--cwd", cwd, "--json"], { encoding: "utf8", env: ARCHON_ENV, stdio: ["ignore", "pipe", "ignore"] }));
    assert.deepEqual(listed.errors, []);
    const delivery = listed.workflows.filter((w) => w.name.startsWith("delivery-"));
    assert.equal(delivery.length, listNative().length * 2);
    assert.deepEqual(delivery.filter((w) => w.parseWarnings?.length).map((w) => w.name), []);

    const full = dryRun(cwd, "delivery-full", "Add a --verbose flag to the CLI that prints each command");
    assert.equal(full.workflow, "delivery-full");
    assert.equal(full.outcome, "completed");
    assert.equal(full.trace.find((t) => t.nodeId === "task__create").output, `{"task_dir":".agents/tasks/verbose-flag-cli-prints","skills_dir":"${ARCHON_HOME}/.agents/skills"}`, "the default skills_dir is expanded from ~");
    // The dry run delivers no INPUTS_* to the included task node, so `workflow:` is its default here; the
    // task-node tests above prove the field. The trace proves slug, title, body and the commit.
    assert.match(fs.readFileSync(path.join(cwd, ".agents", "tasks", "verbose-flag-cli-prints", "task.md"), "utf8"), /^---\nslug: verbose-flag-cli-prints\ntitle: Add a --verbose flag to the CLI that prints each command\nworkflow: [a-z]+\ncreated: \d{4}-\d{2}-\d{2}\n---\nAdd a --verbose flag/);
    assert.equal(git(cwd, "log", "-1", "--format=%s"), "docs(task): open verbose-flag-cli-prints");
    assert.equal(fs.readFileSync(path.join(cwd, ".gitignore"), "utf8"), "node_modules/\n", ".gitignore is left alone when it does not ignore the task directory");
    // Every gate's body ran (the include-alias workaround holds) and the per-phase review stayed off.
    for (const id of ["gates", "phase", "gate", "implement-phase", "review-code"]) assert.ok(ran(full).includes(id), `${id} ran`);
    assert.ok(!ran(full).includes("review-phase"));

    const reviewed = dryRun(cwd, "delivery-full", "Second request", ["--input", "review_each_phase=true"]);
    assert.equal(reviewed.outcome, "completed");
    assert.ok(ran(reviewed).includes("review-phase"), "review_each_phase runs the per-phase review pass");

    for (const [name, [gated, unattended, finalJoin]] of Object.entries(PACKS)) {
      const trace = dryRun(cwd, name, `Default gates for ${name}`);
      assert.equal(trace.workflow, name);
      assert.equal(trace.outcome, "completed", `${name}: ${trace.error ?? ""}`);
      assert.ok(!trace.trace.some((t) => t.state === "failed"), `${name} has no failed node`);
      for (const id of gated) assert.equal(state(trace, id), "completed", `${name}: gated ${id} runs by default`);
      for (const id of unattended) assert.equal(state(trace, id), "skipped", `${name}: twin ${id} is skipped by default`);
      assert.equal(state(trace, finalJoin), "completed", `${name}: ${finalJoin} runs`);

      const none = dryRun(cwd, name, `No gates for ${name}`, ["--input", "gates=none"]);
      assert.equal(none.workflow, name);
      assert.equal(none.outcome, "completed", `${name} gates=none: ${none.error ?? ""}`);
      for (const id of gated) assert.equal(state(none, id), "skipped", `${name} gates=none: ${id} is skipped`);
      for (const id of unattended) assert.equal(state(none, id), id.endsWith("__once") ? "stubbed" : "completed", `${name} gates=none: twin ${id} runs`);
      assert.equal(state(none, finalJoin), "completed", `${name} gates=none: ${finalJoin} runs`);
      assert.ok(!none.trace.some((t) => t.state === "paused"), `${name} gates=none never pauses`);
    }
    // The unattended implement twin's body and the unattended reproduction's counter run.
    assert.equal(state(dryRun(cwd, "delivery-lean", "Unattended body", ["--input", "gates=none"]), "implement-phase-auto"), "stubbed");
    const autoBugfix = dryRun(cwd, "delivery-bugfix", "Unattended reproduction", ["--input", "gates=none"]);
    assert.equal(autoBugfix.trace.find((t) => t.nodeId === "attempt-count").output, '{"status":"reproduced","attempt":1}');
    assert.equal(state(autoBugfix, "not-reproduced"), "skipped");

    const bugfix = dryRun(cwd, "delivery-bugfix", "Another bug report here");
    assert.deepEqual(ran(bugfix).slice(0, 5), ["task__create", "gates", "attempt", "gate", "reproduce"], "reproduction and its gate run before anything else");

    // A gate subset pauses only there: with gates=plan the design phase runs once and the run stops at the
    // plan gate, before any implementation node.
    const paused = dryRun(cwd, "delivery-full", "Pause at the plan", ["--input", "gates=plan", "--pause-at-gates"]);
    assert.equal(paused.workflow, "delivery-full");
    assert.equal(paused.outcome, "paused");
    assert.deepEqual(paused.trace.filter((t) => t.state === "paused").map((t) => t.nodeId), ["gate"]);
    assert.equal(state(paused, "design__once"), "stubbed");
    assert.equal(state(paused, "design__cycle"), "skipped");
    assert.deepEqual(ran(paused).slice(-2), ["phase", "gate"], "the paused gate follows the plan phase");
    assert.ok(!paused.trace.some((t) => t.nodeId.startsWith("implement")), "nothing after the plan gate ran");

    const bogus = dryRun(cwd, "delivery-full", "Bad gate name", ["--input", "gates=bogus"]);
    assert.equal(bogus.outcome, "failed");
    assert.deepEqual(bogus.trace.filter((t) => t.state === "failed").map((t) => t.nodeId), ["gates"]);
    assert.equal(bogus.trace.find((t) => t.nodeId === "gates").reason, 'gates: unknown gate "bogus"; use all, none, or a comma-separated subset of: design plan phases pr');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

function fixtureTest(cwd, target) {
  const result = spawnSync(ARCHON, ["workflow", "test", target, "--cwd", cwd, "--json", "--quiet"], { encoding: "utf8", env: ARCHON_ENV, timeout: 600000 });
  return { code: result.status, report: JSON.parse(result.stdout) };
}

test("archon: every declared fixture passes under `workflow test`, and the runner rejects a fixture whose expectation is wrong", { skip: !ARCHON && "no archon 0.10+ on PATH" }, () => {
  const cwd = fixture();
  try {
    const declared = listNative().flatMap(({ dir }) => {
      const fixtures = path.join(NATIVE_DIR, dir, "fixtures");
      return fs.existsSync(fixtures) ? fs.readdirSync(fixtures).filter((f) => f.endsWith(".stubs.yaml")).map((f) => `delivery/${dir}/fixtures/${f}`) : [];
    });
    assert.ok(declared.length > 0);
    const { code, report } = fixtureTest(cwd, "delivery");
    assert.equal(code, 0, JSON.stringify(report.results.filter((r) => !r.pass), null, 1));
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.results.map((r) => r.fixture).sort(), declared.sort(), "every fixture in the repository ran");
    for (const result of report.results) {
      assert.ok(result.pass, `${result.fixture}: ${result.failureReason}`);
      assert.deepEqual(result.unusedStubs, [], `${result.fixture} has no unused stub`);
      assert.deepEqual(result.missingStubs, [], `${result.fixture} stubs every reached node`);
    }
    assert.equal(git(cwd, "log", "--format=%s"), "init", "exec-code fixtures commit in Archon's scratch worktree, not in the repository");
    assert.ok(!fs.existsSync(path.join(cwd, ".agents")));

    // Negative control: the same fixture with a wrong outcome fails, so a passing report means something.
    const source = path.join(cwd, ".archon", "workflows", "delivery", "epic", "fixtures", "unattended.stubs.yaml");
    const control = path.join(cwd, ".archon", "workflows", "delivery", "epic", "fixtures", "control.stubs.yaml");
    fs.writeFileSync(control, fs.readFileSync(source, "utf8").replace("expect: completed", "expect: cancelled"));
    const failed = fixtureTest(cwd, "delivery-epic");
    assert.equal(failed.code, 1);
    const controlResult = failed.report.results.find((r) => r.fixture.endsWith("control.stubs.yaml"));
    assert.equal(controlResult.pass, false);
    assert.equal(controlResult.failureReason, "expected cancelled, dry-run reported completed");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

// A fake `omp -p`: logs every prompt to FAKE_OMP_LOG and plays the skills the packs name, writing the
// artifacts the packs read and answering as a model does (JSON in a code fence, prose around it).
const FENCE = "```";
const FAKE_OMP = String.raw`#!/bin/bash
for prompt in "$@"; do :; done
printf '=== CALL\n%s\n' "$prompt" >> "$FAKE_OMP_LOG"
task=$(printf '%s' "$prompt" | grep -o 'task directory [^ ,]*' | head -1 | awk '{print $3}' | sed 's/[.:]$//')
case "$prompt" in
  *create-research-questions/SKILL.md*) printf 'q\n' > "$task/01-research-questions-x.md"; echo saved ;;
  *create-research/SKILL.md*) printf 'r\n' > "$task/02-research-x.md"; echo saved ;;
  *create-structure-outline/SKILL.md*) printf '## Step 1: a\n\n- [ ] one\n\n## Step 2: b\n\n- [ ] two\n\n## Human Review\n\n- [ ] stays open\n' > "$task/03-structure-outline-x.md"; echo saved ;;
  *implement-outline/SKILL.md*)
    f="$task/03-structure-outline-x.md"
    awk '!done && /^- \[ \]/ { sub(/- \[ \]/, "- [x]"); done = 1 } { print }' "$f" > "$f.new" && mv "$f.new" "$f"
    n=$(grep -c '^- \[x\]' "$f"); echo "step $n" > "step-$n.txt"; git add "step-$n.txt"; git commit -q -m "feat: step $n"; echo implemented ;;
  *review-code/SKILL.md*) printf 'status: clean\n' > "$task/05-code-review-x.md"; printf 'Here is the review:\n${FENCE}json\n{"status":"clean",\n "artifact":"05-code-review-x.md","summary":"ok"}\n${FENCE}\nDone.\n' ;;
  *describe-pr/SKILL.md*) printf 'pr\n' > "$task/06-pr-description-x.md"; echo described ;;
  *reproduce-bug/SKILL.md*) repro=$FAKE_REPRO; [ -n "$repro" ] || repro=not-reproduced; n=$(grep -c '=== CALL' "$FAKE_OMP_LOG"); printf 'attempt %s\n' "$n" > "$task/01-reproduction-x.md"; printf '{"status":"%s","summary":"attempt %s","artifact":"01-reproduction-x.md"}\n' "$repro" "$n" ;;
  *) echo ok ;;
esac
`;

// A real Archon run (no --dry-run) of the OMP flavor in a scratch repository under a scratch HOME, so
// Archon's database, config, and workspace registry are created there and discarded.
function realRun(cwd, home, name, message, env, extra = []) {
  const result = spawnSync(ARCHON, ["workflow", "run", name, "--cwd", cwd, "--no-worktree", "--quiet", ...extra, message], {
    cwd,
    encoding: "utf8",
    env: { ...ARCHON_ENV, ...GIT_ENV, HOME: home, PATH: `${path.join(cwd, "bin")}${path.delimiter}${path.dirname(ARCHON)}${path.delimiter}${process.env.PATH}`, FAKE_OMP_LOG: path.join(cwd, "omp.log"), ...env },
    timeout: 120000,
  });
  const calls = fs.existsSync(path.join(cwd, "omp.log")) ? fs.readFileSync(path.join(cwd, "omp.log"), "utf8").split("=== CALL\n").slice(1) : [];
  fs.rmSync(path.join(cwd, "omp.log"), { force: true });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}`, calls };
}

test("archon: a real run of the omp flavor with a fake omp proves what dry runs cannot: expanded inputs reach included nodes, the schema travels in the prompt, fenced answers are filtered to JSON, $LOOP_PREV substitutes, until_bash ends the loop, and every join commits", { skip: !ARCHON && "no archon 0.10+ on PATH" }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "skills-archon-home-"));
  const cwd = gitRepo("node_modules/\n.agents/tasks/\n");
  try {
    fs.cpSync(path.join(REPO, ".archon", "workflows", "delivery-omp"), path.join(cwd, ".archon", "workflows", "delivery-omp"), { recursive: true });
    fs.mkdirSync(path.join(cwd, "bin"));
    fs.writeFileSync(path.join(cwd, "bin", "omp"), FAKE_OMP, { mode: 0o755 });

    const lean = realRun(cwd, home, "delivery-lean-omp", "Add a --verbose flag to the CLI that prints each command", {}, ["--input", "gates=none"]);
    assert.equal(lean.code, 0, lean.out);
    assert.match(lean.out, /Workflow completed successfully/);
    const skill = (call) => /[Rr]ead and follow (\S+)\/SKILL\.md/.exec(call)?.[1];
    assert.deepEqual(lean.calls.map((c) => path.basename(skill(c))), ["create-research-questions", "create-research", "create-structure-outline", "implement-outline", "implement-outline", "review-code", "describe-pr"], "two implementation phases: until_bash counted the real boxes and ignored the Human Review one");
    for (const call of lean.calls) assert.equal(path.dirname(skill(call)), path.join(home, ".agents", "skills"), "every node, included or not, reads the skills directory with ~ expanded");
    assert.match(lean.calls[5], /CRITICAL: Respond with ONLY a JSON object[\s\S]*status: \{ type: string, enum: \[clean, findings, blocked\] \}/, "the review node's schema is in its prompt");
    assert.deepEqual(git(cwd, "log", "--format=%s").split("\n"), [
      "docs(task): pr artifacts",
      "docs(task): review artifacts",
      "docs(task): implement artifacts",
      "feat: step 2",
      "feat: step 1",
      "docs(task): outline artifacts",
      "docs(task): research artifacts",
      "docs(task): open verbose-flag-cli-prints",
      "init",
    ]);
    assert.equal(git(cwd, "status", "--porcelain", "--", ".agents"), "", "no artifact left uncommitted");
    assert.equal(fs.readFileSync(path.join(cwd, ".gitignore"), "utf8"), "node_modules/\n");

    // Unattended bugfix that never reproduces: four fresh attempts, each seeing the previous status
    // through $LOOP_PREV, each committed, then the run cancels with the count.
    const bug = realRun(cwd, home, "delivery-bugfix-omp", "The CLI exits 0 when the config file is missing", { FAKE_REPRO: "not-reproduced" }, ["--input", "gates=none"]);
    assert.notEqual(bug.code, 0);
    assert.match(bug.out, /Bug not reproduced after 4 attempt\(s\)/);
    assert.equal(bug.calls.length, 4);
    assert.match(bug.calls[0], /\nstatus: \n/, "first attempt: $LOOP_PREV is empty");
    assert.match(bug.calls[1], /\nstatus: not-reproduced\nsummary: attempt 1\n/, "second attempt sees the first attempt's answer through $LOOP_PREV");
    assert.equal(git(cwd, "log", "--format=%s", "-5").split("\n").filter((s) => s === "docs(task): reproduce artifacts").length, 4, "each attempt's artifact is committed before the cancel");
    assert.ok(fs.existsSync(path.join(home, ".archon", "archon.db")), "the run used the scratch HOME, not the real one");

    // A gated outline: the run exits at the gate; a detached reject re-runs the phase with the
    // reviewer's text as feedback through the iterate skill; a detached approve finishes unattended.
    const steer = (args) => spawnSync(ARCHON, [...args, "--cwd", cwd, "--quiet"], { cwd, encoding: "utf8", env: { ...ARCHON_ENV, ...GIT_ENV, HOME: home, PATH: `${path.join(cwd, "bin")}${path.delimiter}${process.env.PATH}`, FAKE_OMP_LOG: path.join(cwd, "omp.log") }, timeout: 120000 });
    const gated = realRun(cwd, home, "delivery-lean-omp", "Add a --quiet flag to the CLI", {}, ["--input", "gates=outline"]);
    assert.equal(gated.code, 0, gated.out);
    assert.match(gated.out, /Workflow paused/);
    const runId = /Run ID: `([0-9a-f-]{36})`/.exec(gated.out)?.[1];
    assert.ok(runId, gated.out);
    assert.deepEqual(gated.calls.map((c) => path.basename(skill(c))), ["create-research-questions", "create-research", "create-structure-outline"], "the run stops at the outline gate");
    const rejected = steer(["workflow", "reject", runId, "--detach", "Split step 1 in two"]);
    assert.equal(rejected.status, 0, rejected.stderr);
    const waited = steer(["workflow", "wait", runId, "--timeout", "90"]);
    assert.equal(waited.status, 0, waited.stderr);
    let calls = fs.readFileSync(path.join(cwd, "omp.log"), "utf8").split("=== CALL\n").slice(1);
    assert.equal(calls.length, 1, "reject re-runs the phase once");
    assert.match(calls[0], /Reviewer feedback from the previous pass \(empty on the first pass\):\nSplit step 1 in two\n[\s\S]*Otherwise, read and follow \S+\/iterate-structure-outline\/SKILL\.md/, "the reviewer's text reaches the revision prompt verbatim, which names the iterate skill");
    const approved = steer(["workflow", "approve", runId, "--detach"]);
    assert.equal(approved.status, 0, approved.stderr);
    assert.equal(steer(["workflow", "wait", runId, "--timeout", "90"]).status, 0);
    calls = fs.readFileSync(path.join(cwd, "omp.log"), "utf8").split("=== CALL\n").slice(1);
    assert.deepEqual(calls.slice(1).map((c) => path.basename(skill(c))), ["implement-outline", "implement-outline", "review-code", "describe-pr"], "after approve the implementation gate is off, so the phases run unattended to the end");
    assert.equal(git(cwd, "log", "-1", "--format=%s"), "docs(task): pr artifacts");
    fs.rmSync(path.join(cwd, "omp.log"), { force: true });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});
