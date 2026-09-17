#!/usr/bin/env node
// Typed judgments over text through the TypeSafe System One API, one command per decision the
// delivery packs and skills make over agent or human prose. Each command owns its thresholds and
// prints a small answer code can branch on; when the service is unavailable (no key, network,
// HTTP error, timeout) it prints nothing and exits 3 so the caller falls back to its own rule.
// `extract-json` is the exception: it always prints something usable and exits 0.
//
// Usage: node judge.mjs <command> [args] [--json]
//   plan-remaining <plan.md>                     done | remaining | no-phases | unclear
//   review-status <artifact.md> <claimed>        clean | findings | blocked (never relaxes a claim)
//   reproduction-status <artifact.md> <claimed>  reproduced | not-reproduced
//   extract-json --required a,b --enum f=x,y [--dir d] [file|-]   a JSON object, or the input text
//   route-workflow [--children file.json] [text|@file|-]          {workflow, confidence, probabilities}
//   size-children --children file.json          one ok | split | unclear per epic child, with the split to apply
//   triage-threads <threads.json>                one disposition per review thread
//   feedback-intent [text|@file|-]               revise | proceed | stop
//   slug [request|@file|-]                       the chosen directory slug
//   tier [text|@file|-]                          small | medium | large
//   autonomy [text|@file|-]                      none | pr | plan | all (how much the request wants a human involved)
//   grade-steps <steps.json>                     one pass | fail | unclear per observed step
//   rerank --query <text|@file|-> <candidates.json>   candidates ordered by how well they answer the query
//   coverage <questions.json> <artifact.md>      answered | partial | missing per research question
//   cite <claims.json>                           supported | unsupported | unclear per cited claim
//   route-question <questions.json>              locate | analyze | pattern | web | none | undecided per question
//   neutral <questions.json>                     neutral | leading | unclear per question
//   ask --state <json|@file> --questions <json|@file>             the raw answers object
// Text arguments: `@path` reads a file, `-` reads stdin.
// Env: TYPESAFE_API_KEY (required), TYPESAFE_BASE_URL, TYPESAFE_DEFAULT_MODEL, JUDGE_TIMEOUT (seconds, default 20).
// Exit: 0 answered, 2 usage error, 3 unavailable.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Act only when the model is clear; the band between hands the decision back to the caller. `safe` is the
// bar for moving a claim toward the safer status (clean to findings, reproduced to not-reproduced): a wrong
// move there costs one extra session, the opposite mistake ships a bug, so the majority reading is enough.
const T = { yes: 0.8, no: 0.2, safe: 0.5, confident: 0.8, decisive: 0.9, triage: 0.7 };
const WORKFLOWS = {
  oneshot: "A bounded change with a clear specification that one session implements without research or design: a flag, a copy change, a small function, a configuration edit.",
  bugfix: "A reported defect: something that should work behaves wrongly, and it needs reproducing and fixing.",
  lean: "A feature with a known shape that needs a short structure outline and phased implementation, but no research or design discussion; or the request asks for an outline-first or lean approach.",
  full: "Work that needs research and a design discussion before planning: unclear requirements, several possible approaches, or a cross-cutting or architectural change.",
  prd: "Product work that needs a requirements document and a technical design first, or the request asks for a PRD or TDD.",
  epic: "A large initiative to split into several independent child tasks, each delivered as its own pull request.",
};

class Unavailable extends Error {}
const usage = (message) => { process.stderr.write(`judge: ${message}\n`); process.exit(2); };
const textArg = (value) => (value === "-" ? fs.readFileSync(0, "utf8") : value?.startsWith("@") ? fs.readFileSync(value.slice(1), "utf8") : value ?? "");
const flag = (args, name) => { const i = args.indexOf(name); if (i < 0) return undefined; const [value] = args.splice(i, 2).slice(1); return value; };
const bool = (args, name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const argmax = (probabilities) => Object.entries(probabilities).reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];

export async function systemOne(state, questions) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Unavailable("TYPESAFE_API_KEY is not set");
  const base = (process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai").replace(/\/$/, "");
  const seconds = Number(process.env.JUDGE_TIMEOUT) || 20;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), seconds * 1000);
  try {
    const response = await fetch(`${base}/v1/systemone`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ state, model: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest", questions }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Unavailable(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const body = await response.json();
    if (!body || typeof body.answers !== "object") throw new Unavailable("response has no answers");
    return body.answers;
  } catch (error) {
    if (error instanceof Unavailable) throw error;
    throw new Unavailable(error.name === "AbortError" ? `no answer within ${seconds}s` : error.message);
  } finally {
    clearTimeout(timer);
  }
}

const noul = (instructions) => ({ type: "noul", instructions });
const choice = (instructions, criteria) => ({ type: "choice", instructions, criteria });
const score = (instructions, criteria) => ({ type: "score", instructions, criteria });

// Phase headings of a plan or structure outline: `## Phase N` or `## Step N`, at heading level 2 or 3,
// outside code fences. Returns [{ key, title }].
export function planPhases(plan) {
  const phases = [];
  let fenced = false;
  for (const line of plan.split("\n")) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const match = /^#{2,3} ((?:Phase|Step) (\d+))\b:?\s*(.*)$/.exec(line);
    if (match) phases.push({ key: match[1].toLowerCase().replace(" ", "-"), title: match[3] ? `${match[1]}: ${match[3]}` : match[1] });
  }
  return phases;
}

async function planRemaining(file) {
  const plan = fs.readFileSync(file, "utf8");
  const phases = planPhases(plan);
  const questions = {
    remaining: noul("At least one implementation phase or step in `plan` still has implementation work that is not marked complete. Judge only the phase sections and the phase checklist; ignore reviewer checklists under Human Review or Verify headings, which are for a person, not the implementer."),
    has_phases: noul("The `plan` is organised into numbered implementation phases or steps that an implementer works through in order."),
  };
  if (phases.length) {
    const criteria = Object.fromEntries(phases.map((phase) => [phase.key, `${phase.title} is the earliest phase whose implementation work is not yet complete`]));
    criteria.none = "Every implementation phase is complete; nothing is left to implement";
    questions.next = choice("Which phase of `plan` should the implementer work on next", criteria);
  }
  const answers = await systemOne({ plan }, questions);
  const remaining = answers.remaining.noul;
  const verdict = answers.has_phases.noul < 0.5 ? "no-phases" : remaining <= T.no ? "done" : remaining >= T.yes ? "remaining" : "unclear";
  const next = answers.next && answers.next.confidence >= T.confident && answers.next.choice !== "none" ? phases.find((phase) => phase.key === answers.next.choice) : null;
  return { text: verdict, json: { verdict, remaining, has_phases: answers.has_phases.noul, next: next ? next.title : null, next_confidence: answers.next?.confidence ?? null } };
}

async function reviewStatus(file, claimed) {
  const review = fs.readFileSync(file, "utf8");
  const answers = await systemOne({ review }, {
    open_major: noul("The code review in `review` lists at least one finding of critical or major severity, or marked required or blocking, that is not recorded as fixed or declined."),
    blocked: noul("The reviewer states the review could not be completed: a required check could not run, the diff could not be obtained, or the review is marked blocked."),
  });
  const open = answers.open_major.noul; const blocked = answers.blocked.noul;
  let status;
  if (claimed === "blocked") status = "blocked";
  else if (blocked > T.safe) status = "blocked";
  else if (claimed === "findings") status = "findings";
  else if (claimed === "clean") status = open > T.safe ? "findings" : "clean";
  else status = open <= T.no ? "clean" : "findings";
  return { text: status, json: { status, claimed, open_major: open, blocked } };
}

async function reproductionStatus(file, claimed) {
  const reproduction = fs.readFileSync(file, "utf8");
  const answers = await systemOne({ reproduction }, {
    shown: noul("`reproduction` records a concrete attempt, a command or steps with their observed result, whose outcome exhibits the reported behavior, and names the code that causes it."),
  });
  const shown = answers.shown.noul;
  const status = claimed === "reproduced" ? (shown < T.safe ? "not-reproduced" : "reproduced") : claimed === "not-reproduced" ? "not-reproduced" : shown >= T.yes ? "reproduced" : "not-reproduced";
  return { text: status, json: { status, claimed, shown } };
}

// The first JSON object in `text` that has every required key; else the first that parses; else null.
export function scanJson(text, required) {
  let fallback = null;
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0; let inString = false; let end = -1;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) { if (c === "\\") i++; else if (c === '"') inString = false; continue; }
      if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { end = i; break; }
    }
    if (end < 0) continue;
    let value;
    try { value = JSON.parse(text.slice(start, end + 1)); } catch { continue; }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (required.every((key) => key in value)) return value;
    fallback ??= value;
  }
  return fallback;
}

const ARTIFACT_NAME = /\b\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md\b/g;
async function extractJson(args) {
  const required = (flag(args, "--required") || "").split(",").filter(Boolean);
  const enums = Object.fromEntries((flag(args, "--enum") || "").split(";").filter(Boolean).map((spec) => { const [field, values] = spec.split("="); return [field, values.split(",").filter(Boolean)]; }));
  const dir = flag(args, "--dir");
  const text = textArg(args[0] ?? "-");
  const found = scanJson(text, required);
  if (found && required.every((key) => key in found)) return { text: JSON.stringify(found), json: found };
  const raw = { text: text.replace(/\s+$/, ""), json: null };
  let answers;
  try {
    const questions = {};
    for (const [field, values] of Object.entries(enums)) questions[field] = choice(`Which \`${field}\` does the \`answer\` report`, { ...Object.fromEntries(values.map((value) => [value, `The answer reports ${field} ${value}`])), unclear: `The answer does not report any ${field}` });
    const names = [...new Set(text.match(ARTIFACT_NAME) || [])];
    if (names.length > 1 && required.some((key) => /artifact|file/.test(key))) questions.artifact_name = choice("Which file is the artifact the answer says it saved", Object.fromEntries(names.map((name) => [name, `The file ${name}`])));
    answers = Object.keys(questions).length ? await systemOne({ answer: text }, questions) : {};
    const object = found && typeof found === "object" ? { ...found } : {};
    for (const field of Object.keys(enums)) {
      const answer = answers[field];
      if (!answer || answer.choice === "unclear" || answer.confidence < T.confident) { process.stderr.write(`judge: ${field} could not be recovered from the answer\n`); return raw; }
      object[field] = answer.choice;
    }
    for (const key of required) {
      if (key in object) continue;
      if (/artifact|file/.test(key)) {
        object[key] = names.length === 1 ? names[0] : names.length > 1 ? answers.artifact_name?.choice ?? "" : dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => /^\d{2}-.*\.md$/.test(name)).sort().at(-1) ?? "" : "";
      } else object[key] = text.replace(/\s+/g, " ").trim().slice(0, 500);
    }
    return { text: JSON.stringify(object), json: object };
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    process.stderr.write(`judge: ${error.message}; printing the answer as is\n`);
    return raw;
  }
}

async function routeWorkflow(args) {
  const childrenFile = flag(args, "--children");
  if (childrenFile) {
    const children = JSON.parse(fs.readFileSync(childrenFile, "utf8"));
    const { epic, ...criteria } = WORKFLOWS;
    const questions = Object.fromEntries(children.map((child, i) => [`child_${i}`, choice(`Which delivery workflow fits the child task \`children[${i}].prompt\` (named \`children[${i}].name\`)`, criteria)]));
    const answers = await systemOne({ children }, questions);
    const rows = children.map((child, i) => { const a = answers[`child_${i}`]; return { name: child.name, workflow: a.confidence >= T.confident ? a.choice : "full", suggested: a.choice, confidence: a.confidence, probabilities: a.probabilities }; });
    return { text: rows.map((row) => `${row.name}\t${row.workflow}\t${row.confidence}`).join("\n"), json: rows };
  }
  const request = textArg(args[0] ?? "-");
  const answers = await systemOne({ request }, { workflow: choice("Which delivery workflow fits the `request`", WORKFLOWS) });
  const a = answers.workflow;
  const workflow = a.confidence >= T.confident ? a.choice : "full";
  return { text: workflow, json: { workflow, suggested: a.choice, confidence: a.confidence, probabilities: a.probabilities } };
}

// One split per symptom in shared/SLICING.md, in that document's order.
const SPLITS = {
  workflow_step: "The child walks several steps of one flow; each step becomes its own child and the first is a walking skeleton.",
  rule_variation: "The child carries a core rule and its exceptions; the core rule ships first and each variation becomes its own child.",
  input_format: "The child accepts several input shapes or formats; the first shape ships first and each further format becomes its own child.",
  failure_path: "The child mixes the happy path with error, permission, or boundary handling; the happy path ships first and each failure class becomes its own child.",
  research_spike: "The child is large because the approach is unknown; a time-boxed research child that ends in a design artifact comes first.",
  layer_batch: "The child changes one layer for every feature at once, so it is a horizontal batch; the work regroups by behavior instead.",
  none: "No split applies: the child is already one unit of work.",
};

// Sizing bars, set from a calibration run over eight children, four of them one pull request each and four
// oversize: the structural tests separated at 0.65 against 0.52, so a pass needs 0.60 and a clear fail sits
// under 0.40. The effort question answers lower for every child because the model cannot see the codebase
// (0.54 to 0.67 for the small ones, 0.06 to 0.22 for the oversize ones), so it carries its own two bars.
const SIZE = { pass: 0.6, fail: 0.4, effort_pass: 0.4, effort_fail: 0.25 };

// The four tests of shared/SLICING.md, as probabilities that the child passes each one. A child fails on the
// test furthest below its bar; a declared enabler is exempt from the vertical-slice test by design.
async function sizeChildren(file) {
  const children = JSON.parse(fs.readFileSync(file, "utf8"));
  const questions = {};
  children.forEach((child, i) => {
    const it = `the child task \`children[${i}]\` (named \`children[${i}].name\`, described in \`children[${i}].prompt\`)`;
    questions[`obligation_${i}`] = noul(`${it} asks one thing of the system: one actor, one behavior, and one measurable pass criterion, stated in \`children[${i}].acceptance\` when it has them. Naming the files to change, the tests to write, or the documentation to update is part of that one obligation. Two unrelated behaviors, or wording such as "and also", is more than one.`);
    questions[`vertical_${i}`] = noul(`${it} ends at behavior a user or a calling program can exercise once it merges, crossing whatever storage, service, contract, and client layers that behavior needs. A change that stops at one layer boundary and leaves nothing exercisable does not.`);
    questions[`one_day_${i}`] = noul(`An engineer who knows this codebase implements ${it}, proves it with a test or an observation, and opens the pull request within one working day.`);
    questions[`merge_safe_${i}`] = noul(`Merging ${it} on its own leaves the product releasable: it finishes the behavior it changes, or its path stays additive, unreachable until later work, or behind a flag whose default keeps today's behavior. A child that half-changes a behavior another child must finish does not.`);
    if (Array.isArray(child.acceptance) && child.acceptance.length) {
      questions[`criteria_${i}`] = noul(`Every sentence in \`children[${i}].acceptance\` names observable state (a status code, stored record, emitted event, exit code, or rendered value) that a command, request, or observation decides, states one behavior, and avoids unmeasurable words such as fast, secure, user-friendly, or works correctly.`);
    }
    questions[`split_${i}`] = choice(`Assuming ${it} is too large for one pull request and must be split, which split applies`, SPLITS);
  });
  const answers = await systemOne({ children }, questions);
  const rows = children.map((child, i) => {
    const tests = {
      single_obligation: answers[`obligation_${i}`].noul,
      vertical_slice: answers[`vertical_${i}`].noul,
      one_day: answers[`one_day_${i}`].noul,
      merge_safe: answers[`merge_safe_${i}`].noul,
    };
    const enabler = child.slice === "enabler";
    const bars = { single_obligation: SIZE.pass, merge_safe: SIZE.pass, one_day: SIZE.effort_pass };
    if (!enabler) bars.vertical_slice = SIZE.pass;
    const weakest = Object.keys(bars).reduce((worst, key) => (tests[key] - bars[key] < tests[worst] - bars[worst] ? key : worst));
    const structural = Math.min(...Object.keys(bars).filter((key) => key !== "one_day").map((key) => tests[key]));
    const verdict =
      structural < SIZE.fail || tests.one_day < SIZE.effort_fail
        ? "split"
        : structural >= SIZE.pass && tests.one_day >= SIZE.effort_pass
          ? "ok"
          : "unclear";
    const criteriaAnswer = answers[`criteria_${i}`];
    const criteria = !criteriaAnswer ? "none" : criteriaAnswer.noul >= T.yes ? "ok" : criteriaAnswer.noul <= T.no ? "weak" : "unclear";
    const suggestion = answers[`split_${i}`];
    const named = verdict !== "ok" && suggestion.choice !== "none" && suggestion.confidence >= T.confident;
    return {
      name: child.name,
      verdict,
      weakest,
      probability: tests[weakest],
      tests,
      enabler,
      criteria,
      criteria_probability: criteriaAnswer?.noul ?? null,
      split: named ? suggestion.choice : null,
      suggested_split: suggestion.choice,
      split_confidence: suggestion.confidence,
    };
  });
  return { text: rows.map((row) => `${row.name}\t${row.verdict}\t${row.weakest}\t${row.probability}\t${row.split ?? "none"}`).join("\n"), json: rows };
}

async function triageThreads(file) {
  const threads = JSON.parse(fs.readFileSync(file, "utf8"));
  const questions = {};
  threads.forEach((thread, i) => {
    questions[`disposition_${i}`] = choice(`How should the review thread \`threads[${i}]\` be handled`, {
      fix: "The thread asks for a concrete change to the code or documentation that should be made",
      discuss: "The thread raises a design or approach question that needs a reply and a decision rather than a direct edit",
      decline: "The request conflicts with the task, the repository conventions, or rests on a misreading, so a reasoned no is right",
      clarify: "The thread asks a question or is too vague to act on; it needs an answer or more information before any change",
    });
    questions[`change_${i}`] = noul(`The review thread \`threads[${i}].body\` asks for a code or documentation change`);
    if (thread.hunk) questions[`addressed_${i}`] = noul(`The current code in \`threads[${i}].hunk\` already does what the thread \`threads[${i}].body\` asks for`);
  });
  const answers = await systemOne({ threads }, questions);
  const rows = threads.map((thread, i) => {
    const d = answers[`disposition_${i}`];
    return { id: thread.id, disposition: d.confidence >= T.triage ? d.choice : null, suggested: d.choice, confidence: d.confidence, requests_change: answers[`change_${i}`].noul, addressed: answers[`addressed_${i}`]?.noul ?? null };
  });
  return { text: rows.map((row) => `${row.id}\t${row.disposition ?? "undecided"}\t${row.confidence}`).join("\n"), json: rows };
}

async function feedbackIntent(text) {
  const feedback = textArg(text);
  const answers = await systemOne({ feedback }, {
    intent: choice("What does the reviewer's `feedback` ask the workflow to do", {
      revise: "Asks for changes to the artifact or work just reviewed before continuing",
      proceed: "Accepts the work as it is (including saying it is approved, fine, or that the wrong button was pressed), or only notes something for later; no change is requested before continuing",
      stop: "Asks to stop, abandon, cancel, or pause the run instead of continuing",
      unclear: "None of these can be told from the text",
    }),
  });
  const a = answers.intent;
  const intent = (a.choice === "proceed" || a.choice === "stop") && a.confidence >= T.decisive ? a.choice : "revise";
  return { text: intent, json: { intent, suggested: a.choice, confidence: a.confidence, probabilities: a.probabilities } };
}

// The same stop list as the task node's slug pipeline; the candidates are what code can propose.
const STOP = new Set("a an the to of for in on and or with that this add make create please fix bug".split(" "));
// Function words the task node keeps; dropping them gives the judge one more candidate to weigh.
const FILLER = new Set([...STOP, ..."where when which who is are was does do so into from by as at be it its we our users report since after".split(" ")]);
export function slugCandidates(request) {
  const words = request.split("\n")[0].toLowerCase().replace(/[^a-z0-9 -]/g, " ").replace(/-/g, " ").split(/\s+/).filter(Boolean);
  const kept = words.filter((word) => !STOP.has(word));
  const lean = words.filter((word) => !FILLER.has(word));
  const candidates = [kept.slice(0, 4), words.slice(0, 4), kept.slice(0, 3), lean.slice(0, 4), lean.slice(0, 3), kept.slice(1, 5)].map((list) => list.join("-")).filter((slug) => slug.includes("-"));
  return [...new Set(candidates)];
}
async function slug(text) {
  const request = textArg(text);
  const candidates = slugCandidates(request);
  if (candidates.length <= 1) return { text: candidates[0] ?? "", json: { slug: candidates[0] ?? "", candidates } };
  const answers = await systemOne({ request }, { slug: choice("Which candidate names the task in `request` best as a short directory name: specific and recognisable, without filler words", Object.fromEntries(candidates.map((c) => [c, `The slug ${c}`]))) });
  const a = answers.slug;
  const chosen = a.confidence >= 0.5 ? a.choice : candidates[0];
  return { text: chosen, json: { slug: chosen, suggested: a.choice, confidence: a.confidence, candidates } };
}

const TIERS = ["small", "medium", "large"];
async function tier(text) {
  const request = textArg(text);
  const answers = await systemOne({ request }, {
    complexity: score("How demanding is the work the `request` describes for the model that will design and implement it", [
      "Mechanical or narrowly scoped: a rename, a configuration flip, a copy edit, a single obvious fix; no design decision",
      "Bounded feature or fix touching a few files with clear requirements; some judgment, but a known pattern",
      "Cross-cutting: a new subsystem, unclear requirements, architectural or data-model decisions, or security- or concurrency-sensitive code",
    ]),
  });
  const a = answers.complexity;
  const level = a.confidence >= 0.5 ? Number(argmax(a.probabilities)) : 2;
  return { text: TIERS[level], json: { tier: TIERS[level], score: a.score, confidence: a.confidence, probabilities: a.probabilities } };
}

// How much human involvement the request asks for, from none (hands-off) to all (every gate). Unattended
// is the risky direction, so `none` needs the decisive bar and `pr`/`plan` the confident one; anything
// less, or nothing said, is `all`, the packs' default.
async function autonomy(text) {
  const request = textArg(text);
  const answers = await systemOne({ request }, {
    involvement: choice("How much does the `request` want a person involved while the work is done", {
      none: "Do it without checking in: just do it, hands-off, fully automatic, no review needed, do not wait for me",
      pr: "Only show the finished result: review the pull request, tell me when it is done, check with me at the end",
      plan: "Review the plan or design before the build starts, but not every step after that",
      all: "Stay involved along the way: approve each step, keep me in the loop, check with me as you go",
      unspecified: "Says nothing about how much to check in",
    }),
  });
  const a = answers.involvement;
  const level = a.choice === "none" ? (a.confidence >= T.decisive ? "none" : "all") : a.choice === "pr" || a.choice === "plan" ? (a.confidence >= T.confident ? a.choice : "all") : "all";
  return { text: level, json: { autonomy: level, suggested: a.choice, confidence: a.confidence, probabilities: a.probabilities } };
}

async function gradeSteps(file) {
  const steps = JSON.parse(fs.readFileSync(file, "utf8"));
  const questions = {};
  steps.forEach((step, i) => {
    questions[`satisfied_${i}`] = noul(`\`steps[${i}].observed\` is the accessibility snapshot or view hierarchy read from the screen after the step: element roles, names, values, and states, one per entry. It shows the outcome described in \`steps[${i}].expected\`: the named elements, text, or states are present as described.`);
    questions[`severity_${i}`] = score(`How far does \`steps[${i}].observed\` deviate from \`steps[${i}].expected\``, [
      "Matches the expectation; nothing wrong",
      "Cosmetic difference only: layout, wording, or styling that does not affect the task",
      "Functional deviation: the outcome is partly wrong or a control does not behave as described",
      "Blocking: the flow cannot continue, crashes, or shows an error state",
    ]);
  });
  const answers = await systemOne({ steps }, questions);
  const rows = steps.map((step, i) => {
    const satisfied = answers[`satisfied_${i}`].noul; const severity = answers[`severity_${i}`];
    return { id: step.id, verdict: satisfied >= T.yes ? "pass" : satisfied <= T.no ? "fail" : "unclear", satisfied, severity: Number(argmax(severity.probabilities)), severity_confidence: severity.confidence };
  });
  return { text: rows.map((row) => `${row.id}\t${row.verdict}\t${row.satisfied}\t${row.severity}`).join("\n"), json: rows };
}

// Research support. `rerank` scores candidate files or excerpts against one question so a skill reads the
// useful ones first; `coverage` checks a finished research document against the questions it set out to
// answer; `cite` checks a claim against the source lines the skill fetched for its `path:line` pointer;
// `route-question` names the worker role a question needs (a wrong role costs little, so a majority reading
// decides); `neutral` flags a question that presumes its answer (plainly neutral questions score around 0.3,
// so the flag bar is 0.6). Rows carry the probabilities so the skill can record them.
const RELEVANCE = ["Unrelated to the question", "Touches the topic but does not help answer it", "Useful context: part of the answer or a pointer to it", "Answers the question directly"];
async function rerank(args) {
  const query = textArg(flag(args, "--query") ?? usage("rerank needs --query"));
  const candidates = JSON.parse(fs.readFileSync(args[0] ?? usage("rerank needs <candidates.json>"), "utf8"));
  const questions = Object.fromEntries(candidates.map((_, i) => [`c_${i}`, score(`How well does \`candidates[${i}].text\` (from \`candidates[${i}].id\`) help answer the \`query\``, RELEVANCE)]));
  questions.any = noul("At least one of the `candidates` answers the `query` directly or points to where the answer is");
  const answers = await systemOne({ query, candidates }, questions);
  const rows = candidates.map((c, i) => { const a = answers[`c_${i}`]; return { id: c.id, score: Number(a.score.toFixed(2)), level: Number(argmax(a.probabilities)), confidence: a.confidence }; }).sort((x, y) => y.score - x.score);
  return { text: rows.map((r) => `${r.id}\t${r.score}\t${r.level}`).join("\n"), json: { any: answers.any.noul, candidates: rows } };
}

async function coverage(questionsFile, artifactFile) {
  const questions = JSON.parse(fs.readFileSync(questionsFile, "utf8"));
  const research = fs.readFileSync(artifactFile, "utf8");
  const answers = await systemOne({ research, questions }, Object.fromEntries(questions.map((_, i) => [`q_${i}`, noul(`The \`research\` document answers \`questions[${i}].text\` with concrete evidence: file paths, line references, quoted source, or a stated finding tied to them`)])));
  const rows = questions.map((q, i) => { const p = answers[`q_${i}`].noul; return { id: q.id, answered: p, verdict: p >= T.yes ? "answered" : p <= T.no ? "missing" : "partial" }; });
  return { text: rows.map((r) => `${r.id}\t${r.verdict}\t${r.answered}`).join("\n"), json: rows };
}

async function cite(file) {
  const claims = JSON.parse(fs.readFileSync(file, "utf8"));
  const answers = await systemOne({ claims }, Object.fromEntries(claims.map((_, i) => [`s_${i}`, noul(`The source text \`claims[${i}].source\` supports the statement \`claims[${i}].claim\`; the statement describes what the source shows, not something the source contradicts or does not mention`)])));
  const rows = claims.map((c, i) => { const p = answers[`s_${i}`].noul; return { id: c.id, supported: p, verdict: p >= T.yes ? "supported" : p <= T.no ? "unsupported" : "unclear" }; });
  return { text: rows.map((r) => `${r.id}\t${r.verdict}\t${r.supported}`).join("\n"), json: rows };
}

const ROLES = {
  locate: "Find where something lives: files, directories, entry points, configuration, tests for a topic",
  analyze: "Explain how a piece of the code works, with file and line evidence",
  pattern: "Find existing examples, conventions, or comparable implementations to follow",
  web: "Needs current external information: library documentation, a standard, a vendor API, release notes",
  none: "Answerable from the request and the task files alone; no repository or web reading needed",
};
async function routeQuestion(file) {
  const questions = JSON.parse(fs.readFileSync(file, "utf8"));
  const answers = await systemOne({ questions }, Object.fromEntries(questions.map((_, i) => [`r_${i}`, choice(`Which kind of worker answers \`questions[${i}].text\``, ROLES)])));
  const rows = questions.map((q, i) => { const a = answers[`r_${i}`]; return { id: q.id, role: a.confidence >= 0.5 ? a.choice : null, suggested: a.choice, confidence: a.confidence }; });
  return { text: rows.map((r) => `${r.id}\t${r.role ?? "undecided"}\t${r.confidence}`).join("\n"), json: rows };
}

async function neutral(file) {
  const questions = JSON.parse(fs.readFileSync(file, "utf8"));
  const answers = await systemOne({ questions }, Object.fromEntries(questions.map((_, i) => [`n_${i}`, noul(`\`questions[${i}].text\` presumes its own answer or steers toward one approach, for example by asserting a cause, naming the expected result, or asking why something is the case before establishing that it is`)])));
  const rows = questions.map((q, i) => { const p = answers[`n_${i}`].noul; return { id: q.id, leading: p, verdict: p >= 0.6 ? "leading" : p < 0.4 ? "neutral" : "unclear" }; });
  return { text: rows.map((r) => `${r.id}\t${r.verdict}\t${r.leading}`).join("\n"), json: rows };
}

async function ask(args) {
  const state = flag(args, "--state"); const questions = flag(args, "--questions");
  if (!state || !questions) usage("ask needs --state and --questions");
  const answers = await systemOne(JSON.parse(textArg(state)), JSON.parse(textArg(questions)));
  return { text: JSON.stringify(answers), json: answers };
}

async function main(argv) {
  const args = [...argv];
  const json = bool(args, "--json");
  const [command, ...rest] = args;
  const need = (n, what) => { if (rest.length < n) usage(`${command} needs ${what}`); };
  let result;
  switch (command) {
    case "plan-remaining": need(1, "<plan.md>"); result = await planRemaining(rest[0]); break;
    case "review-status": need(2, "<artifact.md> <claimed>"); result = await reviewStatus(rest[0], rest[1]); break;
    case "reproduction-status": need(2, "<artifact.md> <claimed>"); result = await reproductionStatus(rest[0], rest[1]); break;
    case "extract-json": result = await extractJson(rest); break;
    case "route-workflow": result = await routeWorkflow(rest); break;
    case "size-children": { const childrenFile = flag(rest, "--children") ?? rest[0]; if (!childrenFile) usage("size-children needs --children <file.json>"); result = await sizeChildren(childrenFile); break; }
    case "triage-threads": need(1, "<threads.json>"); result = await triageThreads(rest[0]); break;
    case "feedback-intent": result = await feedbackIntent(rest[0] ?? "-"); break;
    case "slug": result = await slug(rest[0] ?? "-"); break;
    case "tier": result = await tier(rest[0] ?? "-"); break;
    case "autonomy": result = await autonomy(rest[0] ?? "-"); break;
    case "grade-steps": need(1, "<steps.json>"); result = await gradeSteps(rest[0]); break;
    case "rerank": result = await rerank(rest); break;
    case "coverage": need(2, "<questions.json> <artifact.md>"); result = await coverage(rest[0], rest[1]); break;
    case "cite": need(1, "<claims.json>"); result = await cite(rest[0]); break;
    case "route-question": need(1, "<questions.json>"); result = await routeQuestion(rest[0]); break;
    case "neutral": need(1, "<questions.json>"); result = await neutral(rest[0]); break;
    case "ask": result = await ask(rest); break;
    default: usage(`unknown command ${command ?? "(none)"}; see the header of ${path.basename(process.argv[1])}`);
  }
  process.stdout.write(`${json && result.json !== null ? JSON.stringify(result.json) : result.text}\n`);
}

// Compared by real path so a symlinked skills directory still runs the command.
const invoked = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : null;
if (invoked && invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof Unavailable) { process.stderr.write(`judge: unavailable: ${error.message}\n`); process.exit(3); }
    process.stderr.write(`judge: ${error.stack || error.message}\n`);
    process.exit(1);
  });
}
