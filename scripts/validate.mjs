#!/usr/bin/env node
// Validates the skill collection: layout, frontmatter, shared links, reference files,
// answer-template handoffs, human-review templates, banned host tokens, and workflow coverage.
// Usage: node scripts/validate.mjs [--root <dir>]
// Exit 1 with one `file:line: message` per failure.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanSkills } from "./lib/layout.mjs";
import { SUBJECT_PATTERN, MAX_SUBJECT_LENGTH } from "./check-commits.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = rootIndex === -1 ? repoRoot : path.resolve(args[rootIndex + 1] ?? "");
const generated = root !== repoRoot;

const EXPECTED_SKILL_COUNT = 39;
const SHARED_LINKS = {
  "shared/WRITING.md": "https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md",
  "shared/CONVENTIONS.md": "https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md",
};
const LINE6 =
  "Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.";

const RESEARCH_VARIANTS = { full: "create-design-discussion", lean: "create-structure-outline", prd: "create-prd" };

// answer file -> skill named in the final fence (research answers: per workflow variant).
const ANSWER_INVENTORY = {
  "ci-commit/references/commit_final_answer.md": "describe-pr",
  "configure-workspaces/references/workspace_final_answer.md": "setup-worktree",
  "create-design-discussion/references/design_discussion_final_answer.md": "create-plan",
  "create-design-discussion/references/design_discussion_review_answer.md": "iterate-design-discussion",
  "create-epic-plan/references/epic_plan_final_answer.md": "start-epic-delivery",
  "create-plan/references/plan_disabled_answer.md": "implement-plan",
  "create-plan/references/plan_final_answer.md": "setup-worktree",
  "create-plan/references/plan_in_worktree_answer.md": "implement-plan",
  "create-prd/references/prd_final_answer.md": "create-tdd",
  "create-prd/references/prd_review_answer.md": "iterate-prd",
  "create-research/references/research_final_answer.md": RESEARCH_VARIANTS,
  "create-research-questions/references/research_questions_final_answer.md": "create-research",
  "create-structure-outline/references/structure_outline_final_answer.md": "implement-outline",
  "create-structure-outline/references/structure_outline_setup_answer.md": "setup-worktree",
  "create-tdd/references/tdd_final_answer.md": "create-plan",
  "create-tdd/references/tdd_program_review_answer.md": "iterate-tdd",
  "create-tdd/references/tdd_system_review_answer.md": "iterate-tdd",
  "describe-pr/references/pr_description_final_answer.md": "resolve-pr-reviews",
  "fix-code-review/references/code_review_fixes_answer.md": "review-code",
  "implement-outline/references/implementation_final_answer.md": "describe-pr",
  "implement-outline/references/implementation_phase_final_answer.md": "implement-outline",
  "implement-plan/references/implementation_final_answer.md": "describe-pr",
  "implement-plan/references/implementation_phase_final_answer.md": "implement-plan",
  "iterate-design-discussion/references/design_discussion_final_answer.md": "create-plan",
  "iterate-design-discussion/references/design_discussion_review_answer.md": "iterate-design-discussion",
  "iterate-implementation/references/implementation_final_answer.md": "describe-pr",
  "iterate-implementation/references/implementation_phase_final_answer.md": "implement-plan",
  "iterate-plan/references/plan_disabled_answer.md": "implement-plan",
  "iterate-plan/references/plan_final_answer.md": "setup-worktree",
  "iterate-plan/references/plan_in_worktree_answer.md": "implement-plan",
  "iterate-prd/references/prd_final_answer.md": "create-tdd",
  "iterate-prd/references/prd_review_answer.md": "iterate-prd",
  "iterate-research/references/research_final_answer.md": RESEARCH_VARIANTS,
  "iterate-research-questions/references/research_questions_final_answer.md": "create-research",
  "iterate-structure-outline/references/structure_outline_final_answer.md": "implement-outline",
  "iterate-structure-outline/references/structure_outline_setup_answer.md": "setup-worktree",
  "iterate-tdd/references/tdd_final_answer.md": "create-plan",
  "iterate-tdd/references/tdd_review_answer.md": "iterate-tdd",
  "record-evidence/references/evidence_failed_answer.md": "iterate-implementation",
  "record-evidence/references/evidence_final_answer.md": "describe-pr",
  "record-evidence/references/evidence_standalone_answer.md": "show-me",
  "resolve-pr-reviews/references/pr_review_approved_answer.md": "show-me",
  "resolve-pr-reviews/references/pr_review_pending_answer.md": "resolve-pr-reviews",
  "review-artifact-comments/references/comments_final_answer.md": "iterate-implementation",
  "review-code/references/code_review_blocked_answer.md": "show-me",
  "review-code/references/code_review_clean_answer.md": "describe-pr",
  "review-code/references/code_review_findings_answer.md": "fix-code-review",
  "review-loop/references/review_loop_blocked_answer.md": "show-me",
  "review-loop/references/review_loop_capped_answer.md": "show-me",
  "review-loop/references/review_loop_clean_answer.md": "describe-pr",
  "setup-worktree/references/worktree_final_answer.md": "implement-plan",
  "show-me/references/show_me_final_answer.md": "show-me",
  "start-epic-delivery/references/epic_delivery_final_answer.md": "create-research-questions",
  "start-task/references/route_direct_answer.md": "start-task",
  "start-task/references/route_epic_answer.md": "create-epic-plan",
  "start-task/references/route_task_answer.md": "run-task",
};

// Replies that end an exchange instead of handing to a phase: no fresh-session sentence. Every reply whose
// fence names show-me is terminal by convention; these are terminal although their fence names another skill.
const TERMINAL_ANSWERS = new Set(["start-task/references/route_direct_answer.md"]);

const HUMAN_REVIEW_TEMPLATES = [
  "create-design-discussion/references/design_discussion_template.md",
  "iterate-design-discussion/references/design_discussion_template.md",
  "create-prd/references/prd_template.md",
  "iterate-prd/references/prd_template.md",
  "create-tdd/references/tdd_template.md",
  "iterate-tdd/references/tdd_template.md",
  "create-structure-outline/references/structure_outline_template.md",
  "iterate-structure-outline/references/structure_outline_template.md",
  "create-plan/references/plan_template.md",
  "iterate-plan/references/plan_template.md",
  "create-epic-plan/references/epic_plan_template.md",
  "implement-plan/references/implementation_template.md",
  "implement-outline/references/implementation_template.md",
  "iterate-implementation/references/implementation_template.md",
  "describe-pr/references/pr_description_template.md",
  "resolve-pr-reviews/references/pr_review_template.md",
  "start-epic-delivery/references/epic_delivery_template.md",
];

const IMPLEMENTATION_SKILLS = ["implement-plan", "implement-outline", "iterate-implementation"];

const PHASE_ANSWERS = IMPLEMENTATION_SKILLS.map((skill) => `${skill}/references/implementation_phase_final_answer.md`);

const HUMAN_GATE_ANSWERS = Object.keys(ANSWER_INVENTORY).filter(
  (file) =>
    !PHASE_ANSWERS.includes(file) &&
    /^(?:create|iterate)-(?:design-discussion|prd|tdd|structure-outline|plan|epic-plan)\/|^(?:implement-plan|implement-outline|iterate-implementation)\/|^describe-pr\/references\/pr_description_final_answer|^resolve-pr-reviews\/references\/pr_review_pending_answer|^start-epic-delivery\//.test(
      file,
    ),
);

const BANNED_TOKENS = [
  /\brpi\b/i,
  /rpi[-_:]/i,
  /\bbb\b/i,
  /bb[-_]plugin/i,
  /\bBB_[A-Z]/,
  /\.rpi\//i,
  /::rpi-artifact/i,
  /humanlayer/i,
  /outline_only/i,
  /prd_tdd/i,
  /rpi_task_context/i,
  /artifact_directive/i,
];

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "results"]);
const SKIP_FILES = new Set(["scripts/validate.mjs", ".skill-lock.json"]);

const failures = [];
const fail = (file, line, message) => failures.push(`${file}:${line}: ${message}`);
const rel = (file) => path.relative(root, file);
const read = (file) => fs.readFileSync(file, "utf8");

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...listFiles(path.join(dir, entry.name)));
    } else {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function fences(content) {
  return [...content.matchAll(/^(`{3,})([^\n]*)\n([\s\S]*?)^\1[ \t]*$/gm)].map((m) => ({
    lang: m[2].trim(),
    body: m[3],
    index: m.index,
    end: m.index + m[0].length,
  }));
}

function fillTemplate(input) {
  return input
    .replaceAll("{artifact_link}", "[01-artifact.md](.agents/tasks/task-slug/01-artifact.md)")
    .replaceAll("{summary}", "Saved the requested artifact.")
    .replaceAll("{artifact_file}", "01-artifact.md")
    .replaceAll("{plan_file}", "01-plan.md")
    .replaceAll("{report_link}", "[report.md](.agents/tasks/task-slug/evidence/screen/report.md)")
    .replaceAll("{implementation_command}", "/implement-plan")
    .replaceAll("{first_child_command}", "/create-research-questions")
    .replaceAll("{child_slug}", "child-slug")
    .replaceAll("{child_start_command}", "/create-research-questions")
    .replaceAll("{review_check}", "Review the named behavior and evidence.")
    .replaceAll("{known_limits}", "None.")
    .replaceAll("{completed_phase}", "1")
    .replaceAll("{next_phase}", "2")
    .replaceAll("{task_dir}", ".agents/tasks/task-slug")
    .replaceAll("{workflow}", "lean")
    .replaceAll("{reason}", "The shape is clear and it touches several files.")
    .replaceAll("{with_note}", "")
    .replaceAll("{first_command}", "/create-research-questions");
}

// Research answers carry `{next_command}`, filled per workflow type by the skill; render one per type.
function renderWorkflowVariant(input, workflow) {
  if (!input.includes("{next_command}")) return null;
  return input.replaceAll("{next_command}", `/${RESEARCH_VARIANTS[workflow]}`);
}

// 1. Layout: skills/<name>/ or skills/<group>/<name>/, names unique across groups.
const skillsDir = path.join(root, "skills");
const layout = scanSkills(skillsDir);
for (const problem of layout.problems) fail(rel(problem.path), 0, problem.message);
if (!fs.existsSync(skillsDir)) report();
const skillNames = layout.skills.map((s) => s.name);
// Skill name -> directory; skill-relative paths (`<name>/references/x.md`) resolve through this map.
const skillDirs = new Map(layout.skills.map((s) => [s.name, s.dir]));
const skillFile = (skillRelative) => {
  const [name, ...rest] = skillRelative.split("/");
  const dir = skillDirs.get(name);
  return dir ? path.join(dir, ...rest) : path.join(skillsDir, skillRelative);
};
if (skillNames.length !== EXPECTED_SKILL_COUNT) {
  fail("skills", 0, `expected ${EXPECTED_SKILL_COUNT} skills, found ${skillNames.length}`);
}
const skillSet = new Set(skillNames);

// 2-4. Frontmatter, shared links, reference files.
for (const name of skillNames) {
  const file = path.join(skillDirs.get(name), "SKILL.md");
  const content = read(file);
  const lines = content.split("\n");
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!fm) {
    fail(rel(file), 1, "frontmatter must be the first block");
    continue;
  }
  const keys = fm[1].split("\n").map((line) => line.split(":")[0].trim());
  if (keys.join(",") !== "name,description") {
    fail(rel(file), 1, `frontmatter keys must be exactly name, description (found ${keys.join(", ")})`);
  }
  const fmName = /^name:\s*(.*)$/m.exec(fm[1])?.[1]?.trim();
  const fmDescription = /^description:\s*(.*)$/m.exec(fm[1])?.[1]?.trim() ?? "";
  if (fmName !== name) fail(rel(file), 2, `name "${fmName}" must equal the directory name`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) fail(rel(file), 2, "name must be kebab-case, at most 64 chars");
  if (fmDescription.length < 1 || fmDescription.length > 1024) fail(rel(file), 3, "description must be 1-1024 chars");

  if (lines[5] !== LINE6) fail(rel(file), 6, "line 6 must be the shared writing-guide and conventions sentence");
  if (generated && !lines[7]?.startsWith("Runtime: ")) fail(rel(file), 8, "generated skills carry `Runtime: <name>.` on line 8");

  for (const [target, url] of Object.entries(SHARED_LINKS)) {
    const count = content.split(url).length - 1;
    if (count !== 1) fail(rel(file), 6, `must link ${target} exactly once (found ${count})`);
    if (!fs.existsSync(path.join(repoRoot, target))) fail(target, 0, "shared document missing from the repository");
  }

  for (const match of content.matchAll(/references\/([A-Za-z0-9_.-]+)/g)) {
    const fileName = match[1].replace(/\.+$/, "");
    const referenced = path.join(skillDirs.get(name), "references", fileName);
    if (!fs.existsSync(referenced)) {
      const line = content.slice(0, match.index).split("\n").length;
      fail(rel(file), line, `references/${fileName} does not exist`);
    }
  }
}

// 5. Answer templates, keyed by skill-relative path (`<name>/references/<file>`).
const answerFiles = layout.skills
  .flatMap((s) => listFiles(s.dir).filter((file) => file.endsWith("answer.md")).map((file) => `${s.name}/${path.relative(s.dir, file)}`))
  .sort();
const inventoryFiles = Object.keys(ANSWER_INVENTORY).sort();
for (const file of answerFiles) if (!ANSWER_INVENTORY[file]) fail(rel(skillFile(file)), 0, "answer template missing from the declared inventory");
for (const file of inventoryFiles) if (!answerFiles.includes(file)) fail(rel(skillFile(file)), 0, "declared answer template does not exist");

const FRESH_SESSION_SENTENCE =
  "Start the next phase in a new session, or hand the task to `/run-task`; continuing in this session carries this phase's context into the next one.";

function checkHandoff(content, expectedSkill, label, { terminal = expectedSkill === "show-me" } = {}) {
  const blocks = fences(content);
  if (blocks.length !== 1) return fail(label, 0, `expected exactly one fenced block, found ${blocks.length}`);
  const [block] = blocks;
  if (block.lang.toLowerCase() !== "text") return fail(label, 0, `final fence must be a text fence, found "${block.lang}"`);
  const body = block.body.trim();
  const match = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)( @\S+)?$/.exec(body);
  if (!match) return fail(label, 0, `fence must hold one /<skill>[ @<file>] line, found "${body}"`);
  if (!skillSet.has(match[1])) fail(label, 0, `fence names unknown skill "${match[1]}"`);
  if (match[1] !== expectedSkill) fail(label, 0, `fence names "${match[1]}", expected "${expectedSkill}"`);
  if (content.slice(block.end).trim() !== "") fail(label, 0, "nothing may follow the command fence");
  const sentences = content.split(FRESH_SESSION_SENTENCE).length - 1;
  if (terminal) {
    if (sentences !== 0) fail(label, 0, "terminal replies must not carry the fresh-session sentence");
  } else if (sentences !== 1) {
    fail(label, 0, `must carry the fresh-session sentence exactly once before the fence (found ${sentences})`);
  }
}

for (const [file, expected] of Object.entries(ANSWER_INVENTORY)) {
  const full = skillFile(file);
  if (!fs.existsSync(full)) continue;
  const raw = fillTemplate(read(full));
  if (typeof expected === "object") {
    for (const [workflow, skill] of Object.entries(expected)) {
      const rendered = renderWorkflowVariant(raw, workflow);
      if (!rendered) {
        fail(rel(skillFile(file)), 0, `missing workflow variant for ${workflow}`);
        continue;
      }
      checkHandoff(rendered, skill, `${rel(skillFile(file))} (${workflow})`);
    }
  } else {
    checkHandoff(raw, expected, rel(skillFile(file)), { terminal: expected === "show-me" || TERMINAL_ANSWERS.has(file) });
  }
}

// 6. Human-review artifact templates.
for (const file of HUMAN_REVIEW_TEMPLATES) {
  const full = skillFile(file);
  if (!fs.existsSync(full)) {
    fail(rel(skillFile(file)), 0, "human-review template missing");
    continue;
  }
  const content = read(full);
  for (const heading of ["## Human Review", "### Review targets", "### Verify", "### Known limits"]) {
    const count = content.split(`\n${heading}\n`).length - 1;
    if (count !== 1) fail(rel(skillFile(file)), 0, `must contain exactly one "${heading}" heading (found ${count})`);
  }
}

// 7. Implementation templates.
for (const skill of IMPLEMENTATION_SKILLS) {
  const full = skillFile(`${skill}/references/implementation_template.md`);
  if (!fs.existsSync(full)) continue;
  const content = read(full);
  const fm = /^---\n([\s\S]*?)\n---/.exec(content)?.[1] ?? "";
  if (!/^type: implementation$/m.test(fm)) fail(rel(full), 1, "frontmatter must declare `type: implementation`");
  if (!/^completed_phase: \[positive integer\]$/m.test(fm)) fail(rel(full), 1, "frontmatter must declare `completed_phase: [positive integer]`");
}

// 8. Human-gate and phase answers.
for (const file of HUMAN_GATE_ANSWERS) {
  const full = skillFile(file);
  if (!fs.existsSync(full)) continue;
  const content = read(full);
  const links = content.split("{artifact_link}").length - 1;
  if (links !== 1) fail(rel(skillFile(file)), 0, `must contain {artifact_link} exactly once (found ${links})`);
  if (!/^Check:$/m.test(content)) fail(rel(skillFile(file)), 0, "must contain a `Check:` line");
  if (!/approval/.test(content)) fail(rel(skillFile(file)), 0, "must state that running the next command records approval");
  if (!/reply with (the )?changes|\/iterate-/i.test(content)) fail(rel(skillFile(file)), 0, "must explain how to request changes");
}
for (const file of PHASE_ANSWERS) {
  const full = skillFile(file);
  if (!fs.existsSync(full)) continue;
  const content = read(full);
  const links = content.split("{artifact_link}").length - 1;
  if (links !== 1) fail(rel(skillFile(file)), 0, `must contain {artifact_link} exactly once (found ${links})`);
  if (!/^Check:$/m.test(content)) fail(rel(skillFile(file)), 0, "must contain a `Check:` line");
  if (!/Deferred human evidence \(recorded, not executed\):/.test(content)) fail(rel(skillFile(file)), 0, "must record deferred human evidence");
  if (/[Aa]pproved/.test(content)) fail(rel(skillFile(file)), 0, "phase answers must not carry approval wording");
}

// 9. Banned tokens.
let bannedHits = 0;
for (const file of listFiles(root)) {
  const relative = rel(file);
  if (SKIP_FILES.has(relative)) continue;
  if (/\.(png|jpg|jpeg|gif|ico|woff2?|zip)$/i.test(file)) continue;
  const lines = read(file).split("\n");
  lines.forEach((line, index) => {
    for (const token of BANNED_TOKENS) {
      if (token.test(line)) {
        bannedHits += 1;
        fail(relative, index + 1, `banned token ${token}: ${line.trim().slice(0, 120)}`);
        break;
      }
    }
  });
}

// 10. Workflow coverage.
const workflowFile = path.join(repoRoot, "workflows", "delivery.md");
if (!fs.existsSync(workflowFile)) {
  fail("workflows/delivery.md", 0, "missing workflow document");
} else {
  const content = read(workflowFile);
  // Every skill in a group belongs to that group's workflow document; standalone skills need no mention.
  for (const skill of layout.skills) {
    if (skill.group !== "delivery" || skill.name.startsWith("agent-")) continue;
    if (!content.includes(skill.name)) fail("workflows/delivery.md", 0, `does not mention skill "${skill.name}"`);
  }
  for (const skill of layout.skills) {
    if (!skill.group || skill.group === "delivery") continue;
    const doc = path.join(repoRoot, "workflows", `${skill.group}.md`);
    if (!fs.existsSync(doc)) fail(`workflows/${skill.group}.md`, 0, `group skills/${skill.group}/ needs a workflow document`);
    else if (!read(doc).includes(skill.name)) fail(`workflows/${skill.group}.md`, 0, `does not mention skill "${skill.name}"`);
  }
  if (!/^\| Skill \| Artifact type \| Next command \| Human gate \| Interactive \|$/m.test(content)) {
    fail("workflows/delivery.md", 0, "phase table must have the columns Skill, Artifact type, Next command, Human gate, Interactive");
  }
}

// 11. The phase table and the deterministic module agree: skill, artifact type, gate, interactive, and the
// set of skills each phase's next() can hand off to over the whole decision space. The workflow-type
// chain rows must equal the commands the module produces for a plain repository.
const workflowModule = path.join(skillDirs.get("run-task") ?? path.join(skillsDir, "run-task"), "scripts", "workflow.mjs");
if (!fs.existsSync(workflowModule)) {
  fail("skills/delivery/run-task/scripts/workflow.mjs", 0, "run-task must ship its deterministic workflow module");
} else if (fs.existsSync(workflowFile)) {
  const { PHASES, TYPES, START_COMMAND, parseCommand } = await import(workflowModule);
  const doc = read(workflowFile);
  const rows = doc
    .split("\n")
    .filter((line) => /^\| [a-z0-9-]+ \| /.test(line) && !line.startsWith("| Skill |"))
    .map((line) => line.split("|").map((cell) => cell.trim()).slice(1, -1))
    .filter((cells) => cells.length === 5);
  const contexts = [];
  for (const workflow of TYPES) {
    for (const probe of [{ inWorktree: false, disabled: false }, { inWorktree: false, disabled: true }, { inWorktree: true, disabled: false }]) {
      for (const remaining of [[1], []]) {
        for (const status of ["", "findings", "clean", "blocked", "pending", "approved", "passed", "untested", "failed"]) {
          contexts.push({ workflow, probe, remaining, status, artifact: "NN-type-slug.md", planFile: "NN-plan-slug.md" });
        }
      }
    }
  }
  const reachable = (skill) => {
    const out = new Set();
    for (const ctx of contexts) {
      const command = PHASES[skill].next(ctx);
      if (command) out.add(parseCommand(command)?.skill ?? command);
    }
    return out;
  };
  const tabled = new Set();
  for (const [skill, type, nextCell, gate, interactive] of rows) {
    tabled.add(skill);
    if (skill === "run-task") continue;
    const phase = PHASES[skill];
    if (!phase) {
      fail("workflows/delivery.md", 0, `phase table row "${skill}" has no entry in workflow.mjs PHASES`);
      continue;
    }
    if (phase.type !== type) fail("workflows/delivery.md", 0, `"${skill}" artifact type is "${type}" in the table and "${phase.type}" in workflow.mjs`);
    if (phase.gate !== (gate === "yes")) fail("workflows/delivery.md", 0, `"${skill}" human gate is "${gate}" in the table and ${phase.gate} in workflow.mjs`);
    if (phase.interactive !== (interactive === "yes")) fail("workflows/delivery.md", 0, `"${skill}" interactive is "${interactive}" in the table and ${phase.interactive} in workflow.mjs`);
    const named = new Set([...nextCell.matchAll(/\/([a-z0-9]+(?:-[a-z0-9]+)*)/g)].map((m) => m[1]));
    const coded = reachable(skill);
    const sortedNamed = [...named].sort().join(", ");
    const sortedCoded = [...coded].sort().join(", ");
    if (sortedNamed !== sortedCoded) {
      fail("workflows/delivery.md", 0, `"${skill}" next command names [${sortedNamed}] in the table but workflow.mjs can hand off to [${sortedCoded}]`);
    }
  }
  for (const skill of Object.keys(PHASES)) if (!tabled.has(skill)) fail("workflows/delivery.md", 0, `workflow.mjs PHASES has "${skill}" but the phase table does not`);

  // Chain rows: simulate the module for a plain repository (no workspace config, not a worktree) and a
  // plan with one phase, up to the external pull request review.
  for (const workflow of TYPES) {
    if (workflow === "oneshot") continue;
    const row = doc.split("\n").find((line) => line.startsWith(`| \`${workflow}\` |`));
    if (!row) {
      fail("workflows/delivery.md", 0, `no chain row for workflow type ${workflow}`);
      continue;
    }
    const documented = row.split("|")[2].trim().split(",").map((s) => s.trim());
    const chain = [];
    let skill = parseCommand(START_COMMAND[workflow]).skill;
    const seen = new Set();
    while (skill && !seen.has(skill)) {
      chain.push(skill);
      seen.add(skill);
      const command = PHASES[skill].next({ workflow, probe: { inWorktree: false, disabled: false }, remaining: [], status: "clean", artifact: "a.md", planFile: "p.md" });
      skill = command ? parseCommand(command)?.skill ?? null : null;
    }
    if (chain.at(-1) === "resolve-pr-reviews") chain.pop();
    chain.push("resolve-pr-reviews");
    if (chain.join(",") !== documented.join(",")) {
      fail("workflows/delivery.md", 0, `chain for ${workflow} is documented as [${documented.join(", ")}] but workflow.mjs produces [${chain.join(", ")}]`);
    }
  }
}

// 12. The commit subject rule the conventions document is the rule the commit-msg hook and CI enforce.
const conventionsFile = path.join(repoRoot, "shared", "CONVENTIONS.md");
const conventionsLines = read(conventionsFile).split("\n");
const ruleIndex = conventionsLines.findIndex((line) => /^Validate the subject before committing: it must match `/.test(line));
const rule = ruleIndex === -1 ? null : /must match `([^`]+)` and be at most (\d+) characters/.exec(conventionsLines[ruleIndex]);
if (!rule) {
  fail("shared/CONVENTIONS.md", 0, "missing the commit subject validation sentence (regex and length)");
} else {
  if (rule[1] !== SUBJECT_PATTERN.source) fail("shared/CONVENTIONS.md", ruleIndex + 1, `documented subject regex differs from scripts/check-commits.mjs: ${SUBJECT_PATTERN.source}`);
  if (Number(rule[2]) !== MAX_SUBJECT_LENGTH) fail("shared/CONVENTIONS.md", ruleIndex + 1, `documented subject limit ${rule[2]} differs from scripts/check-commits.mjs: ${MAX_SUBJECT_LENGTH}`);
}

report();

function report() {
  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    console.error(`\n${failures.length} problem(s)`);
    process.exit(1);
  }
  console.log(
    `ok: ${skillNames.length} skills, ${answerFiles.length} answer templates, ${HUMAN_REVIEW_TEMPLATES.length} human-review templates, ${bannedHits} banned tokens${generated ? ` (generated tree ${root})` : ""}`,
  );
}
