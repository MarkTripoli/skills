import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as wf from "../skills/delivery/run-task/scripts/workflow.mjs";
import { makeFixture, runChain, fakePhase, checkPhase, kebab, DEFAULT_CHILDREN } from "../scripts/simulate.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fixtures = [];
function fixture(options) {
  const f = makeFixture(options);
  fixtures.push(f);
  return f;
}
after(() => {
  for (const f of fixtures) f.cleanup();
});

// The chain column of workflows/delivery.md for one workflow type, without the external
// resolve-pr-reviews step. Per the doc's sentence under the table, setup-worktree is skipped inside a
// worktree or when the workspace config is disabled; `worktree` mirrors the fixture's mode.
function documentedChain(type, { worktree = "none" } = {}) {
  const doc = fs.readFileSync(path.join(REPO, "workflows", "delivery.md"), "utf8");
  const row = doc.split("\n").find((line) => line.startsWith(`| \`${type}\` |`));
  assert.ok(row, `workflows/delivery.md has no chain row for ${type}`);
  const chain = row.split("|")[2].trim().split(",").map((s) => s.trim());
  assert.equal(chain.at(-1), "resolve-pr-reviews");
  const skipWorktree = worktree === "disabled" || worktree === "inside";
  return chain.slice(0, -1).filter((skill) => !(skipWorktree && skill === "setup-worktree"));
}

function assertClean(result) {
  assert.deepEqual(result.issues, []);
  assert.equal(result.done, true, result.reason);
}

const skills = (result) => result.steps.map((s) => s.skill);
const gates = (result) => result.steps.filter((s) => s.pendingGate).map((s) => s.skill);
const fenceOf = (taskDir, step) => wf.parseReply(fs.readFileSync(path.join(taskDir, "replies", step.replyFile), "utf8")).command;

test("full: one implementation run completes every phase; the chain equals workflows/delivery.md", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "full" });
  const result = runChain(projectRoot, taskDir, { scenario: { planPhases: 2 } });
  assertClean(result);
  assert.deepEqual(skills(result), documentedChain("full"));
  assert.deepEqual(gates(result), ["create-design-discussion", "create-plan", "implement-plan", "describe-pr"]);
  assert.match(result.reason, /external/);
  const replies = wf.listReplies(taskDir).map((r) => r.name);
  assert.deepEqual(replies, result.steps.map((s) => s.replyFile));
  assert.equal(replies[0], "01-create-research-questions.md");
  const artifacts = wf.listArtifacts(taskDir, "verbose-flag");
  assert.deepEqual(artifacts.map((a) => a.type), ["research-questions", "research", "design-discussion", "plan", "worktree-setup", "implementation", "implementation", "pr-description"]);
  assert.deepEqual(wf.remainingPhases(artifacts[3].text), []);
  assert.deepEqual(artifacts.filter((a) => a.type === "implementation").map((a) => a.data.completed_phase), ["1", "2"]);
  const implement = result.steps.find((s) => s.skill === "implement-plan");
  assert.equal(fenceOf(taskDir, implement), "/describe-pr");
});

test("lean in a plain repo: the outline hands to setup-worktree, which hands to implement-outline with the outline", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "none" });
  const result = runChain(projectRoot, taskDir, { scenario: { planPhases: 2 } });
  assertClean(result);
  assert.deepEqual(skills(result), documentedChain("lean"));
  const setup = result.steps.find((s) => s.skill === "setup-worktree");
  assert.equal(fenceOf(taskDir, setup), "/implement-outline @03-structure-outline-verbose-flag.md");
  assert.deepEqual(gates(result), ["create-structure-outline", "implement-outline", "describe-pr"]);
  const outline = wf.listArtifacts(taskDir, "verbose-flag").find((a) => a.type === "structure-outline");
  assert.deepEqual(wf.remainingPhases(outline.text), []);
  assert.match(outline.text, /- \[x\] Step 1: Work area\n- \[x\] Step 2: Work area/);
});

test("lean with a disabled workspace: setup-worktree is skipped and the outline hands to implement-outline", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  const result = runChain(projectRoot, taskDir, { scenario: { planPhases: 2 } });
  assertClean(result);
  assert.deepEqual(skills(result), documentedChain("lean", { worktree: "disabled" }));
  assert.equal(result.steps[2].next, "/implement-outline @03-structure-outline-verbose-flag.md");
  assert.deepEqual(gates(result), ["create-structure-outline", "implement-outline", "describe-pr"]);
});

test("prd inside a real worktree: the plan hands to implement-plan", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "prd", worktree: "inside" });
  assert.equal(wf.worktreeProbe(projectRoot).inWorktree, true);
  const result = runChain(projectRoot, taskDir, { scenario: { planPhases: 1 } });
  assertClean(result);
  assert.deepEqual(skills(result), documentedChain("prd", { worktree: "inside" }));
  const plan = result.steps.find((s) => s.skill === "create-plan");
  assert.equal(plan.next, "/implement-plan @04-plan-verbose-flag.md");
  assert.deepEqual(gates(result), ["create-prd", "create-tdd", "create-plan", "implement-plan", "describe-pr"]);
});

test("interrupted: stopping after each phase re-enters implement-plan with the plan until no phase remains", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "full" });
  const result = runChain(projectRoot, taskDir, { scenario: { stopEachPhase: true, planPhases: 2 } });
  assertClean(result);
  const runs = result.steps.filter((s) => s.skill === "implement-plan");
  assert.equal(runs.length, 2);
  assert.equal(fenceOf(taskDir, runs[0]), "/implement-plan @04-plan-verbose-flag.md");
  assert.equal(fenceOf(taskDir, runs[1]), "/describe-pr");
  assert.deepEqual(gates(result), ["create-design-discussion", "create-plan", "implement-plan", "implement-plan", "describe-pr"]);
  assert.deepEqual(wf.listArtifacts(taskDir, "verbose-flag").filter((a) => a.type === "implementation").map((a) => a.data.completed_phase), ["1", "2"]);
});

test("a human-gated phase stops the implementation run after that phase only", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "full", worktree: "disabled" });
  const result = runChain(projectRoot, taskDir, { scenario: { planPhases: 3, humanGated: [2] } });
  assertClean(result);
  const runs = result.steps.filter((s) => s.skill === "implement-plan");
  assert.equal(runs.length, 2);
  assert.deepEqual(wf.listArtifacts(taskDir, "verbose-flag").filter((a) => a.type === "implementation").map((a) => a.data.completed_phase), ["1", "2", "3"]);
  assert.equal(fenceOf(taskDir, runs[0]), "/implement-plan @04-plan-verbose-flag.md");
  assert.match(fs.readFileSync(path.join(taskDir, "replies", runs[0].replyFile), "utf8"), /^Phase 2 automated checks are green\./);
});

test("oneshot: one inline prompt, then describe-pr", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "oneshot" });
  const result = runChain(projectRoot, taskDir);
  assertClean(result);
  assert.deepEqual(skills(result), ["oneshot", "describe-pr"]);
  assert.equal(result.steps[0].command, wf.ONESHOT_PROMPT);
  assert.equal(result.steps[0].artifactFile, null);
  assert.equal(result.steps[0].pendingGate, false);
  assert.deepEqual(wf.listArtifacts(taskDir, "verbose-flag").map((a) => a.name), ["pr-description.md"]);
});

// workflows/delivery.md, Review loop: the loop is user-invoked between implementation and the pull
// request; nothing in the table routes into it. `reviewLoop` models the user typing `/review-code`
// where the table would have run describe-pr; the loop's own transitions are then checked like any phase.
test("review loop: findings, fix, clean review, then describe-pr", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "full", worktree: "disabled" });
  const result = runChain(projectRoot, taskDir, { scenario: { planPhases: 1, reviewLoop: true, codeReview: ["findings", "clean"] } });
  assertClean(result);
  const tail = skills(result).slice(-4);
  assert.deepEqual(tail, ["review-code", "fix-code-review", "review-code", "describe-pr"]);
  const reviews = wf.listArtifacts(taskDir, "verbose-flag").filter((a) => a.type === "code-review");
  assert.deepEqual(reviews.map((a) => a.status), ["findings", "clean"]);
  assert.equal(result.steps.at(-4).next, `/fix-code-review @${reviews[0].name}`);
  assert.equal(result.steps.at(-2).next, "/describe-pr");
  assert.ok(result.steps.slice(-4, -1).every((s) => !s.pendingGate));
});

test("iterate: requesting changes at the plan gate revises the plan in place and returns to the gate", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "full" });
  const approvals = [];
  const result = runChain(projectRoot, taskDir, { scenario: { planPhases: 1, changesAt: { "create-plan": 1 } }, approve: (step) => (approvals.push(step.skill), true) });
  assertClean(result);
  const seq = skills(result);
  const at = seq.indexOf("create-plan");
  assert.deepEqual(seq.slice(at, at + 3), ["create-plan", "iterate-plan", "setup-worktree"]);
  assert.equal(result.steps[at + 1].artifactFile, result.steps[at].artifactFile);
  assert.equal(result.steps[at + 1].pendingGate, true);
  assert.equal(result.steps[at + 1].next, result.steps[at].next);
  assert.deepEqual(approvals, ["create-design-discussion", "iterate-plan", "implement-plan", "describe-pr"]);
  const plans = wf.listArtifacts(taskDir, "verbose-flag").filter((a) => a.type === "plan");
  assert.equal(plans.length, 1, "the iteration allocated a new artifact number");
  assert.equal(plans[0].name, result.steps[at].artifactFile);
  assert.equal(wf.listReplies(taskDir).find((r) => r.skill === "iterate-plan").name, `${String(at + 2).padStart(2, "0")}-iterate-plan.md`);
});

test("iterate-plan changes the plan file without allocating a new number", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "full" });
  runChain(projectRoot, taskDir, { scenario: { planPhases: 1 }, approve: (step) => step.skill !== "create-plan" });
  const before = wf.listArtifacts(taskDir, "verbose-flag").find((a) => a.type === "plan");
  const result = fakePhase("iterate-plan", taskDir, { arg: before.name, feedback: "Split the migration out of phase 1." });
  assert.deepEqual(checkPhase(result, taskDir), []);
  const after = wf.listArtifacts(taskDir, "verbose-flag");
  assert.equal(after.filter((a) => a.type === "plan").length, 1);
  assert.equal(result.artifactFile, before.name);
  const revised = after.find((a) => a.type === "plan");
  assert.notEqual(revised.text, before.text);
  assert.ok(revised.text.includes("Split the migration out of phase 1."));
  assert.equal(after.length, wf.listArtifacts(taskDir, "verbose-flag").length);
});

test("epic: start-epic-delivery creates one task per child and each child starts with its own command", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "full", slug: "config-epic" });
  const first = fakePhase("create-epic-plan", taskDir, {});
  assert.deepEqual(checkPhase(first, taskDir), []);
  assert.equal(wf.nextCommand(taskDir, { projectRoot }).command, "/start-epic-delivery @01-epic-plan-config-epic.md");
  const result = runChain(projectRoot, taskDir);
  assertClean(result);
  assert.deepEqual(skills(result), ["start-epic-delivery"]);
  assert.equal(result.steps[0].pendingGate, true);
  assert.match(result.reason, /children/);

  // Frontmatter keys per skills/delivery/start-epic-delivery/SKILL.md; order is not part of the contract.
  const CHILD_KEYS = ["slug", "title", "workflow", "created", "parent", "depends_on"];
  for (const child of DEFAULT_CHILDREN) {
    const dir = path.join(projectRoot, ".agents", "tasks", kebab(child.name));
    const { data, body } = wf.parseFrontmatter(fs.readFileSync(path.join(dir, "task.md"), "utf8"));
    assert.deepEqual(Object.keys(data).sort(), [...CHILD_KEYS].sort());
    assert.equal(data.slug, kebab(child.name));
    assert.equal(data.title, child.name);
    assert.equal(data.workflow, child.workflow);
    assert.equal(data.parent, "config-epic");
    assert.equal(body.trim(), child.prompt);
    const next = wf.nextCommand(dir, { projectRoot });
    if (child.workflow === "oneshot") {
      assert.equal(next.inline, true);
      assert.equal(next.command, wf.ONESHOT_PROMPT);
    } else {
      assert.equal(next.command, wf.START_COMMAND[child.workflow]);
    }
  }
  const dependent = fs.readFileSync(path.join(projectRoot, ".agents", "tasks", "wire-verbose-flag", "task.md"), "utf8");
  assert.match(dependent, /depends_on:\n  - add-config-loader\n/);
});

test("recovery: with replies/ deleted, nextCommand derives the same full command and gate from artifacts", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "full" });
  const seen = [];
  for (const stopAt of ["create-design-discussion", "create-plan", "implement-plan", "describe-pr"]) {
    const result = runChain(projectRoot, taskDir, { scenario: { planPhases: 2, stopEachPhase: true }, approve: (step) => step.skill !== stopAt });
    assert.deepEqual(result.issues, []);
    const fromReply = wf.nextCommand(taskDir, { projectRoot });
    assert.equal(fromReply.source, "reply");
    fs.rmSync(path.join(taskDir, "replies"), { recursive: true, force: true });
    const fromArtifacts = wf.nextCommand(taskDir, { projectRoot });
    assert.equal(fromArtifacts.source, "artifact");
    assert.equal(fromArtifacts.command, fromReply.command);
    assert.equal(fromArtifacts.arg, fromReply.arg);
    assert.equal(fromArtifacts.done, fromReply.done);
    assert.equal(fromArtifacts.pendingGate, wf.PHASES[stopAt].gate);
    assert.equal(fromArtifacts.pendingGate, fromReply.pendingGate);
    assert.equal(fromArtifacts.gateArtifact, fromReply.gateArtifact);
    seen.push(fromArtifacts.command);
  }
  assert.deepEqual(seen, [
    "/create-plan @03-design-discussion-verbose-flag.md",
    "/setup-worktree @04-plan-verbose-flag.md",
    "/implement-plan @04-plan-verbose-flag.md",
    null,
  ]);
});

test("phase subcommand: --reply writes the reply to the named path and --feedback lands in the revised artifact", async () => {
  const { execFileSync } = await import("node:child_process");
  const { taskDir } = fixture({ workflow: "full" });
  const script = path.join(REPO, "scripts", "simulate.mjs");
  const replyFile = path.join(taskDir, "custom", "01-create-research-questions.md");
  const out = execFileSync("node", [script, "phase", "create-research-questions", taskDir, "--reply", replyFile], { encoding: "utf8" });
  assert.equal(fs.readFileSync(replyFile, "utf8"), out);
  assert.equal(fs.existsSync(path.join(taskDir, "replies")), false);
  assert.equal(wf.parseReply(out).command, "/create-research");
  const questions = wf.listArtifacts(taskDir, "verbose-flag")[0];
  assert.equal(questions.type, "research-questions");
  assert.match(questions.text, /^Request: Add a --verbose flag to the CLI\.$/m);
  execFileSync("node", [script, "phase", "iterate-research-questions", taskDir, `@${questions.name}`, "--feedback", "Ask about stderr handling."], { encoding: "utf8" });
  const revised = wf.listArtifacts(taskDir, "verbose-flag");
  assert.equal(revised.length, 1);
  assert.ok(revised[0].text.includes("Ask about stderr handling."));
});
