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
    assert.ok(!("criteria" in stub.requests[0].questions.remaining), "a question with no stated boundary sends none");
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

test("judge review-status and reproduction-status: a claim only ever moves toward the safer status, at the majority bar", async () => {
  let open = 0.9; let blocked = 0.0; let shown = 0.9;
  const stub = await startStub((id) => (id === "open_major" ? noul(open) : id === "blocked" ? noul(blocked) : noul(shown)));
  try {
    const review = tmp("08-code-review-x.md", "# Review\n\nR1 major: null deref at a.js:3\n");
    assert.equal((await judge(["review-status", review, "clean"], stub.env)).out, "findings", "clean with an open major finding becomes findings");
    const gate = stub.requests[0].questions.open_major;
    assert.deepEqual(Object.keys(gate), ["type", "instructions", "criteria"]);
    assert.match(gate.criteria.false, /Only advisories remain/);
    open = 0.55;
    assert.equal((await judge(["review-status", review, "clean"], stub.env)).out, "findings", "a majority reading of an open major finding is enough to keep reviewing");
    open = 0.45;
    assert.equal((await judge(["review-status", review, "clean"], stub.env)).out, "clean");
    assert.equal((await judge(["review-status", review, "findings"], stub.env)).out, "findings", "findings is never relaxed to clean");
    blocked = 0.9;
    assert.equal((await judge(["review-status", review, "clean"], stub.env)).out, "blocked");
    assert.equal((await judge(["review-status", review, "blocked"], stub.env)).out, "blocked");
    const repro = tmp("02-reproduction-x.md", "# Reproduction\n");
    assert.equal((await judge(["reproduction-status", repro, "reproduced"], stub.env)).out, "reproduced");
    shown = 0.24;
    assert.equal((await judge(["reproduction-status", repro, "reproduced"], stub.env)).out, "not-reproduced", "a claimed reproduction the artifact more likely than not does not show is not one");
    shown = 0.55;
    assert.equal((await judge(["reproduction-status", repro, "reproduced"], stub.env)).out, "reproduced");
    assert.equal((await judge(["reproduction-status", repro, "not-reproduced"], stub.env)).out, "not-reproduced");
  } finally { stub.close(); }
});

test("judge verification-status: a passed claim with a failed item becomes failed, a blocked artifact blocks, failed is never relaxed", async () => {
  let openFail = 0.9; let blocked = 0.0;
  const stub = await startStub((id) => (id === "open_fail" ? noul(openFail) : noul(blocked)));
  try {
    const artifact = tmp("06-verification-x.md", "# Verification\n\n| A2 | fail | 2 |\n");
    assert.equal((await judge(["verification-status", artifact, "passed"], stub.env)).out, "failed", "passed with a failed item in the table becomes failed");
    assert.equal(stub.requests.at(-1).state.verification, fs.readFileSync(artifact, "utf8"), "the artifact text is the state");
    openFail = 0.45;
    assert.equal((await judge(["verification-status", artifact, "passed"], stub.env)).out, "passed");
    assert.equal((await judge(["verification-status", artifact, "failed"], stub.env)).out, "failed", "failed is never relaxed to passed");
    blocked = 0.9;
    assert.equal((await judge(["verification-status", artifact, "passed"], stub.env)).out, "blocked");
    assert.equal((await judge(["verification-status", artifact, "blocked"], stub.env)).out, "blocked");
    const full = JSON.parse((await judge(["verification-status", artifact, "passed", "--json"], stub.env)).out);
    assert.deepEqual(Object.keys(full).sort(), ["blocked", "claimed", "open_fail", "status"]);
  } finally { stub.close(); }
});

test("judge systemOne: a rate limit or a 5xx is retried inside the timeout, an oversized request is not, and an answered call names its model", async () => {
  const review = tmp("08-code-review-x.md", "# Review\n");
  const once = await startStub(() => noul(0.1), { statuses: [429], retryAfter: 0 });
  try {
    const result = await judge(["review-status", review, "clean"], once.env);
    assert.equal(result.out, "clean");
    assert.equal(once.requests.length, 2, "the rate-limited attempt is sent again");
    assert.match(result.err, /judge: model jev-stub, tokens 1 in \/ 1 out/);
  } finally { once.close(); }
  const twice = await startStub(() => noul(0.1), { statuses: [500, 503] });
  try {
    assert.equal((await judge(["review-status", review, "clean"], twice.env)).out, "clean");
    assert.equal(twice.requests.length, 3, "two retries by default");
  } finally { twice.close(); }
  const exhausted = await startStub(() => noul(0.1), { statuses: [500, 500, 500] });
  try {
    const result = await judge(["review-status", review, "clean"], exhausted.env);
    assert.equal(result.code, 3);
    assert.match(result.err, /judge: unavailable: HTTP 500/);
    assert.equal(exhausted.requests.length, 3, "the attempt count bounds the retries");
  } finally { exhausted.close(); }
  const off = await startStub(() => noul(0.1), { statuses: [429] });
  try {
    assert.equal((await judge(["review-status", review, "clean"], { ...off.env, JUDGE_RETRIES: "0" })).code, 3);
    assert.equal(off.requests.length, 1, "JUDGE_RETRIES=0 sends one request");
  } finally { off.close(); }
  const big = await startStub(() => noul(0.1), { statuses: [400] });
  try {
    const result = await judge(["review-status", review, "clean"], big.env);
    assert.equal(result.code, 3);
    assert.match(result.err, /request too large/);
    assert.equal(big.requests.length, 1, "an oversized request is never retried");
  } finally { big.close(); }
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
    assert.equal(unclear.code, 0);
    assert.equal(unclear.out, "Something else entirely");
    assert.match(unclear.err, /judge: status could not be recovered from the answer/);
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
    confidence = 0.95; picked = "none";
    assert.equal((await judge(["autonomy", "just fix it, no need to check with me"], stub.env)).out, "none");
    confidence = 0.85;
    assert.equal((await judge(["autonomy", "just fix it"], stub.env)).out, "all", "unattended needs the decisive bar");
    picked = "plan";
    assert.equal((await judge(["autonomy", "run the plan by me first"], stub.env)).out, "plan");
    picked = "unspecified"; confidence = 1;
    assert.equal((await judge(["autonomy", "Add a flag"], stub.env)).out, "all", "nothing said means every gate");
    confidence = 0.95; picked = "decline";
    const threads = tmp("threads.json", JSON.stringify([{ id: "t1", author: "bob", body: "Rename x", hunk: "const x = 1" }, { id: "t2", author: "bot", body: "Consider y" }]));
    const triage = JSON.parse((await judge(["triage-threads", threads, "--json"], stub.env)).out);
    assert.deepEqual(triage.map((row) => [row.id, row.disposition, row.addressed]), [["t1", "decline", 0.9], ["t2", "decline", null]]);
    confidence = 0.6;
    assert.equal((await judge(["triage-threads", threads], stub.env)).out.split("\n")[0], "t1\tundecided\t0.6");
    const steps = tmp("steps.json", JSON.stringify([{ id: "s1", expected: "a toast says Saved", observed: "toast: Saved" }]));
    level = 2; confidence = 0.9;
    assert.deepEqual(JSON.parse((await judge(["grade-steps", steps, "--json"], stub.env)).out), [{ id: "s1", verdict: "pass", satisfied: 0.9, severity: 2, severity_confidence: 0.9 }]);
    const checks = tmp("checks.json", JSON.stringify([{ id: "C1", expected: "exits 0 with no failing test", observed: "tests 9, pass 9, fail 0; exit 0" }]));
    level = 0;
    assert.deepEqual(JSON.parse((await judge(["grade-steps", "--kind", "command", checks, "--json"], stub.env)).out), [{ id: "C1", verdict: "pass", satisfied: 0.9, severity: 0, severity_confidence: 0.9 }]);
    assert.match(stub.requests.at(-1).questions.satisfied_0.instructions, /stdout, stderr, the exit code/, "command rows are graded as command output, not as a screen");
    const diffs = tmp("diffs.json", JSON.stringify([{ id: "T1", expected: "the change keeps this check's strength", observed: "additions only: two tests appended; no skip, only, or todo" }]));
    assert.equal(JSON.parse((await judge(["grade-steps", "--kind", "diff", diffs, "--json"], stub.env)).out)[0].verdict, "pass");
    assert.match(stub.requests.at(-1).questions.satisfied_0.instructions, /no test deleted, skipped/, "diff rows are graded for weakened checks");
    assert.equal((await judge(["grade-steps", "--kind", "file", checks], stub.env)).code, 2, "an unknown kind is a usage error");
  } finally { stub.close(); }
});

test("judge size-children: each sizing test is read against its own bar, a declared enabler skips the vertical test, and a split is named only when the model is sure", async () => {
  let oneDay = 0.9; let vertical = 0.9; let criteria = 0.95; let split = "workflow_step"; let confidence = 0.95;
  const stub = await startStub((id, question) =>
    question.type === "choice"
      ? choice(split, question.criteria, confidence)
      : noul(id.startsWith("one_day") ? oneDay : id.startsWith("vertical") ? vertical : id.startsWith("criteria") ? criteria : 0.9),
  );
  try {
    const file = tmp("children.json", JSON.stringify([
      { name: "Reject expired keys", prompt: "Return 401 for an expired key.", acceptance: ["WHEN an expired key is used, the gateway shall return 401."] },
      { name: "Rebuild the gateway", prompt: "Move every endpoint onto the new router." },
    ]));
    let rows = JSON.parse((await judge(["size-children", "--children", file, "--json"], stub.env)).out);
    assert.deepEqual(rows.map((row) => [row.verdict, row.split]), [["ok", null], ["ok", null]], "every test above its bar stands, and no split is applied to a child that passes");
    assert.deepEqual([rows[0].criteria, rows[1].criteria], ["ok", "none"], "a child without acceptance sentences is not judged on them");
    assert.deepEqual(Object.keys(stub.requests.at(-1).questions).filter((id) => id.startsWith("criteria")), ["criteria_0"]);

    // The effort question answers lower than the text questions for every child, so it carries lower bars:
    // 0.5 still passes, 0.2 is a clear no.
    oneDay = 0.5;
    assert.equal(JSON.parse((await judge(["size-children", "--children", file, "--json"], stub.env)).out)[0].verdict, "ok", "a hedged effort answer alone does not split a child");
    oneDay = 0.2;
    rows = JSON.parse((await judge(["size-children", "--children", file, "--json"], stub.env)).out);
    assert.deepEqual(rows.map((row) => [row.verdict, row.weakest, row.split]), [["split", "one_day", "workflow_step"], ["split", "one_day", "workflow_step"]]);
    assert.equal((await judge(["size-children", "--children", file], stub.env)).out.split("\n")[0], "Reject expired keys\tsplit\tone_day\t0.2\tworkflow_step");

    confidence = 0.6;
    rows = JSON.parse((await judge(["size-children", "--children", file, "--json"], stub.env)).out);
    assert.deepEqual([rows[0].split, rows[0].suggested_split], [null, "workflow_step"], "an unsure split is reported but never applied");
    confidence = 0.95; split = "none";
    assert.equal(JSON.parse((await judge(["size-children", "--children", file, "--json"], stub.env)).out)[0].split, null, "no split pattern fits: the skill decides");

    oneDay = 0.9; criteria = 0.1;
    const banded = tmp("banded.json", JSON.stringify([{ name: "Half sure", prompt: "Do the thing.", acceptance: ["The system shall be fast."] }]));
    const between = await startStub((id, question) => (question.type === "choice" ? choice("none", question.criteria, 0.95) : noul(id.startsWith("merge_safe") ? 0.5 : id.startsWith("criteria") ? 0.1 : 0.9)));
    try {
      const row = JSON.parse((await judge(["size-children", "--children", banded, "--json"], between.env)).out)[0];
      assert.deepEqual([row.verdict, row.weakest, row.criteria], ["unclear", "merge_safe", "weak"], "between the bars the decision goes back to the skill, and vague criteria are flagged on their own");
    } finally { between.close(); }

    // A child that stops at a layer boundary fails the vertical test unless the plan declares it an enabler.
    vertical = 0.1; criteria = 0.95;
    const migration = tmp("migration.json", JSON.stringify([{ name: "Add the invoices table", prompt: "Add the migration; nothing reads it yet.", acceptance: ["The migration shall create the invoices table."] }]));
    assert.equal(JSON.parse((await judge(["size-children", "--children", migration, "--json"], stub.env)).out)[0].verdict, "split");
    const enabler = tmp("enabler.json", JSON.stringify([{ name: "Add the invoices table", slice: "enabler", prompt: "Add the migration; nothing reads it yet.", acceptance: ["The migration shall create the invoices table."] }]));
    const row = JSON.parse((await judge(["size-children", "--children", enabler, "--json"], stub.env)).out)[0];
    assert.deepEqual([row.verdict, row.enabler], ["ok", true], "a declared enabler is exempt from the vertical test; its consumer is the skill's check");
    assert.ok(row.tests.vertical_slice === 0.1, "the vertical probability is still reported for the reader");

    assert.equal((await judge(["size-children"], stub.env)).code, 2);
  } finally { stub.close(); }
});

test("judge research commands: rerank orders by expected level and asks whether any candidate answers; coverage, cite, neutral, and route-question apply their bands", async () => {
  let level = 0; let p = 0.9; let role = "analyze"; let confidence = 0.9;
  const stub = await startStub((id, question) => (question.type === "score" ? score(id === "c_1" ? 3 : level, question.criteria) : question.type === "noul" ? noul(p) : choice(role, question.criteria, confidence)));
  try {
    const cands = tmp("cands.json", JSON.stringify([{ id: "a.js", text: "x" }, { id: "b.js", text: "y" }]));
    const ranked = JSON.parse((await judge(["rerank", "--query", "where is y", cands, "--json"], stub.env)).out);
    assert.deepEqual(ranked.candidates.map((c) => [c.id, c.level]), [["b.js", 3], ["a.js", 0]], "the best candidate comes first");
    assert.equal(ranked.any, 0.9);
    assert.ok(stub.requests.at(-1).questions.c_0.instructions.includes("candidates[0].text"), "each candidate gets its own score question over the shared state");
    const qs = tmp("q.json", JSON.stringify([{ id: "Q1", text: "Where is dispatch?" }]));
    const artifact = tmp("02-research-x.md", "# Research\n");
    assert.equal((await judge(["coverage", qs, artifact], stub.env)).out, "Q1\tanswered\t0.9");
    p = 0.5;
    assert.equal((await judge(["coverage", qs, artifact], stub.env)).out, "Q1\tpartial\t0.5");
    const claims = tmp("claims.json", JSON.stringify([{ id: "C1", claim: "exits 1", source: "process.exit(2)" }]));
    p = 0.03;
    assert.equal((await judge(["cite", claims], stub.env)).out, "C1\tunsupported\t0.03");
    p = 0.65;
    assert.equal((await judge(["neutral", qs], stub.env)).out, "Q1\tleading\t0.65", "the flag bar for a leading question is 0.6");
    p = 0.35;
    assert.equal((await judge(["neutral", qs], stub.env)).out, "Q1\tneutral\t0.35");
    assert.equal((await judge(["route-question", qs], stub.env)).out, "Q1\tanalyze\t0.9");
    confidence = 0.45;
    assert.equal((await judge(["route-question", qs], stub.env)).out, "Q1\tundecided\t0.45", "below a majority reading the skill picks the worker");
  } finally { stub.close(); }
});
