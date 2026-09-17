import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startStub, noul, choice, score } from "./lib/typesafe-stub.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JUDGE = path.join(REPO, "skills", "delivery", "typed-judgment", "judge.mjs");
const PLAN = fs.readFileSync(path.join(REPO, "skills", "delivery", "create-plan", "references", "plan_template.md"), "utf8");

// Async so the in-process stub server can answer while the helper runs.
function judge(args, env, input) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [JUDGE, ...args], { env: { PATH: process.env.PATH, ...env } });
    let out = ""; let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("close", (code) => resolve({ code, out: out.replace(/\n$/, ""), err: err.trim() }));
    child.stdin.end(input ?? "");
  });
}
const tmp = (name, content) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-judge-")); const file = path.join(dir, name); fs.writeFileSync(file, content); return file; };

test("judge: without a key or with a dead endpoint every verdict command prints nothing and exits 3; extract-json prints its input", async () => {
  const plan = tmp("03-plan-x.md", PLAN);
  assert.deepEqual(await judge(["plan-remaining", plan], {}), { code: 3, out: "", err: "judge: unavailable: TYPESAFE_API_KEY is not set" });
  const dead = await judge(["feedback-intent", "looks good"], { TYPESAFE_API_KEY: "k", TYPESAFE_BASE_URL: "http://127.0.0.1:9", JUDGE_TIMEOUT: "2" });
  assert.equal(dead.code, 3); assert.equal(dead.out, "");
  const passthrough = await judge(["extract-json", "--required", "status", "--enum", "status=clean,findings"], {}, "The review is clean.\n");
  assert.deepEqual(passthrough, { code: 0, out: "The review is clean.", err: "judge: TYPESAFE_API_KEY is not set; printing the answer as is" });
  assert.equal((await judge(["nonsense"], {})).code, 2);
});

test("judge plan-remaining: verdict from the probability bands, phase criteria built from the headings, next phase only when confident", async () => {
  let remaining = 0.1; let hasPhases = 0.99; let next = "none"; let nextConfidence = 0.9;
  const stub = await startStub((id, question) => (id === "remaining" ? noul(remaining) : id === "has_phases" ? noul(hasPhases) : choice(next, question.criteria, nextConfidence)));
  try {
    const plan = tmp("03-plan-x.md", `${PLAN}\n### Step 9: Extra\n\n- [ ] later\n\n\`\`\`\n## Phase 77: quoted\n\`\`\`\n`);
    assert.equal((await judge(["plan-remaining", plan], stub.env)).out, "done");
    const keys = Object.keys(stub.requests[0].questions.next.criteria);
    assert.ok(keys.includes("phase-1") && keys.includes("step-9") && keys.at(-1) === "none" && !keys.includes("phase-77"), `criteria cover ## and ### headings outside fences plus none: ${keys}`);
    assert.equal(stub.requests[0].state.plan.length, fs.readFileSync(plan, "utf8").length, "the plan text is the state");
    remaining = 0.95; next = "step-9";
    const full = JSON.parse((await judge(["plan-remaining", plan, "--json"], stub.env)).out);
    assert.equal(full.verdict, "remaining"); assert.equal(full.next, "Step 9: Extra");
    nextConfidence = 0.5;
    assert.equal(JSON.parse((await judge(["plan-remaining", plan, "--json"], stub.env)).out).next, null, "an unsure next phase is not named");
    remaining = 0.5;
    assert.equal((await judge(["plan-remaining", plan], stub.env)).out, "unclear");
    hasPhases = 0.2;
    assert.equal((await judge(["plan-remaining", plan], stub.env)).out, "no-phases");
  } finally { stub.close(); }
});

test("judge review-status and reproduction-status: a claim only ever moves toward the safer status", async () => {
  let open = 0.9; let blocked = 0.0; let shown = 0.9;
  const stub = await startStub((id) => (id === "open_major" ? noul(open) : id === "blocked" ? noul(blocked) : noul(shown)));
  try {
    const review = tmp("08-code-review-x.md", "# Review\n\nR1 major: null deref at a.js:3\n");
    assert.equal((await judge(["review-status", review, "clean"], stub.env)).out, "findings", "clean with an open major finding becomes findings");
    open = 0.05;
    assert.equal((await judge(["review-status", review, "clean"], stub.env)).out, "clean");
    assert.equal((await judge(["review-status", review, "findings"], stub.env)).out, "findings", "findings is never relaxed to clean");
    blocked = 0.9;
    assert.equal((await judge(["review-status", review, "clean"], stub.env)).out, "blocked");
    assert.equal((await judge(["review-status", review, "blocked"], stub.env)).out, "blocked");
    const repro = tmp("02-reproduction-x.md", "# Reproduction\n");
    assert.equal((await judge(["reproduction-status", repro, "reproduced"], stub.env)).out, "reproduced");
    shown = 0.1;
    assert.equal((await judge(["reproduction-status", repro, "reproduced"], stub.env)).out, "not-reproduced", "a claimed reproduction nothing shows is not one");
    assert.equal((await judge(["reproduction-status", repro, "not-reproduced"], stub.env)).out, "not-reproduced");
  } finally { stub.close(); }
});

test("judge extract-json: a contained object needs no call; prose is recovered by enum choice plus the one artifact name; unclear falls back to the text", async () => {
  let status = "findings"; let confidence = 0.95;
  const stub = await startStub((id, question) => choice(id === "artifact_name" ? Object.keys(question.criteria)[1] : status, question.criteria, confidence));
  try {
    const fenced = await judge(["extract-json", "--required", "status,artifact,summary", "--enum", "status=clean,findings,blocked"], stub.env, 'Here you go:\n```json\n{"status": "clean", "artifact": "08-code-review-x.md", "summary": "ok"}\n```\n');
    assert.equal(fenced.out, '{"status":"clean","artifact":"08-code-review-x.md","summary":"ok"}');
    assert.equal(stub.requests.length, 0, "a parseable object is taken without asking");
    const prose = await judge(["extract-json", "--required", "status,artifact,summary", "--enum", "status=clean,findings,blocked"], stub.env, "I saved 08-code-review-x.md. Two findings remain open, both major.\n");
    assert.deepEqual(JSON.parse(prose.out), { status: "findings", artifact: "08-code-review-x.md", summary: "I saved 08-code-review-x.md. Two findings remain open, both major." });
    assert.deepEqual(Object.keys(stub.requests.at(-1).questions), ["status"], "one artifact name needs no question");
    const two = await judge(["extract-json", "--required", "status,artifact", "--enum", "status=clean,findings,blocked"], stub.env, "Read 07-plan-x.md, wrote 08-code-review-x.md; clean.\n");
    assert.equal(JSON.parse(two.out).artifact, "08-code-review-x.md", "several names: the choice picks");
    const dir = path.dirname(tmp("09-code-review-x.md", "")); fs.writeFileSync(path.join(dir, "03-plan-x.md"), "");
    const none = await judge(["extract-json", "--required", "status,artifact", "--enum", "status=clean,findings,blocked", "--dir", dir], stub.env, "All good, nothing to report.\n");
    assert.equal(JSON.parse(none.out).artifact, "09-code-review-x.md", "no name in the text: the newest artifact in --dir");
    status = "unclear";
    const unclear = await judge(["extract-json", "--required", "status", "--enum", "status=clean,findings,blocked"], stub.env, "Something else entirely\n");
    assert.deepEqual(unclear, { code: 0, out: "Something else entirely", err: "judge: status could not be recovered from the answer" });
    status = "clean"; confidence = 0.6;
    assert.equal((await judge(["extract-json", "--required", "status", "--enum", "status=clean,findings,blocked"], stub.env, "meh\n")).out, "meh", "a low-confidence recovery is not trusted");
  } finally { stub.close(); }
});

test("judge feedback-intent, route-workflow, slug, tier, triage-threads, grade-steps: thresholds and shapes", async () => {
  let picked; let confidence = 0.95; let level = 0;
  const stub = await startStub((id, question) => (question.type === "noul" ? noul(0.9) : question.type === "score" ? score(level, question.criteria, confidence) : choice(picked ?? Object.keys(question.criteria)[0], question.criteria, confidence)));
  try {
    picked = "proceed";
    assert.equal((await judge(["feedback-intent", "fine, ship it"], stub.env)).out, "proceed");
    confidence = 0.8;
    assert.equal((await judge(["feedback-intent", "fine, ship it"], stub.env)).out, "revise", "proceed below 0.9 confidence stays a revision");
    picked = "stop"; confidence = 0.95;
    assert.equal((await judge(["feedback-intent", "-"], stub.env, "abandon this")).out, "stop");
    picked = "bugfix";
    assert.equal((await judge(["route-workflow", "Fix the crash on empty names"], stub.env)).out, "bugfix");
    confidence = 0.6;
    assert.equal((await judge(["route-workflow", "something"], stub.env)).out, "full", "an unsure route is the gated pack");
    const children = tmp("children.json", JSON.stringify([{ name: "one", prompt: "Fix it" }, { name: "two", prompt: "Add it" }]));
    const rows = JSON.parse((await judge(["route-workflow", "--children", children, "--json"], stub.env)).out);
    assert.deepEqual(rows.map((row) => [row.name, row.workflow, row.suggested]), [["one", "full", "bugfix"], ["two", "full", "bugfix"]]);
    assert.ok(!("epic" in stub.requests.at(-1).questions.child_0.criteria), "a child is never an epic");
    confidence = 0.95; picked = undefined;
    const slugged = await judge(["slug", "Please add a --verbose flag to the CLI that prints each command"], stub.env);
    const criteria = Object.keys(stub.requests.at(-1).questions.slug.criteria);
    assert.ok(criteria.includes("verbose-flag-cli-prints") && criteria.includes("please-add-a-verbose"), `candidates are code-proposed: ${criteria}`);
    assert.equal(slugged.out, criteria[0]);
    assert.equal((await judge(["slug", "Verbose"], stub.env)).out, "", "one word yields no slug candidate; the caller keeps its own");
    level = 1;
    assert.equal((await judge(["tier", "Add a flag"], stub.env)).out, "medium");
    confidence = 0.4;
    assert.equal((await judge(["tier", "Add a flag"], stub.env)).out, "large", "an unsure tier is the strong one");
    confidence = 0.95; picked = "decline";
    const threads = tmp("threads.json", JSON.stringify([{ id: "t1", author: "bob", body: "Rename x", hunk: "const x = 1" }, { id: "t2", author: "bot", body: "Consider y" }]));
    const triage = JSON.parse((await judge(["triage-threads", threads, "--json"], stub.env)).out);
    assert.deepEqual(triage.map((row) => [row.id, row.disposition, row.addressed]), [["t1", "decline", 0.9], ["t2", "decline", null]]);
    confidence = 0.6;
    assert.equal((await judge(["triage-threads", threads], stub.env)).out.split("\n")[0], "t1\tundecided\t0.6");
    const steps = tmp("steps.json", JSON.stringify([{ id: "s1", expected: "a toast says Saved", observed: "toast: Saved" }]));
    level = 2; confidence = 0.9;
    assert.deepEqual(JSON.parse((await judge(["grade-steps", steps, "--json"], stub.env)).out), [{ id: "s1", verdict: "pass", satisfied: 0.9, severity: 2, severity_confidence: 0.9 }]);
  } finally { stub.close(); }
});
