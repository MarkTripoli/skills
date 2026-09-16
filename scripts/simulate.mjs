#!/usr/bin/env node
// Token-free simulation of the delivery workflow. A fake agent fills the real artifact and answer
// templates for one phase; a chain runner drives a temp fixture through nextCommand -> fakePhase
// until the loop ends, validating every artifact and reply against workflow.mjs on the way.
//
// CLI:
//   node scripts/simulate.mjs <full|lean|prd|oneshot|epic|review-loop|review-loop-capped|with-evidence|evidence-failed|iterate|recovery|interrupted> [--json] [--keep]
//   node scripts/simulate.mjs phase <skill> <task dir> [@<artifact>] [--reply <file>] [--feedback "<text>"]
// Exit 0 when every check passes; 1 with one issue per line otherwise.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as wf from "../skills/delivery/run-task/scripts/workflow.mjs";
import { scanSkills, skillDir } from "./lib/layout.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_SKILLS_DIR = path.join(REPO_ROOT, "skills");

const REVIEW_CHECK = "The artifact names the behavior it changes and the command that proves it.";
const KNOWN_LIMITS = "None.";

export const DEFAULT_CHILDREN = [
  { name: "Add config loader", workflow: "full", depends_on: [], prompt: "Add a configuration loader that reads settings from a file." },
  { name: "Document the config file", workflow: "lean", depends_on: [], prompt: "Document the configuration file format." },
  { name: "Wire verbose flag", workflow: "oneshot", depends_on: ["Add config loader"], prompt: "Add a --verbose flag that prints the loaded configuration." },
];

// Template helpers -----------------------------------------------------------------------------

function referencesDir(skill, skillsDir) {
  const dir = path.join(skillDir(skillsDir, skill), "references");
  if (!fs.existsSync(dir)) throw new Error(`${skill}: no references directory under ${skillsDir}`);
  return dir;
}

function artifactTemplate(skill, skillsDir) {
  const dir = referencesDir(skill, skillsDir);
  const names = fs.readdirSync(dir).filter((n) => n.endsWith("_template.md"));
  if (names.length !== 1) throw new Error(`${skill}: expected one *_template.md, found ${names.length}`);
  return fs.readFileSync(path.join(dir, names[0]), "utf8");
}

function answerTemplate(skill, file, skillsDir) {
  const full = path.join(referencesDir(skill, skillsDir), file);
  if (!fs.existsSync(full)) throw new Error(`${skill}: answer template ${file} not found`);
  return fs.readFileSync(full, "utf8");
}

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

function setFront(text, key, value) {
  const m = FRONT.exec(text);
  if (!m) throw new Error(`cannot set ${key}: no frontmatter`);
  const re = new RegExp(`^${key}:.*$`, "m");
  const line = `${key}: ${value}`;
  const updated = re.test(m[1]) ? m[1].replace(re, () => line) : `${m[1]}\n${line}`;
  return `---\n${updated}\n---${text.slice(m[0].length - m[2].length)}`;
}

// Replaces `[placeholder]` with its text (checkboxes `[ ]` stay) and `{placeholder}` likewise.
function fillBody(body) {
  return body.replace(/\[([^\[\]\n]*\S[^\[\]\n]*)\]/g, "$1").replace(/\{([^{}\n]+)\}/g, "$1");
}

function summaryFor(type, slug) {
  return `The ${type} artifact for ${slug}, written by the fake agent. It fixes the decisions the next phase consumes.`;
}

// Fills one artifact template: frontmatter `type` and `summary` (added when the template has none),
// extra frontmatter keys, bracket placeholders in the body, a `Request:` line grounding the artifact in
// task.md right after the title heading, then the caller's body transform.
function fillArtifact(template, { type, slug, request = "", front = {}, body = (b) => b }) {
  let text = wf.parseFrontmatter(template).raw === null ? `---\ntype: ${type}\nsummary: ""\n---\n\n${template}` : template;
  text = setFront(text, "type", type);
  text = setFront(text, "summary", JSON.stringify(summaryFor(type, slug)));
  for (const [key, value] of Object.entries(front)) text = setFront(text, key, value);
  const { raw, body: rest } = wf.parseFrontmatter(text);
  // Frontmatter placeholders such as `repo: [repository name]` or `task: eng-xxxx-description` get fixture values.
  const filledRaw = raw
    .split("\n")
    .map((line) => line.replace(/^([A-Za-z_][\w-]*):\s*"?\[[^\]]*\]"?\s*$/, "$1: fixture").replace(/^task: eng-xxxx-description$/, `task: ${slug}`))
    .join("\n");
  const requestLine = request ? `Request: ${request.replace(/\s+/g, " ").trim()}` : null;
  const filled = fillBody(rest);
  const grounded = !requestLine ? filled : /^# .*\n/m.test(filled) ? filled.replace(/^(# .*\n)/m, `$1\n${requestLine}\n`) : `${filled.trimEnd()}\n\n${requestLine}\n`;
  return `---\n${filledRaw}\n---\n${body(grounded)}`;
}

// Flips `human-gated: false` to `true` inside the sections of the listed phases or steps.
function markHumanGated(body, phases) {
  if (!phases?.length) return body;
  const wanted = new Set(phases.map(Number));
  let current = null;
  return body
    .split("\n")
    .map((line) => {
      if (/^## /.test(line)) current = Number(/^## (?:Phase|Step) (\d+)\b/.exec(line)?.[1] ?? NaN);
      return wanted.has(current) ? line.replace(/^human-gated: false$/, "human-gated: true") : line;
    })
    .join("\n");
}

// Expands the `## Phase 1` block of the plan template into `count` phases.
function expandPlanPhases(body, count, humanGated) {
  const start = body.indexOf("## Phase 1");
  const second = body.indexOf("## Phase 2");
  const review = body.indexOf("## Human Review");
  if (start === -1 || second === -1 || review === -1) throw new Error("plan template lost its Phase 1, Phase 2, or Human Review sections");
  const block = body.slice(start, second);
  const phases = [];
  for (let n = 1; n <= count; n++) phases.push(block.replaceAll("Phase 1", `Phase ${n}`).replaceAll("#### 1.1", `#### ${n}.1`));
  return markHumanGated(body.slice(0, start) + phases.join("") + body.slice(review), humanGated);
}

// Expands `## Step 1` and the `## Phase Checklist` of the outline template into `count` steps.
// Runs after fillBody, so the template brackets are already gone.
function expandOutlineSteps(body, count, humanGated) {
  const checklist = Array.from({ length: count }, (_, i) => `- [ ] Step ${i + 1}: Work area`).join("\n");
  const text = body.replace(/(## Phase Checklist\n\n)[\s\S]*?(\n\n---)/, `$1${checklist}$2`);
  const start = text.indexOf("## Step 1");
  const second = text.indexOf("## Step 2");
  const tail = text.indexOf("## Open Questions");
  if (start === -1 || second === -1 || tail === -1) throw new Error("structure outline template lost its Step 1, Step 2, or Open Questions sections");
  const block = text.slice(start, second);
  const steps = [];
  for (let n = 1; n <= count; n++) steps.push(block.replaceAll("Step 1", `Step ${n}`));
  return markHumanGated(text.slice(0, start) + steps.join("") + text.slice(tail), humanGated);
}

// True when phase or step n of a plan or outline carries `human-gated: true` in its own section.
function phaseIsHumanGated(text, n) {
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^## /.test(line)) current = Number(/^## (?:Phase|Step) (\d+)\b/.exec(line)?.[1] ?? NaN);
    else if (current === n && /^human-gated: true$/.test(line)) return true;
  }
  return false;
}

export function kebab(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Mirrors start-epic-delivery step 8: every start command names the child's task directory.
function childStartCommand(child) {
  const dir = `.agents/tasks/${child.slug}`;
  if (child.workflow === "oneshot") return `/run-task @${dir}`;
  return `${wf.START_COMMAND[child.workflow]} @${dir}`;
}

function waves(children) {
  const bySlug = new Map(children.map((c) => [c.slug, c]));
  const placed = new Map();
  const out = [];
  let remaining = [...children];
  while (remaining.length) {
    const wave = remaining.filter((c) => c.depends_on.every((d) => placed.has(kebab(d))));
    if (!wave.length) throw new Error(`epic children with unresolvable dependencies: ${remaining.map((c) => c.name).join(", ")}`);
    for (const c of wave) placed.set(c.slug, out.length + 1);
    out.push(wave);
    remaining = remaining.filter((c) => !placed.has(c.slug));
  }
  return { waves: out, bySlug };
}

// Answer filling --------------------------------------------------------------------------------

// Research answers carry `{next_command}`; the skill fills it from `workflow` in task.md.
const RESEARCH_NEXT = { full: "/create-design-discussion", lean: "/create-structure-outline", prd: "/create-prd" };

function pruneVariants(text, workflow) {
  if (!text.includes("{next_command}")) return text;
  const next = RESEARCH_NEXT[workflow];
  if (!next) throw new Error(`research answer has no next command for workflow ${workflow}`);
  return text.replaceAll("{next_command}", next);
}

export function fillAnswer(template, vars) {
  let text = template;
  if (vars.wave1) {
    text = text.replace(/^.*\{child_slug\}.*$/m, (line) =>
      vars.wave1.map((c) => line.replace("{child_slug}", c.slug).replace("{child_start_command}", c.start)).join("\n"),
    );
  }
  text = text.replace(/\{([a-z_]+)\}/g, (m, key) => {
    if (!(key in vars)) throw new Error(`answer template uses unknown placeholder {${key}}`);
    return vars[key];
  });
  // Prose placeholders such as `{evidence item and pointer, or None}` become their own text.
  text = text.replace(/\{([^{}\n]*\s[^{}\n]*)\}/g, "$1");
  return text;
}

// The fake agent ---------------------------------------------------------------------------------

const PLAN_TYPE = { full: "plan", prd: "plan", lean: "structure-outline", oneshot: "plan" };

function isIterate(skill) {
  return skill.startsWith("iterate-") && skill !== "iterate-implementation";
}

function link(slug, file) {
  return `[${file}](.agents/tasks/${slug}/${file})`;
}

function findArtifact(artifacts, type, arg) {
  if (arg) {
    const named = artifacts.find((a) => a.name === arg.replace(/^@/, "").split("/").pop());
    if (named) return named;
  }
  return [...artifacts].reverse().find((a) => a.type === type) ?? null;
}

function counterKey(scenario, key) {
  scenario._counters ??= {};
  const n = scenario._counters[key] ?? 0;
  scenario._counters[key] = n + 1;
  return n;
}

// `replyFile` overrides the default `replies/NN-<skill>.md`; `feedback` is the text an iteration applies.
export function fakePhase(skill, taskDir, { scenario = {}, skillsDir = DEFAULT_SKILLS_DIR, arg = null, replyFile = null, feedback = null } = {}) {
  taskDir = path.resolve(taskDir);
  const task = wf.readTask(taskDir);
  const slug = task.slug;
  const projectRoot = wf.projectRootOf(taskDir);
  const artifacts = wf.listArtifacts(taskDir, slug);
  const probe = wf.worktreeProbe(projectRoot);
  replyFile = replyFile ? path.resolve(replyFile) : wf.replyPath(taskDir, wf.nextReplyNumber(taskDir), skill);
  const finish = (artifactFile, artifactType, reply) => {
    fs.mkdirSync(path.dirname(replyFile), { recursive: true });
    fs.writeFileSync(replyFile, reply);
    return { skill, artifactFile, artifactType, replyFile, reply };
  };

  if (skill === "oneshot") {
    const reply = `Implemented the task in \`task.md\`, ran the narrowest checks, and committed with explicit paths.\n\n${wf.FRESH_SESSION_SENTENCE}\n\n\`\`\`text\n/describe-pr\n\`\`\`\n`;
    return finish(null, null, reply);
  }

  const phase = wf.PHASES[skill];
  if (!phase) throw new Error(`unknown skill ${skill}`);
  const type = phase.type;
  const templateSkill = isIterate(skill) && artifacts.some((a) => a.type === type) ? null : skill;
  const write = (name, text) => {
    fs.writeFileSync(path.join(taskDir, name), text);
    return name;
  };
  const baseVars = (file) => ({
    artifact_link: link(slug, file),
    artifact_file: file,
    summary: wf.parseFrontmatter(fs.readFileSync(path.join(taskDir, file), "utf8")).data.summary,
    review_check: REVIEW_CHECK,
    known_limits: KNOWN_LIMITS,
  });
  const reply = (file, vars) => fillAnswer(pruneVariants(answerTemplate(skill, file, skillsDir), task.workflow), vars);
  const planPhases = scenario.planPhases ?? 2;
  const implementationCommand = task.workflow === "lean" ? "/implement-outline" : "/implement-plan";
  // Conventions, Answer template placeholders: setup-worktree and the implementation skills fill `{plan_file}`
  // with the plan or outline being implemented.
  const planFile = () => {
    const plan = findArtifact(artifacts, PLAN_TYPE[task.workflow], null);
    return plan ? plan.name : "";
  };

  // Iterations edit the newest artifact of the type in place and never take a new number.
  const revise = () => {
    const own = findArtifact(artifacts, type, arg);
    const revision = counterKey(scenario, `revise:${own.name}`) + 1;
    fs.writeFileSync(own.file, `${own.text.trimEnd()}\n- Revision ${revision}: ${feedback ?? "applied the requested changes."}\n`);
    return own.name;
  };
  // The artifact number is taken at write time, so one run can save several receipts in order.
  const create = (front = {}, body = (b) => b, name = null) =>
    write(
      name ?? `${String(wf.nextArtifactNumber(taskDir, slug)).padStart(2, "0")}-${type}-${slug}.md`,
      fillArtifact(artifactTemplate(templateSkill ?? skill, skillsDir), { type, slug, request: task.body, front: { task: slug, ...front }, body }),
    );

  switch (skill) {
    case "create-research-questions":
    case "iterate-research-questions":
    case "create-research":
    case "iterate-research": {
      const file = templateSkill ? create() : revise();
      const answer = type === "research" ? "research_final_answer.md" : "research_questions_final_answer.md";
      return finish(file, type, reply(answer, baseVars(file)));
    }
    case "create-design-discussion":
    case "iterate-design-discussion":
      return single("design_discussion_final_answer.md");
    case "create-prd":
    case "iterate-prd":
      return single("prd_final_answer.md");
    case "create-tdd":
    case "iterate-tdd":
      return single("tdd_final_answer.md");
    case "create-plan":
    case "iterate-plan": {
      const file = templateSkill ? create({}, (b) => expandPlanPhases(b, planPhases, scenario.humanGated)) : revise();
      const answer = probe.inWorktree ? "plan_in_worktree_answer.md" : probe.disabled ? "plan_disabled_answer.md" : "plan_final_answer.md";
      return finish(file, type, reply(answer, baseVars(file)));
    }
    case "create-structure-outline":
    case "iterate-structure-outline": {
      const file = templateSkill ? create({}, (b) => expandOutlineSteps(b, planPhases, scenario.humanGated)) : revise();
      const answer = probe.inWorktree || probe.disabled ? "structure_outline_final_answer.md" : "structure_outline_setup_answer.md";
      return finish(file, type, reply(answer, baseVars(file)));
    }
    case "setup-worktree": {
      const file = create();
      return finish(file, type, reply("worktree_final_answer.md", { ...baseVars(file), implementation_command: implementationCommand, plan_file: planFile() }));
    }
    // Mirrors implement-plan steps 6 and 7: every phase advances on green checks and the run only stops
    // early at a `human-gated: true` phase (or when the scenario interrupts after each phase). One receipt
    // per completed phase. iterate-implementation applies feedback to one phase and stops there.
    case "implement-plan":
    case "implement-outline":
    case "iterate-implementation": {
      const plan = findArtifact(artifacts, PLAN_TYPE[task.workflow], arg);
      if (!plan) throw new Error(`${skill}: no ${PLAN_TYPE[task.workflow]} artifact in ${taskDir}`);
      const onePhase = skill === "iterate-implementation" || scenario.stopEachPhase === true;
      let text = plan.text;
      let remaining = wf.remainingPhases(text);
      const lastPhase = Math.max(1, ...text.split("\n").map((l) => Number(/^## (?:Phase|Step) (\d+)\b/.exec(l)?.[1] ?? 0)));
      let n = remaining[0] ?? lastPhase;
      let file;
      for (;;) {
        text = wf.completePhase(text, n);
        fs.writeFileSync(plan.file, text);
        remaining = wf.remainingPhases(text);
        file = create({ completed_phase: String(n) });
        if (!remaining.length || onePhase || phaseIsHumanGated(text, n)) break;
        n = remaining[0];
      }
      if (remaining.length) {
        const vars = { ...baseVars(file), plan_file: plan.name, completed_phase: String(n), next_phase: String(remaining[0]), implementation_command: implementationCommand };
        return finish(file, type, reply("implementation_phase_final_answer.md", vars));
      }
      return finish(file, type, reply("implementation_final_answer.md", { ...baseVars(file), plan_file: plan.name }));
    }
    case "review-loop": {
      const statuses = scenario.codeReview ?? ["clean"];
      const maxDepth = scenario.maxDepth ?? null;
      const createSub = (subSkill, subType, front = {}) =>
        write(
          `${String(wf.nextArtifactNumber(taskDir, slug)).padStart(2, "0")}-${subType}-${slug}.md`,
          fillArtifact(artifactTemplate(subSkill, skillsDir), { type: subType, slug, request: task.body, front: { task: slug, ...front } }),
        );
      let depth = 0;
      let loopStatus;
      for (;;) {
        const reviewStatus = statuses[Math.min(counterKey(scenario, "codeReview"), statuses.length - 1)];
        createSub("review-code", "code-review", { status: reviewStatus });
        if (reviewStatus === "clean" || reviewStatus === "blocked") {
          loopStatus = reviewStatus;
          break;
        }
        if (maxDepth != null && depth + 1 > maxDepth) {
          loopStatus = "capped";
          break;
        }
        createSub("fix-code-review", "code-review-fixes", {});
        depth += 1;
      }
      const file = create({ depth, max_depth: maxDepth ?? "", status: loopStatus });
      const answer = { clean: "review_loop_clean_answer.md", capped: "review_loop_capped_answer.md", blocked: "review_loop_blocked_answer.md" }[loopStatus];
      return finish(file, type, reply(answer, baseVars(file)));
    }
    case "review-code": {
      const statuses = scenario.codeReview ?? ["clean"];
      const status = statuses[Math.min(counterKey(scenario, "codeReview"), statuses.length - 1)];
      const file = create({ status });
      const answer = { findings: "code_review_findings_answer.md", clean: "code_review_clean_answer.md", blocked: "code_review_blocked_answer.md" }[status];
      if (!answer) throw new Error(`review-code: unknown status ${status}`);
      return finish(file, type, reply(answer, baseVars(file)));
    }
    case "fix-code-review":
      return single("code_review_fixes_answer.md");
    case "record-evidence": {
      const statuses = scenario.evidence ?? ["passed"];
      const status = statuses[Math.min(counterKey(scenario, "evidence"), statuses.length - 1)];
      const file = create({ status });
      const reportLink = `[report.md](.agents/tasks/${slug}/evidence/screen/report.md)`;
      if (status === "failed") return finish(file, type, reply("evidence_failed_answer.md", { ...baseVars(file), report_link: reportLink, plan_file: planFile() }));
      return finish(file, type, reply("evidence_final_answer.md", { ...baseVars(file), report_link: reportLink }));
    }
    case "describe-pr": {
      const file = create({}, (b) => b, "pr-description.md");
      return finish(file, type, reply("pr_description_final_answer.md", baseVars(file)));
    }
    case "resolve-pr-reviews": {
      const statuses = scenario.prReview ?? ["approved"];
      const status = statuses[Math.min(counterKey(scenario, "prReview"), statuses.length - 1)];
      const file = create({ status });
      return finish(file, type, reply(status === "approved" ? "pr_review_approved_answer.md" : "pr_review_pending_answer.md", baseVars(file)));
    }
    case "ci-commit":
      return single("commit_final_answer.md");
    case "configure-workspaces":
      return single("workspace_final_answer.md");
    case "review-artifact-comments":
      return single("comments_final_answer.md");
    case "show-me":
      return single("show_me_final_answer.md");
    case "create-epic-plan": {
      const children = scenario.children ?? DEFAULT_CHILDREN;
      const json = JSON.stringify(children, null, 2);
      const file = create({}, (b) => b.replace(/```json\n[\s\S]*?\n```/, `\`\`\`json\n${json}\n\`\`\``));
      return finish(file, type, reply("epic_plan_final_answer.md", baseVars(file)));
    }
    case "start-epic-delivery": {
      const epic = findArtifact(artifacts, "epic-plan", arg);
      if (!epic) throw new Error(`start-epic-delivery: no epic-plan artifact in ${taskDir}`);
      const fence = wf.fences(epic.text).find((f) => f.lang === "json");
      if (!fence) throw new Error(`${epic.name}: no \`\`\`json children fence`);
      const children = JSON.parse(fence.body).map((c) => ({ ...c, slug: kebab(c.name), depends_on: c.depends_on ?? [] }));
      const conflicts = children.filter((c) => fs.existsSync(path.join(projectRoot, ".agents", "tasks", c.slug)));
      if (conflicts.length) throw new Error(`child task directories already exist: ${conflicts.map((c) => c.slug).join(", ")}`);
      const { waves: waveList } = waves(children);
      const created = task.created || new Date().toISOString().slice(0, 10);
      for (const child of children) {
        const dir = path.join(projectRoot, ".agents", "tasks", child.slug);
        fs.mkdirSync(dir, { recursive: true });
        const deps = child.depends_on.length ? `\n${child.depends_on.map((d) => `  - ${kebab(d)}`).join("\n")}` : " []";
        fs.writeFileSync(
          path.join(dir, "task.md"),
          `---\nslug: ${child.slug}\ntitle: ${child.name}\nworkflow: ${child.workflow}\ncreated: ${created}\nparent: ${slug}\ndepends_on:${deps}\n---\n${child.prompt}\n`,
        );
      }
      const rows = children.map((c) => `| ${c.name} | \`.agents/tasks/${c.slug}/\` | ${c.workflow} | ${c.depends_on.length ? c.depends_on.map(kebab).join(", ") : "none"} |`).join("\n");
      const waveLines = waveList.map((w, i) => `- Wave ${i + 1}: ${w.map((c) => c.slug).join(", ")}`).join("\n");
      const file = create({ epic_plan: epic.name }, (b) =>
        b.replace(/^\| Child name \|.*$/m, rows).replace(/^- Wave 1:.*\n- Wave 2:.*$/m, waveLines),
      );
      const wave1 = waveList[0].map((c) => ({ slug: c.slug, start: childStartCommand(c) }));
      const vars = { ...baseVars(file), wave1, first_child_command: wave1[0].start };
      return finish(file, type, reply("epic_delivery_final_answer.md", vars));
    }
    default:
      throw new Error(`fakePhase does not handle ${skill}`);
  }

  function single(answer, vars = {}) {
    const file = templateSkill ? create() : revise();
    return finish(file, type, reply(answer, { ...baseVars(file), ...vars }));
  }
}

// Validation of one produced phase against the table -------------------------------------------

const PLAN_ARG_SKILLS = new Set(["setup-worktree", "implement-plan", "implement-outline", "iterate-implementation", "configure-workspaces", "ci-commit"]);

// Validates the artifact and the reply, then compares the reply's whole fence line (skill and `@file`)
// with the command PHASES[skill].next predicts from the task directory after the phase ran.
export function checkPhase(result, taskDir, { knownSkills = null } = {}) {
  const issues = [];
  taskDir = path.resolve(taskDir);
  const task = wf.readTask(taskDir);
  const artifacts = wf.listArtifacts(taskDir, task.slug);
  if (result.artifactFile) {
    const text = fs.readFileSync(path.join(taskDir, result.artifactFile), "utf8");
    for (const issue of wf.validateArtifact(text, { type: result.artifactType })) issues.push(`${result.artifactFile}: ${issue}`);
  }
  const replyName = path.basename(result.replyFile);
  for (const issue of wf.validateReply(result.reply, { knownSkills })) issues.push(`${replyName}: ${issue}`);
  const parsed = wf.parseReply(result.reply);
  let predicted;
  if (result.skill === "oneshot") predicted = "/describe-pr";
  else {
    const phase = wf.PHASES[result.skill];
    const own = [...artifacts].reverse().find((a) => a.type === phase.type) ?? null;
    const plan = [...artifacts].reverse().find((a) => a.type === PLAN_TYPE[task.workflow]) ?? null;
    predicted = phase.next({
      workflow: task.workflow,
      artifact: own?.name ?? null,
      status: own?.status ?? "",
      planFile: plan?.name ?? null,
      remaining: plan ? wf.remainingPhases(plan.text) : [],
      probe: wf.worktreeProbe(wf.projectRootOf(taskDir)),
      taskDir,
    });
  }
  if (predicted) {
    if (parsed.command !== predicted) issues.push(`${replyName}: fence is "${parsed.command ?? parsed.fence?.body.trim() ?? ""}", table predicts "${predicted}"`);
  } else if (parsed.skill && parsed.skill !== "show-me" && result.skill !== "start-epic-delivery") {
    issues.push(`${replyName}: table predicts no next command but the reply names /${parsed.skill}`);
  }
  // Conventions, Answer template placeholders: in these replies every `/<skill> @<file>` names the plan or
  // structure outline being implemented, never the receipt this phase saved.
  if (PLAN_ARG_SKILLS.has(result.skill)) {
    const plan = [...artifacts].reverse().find((a) => a.type === PLAN_TYPE[task.workflow]) ?? null;
    for (const [, command, file] of result.reply.matchAll(/(\/[a-z0-9-]+) @([^\s`]+)/g)) {
      if (file !== plan?.name) issues.push(`${replyName}: "${command} @${file}" must name the ${PLAN_TYPE[task.workflow]} (${plan?.name ?? "none exists"}), not ${file}`);
    }
  }
  return issues;
}

// Fixtures ---------------------------------------------------------------------------------------

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).toString().trim();
}

function initRepo(dir) {
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "index.js"), "#!/usr/bin/env node\nconsole.log('hello');\n");
  fs.writeFileSync(path.join(dir, ".gitignore"), ".agents/tasks/\n");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "fixture@example.com");
  git(dir, "config", "user.name", "Fixture");
  git(dir, "config", "commit.gpgsign", "false");
  git(dir, "add", "src/index.js", ".gitignore");
  git(dir, "commit", "-q", "-m", "chore: fixture");
}

// Creates a temp project: a git repo with one commit. `worktree: "disabled"` adds a disabled
// workspace config; `worktree: "inside"` makes the project itself a worktree of a base repo.
export function makeFixture({ workflow = "full", worktree = "none", slug = "verbose-flag", request = "Add a --verbose flag to the CLI." } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skills-sim-"));
  let projectRoot = path.join(tmp, "project");
  if (worktree === "inside") {
    const base = path.join(tmp, "base");
    fs.mkdirSync(base);
    initRepo(base);
    git(base, "worktree", "add", "-q", "-b", slug, projectRoot);
  } else {
    fs.mkdirSync(projectRoot);
    initRepo(projectRoot);
    if (worktree === "disabled") {
      fs.mkdirSync(path.join(projectRoot, ".agents"), { recursive: true });
      fs.writeFileSync(path.join(projectRoot, ".agents", "workspace.json"), JSON.stringify({ repos: [{ localPath: ".", primary: true }], disabled: true }, null, 2));
    }
  }
  const { taskDir } = wf.createTask(projectRoot, { request, workflow, slug, created: "2026-01-01" });
  return { tmp, projectRoot, taskDir, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

// Chain runner -----------------------------------------------------------------------------------

const iterateSkillFor = wf.iterateSkillFor;

export function runChain(projectRoot, taskDir, { scenario = {}, approve = () => true, maxSteps = 40, skillsDir = DEFAULT_SKILLS_DIR } = {}) {
  taskDir = path.resolve(taskDir);
  const knownSkills = new Set(scanSkills(skillsDir).skills.map((s) => s.name));
  const steps = [];
  const issues = [];
  const changesLeft = { ...(scenario.changesAt ?? {}) };
  let inserted = false;
  for (let i = 0; i < maxSteps; i++) {
    let next = wf.nextCommand(taskDir, { projectRoot, with: scenario.with ?? [] });
    if (next.done) return { steps, issues, done: true, reason: next.reason };
    let { command, skill, arg } = next;
    // workflows/delivery.md, Review loop: nothing in the table routes into review-loop; the user invokes it
    // between implementation and the pull request. The injection models the user typing `/review-loop`
    // where the table would have run describe-pr.
    if (scenario.reviewLoop && skill === "describe-pr" && !inserted) {
      inserted = true;
      command = "/review-loop";
      skill = "review-loop";
      arg = null;
    }
    const result = fakePhase(skill, taskDir, { scenario, skillsDir, arg });
    issues.push(...checkPhase(result, taskDir, { knownSkills }));
    const after = wf.nextCommand(taskDir, { projectRoot, with: scenario.with ?? [] });
    const step = { skill, command, artifactFile: result.artifactFile, replyFile: path.basename(result.replyFile), pendingGate: after.pendingGate, next: after.done ? null : after.command };
    steps.push(step);
    if (issues.length) return { steps, issues, done: false, reason: "validation failed" };
    if (after.pendingGate) {
      if ((changesLeft[skill] ?? 0) > 0) {
        changesLeft[skill] -= 1;
        const iterateSkill = iterateSkillFor(skill);
        if (!iterateSkill) return { steps, issues: [`no iterate skill for ${skill}`], done: false, reason: "validation failed" };
        const iter = fakePhase(iterateSkill, taskDir, { scenario, skillsDir, arg: after.gateArtifact });
        issues.push(...checkPhase(iter, taskDir, { knownSkills }));
        const again = wf.nextCommand(taskDir, { projectRoot, with: scenario.with ?? [] });
        if (!again.pendingGate) issues.push(`${iterateSkill} did not return to the ${skill} gate`);
        steps.push({ skill: iterateSkill, command: `/${iterateSkill} @${after.gateArtifact}`, artifactFile: iter.artifactFile, replyFile: path.basename(iter.replyFile), pendingGate: again.pendingGate, next: again.done ? null : again.command });
        if (issues.length) return { steps, issues, done: false, reason: "validation failed" };
      }
      if (!approve(steps.at(-1))) return { steps, issues, done: false, reason: `stopped at the ${skill} gate` };
    }
  }
  return { steps, issues, done: false, reason: `exceeded ${maxSteps} steps` };
}

// Scenarios ----------------------------------------------------------------------------------------

export const SCENARIOS = {
  full: { workflow: "full" },
  lean: { workflow: "lean" },
  prd: { workflow: "prd", worktree: "inside" },
  oneshot: { workflow: "oneshot" },
  epic: { workflow: "full", start: "create-epic-plan" },
  // The review loop is user-invoked after implementation (workflows/delivery.md, Review loop); runChain
  // injects `/review-loop` where the table would run describe-pr. review-loop's own fakePhase case models
  // the internal review-code/fix-code-review passes.
  "review-loop": { workflow: "full", worktree: "disabled", reviewLoop: true, codeReview: ["findings", "clean"] },
  // Depth cap: two findings-only reviews with maxDepth 1 stop the loop `capped` after one fix pass; the
  // chain ends there (no describe-pr).
  "review-loop-capped": { workflow: "full", worktree: "disabled", reviewLoop: true, codeReview: ["findings", "findings"], maxDepth: 1 },
  // Optional phases declared up front: run-task inserts record-evidence before describe-pr (workflows/delivery.md,
  // Optional phases). `evidence` lists the receipt status per run; a failed recording hands to iterate-implementation.
  "with-evidence": { workflow: "lean", worktree: "disabled", with: ["record-evidence"], evidence: ["passed"] },
  "evidence-failed": { workflow: "lean", worktree: "disabled", with: ["record-evidence"], evidence: ["failed", "passed"] },
  iterate: { workflow: "full", changesAt: { "create-plan": 1 } },
  recovery: { workflow: "full", recoverAfter: "create-plan" },
  // The interrupted path: the implementation run stops after every phase and re-enters with the plan.
  interrupted: { workflow: "full", stopEachPhase: true, planPhases: 2 },
};

export function runScenario(name) {
  const spec = SCENARIOS[name];
  if (!spec) throw new Error(`unknown scenario ${name}; choose one of ${Object.keys(SCENARIOS).join(", ")}`);
  const { workflow, worktree = "none", start = null, recoverAfter = null, ...scenario } = spec;
  const fixture = makeFixture({ workflow, worktree });
  const projectRoot = fixture.projectRoot;
  const taskDir = fixture.taskDir;
  const issues = [];
  let result;
  if (start) {
    const first = fakePhase(start, taskDir, { scenario });
    issues.push(...checkPhase(first, taskDir));
    const afterFirst = wf.nextCommand(taskDir, { projectRoot });
    const rest = runChain(projectRoot, taskDir, { scenario });
    const firstStep = { skill: start, command: `/${start}`, artifactFile: first.artifactFile, replyFile: path.basename(first.replyFile), pendingGate: afterFirst.pendingGate, next: afterFirst.done ? null : afterFirst.command };
    result = { ...rest, steps: [firstStep, ...rest.steps], issues: [...issues, ...rest.issues] };
  } else if (recoverAfter) {
    const partial = runChain(projectRoot, taskDir, { scenario, approve: (step) => step.skill !== recoverAfter });
    const fromReply = wf.nextCommand(taskDir, { projectRoot });
    fs.rmSync(path.join(taskDir, "replies"), { recursive: true, force: true });
    const fromArtifacts = wf.nextCommand(taskDir, { projectRoot });
    if (fromArtifacts.source !== "artifact") issues.push(`recovery: expected source artifact, got ${fromArtifacts.source}`);
    if (fromArtifacts.command !== fromReply.command) issues.push(`recovery: artifact-derived ${fromArtifacts.command} differs from reply-derived ${fromReply.command}`);
    if (fromArtifacts.pendingGate !== fromReply.pendingGate) issues.push("recovery: pendingGate differs between reply and artifact derivation");
    const rest = runChain(projectRoot, taskDir, { scenario });
    result = { ...rest, steps: [...partial.steps, { skill: "(recovery)", command: fromArtifacts.command, artifactFile: null, replyFile: "replies/ deleted", pendingGate: fromArtifacts.pendingGate, next: fromArtifacts.command }, ...rest.steps], issues: [...partial.issues, ...issues, ...rest.issues] };
  } else {
    result = runChain(projectRoot, taskDir, { scenario });
  }
  return { ...result, fixture, projectRoot, taskDir };
}

export function formatSteps(steps) {
  return steps.map((s, i) => `${String(i + 1).padStart(2, "0")}  ${s.skill}  -> ${s.next ?? "(end)"}${s.pendingGate ? "  [gate]" : ""}`).join("\n");
}

// CLI --------------------------------------------------------------------------------------------

function main(argv) {
  const flags = new Set();
  const options = {};
  const positional = [];
  try {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === "--reply" || a === "--feedback") {
        if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
        options[a.slice(2)] = argv[++i];
      } else if (a.startsWith("--")) flags.add(a);
      else positional.push(a);
    }
    const [cmd, ...rest] = positional;
    if (cmd === "phase") {
      const [skill, taskDir, arg] = rest;
      if (!skill || !taskDir) throw new Error('usage: simulate.mjs phase <skill> <task dir> [@<artifact>] [--reply <file>] [--feedback "<text>"]');
      const result = fakePhase(skill, taskDir, { arg: arg ?? null, replyFile: options.reply ?? null, feedback: options.feedback ?? null });
      process.stdout.write(result.reply.endsWith("\n") ? result.reply : `${result.reply}\n`);
      return 0;
    }
    if (!cmd || !SCENARIOS[cmd]) throw new Error(`usage: simulate.mjs <${Object.keys(SCENARIOS).join("|")}> [--json] [--keep] | phase <skill> <task dir> [@<artifact>] [--reply <file>] [--feedback "<text>"]`);
    const result = runScenario(cmd);
    const ok = result.done && result.issues.length === 0;
    if (flags.has("--json")) {
      process.stdout.write(`${JSON.stringify({ scenario: cmd, done: result.done, reason: result.reason, steps: result.steps, issues: result.issues, taskDir: flags.has("--keep") ? result.taskDir : undefined }, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatSteps(result.steps)}\n${result.done ? "done" : "stopped"}: ${result.reason}\n`);
      for (const issue of result.issues) process.stdout.write(`issue: ${issue}\n`);
    }
    if (flags.has("--keep")) process.stdout.write(`kept: ${result.taskDir}\n`);
    else result.fixture.cleanup();
    return ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
