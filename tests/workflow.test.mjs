import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as wf from "../skills/run-task/scripts/workflow.mjs";

const { FRESH_SESSION_SENTENCE: FRESH } = wf;

// worktreeProbe shells out to git; keep the user's global and system git config out of the results.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

const temps = [];
function tmpdir(prefix = "skills-wf-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).toString().trim();
}

function repo() {
  const dir = tmpdir();
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "T");
  git(dir, "config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
  git(dir, "add", "a.txt");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

// Builds a project with a task directory and optional artifacts/replies; returns { root, taskDir }.
function project({ workflow = "full", slug = "verbose-flag", artifacts = {}, replies = [] } = {}) {
  const root = tmpdir();
  const taskDir = path.join(root, ".agents", "tasks", slug);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "task.md"), `---\nslug: ${slug}\ntitle: T\nworkflow: ${workflow}\ncreated: 2026-01-01\n---\nDo it.\n`);
  for (const [name, text] of Object.entries(artifacts)) fs.writeFileSync(path.join(taskDir, name), text);
  if (replies.length) fs.mkdirSync(path.join(taskDir, "replies"));
  replies.forEach(([name, text]) => fs.writeFileSync(path.join(taskDir, "replies", name), text));
  return { root, taskDir };
}

const reply = (command, { fresh = true, before = "Done.\n\n", after = "" } = {}) => `${before}${fresh ? `${FRESH}\n\n` : ""}\`\`\`text\n${command}\n\`\`\`\n${after}`;

const artifact = (type, extra = "", body = "") => `---\ntype: ${type}\nsummary: "Fixture ${type}."\n${extra}---\n\n# ${type}\n${body}`;

const HUMAN_REVIEW = "\n## Human Review\n\n### Review targets\n\n- x\n\n### Verify\n\n- [ ] check\n\n### Known limits\n\n- None.\n";

const PLAN = `---
type: plan
summary: "Plan."
---

# Plan

## Phase 1: One

- [ ] first
- [ ] second

## Phase 2: Two

- [ ] third
${HUMAN_REVIEW}`;

const OUTLINE = `---
type: structure-outline
summary: "Outline."
---

# Outline

## Phase Checklist

- [ ] Step 1: a
- [ ] Step 2: b

## Step 1: a

- [ ] do a

## Step 2: b

- [ ] do b
${HUMAN_REVIEW}`;

describe("parseReply and validateReply", () => {
  test("accepts a reply with one command fence, the fresh sentence before it, nothing after", () => {
    const text = reply("/create-plan @03-design-discussion-x.md");
    const parsed = wf.parseReply(text);
    assert.equal(parsed.skill, "create-plan");
    assert.equal(parsed.arg, "03-design-discussion-x.md");
    assert.deepEqual(wf.validateReply(text, { expectSkill: "create-plan" }), []);
  });

  test("rejects a reply without a fence", () => {
    const issues = wf.validateReply(`Done.\n\n${FRESH}\n`);
    assert.equal(issues.length, 1);
    assert.match(issues[0], /no fenced block/);
  });

  test("rejects a two-line fence", () => {
    const issues = wf.validateReply(reply("/create-plan\n/create-research"));
    assert.ok(issues.some((i) => /holds 2 lines/.test(i)));
  });

  test("rejects text after the fence", () => {
    const issues = wf.validateReply(reply("/create-plan", { after: "\nThanks.\n" }));
    assert.ok(issues.some((i) => /text follows the command fence/.test(i)));
  });

  test("rejects a missing fresh-session sentence on a non-terminal reply", () => {
    const issues = wf.validateReply(reply("/create-plan", { fresh: false }));
    assert.ok(issues.some((i) => /appears 0 times/.test(i)));
  });

  test("rejects the fresh-session sentence placed after the fence", () => {
    const text = `Done.\n\n\`\`\`text\n/create-plan\n\`\`\`\n${FRESH}\n`;
    const issues = wf.validateReply(text);
    assert.ok(issues.some((i) => /text follows/.test(i)));
    assert.ok(issues.some((i) => /must come before the fence/.test(i)));
  });

  test("terminal /show-me reply is valid without the sentence and invalid with it", () => {
    assert.deepEqual(wf.validateReply(reply("/show-me", { fresh: false })), []);
    assert.ok(wf.validateReply(reply("/show-me")).some((i) => /terminal reply must not/.test(i)));
  });

  test("rejects an unfilled placeholder", () => {
    const issues = wf.validateReply(reply("/create-plan", { before: "Review artifact: {artifact_link}\n\n" }));
    assert.ok(issues.some((i) => /unfilled placeholders: \{artifact_link\}/.test(i)));
  });

  test("rejects unpruned workflow-variant markers", () => {
    const text = `Done.\n\n${FRESH}\n\n<!-- workflow-variants -->\nFor \`full\`:\n\`\`\`text\n/create-design-discussion\n\`\`\`\n<!-- /workflow-variants -->\n`;
    assert.ok(wf.validateReply(text).some((i) => /variant markers were not pruned/.test(i)));
  });

  test("reports a mismatch against expectSkill and unknown skills", () => {
    const text = reply("/create-plan");
    assert.ok(wf.validateReply(text, { expectSkill: "setup-worktree" }).some((i) => /expected "\/setup-worktree"/.test(i)));
    assert.ok(wf.validateReply(text, { knownSkills: new Set(["create-research"]) }).some((i) => /unknown skill/.test(i)));
  });
});

describe("remainingPhases and completePhase", () => {
  test("plan with two phases: completes one at a time, Human Review boxes ignored", () => {
    assert.deepEqual(wf.remainingPhases(PLAN), [1, 2]);
    const afterOne = wf.completePhase(PLAN, 1);
    assert.deepEqual(wf.remainingPhases(afterOne), [2]);
    assert.match(afterOne, /- \[x\] first\n- \[x\] second/);
    assert.match(afterOne, /- \[ \] third/);
    assert.match(afterOne, /### Verify\n\n- \[ \] check/);
    const afterTwo = wf.completePhase(afterOne, 2);
    assert.deepEqual(wf.remainingPhases(afterTwo), []);
    assert.match(afterTwo, /### Verify\n\n- \[ \] check/);
  });

  test("outline steps count as phases; checklist boxes outside a step are ignored", () => {
    assert.deepEqual(wf.remainingPhases(OUTLINE), [1, 2]);
    const afterOne = wf.completePhase(OUTLINE, 1);
    assert.deepEqual(wf.remainingPhases(afterOne), [2]);
    assert.match(afterOne, /- \[x\] do a/);
    assert.match(afterOne, /- \[ \] do b/);
    assert.match(afterOne, /- \[x\] Step 1: a\n- \[ \] Step 2: b/);
    const afterTwo = wf.completePhase(afterOne, 2);
    assert.deepEqual(wf.remainingPhases(afterTwo), []);
    assert.match(afterTwo, /### Verify\n\n- \[ \] check/);
  });

  test("a document with no phase or step headings is one phase that completePhase(1) finishes", () => {
    const flat = `---\ntype: plan\nsummary: "Flat."\n---\n\n# Flat\n\n- [ ] one\n- [ ] two\n${HUMAN_REVIEW}`;
    assert.deepEqual(wf.remainingPhases(flat), [1]);
    const done = wf.completePhase(flat, 1);
    assert.deepEqual(wf.remainingPhases(done), []);
    assert.match(done, /- \[x\] one\n- \[x\] two/);
    assert.match(done, /### Verify\n\n- \[ \] check/);
    assert.equal(wf.completePhase(flat, 2), flat);
  });
});

describe("listArtifacts and nextArtifactNumber", () => {
  test("types come from frontmatter, or from the name segment for receipts", () => {
    const { taskDir } = project({
      artifacts: {
        "01-research-questions-verbose-flag.md": artifact("research-questions"),
        "02-worktree-setup-verbose-flag.md": "# Receipt\n",
        "03-pr-review-verbose-flag.md": artifact("pr-review", "status: pending\n"),
        "pr-description.md": "# PR\n",
        "notes.txt": "ignored",
      },
    });
    const list = wf.listArtifacts(taskDir, "verbose-flag");
    assert.deepEqual(
      list.map((a) => [a.name, a.type]),
      [
        ["01-research-questions-verbose-flag.md", "research-questions"],
        ["02-worktree-setup-verbose-flag.md", "worktree-setup"],
        ["pr-description.md", "pr-description"],
        ["03-pr-review-verbose-flag.md", "pr-review"],
      ],
    );
    assert.equal(list[3].status, "pending");
    assert.equal(wf.nextArtifactNumber(taskDir, "verbose-flag"), 4);
  });

  test("pr-description.md sorts last when no pr-review exists and does not take a number", () => {
    const { taskDir } = project({ artifacts: { "01-plan-verbose-flag.md": PLAN, "pr-description.md": "# PR\n" } });
    const list = wf.listArtifacts(taskDir, "verbose-flag");
    assert.deepEqual(list.map((a) => a.type), ["plan", "pr-description"]);
    assert.equal(wf.nextArtifactNumber(taskDir, "verbose-flag"), 2);
  });

  test("an empty task directory starts at 01", () => {
    const { taskDir } = project();
    assert.equal(wf.nextArtifactNumber(taskDir, "verbose-flag"), 1);
  });
});

describe("nextCommand", () => {
  test("start commands per workflow, oneshot inline", () => {
    for (const [workflow, command] of [["full", "/create-research-questions"], ["lean", "/create-research-questions"], ["prd", "/create-research"]]) {
      const { taskDir } = project({ workflow });
      const next = wf.nextCommand(taskDir);
      assert.equal(next.command, command);
      assert.equal(next.source, "start");
      assert.equal(next.inline, false);
    }
    const { taskDir } = project({ workflow: "oneshot" });
    const next = wf.nextCommand(taskDir);
    assert.equal(next.inline, true);
    assert.equal(next.skill, "oneshot");
    assert.equal(next.command, wf.ONESHOT_PROMPT);
  });

  test("reads the next command from the newest reply and marks the gate", () => {
    const { taskDir } = project({
      artifacts: { "01-design-discussion-verbose-flag.md": artifact("design-discussion") },
      replies: [
        ["01-create-research.md", reply("/create-design-discussion")],
        ["02-create-design-discussion.md", reply("/create-plan @01-design-discussion-verbose-flag.md")],
      ],
    });
    const next = wf.nextCommand(taskDir);
    assert.equal(next.command, "/create-plan @01-design-discussion-verbose-flag.md");
    assert.equal(next.skill, "create-plan");
    assert.equal(next.arg, "01-design-discussion-verbose-flag.md");
    assert.equal(next.source, "reply");
    assert.equal(next.pendingGate, true);
    assert.equal(next.gateArtifact, "01-design-discussion-verbose-flag.md");
    assert.equal(next.lastSkill, "create-design-discussion");
    assert.equal(next.interactive, false);
  });

  test("loop ends on /resolve-pr-reviews, /show-me, a fence-less reply, and start-epic-delivery", () => {
    const cases = [
      ["01-describe-pr.md", reply("/resolve-pr-reviews")],
      ["01-review-code.md", reply("/show-me", { fresh: false })],
      ["01-create-plan.md", "No fence here.\n"],
      ["01-start-epic-delivery.md", reply("/create-research-questions")],
    ];
    for (const entry of cases) {
      const { taskDir } = project({ replies: [entry] });
      const next = wf.nextCommand(taskDir);
      assert.equal(next.done, true, entry[0]);
      assert.equal(next.command, null, entry[0]);
    }
  });

  test("artifact-only recovery: plan hands to setup-worktree, or implement-plan when the probe says so", () => {
    const plain = project({ artifacts: { "01-plan-verbose-flag.md": PLAN } });
    let next = wf.nextCommand(plain.taskDir);
    assert.equal(next.command, "/setup-worktree @01-plan-verbose-flag.md");
    assert.equal(next.source, "artifact");
    assert.equal(next.pendingGate, true);
    assert.equal(next.gateArtifact, "01-plan-verbose-flag.md");
    assert.equal(next.lastSkill, "create-plan");

    fs.mkdirSync(path.join(plain.root, ".agents"), { recursive: true });
    fs.writeFileSync(path.join(plain.root, ".agents", "workspace.json"), JSON.stringify({ disabled: true }));
    next = wf.nextCommand(plain.taskDir);
    assert.equal(next.command, "/implement-plan @01-plan-verbose-flag.md");

    const lean = project({ workflow: "lean", artifacts: { "01-structure-outline-verbose-flag.md": OUTLINE } });
    assert.equal(wf.nextCommand(lean.taskDir).command, "/setup-worktree @01-structure-outline-verbose-flag.md");
  });

  test("artifact-only recovery: implementation with remaining phases re-enters, without them hands to describe-pr", () => {
    const withRemaining = project({
      artifacts: { "01-plan-verbose-flag.md": wf.completePhase(PLAN, 1), "02-implementation-verbose-flag.md": artifact("implementation", "completed_phase: 1\n") },
    });
    let next = wf.nextCommand(withRemaining.taskDir);
    assert.equal(next.command, "/implement-plan @01-plan-verbose-flag.md");
    assert.equal(next.pendingGate, true);

    const finished = project({
      workflow: "lean",
      artifacts: { "01-structure-outline-verbose-flag.md": wf.completePhase(wf.completePhase(OUTLINE, 1), 2), "02-implementation-verbose-flag.md": artifact("implementation", "completed_phase: 2\n") },
    });
    next = wf.nextCommand(finished.taskDir);
    assert.equal(next.command, "/describe-pr");
    assert.equal(next.lastSkill, "implement-outline");

    const halfway = project({
      workflow: "lean",
      artifacts: { "01-structure-outline-verbose-flag.md": wf.completePhase(OUTLINE, 1), "02-implementation-verbose-flag.md": artifact("implementation", "completed_phase: 1\n") },
    });
    assert.equal(wf.nextCommand(halfway.taskDir).command, "/implement-outline @01-structure-outline-verbose-flag.md");
  });

  test("artifact-only recovery: code-review statuses and pr-description", () => {
    const status = (s) => wf.nextCommand(project({ artifacts: { "01-code-review-verbose-flag.md": artifact("code-review", `status: ${s}\n`) } }).taskDir);
    assert.equal(status("findings").command, "/fix-code-review @01-code-review-verbose-flag.md");
    assert.equal(status("clean").command, "/describe-pr");
    const blocked = status("blocked");
    assert.equal(blocked.done, true);
    assert.match(blocked.reason, /nothing runs automatically/);

    const pr = wf.nextCommand(project({ artifacts: { "pr-description.md": "# PR\n" } }).taskDir);
    assert.equal(pr.done, true);
    assert.equal(pr.pendingGate, true);
    assert.equal(pr.gateArtifact, "pr-description.md");
    assert.match(pr.reason, /external/);
  });

  test("interactive flag follows the table for the next skill", () => {
    const { taskDir } = project({ replies: [["01-create-plan.md", reply("/iterate-plan @01-plan-verbose-flag.md")]] });
    assert.equal(wf.nextCommand(taskDir).interactive, true);
  });
});

describe("chooseBackend", () => {
  const bin = tmpdir("skills-herdr-");
  fs.writeFileSync(path.join(bin, "herdr"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const withHerdr = { HERDR_ENV: "1", PATH: bin };
  const without = { HERDR_ENV: "1", PATH: tmpdir("skills-nobin-") };

  test("forced backend wins", () => {
    assert.equal(wf.chooseBackend({ env: withHerdr, herdrKind: "omp", forced: "manual" }).backend, "manual");
  });

  test("Herdr with a kind is chosen, without a kind it falls through", () => {
    assert.equal(wf.chooseBackend({ env: withHerdr, herdrKind: "omp" }).backend, "herdr");
    const noKind = wf.chooseBackend({ env: withHerdr, herdrKind: null });
    assert.equal(noKind.backend, "subagent");
    assert.match(noKind.reason, /names no agent kind/);
    assert.equal(wf.chooseBackend({ env: { HERDR_ENV: "0", PATH: bin }, herdrKind: "omp" }).backend, "subagent");
    assert.equal(wf.chooseBackend({ env: without, herdrKind: "omp" }).backend, "subagent");
  });

  test("interactive phases run inline without Herdr, never in a subagent", () => {
    const pick = wf.chooseBackend({ env: without, herdrKind: "omp", interactive: true });
    assert.equal(pick.backend, "inline");
    assert.equal(wf.chooseBackend({ env: withHerdr, herdrKind: "omp", interactive: true }).backend, "herdr");
  });

  test("no subagent tool means manual", () => {
    assert.equal(wf.chooseBackend({ env: without, subagentAvailable: false }).backend, "manual");
  });
});

describe("statusReport", () => {
  test("prints six lines with fixed prefixes", () => {
    const { taskDir } = project({
      artifacts: { "01-plan-verbose-flag.md": PLAN },
      replies: [["01-create-plan.md", reply("/setup-worktree @01-plan-verbose-flag.md")]],
    });
    const lines = wf.statusReport(taskDir, { env: { PATH: "" }, herdrKind: null }).split("\n");
    assert.equal(lines.length, 6);
    assert.deepEqual(
      lines.map((l) => l.split(":")[0]),
      ["Task", "Artifacts", "Replies", "Next", "Backend", "Context"],
    );
    assert.equal(lines[0], `Task: verbose-flag (full) at ${path.resolve(taskDir)}`);
    assert.equal(lines[1], "Artifacts: 01-plan");
    assert.equal(lines[2], "Replies: 1 (last: 01-create-plan)");
    assert.equal(lines[3], "Next: /setup-worktree @01-plan-verbose-flag.md; human gate: review 01-plan-verbose-flag.md before continuing");
    assert.match(lines[4], /^Backend: subagent \(/);
    assert.ok(lines[5].includes(`/run-task @${path.resolve(taskDir)}`));
  });

  test("a finished task reports no backend", () => {
    const { taskDir } = project({ replies: [["01-describe-pr.md", reply("/resolve-pr-reviews")]] });
    const lines = wf.statusReport(taskDir, { env: { PATH: "" } }).split("\n");
    assert.match(lines[3], /^Next: none; loop ends: /);
    assert.equal(lines[4], "Backend: none");
  });
});

describe("createTask and slugify", () => {
  test("slug drops stop words and caps at four words", () => {
    assert.equal(wf.slugify("Add a --verbose flag to the CLI"), "verbose-flag-cli");
    assert.equal(wf.slugify("Please make the dashboard load faster for admins"), "dashboard-load-faster-admins");
    assert.equal(wf.slugify(""), "task");
  });

  test("writes task.md with the conventions' frontmatter and adds the gitignore line once", () => {
    const root = tmpdir();
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/");
    const first = wf.createTask(root, { request: "Add a --verbose flag to the CLI", workflow: "lean", created: "2026-01-02" });
    assert.equal(first.slug, "verbose-flag-cli");
    assert.equal(first.gitignoreUpdated, true);
    const task = wf.readTask(first.taskDir);
    assert.equal(task.workflow, "lean");
    assert.equal(task.title, "Add a --verbose flag to the CLI");
    assert.equal(task.created, "2026-01-02");
    assert.equal(task.body, "Add a --verbose flag to the CLI");
    assert.equal(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), "node_modules/\n.agents/tasks/\n");

    const second = wf.createTask(root, { request: "Second request here", workflow: "full" });
    assert.equal(second.gitignoreUpdated, false);
    assert.equal(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), "node_modules/\n.agents/tasks/\n");
    assert.throws(() => wf.createTask(root, { request: "Second request here" }), /already exists/);
    assert.throws(() => wf.createTask(root, { request: "x y", workflow: "epic" }), /not one of/);
  });

  test("leaves a missing .gitignore alone", () => {
    const root = tmpdir();
    const result = wf.createTask(root, { request: "Ship the widget now" });
    assert.equal(result.gitignoreUpdated, false);
    assert.equal(fs.existsSync(path.join(root, ".gitignore")), false);
  });
});

describe("worktreeProbe", () => {
  test("plain repo: not a worktree, not disabled, no config", () => {
    const dir = repo();
    const probe = wf.worktreeProbe(dir);
    assert.equal(probe.inWorktree, false);
    assert.match(probe.gitDir, /\.git$/);
    assert.equal(probe.disabled, false);
    assert.equal(probe.configPresent, false);
  });

  test("disabled config and local override", () => {
    const dir = repo();
    fs.mkdirSync(path.join(dir, ".agents"));
    fs.writeFileSync(path.join(dir, ".agents", "workspace.json"), JSON.stringify({ disabled: true }));
    let probe = wf.worktreeProbe(dir);
    assert.equal(probe.disabled, true);
    assert.equal(probe.configPresent, true);
    fs.writeFileSync(path.join(dir, ".agents", "workspace.local.json"), JSON.stringify({ disabled: false }));
    probe = wf.worktreeProbe(dir);
    assert.equal(probe.disabled, false);
    assert.equal(probe.configPresent, true);
  });

  test("a real git worktree is detected", () => {
    const base = repo();
    const wt = path.join(tmpdir(), "wt");
    git(base, "worktree", "add", "-q", "-b", "feature", wt);
    const probe = wf.worktreeProbe(wt);
    assert.equal(probe.inWorktree, true);
    assert.match(probe.gitDir, /\/worktrees\//);
    assert.equal(wf.worktreeProbe(base).inWorktree, false);
  });

  test("outside a repository gitDir is null", () => {
    const dir = tmpdir();
    const probe = wf.worktreeProbe(dir);
    assert.equal(probe.gitDir, null);
    assert.equal(probe.inWorktree, false);
  });
});
