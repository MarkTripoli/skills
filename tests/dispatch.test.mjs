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
// `explicit` defaults to "false" (an auto-judged route); every call that supplies INPUTS_WORKFLOW
// passes "true" explicitly. `gates_plan` defaults to "false"; only a judged `plan` autonomy level sets it.
// `pack` is not a parameter: it is `route`'s own adaptive swap (CR-001), derived from `workflow` and
// `explicit` exactly as the node computes it, so every existing call site keeps working unchanged.
const ADAPTIVE_ELIGIBLE = ["oneshot", "lean", "full", "prd"];
const routed = (workflow, gates, suggested, confidence, confirm, explicit = "false", gatesPlan = "false") => {
  const pack = explicit !== "true" && ADAPTIVE_ELIGIBLE.includes(workflow) ? "adaptive" : workflow;
  return `{"workflow":"${workflow}","gates":"${gates}","suggested":"${suggested}","confidence":"${confidence}","confirm":"${confirm}","explicit":"${explicit}","gates_plan":"${gatesPlan}","pack":"${pack}"}`;
};

// The resolve node with the route's fields and the gate's whole output substituted the way Archon does
// (shell-quoted; a skipped gate is the empty string, a dry run's gate is `approved`). `pack` mirrors
// `route.output.pack` (CR-001: `route` already decided the adaptive swap; `resolve` only recomputes it
// when a reject text names a different pack), so most calls pass whatever `route` would have produced.
// `gatesPlan` mirrors `route.output.gates_plan`, still consumed here: `resolve` still does its own
// rename-then-widen onto `adaptive`'s vocabulary once it applies the swap `pack` names.
// `$route.output.gates_plan` is replaced before the shorter `$route.output.gates`, which is a prefix
// of it: the other order would mangle "_plan" onto the quoted gates value first.
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const resolve = (workflow, gates, confirm, pack = workflow, gatesPlan = "false") =>
  bash(body("resolve").replaceAll("$route.output.workflow", quote(workflow)).replaceAll("$route.output.gates_plan", quote(gatesPlan)).replaceAll("$route.output.gates", quote(gates)).replaceAll("$route.output.pack", quote(pack)).replaceAll("$confirm.output", quote(confirm)));
const reject = (text) => JSON.stringify({ decision: "reject", text });

// The `confirm` node's approval message, folded the way Archon's `>-` block scalar joins it (single
// newlines become spaces; this message has no blank lines, so a plain join suffices) and substituted
// with the same `$route.output.*` values a real run would carry into it.
const CONFIRM_MESSAGE_TEMPLATE = /      message: >-\n((?: {8}.*\n)+)/.exec(PACK)[1].split("\n").filter(Boolean).map((line) => line.replace(/^ {8}/, "")).join(" ");
const confirmMessage = (workflow, confidence, gates) =>
  CONFIRM_MESSAGE_TEMPLATE.replaceAll("$route.output.workflow", workflow).replaceAll("$route.output.confidence", confidence).replaceAll("$route.output.gates", gates);

test("route: an explicit workflow and gates pass through unjudged and never ask for confirmation", async () => {
  const explicit = await route("Anything at all", { INPUTS_WORKFLOW: "lean", INPUTS_GATES: "outline,pr" });
  assert.equal(explicit.code, 0, explicit.err);
  assert.equal(explicit.out, routed("lean", "outline,pr", "", "unknown", "false", "true"));
  // Spaces around the names are tolerated; `program` is a pack a caller may name.
  assert.equal((await route("x", { INPUTS_WORKFLOW: " program ", INPUTS_GATES: "prd, tdd" })).out, routed("program", "prd,tdd", "", "unknown", "false", "true"));
  // A pack name that is not one of the seven fails naming them.
  const bogus = await route("x", { INPUTS_WORKFLOW: "quick", INPUTS_GATES: "all" });
  assert.equal(bogus.code, 1);
  assert.equal(bogus.err, 'workflow: unknown pack "quick"; use auto or one of: oneshot bugfix lean full prd epic program');
});

test("route: without the helper an automatic route is full with every gate and asks for confirmation, even when the run is unattended", async () => {
  const auto = await route("Rework the whole settings area");
  assert.equal(auto.code, 0, auto.err);
  assert.equal(auto.out, routed("full", "all", "", "unknown", "true"));
  assert.equal((await route("Rework the whole settings area", { INPUTS_GATES: "none" })).out, routed("full", "none", "", "unknown", "true"), "gates=none still gets the one determination question when the pack is unsure");
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
    // `none` at the decisive bar runs unattended after the one confirmation; the unsure pack still asks.
    involvement = "none"; involvementConfidence = 0.95;
    assert.equal((await route("Rework the whole settings area, hands off", stub.env)).out, routed("full", "none", "lean", "0.55", "true"));
    // An explicit workflow is taken as given and only the gates are judged.
    workflow = "oneshot"; confidence = 0.99; involvement = "pr"; involvementConfidence = 0.9;
    assert.equal((await route("Add the flag; show me the pull request when done", { INPUTS_WORKFLOW: "lean", ...stub.env })).out, routed("lean", "pr", "", "unknown", "false", "true"));
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
      assert.equal(result.out, routed(pack, gates, "", "unknown", "false", "true", "true"), `${pack}: plan gates`);
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
    assert.equal((await route("Write a PRD for billing and open an epic with children", { INPUTS_WORKFLOW: "prd", ...stub.env })).out, routed("prd", "all", "", "unknown", "false", "true"), "an explicit pack is never remapped");
  } finally {
    stub.close();
  }
});

test("route: a gate name the chosen pack does not have fails naming the pack's gates", async () => {
  // No helper key: the fallback pack is `full`, judged non-explicit, so `huh` is checked against
  // `delivery-adaptive` (the pack that actually runs), not `delivery-full` (CR-001).
  const bogus = await route("Rework the whole settings area", { INPUTS_GATES: "huh" });
  assert.equal(bogus.code, 1);
  assert.equal(bogus.out, "");
  assert.equal(bogus.err, 'gates: unknown gate "huh" for delivery-adaptive; use auto, all, none, or a comma-separated subset of: design prd tdd plan phases pr');
  // An explicit workflow is never swapped, so it is still checked against its own gate names.
  const wrongPack = await route("x", { INPUTS_WORKFLOW: "oneshot", INPUTS_GATES: "outline" });
  assert.equal(wrongPack.code, 1);
  assert.equal(wrongPack.err, 'gates: unknown gate "outline" for delivery-oneshot; use auto, all, none, or a comma-separated subset of: pr');
});

test("route: a gate the judged pack lacks but delivery-adaptive has is accepted, because the run continues in adaptive, not the judged pack (CR-001)", async () => {
  const stub = await startStub((id, question) => (id === "workflow" ? choice("oneshot", question.criteria, 0.95) : choice("all", question.criteria, 0.95)));
  try {
    // `oneshot`'s own gate list is just `pr`; `design`, `plan`, and `phases` are not on it, but they are
    // all on `delivery-adaptive`, which a judged (non-explicit) oneshot pick actually continues in.
    const designPlan = await route("Add the flag; no need to check with me", { INPUTS_GATES: "design,plan", ...stub.env });
    assert.equal(designPlan.code, 0, designPlan.err);
    assert.equal(designPlan.out, routed("oneshot", "design,plan", "oneshot", "0.95", "false"));
    const phases = await route("Add the flag; no need to check with me", { INPUTS_GATES: "phases", ...stub.env });
    assert.equal(phases.code, 0, phases.err);
    assert.equal(phases.out, routed("oneshot", "phases", "oneshot", "0.95", "false"));
    // The control case: naming the pack explicitly still runs the fixed pack, so its own (narrower)
    // gate list still applies and `design` still fails.
    const explicitStillFails = await route("x", { INPUTS_WORKFLOW: "oneshot", INPUTS_GATES: "design" });
    assert.equal(explicitStillFails.code, 1);
    assert.equal(explicitStillFails.err, 'gates: unknown gate "design" for delivery-oneshot; use auto, all, none, or a comma-separated subset of: pr');
  } finally {
    stub.close();
  }
});

test("resolve: an approved or skipped gate trusts route's own pack and gates unchanged (route already resolved the adaptive swap, CR-001); a request changes naming a pack pins that fixed pack instead; an unknown pack or gate fails", async () => {
  assert.equal((await resolve("full", "all", "", "adaptive")).out, '{"workflow":"full","gates":"all","pack":"adaptive"}', "skipped gate: route's pack and gates stand unchanged");
  assert.equal((await resolve("full", "all", "approved", "adaptive")).out, '{"workflow":"full","gates":"all","pack":"adaptive"}', "a dry run's gate answers `approved`");
  assert.equal((await resolve("full", "all", JSON.stringify({ decision: "approve", text: "lean" }), "adaptive")).out, '{"workflow":"full","gates":"all","pack":"adaptive"}', "approve text is not a redirect");
  assert.equal((await resolve("full", "all", reject("lean, outline"), "adaptive")).out, '{"workflow":"lean","gates":"outline","pack":"lean"}', "a reject text naming a pack pins that fixed pack, never adaptive, regardless of route's own pack");
  assert.equal((await resolve("full", "all", reject("lean outline pr"), "adaptive")).out, '{"workflow":"lean","gates":"outline,pr","pack":"lean"}', "spaces work like commas");
  assert.equal((await resolve("full", "all", reject("bugfix"), "adaptive")).out, '{"workflow":"bugfix","gates":"all","pack":"bugfix"}', "no gates named: the route's gates stand; bugfix is never adaptive anyway");
  assert.equal((await resolve("full", "design,plan", reject("  "), "adaptive")).out, '{"workflow":"full","gates":"design,plan","pack":"adaptive"}', "blank reject text keeps route's workflow, gates, and pack as given");
  assert.equal((await resolve("full", "all", reject("oneshot, none"), "adaptive")).out, '{"workflow":"oneshot","gates":"none","pack":"oneshot"}');
  const unknown = await resolve("full", "all", reject("quick, pr"), "adaptive");
  assert.equal(unknown.code, 1);
  assert.equal(unknown.err, 'confirm: unknown pack "quick"; request changes naming one of: oneshot bugfix lean full prd epic program');
  const badGate = await resolve("full", "all", reject("lean, design"), "adaptive");
  assert.equal(badGate.code, 1);
  assert.equal(badGate.err, 'confirm: unknown gate "design" for delivery-lean; name the pack, then all, none, or a comma-separated subset of: outline phases pr');
  // An explicit `--input workflow=` pin (route.output.pack is the fixed pack, never adaptive) passes
  // through unchanged too, with no reject text.
  assert.equal((await resolve("full", "all", "", "full")).out, '{"workflow":"full","gates":"all","pack":"full"}', "route already pinned the fixed pack; resolve does not recompute it");
});

test("resolve: an explicit --input workflow= always pins that fixed pack, never adaptive, even for a pack the judged path would send to adaptive; a judged pack at autonomy plan lands on adaptive with the adaptive pack's own planning gates, not the judged pack's (ADV-001)", async () => {
  assert.equal((await resolve("full", "all", "", "full")).out, '{"workflow":"full","gates":"all","pack":"full"}', "route.output.pack=full (--input workflow=full): pack is the fixed pack, not adaptive");
  // `gates_plan` true (the judged pack's gates came from the `plan` autonomy level): every judged pack's
  // own gates are replaced by the adaptive pack's own planning gate set, not just lean's outline token.
  assert.equal((await resolve("lean", "outline", "", "adaptive", "true")).out, '{"workflow":"lean","gates":"design,prd,tdd,plan","pack":"adaptive"}', "judged lean: lean's outline gate has no adaptive equivalent, so it is replaced rather than renamed");
  assert.equal((await resolve("oneshot", "pr", "", "adaptive", "true")).out, '{"workflow":"oneshot","gates":"design,prd,tdd,plan","pack":"adaptive"}', "judged oneshot: oneshot has no planning gate at all, so without this remap a \"review the plan first\" request would never pause on adaptive's design/prd/tdd/plan phases");
  assert.equal((await resolve("full", "design,plan", "", "adaptive", "true")).out, '{"workflow":"full","gates":"design,prd,tdd,plan","pack":"adaptive"}', "judged full: full's own design,plan gates widen to the adaptive set, which can also run prd/tdd");
  // `gates_plan` false (any other autonomy level): the judged pack's gates pass through unchanged.
  assert.equal((await resolve("full", "all", "", "adaptive")).out, '{"workflow":"full","gates":"all","pack":"adaptive"}', "gates_plan false: no rewrite");
});

test("resolve: a caller-supplied gates=outline on a judged (non-explicit) lean pick is renamed to adaptive's own gate name instead of aborting the swap to delivery-adaptive (CR-002)", async () => {
  assert.equal((await resolve("lean", "outline,pr", "", "adaptive", "false")).out, '{"workflow":"lean","gates":"plan,pr","pack":"adaptive"}', "outline has no adaptive equivalent; it is renamed to plan, not left to fail validation against adaptive's own names");
  // An unknown gate under the adaptive swap names the pack the run will actually use, not the judged one.
  const badGate = await resolve("lean", "outline,huh", "", "adaptive", "false");
  assert.equal(badGate.code, 1);
  assert.equal(badGate.err, 'confirm: unknown gate "huh" for delivery-adaptive; name the pack, then all, none, or a comma-separated subset of: design prd tdd plan phases pr');
});

test("confirm: the approval message states that a judged pick continues in delivery-adaptive with its own gate ceiling, not the judged pack's gates (CR-003)", async () => {
  const message = confirmMessage("lean", "0.55", "outline");
  assert.match(message, /^This request reads like delivery-lean \(confidence 0\.55\) with gates outline\./, "still states the judged pack and gates, as before");
  assert.match(message, /a judged oneshot, lean, full, or prd pick, it\s+runs as delivery-adaptive instead/, "names the pack the run will actually continue in, which `outline` (lean, judged) qualifies for");
  assert.match(message, /pauses at that pack's own gates \(design, prd, tdd, plan, phases, pr\), not outline/, "names adaptive's own gate ceiling instead of repeating the judged pack's `outline`, which resolve will not use");
  // What the message names as adaptive's gate ceiling is a superset of what `resolve` actually produces
  // for this same judged pick, so the message never undersells how many gates might pause.
  const adaptiveNames = ["design", "prd", "tdd", "plan", "phases", "pr"];
  const resolved = JSON.parse((await resolve("lean", "outline", "", "adaptive", "false")).out);
  assert.equal(resolved.pack, "adaptive");
  assert.ok(resolved.gates.split(",").every((g) => adaptiveNames.includes(g)), `resolve's gates (${resolved.gates}) stay within the ceiling the message names`);
});
