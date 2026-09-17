import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { startStub, choice } from "./lib/typesafe-stub.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = path.join(REPO, "skills", "delivery");
const PACK = fs.readFileSync(path.join(REPO, ".archon", "workflows", "delivery", "start", "delivery-start.yaml"), "utf8");

// A top-level bash body of the dispatcher pack, by node id, with the indentation Archon strips.
function body(id) {
  return new RegExp(`  - id: ${id}\\n(?: {4}.*\\n)*? {4}bash: \\|\\n((?: {6}.*\\n|\\n)+?) {4}output_format:`).exec(PACK)[1].replace(/^ {6}/gm, "");
}

// Bodies run under /bin/bash the way Archon runs them, asynchronously so the in-process TypeSafe stub
// can answer the typed-judgment helper while the body runs.
function bash(script, env) {
  return new Promise((resolve) => {
    const child = spawn("/bin/bash", ["-c", script], { env: { PATH: process.env.PATH, HOME: "/home/t", ...env } });
    let out = ""; let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    child.stdin.end();
  });
}

// The route node with the environment Archon provides: the request as ARGUMENTS, the inputs as INPUTS_*.
// The skills directory is the repository's own, which holds `typed-judgment/judge.mjs`; without a
// TypeSafe key the helper exits 3 and the fallbacks apply.
const route = (request, env) => bash(body("route"), { ARGUMENTS: request, INPUTS_SKILLS_DIR: SKILLS, ...env });
const routed = (workflow, gates, suggested, confidence, confirm) => `{"workflow":"${workflow}","gates":"${gates}","suggested":"${suggested}","confidence":"${confidence}","confirm":"${confirm}"}`;

// The resolve node with the route's fields and the gate's whole output substituted the way Archon does
// (shell-quoted; a skipped gate is the empty string, a dry run's gate is `approved`).
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const resolve = (workflow, gates, confirm) => bash(body("resolve").replaceAll("$route.output.workflow", quote(workflow)).replaceAll("$route.output.gates", quote(gates)).replaceAll("$confirm.output", quote(confirm)));
const reject = (text) => JSON.stringify({ decision: "reject", text });

test("route: an explicit workflow and gates pass through unjudged and never ask for confirmation", async () => {
  const explicit = await route("Anything at all", { INPUTS_WORKFLOW: "lean", INPUTS_GATES: "outline,pr" });
  assert.equal(explicit.code, 0, explicit.err);
  assert.equal(explicit.out, routed("lean", "outline,pr", "", "unknown", "false"));
  // Spaces around the names are tolerated; `program` is a pack a caller may name.
  assert.equal((await route("x", { INPUTS_WORKFLOW: " program ", INPUTS_GATES: "prd, tdd" })).out, routed("program", "prd,tdd", "", "unknown", "false"));
  // A pack name that is not one of the seven fails naming them.
  const bogus = await route("x", { INPUTS_WORKFLOW: "quick", INPUTS_GATES: "all" });
  assert.equal(bogus.code, 1);
  assert.equal(bogus.err, 'workflow: unknown pack "quick"; use auto or one of: oneshot bugfix lean full prd epic program');
});

test("route: without the helper an automatic route is full with every gate and asks for confirmation, unless the run is unattended", async () => {
  const auto = await route("Rework the whole settings area");
  assert.equal(auto.code, 0, auto.err);
  assert.equal(auto.out, routed("full", "all", "", "unknown", "true"));
  assert.equal((await route("Rework the whole settings area", { INPUTS_GATES: "none" })).out, routed("full", "none", "", "unknown", "false"), "gates=none never pauses");
  // A dead endpoint is the same as no key.
  const dead = await route("Rework the whole settings area", { TYPESAFE_API_KEY: "k", TYPESAFE_BASE_URL: "http://127.0.0.1:9", JUDGE_TIMEOUT: "2" });
  assert.equal(dead.out, routed("full", "all", "", "unknown", "true"));
});

test("route: with the TypeSafe stub a confident pack and a hands-off request run unattended, an unsure pack falls back to full and asks, and an explicit workflow still takes the judged gates", async () => {
  let workflow = "bugfix"; let confidence = 0.95; let involvement = "none"; let involvementConfidence = 0.95;
  const stub = await startStub((id, question) => (id === "workflow" ? choice(workflow, question.criteria, confidence) : choice(involvement, question.criteria, involvementConfidence)));
  try {
    const confident = await route("The CLI exits 0 when the config file is missing; just fix it, no need to check with me", stub.env);
    assert.equal(confident.code, 0, confident.err);
    assert.equal(confident.out, routed("bugfix", "none", "bugfix", "0.95", "false"));
    assert.deepEqual(stub.requests.map((r) => Object.keys(r.questions)[0]), ["workflow", "involvement"], "one judgment each over the request");
    // Below the confident bar the helper answers full; the dispatcher reports the raw pick and asks.
    workflow = "lean"; confidence = 0.55; involvement = "unspecified";
    assert.equal((await route("Rework the whole settings area", stub.env)).out, routed("full", "all", "lean", "0.55", "true"));
    // `none` below the decisive bar is `all`, so the unsure route still asks.
    involvement = "none"; involvementConfidence = 0.85;
    assert.equal((await route("Rework the whole settings area", stub.env)).out, routed("full", "all", "lean", "0.55", "true"));
    // An explicit workflow is taken as given and only the gates are judged.
    workflow = "oneshot"; confidence = 0.99; involvement = "pr"; involvementConfidence = 0.9;
    assert.equal((await route("Add the flag; show me the pull request when done", { INPUTS_WORKFLOW: "lean", ...stub.env })).out, routed("lean", "pr", "", "unknown", "false"));
    assert.equal(Object.keys(stub.requests.at(-1).questions)[0], "involvement", "the pack was not judged");
  } finally {
    stub.close();
  }
});

test("route: the `plan` autonomy level maps to each pack's planning gates", async () => {
  const stub = await startStub((id, question) => choice("plan", question.criteria, 0.9));
  try {
    for (const [pack, gates] of [["bugfix", "reproduce"], ["lean", "outline"], ["oneshot", "pr"], ["full", "design,plan"], ["prd", "prd,tdd,plan"], ["program", "prd,tdd,plan"], ["epic", "plan"]]) {
      const result = await route("Let me review the plan before you build it", { INPUTS_WORKFLOW: pack, ...stub.env });
      assert.equal(result.out, routed(pack, gates, "", "unknown", "false"), `${pack}: plan gates`);
    }
  } finally {
    stub.close();
  }
});

test("route: a judged prd whose request also asks for epics, children, issues, or several pull requests becomes program; a plain prd and an explicit prd stay prd", async () => {
  const stub = await startStub((id, question) => (id === "workflow" ? choice("prd", question.criteria, 0.9) : choice("unspecified", question.criteria, 0.9)));
  try {
    assert.equal((await route("Write a PRD for billing and open an epic with one child per module", stub.env)).out, routed("program", "all", "prd", "0.9", "false"));
    assert.equal((await route("Write the requirements for billing, then GitHub issues for each piece", stub.env)).out, routed("program", "all", "prd", "0.9", "false"));
    assert.equal((await route("Write a PRD for billing", stub.env)).out, routed("prd", "all", "prd", "0.9", "false"));
    assert.equal((await route("Open an epic with children for billing", stub.env)).out, routed("prd", "all", "prd", "0.9", "false"), "the word check needs both halves");
    assert.equal((await route("Write a PRD for billing and open an epic with children", { INPUTS_WORKFLOW: "prd", ...stub.env })).out, routed("prd", "all", "", "unknown", "false"), "an explicit pack is never remapped");
  } finally {
    stub.close();
  }
});

test("route: a gate name the chosen pack does not have fails naming the pack's gates", async () => {
  const bogus = await route("Rework the whole settings area", { INPUTS_GATES: "huh" });
  assert.equal(bogus.code, 1);
  assert.equal(bogus.out, "");
  assert.equal(bogus.err, 'gates: unknown gate "huh" for delivery-full; use auto, all, none, or a comma-separated subset of: design plan phases pr');
  const wrongPack = await route("x", { INPUTS_WORKFLOW: "oneshot", INPUTS_GATES: "outline" });
  assert.equal(wrongPack.code, 1);
  assert.equal(wrongPack.err, 'gates: unknown gate "outline" for delivery-oneshot; use auto, all, none, or a comma-separated subset of: pr');
});

test("resolve: an approved or skipped gate keeps the route, a request changes naming a pack and gates overrides it, and an unknown pack or gate fails", async () => {
  assert.equal((await resolve("full", "all", "")).out, '{"workflow":"full","gates":"all"}', "skipped gate: route stands");
  assert.equal((await resolve("full", "all", "approved")).out, '{"workflow":"full","gates":"all"}', "a dry run's gate answers `approved`");
  assert.equal((await resolve("full", "all", JSON.stringify({ decision: "approve", text: "lean" }))).out, '{"workflow":"full","gates":"all"}', "approve text is not a redirect");
  assert.equal((await resolve("full", "all", reject("lean, outline"))).out, '{"workflow":"lean","gates":"outline"}');
  assert.equal((await resolve("full", "all", reject("lean outline pr"))).out, '{"workflow":"lean","gates":"outline,pr"}', "spaces work like commas");
  assert.equal((await resolve("full", "all", reject("bugfix"))).out, '{"workflow":"bugfix","gates":"all"}', "no gates named: the route's gates stand");
  assert.equal((await resolve("full", "design,plan", reject("  "))).out, '{"workflow":"full","gates":"design,plan"}', "blank reject text keeps the route");
  assert.equal((await resolve("full", "all", reject("oneshot, none"))).out, '{"workflow":"oneshot","gates":"none"}');
  const unknown = await resolve("full", "all", reject("quick, pr"));
  assert.equal(unknown.code, 1);
  assert.equal(unknown.err, 'confirm: unknown pack "quick"; request changes naming one of: oneshot bugfix lean full prd epic program');
  const badGate = await resolve("full", "all", reject("lean, design"));
  assert.equal(badGate.code, 1);
  assert.equal(badGate.err, 'confirm: unknown gate "design" for delivery-lean; name the pack, then all, none, or a comma-separated subset of: outline phases pr');
});
