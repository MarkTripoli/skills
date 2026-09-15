import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as wf from "../skills/run-task/scripts/workflow.mjs";
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
// resolve-pr-reviews step, with the implementation skill repeated once per plan phase.
function documentedChain(type, { phases = 1 } = {}) {
  const doc = fs.readFileSync(path.join(REPO, "workflows", "delivery.md"), "utf8");
  const row = doc.split("\n").find((line) => line.startsWith(`| \`${type}\` |`));
  assert.ok(row, `workflows/delivery.md has no chain row for ${type}`);
  const chain = row.split("|")[2].trim().split(",").map((s) => s.trim());
  assert.equal(chain.at(-1), "resolve-pr-reviews");
  return chain.slice(0, -1).flatMap((skill) => (skill.startsWith("implement-") ? Array(phases).fill(skill) : [skill]));
}

function assertClean(result) {
  assert.deepEqual(result.issues, []);
  assert.equal(result.done, true, result.reason);
}

const skills = (result) => result.steps.map((s) => s.skill);
const gates = (result) => result.steps.filter((s) => s.pendingGate).map((s) => s.skill);

test("full: the observed chain equals workflows/delivery.md and gates land where the table says", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "full" });
  const result = runChain(projectRoot, taskDir, { scenario: { planPhases: 2 } });
  assertClean(result);
  assert.deepEqual(skills(result), documentedChain("full", { phases: 2 }));
  assert.deepEqual(gates(result), ["create-design-discussion", "create-plan", "implement-plan", "implement-plan", "describe-pr"]);
  assert.match(result.reason, /external/);
  const replies = wf.listReplies(taskDir).map((r) => r.name);
  assert.deepEqual(replies, result.steps.map((s) => s.replyFile));
  assert.equal(replies[0], "01-create-research-questions.md");
  const artifacts = wf.listArtifacts(taskDir, "verbose-flag");
  assert.deepEqual(artifacts.map((a) => a.type), ["research-questions", "research", "design-discussion", "plan", "worktree-setup", "implementation", "implementation", "pr-description"]);
  assert.deepEqual(wf.remainingPhases(artifacts[3].text), []);
  assert.deepEqual(artifacts.filter((a) => a.type === "implementation").map((a) => a.data.completed_phase), ["1", "2"]);
});

test("lean with a disabled workspace: the outline hands to implement-outline directly, once per step", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "lean", worktree: "disabled" });
  const result = runChain(projectRoot, taskDir, { scenario: { planPhases: 2 } });
  assertClean(result);
  assert.deepEqual(skills(result), documentedChain("lean", { phases: 2 }));
  assert.ok(!skills(result).includes("setup-worktree"));
  assert.equal(result.steps[2].next, "/implement-outline @03-structure-outline-verbose-flag.md");
  assert.deepEqual(gates(result), ["create-structure-outline", "implement-outline", "implement-outline", "describe-pr"]);
  const outline = wf.listArtifacts(taskDir, "verbose-flag").find((a) => a.type === "structure-outline");
  assert.deepEqual(wf.remainingPhases(outline.text), []);
});

test("prd inside a real worktree: the plan hands to implement-plan", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "prd", worktree: "inside" });
  assert.equal(wf.worktreeProbe(projectRoot).inWorktree, true);
  const result = runChain(projectRoot, taskDir, { scenario: { planPhases: 1 } });
  assertClean(result);
  assert.deepEqual(skills(result), documentedChain("prd").filter((s) => s !== "setup-worktree"));
  const plan = result.steps.find((s) => s.skill === "create-plan");
  assert.equal(plan.next, "/implement-plan @04-plan-verbose-flag.md");
  assert.deepEqual(gates(result), ["create-prd", "create-tdd", "create-plan", "implement-plan", "describe-pr"]);
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

test("iterate: requesting changes at the plan gate runs iterate-plan in place and returns to the gate", () => {
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
  assert.equal(plans.length, 1);
  assert.match(plans[0].text, /Revision 1: applied the requested changes\./);
  assert.equal(wf.listReplies(taskDir).find((r) => r.skill === "iterate-plan").name, `${String(at + 2).padStart(2, "0")}-iterate-plan.md`);
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

  for (const child of DEFAULT_CHILDREN) {
    const dir = path.join(projectRoot, ".agents", "tasks", kebab(child.name));
    const { data, body } = wf.parseFrontmatter(fs.readFileSync(path.join(dir, "task.md"), "utf8"));
    assert.deepEqual(Object.keys(data), ["slug", "title", "workflow", "created", "parent", "depends_on"]);
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
  assert.throws(() => fakePhase("start-epic-delivery", taskDir, {}), /already exist/);
});

test("recovery: with replies/ deleted, nextCommand derives the same command and gate from artifacts", () => {
  const { projectRoot, taskDir } = fixture({ workflow: "full" });
  const seen = [];
  for (const stopAt of ["create-plan", "implement-plan", "describe-pr"]) {
    const result = runChain(projectRoot, taskDir, { scenario: { planPhases: 2 }, approve: (step) => step.skill !== stopAt });
    assert.deepEqual(result.issues, []);
    const fromReply = wf.nextCommand(taskDir, { projectRoot });
    assert.equal(fromReply.source, "reply");
    fs.rmSync(path.join(taskDir, "replies"), { recursive: true, force: true });
    const fromArtifacts = wf.nextCommand(taskDir, { projectRoot });
    assert.equal(fromArtifacts.source, "artifact");
    assert.equal(fromArtifacts.command, fromReply.command);
    assert.equal(fromArtifacts.done, fromReply.done);
    assert.equal(fromArtifacts.pendingGate, wf.PHASES[stopAt].gate);
    assert.equal(fromArtifacts.pendingGate, fromReply.pendingGate);
    assert.equal(fromArtifacts.gateArtifact, fromReply.gateArtifact);
    seen.push(fromArtifacts.command);
  }
  assert.deepEqual(seen, ["/setup-worktree @04-plan-verbose-flag.md", "/implement-plan @04-plan-verbose-flag.md", null]);
});
