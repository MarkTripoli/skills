#!/usr/bin/env node
// Validates the skill collection: layout, frontmatter, shared links, reference files,
// answer-template handoffs, human-review templates, banned host tokens, workflow coverage, and the Archon packs.
// Usage: node scripts/validate.mjs [--root <dir>]
// Exit 1 with one `file:line: message` per failure.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanSkills } from "./lib/layout.mjs";
import { SUBJECT_PATTERN, MAX_SUBJECT_LENGTH } from "./check-commits.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = rootIndex === -1 ? repoRoot : path.resolve(args[rootIndex + 1] ?? "");
const generated = root !== repoRoot;

const EXPECTED_SKILL_COUNT = 35;
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
  "create-design-discussion/references/design_discussion_final_answer.md": "create-plan",
  "create-design-discussion/references/design_discussion_review_answer.md": "iterate-design-discussion",
  "create-epic-plan/references/epic_plan_final_answer.md": "start-epic-delivery",
  "create-plan/references/plan_final_answer.md": "implement-plan",
  "create-prd/references/prd_final_answer.md": "create-tdd",
  "create-prd/references/prd_review_answer.md": "iterate-prd",
  "create-research/references/research_final_answer.md": RESEARCH_VARIANTS,
  "create-research-questions/references/research_questions_final_answer.md": "create-research",
  "create-structure-outline/references/structure_outline_final_answer.md": "implement-outline",
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
  "iterate-plan/references/plan_final_answer.md": "implement-plan",
  "iterate-prd/references/prd_final_answer.md": "create-tdd",
  "iterate-prd/references/prd_review_answer.md": "iterate-prd",
  "iterate-research/references/research_final_answer.md": RESEARCH_VARIANTS,
  "iterate-research-questions/references/research_questions_final_answer.md": "create-research",
  "iterate-structure-outline/references/structure_outline_final_answer.md": "implement-outline",
  "iterate-tdd/references/tdd_final_answer.md": "create-plan",
  "iterate-tdd/references/tdd_review_answer.md": "iterate-tdd",
  "record-evidence/references/evidence_failed_answer.md": "iterate-implementation",
  "record-evidence/references/evidence_final_answer.md": "describe-pr",
  "record-evidence/references/evidence_standalone_answer.md": "show-me",
  "reproduce-bug/references/reproduction_not_reproduced_answer.md": "show-me",
  "reproduce-bug/references/reproduction_reproduced_answer.md": "review-code",
  "resolve-pr-reviews/references/pr_review_approved_answer.md": "show-me",
  "resolve-pr-reviews/references/pr_review_pending_answer.md": "resolve-pr-reviews",
  "review-artifact-comments/references/comments_final_answer.md": "iterate-implementation",
  "review-code/references/code_review_blocked_answer.md": "show-me",
  "review-code/references/code_review_clean_answer.md": "describe-pr",
  "review-code/references/code_review_findings_answer.md": "fix-code-review",
  "show-me/references/show_me_final_answer.md": "show-me",
  "start-epic-delivery/references/epic_delivery_final_answer.md": "show-me",
};

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
  "reproduce-bug/references/reproduction_template.md",
  "resolve-pr-reviews/references/pr_review_template.md",
  "start-epic-delivery/references/epic_delivery_template.md",
];

const IMPLEMENTATION_SKILLS = ["implement-plan", "implement-outline", "iterate-implementation"];

const PHASE_ANSWERS = IMPLEMENTATION_SKILLS.map((skill) => `${skill}/references/implementation_phase_final_answer.md`);

const HUMAN_GATE_ANSWERS = Object.keys(ANSWER_INVENTORY).filter(
  (file) =>
    !PHASE_ANSWERS.includes(file) &&
    /^(?:create|iterate)-(?:design-discussion|prd|tdd|structure-outline|plan|epic-plan)\/|^(?:implement-plan|implement-outline|iterate-implementation)\/|^describe-pr\/references\/pr_description_final_answer|^resolve-pr-reviews\/references\/pr_review_pending_answer|^reproduce-bug\/references\/reproduction_reproduced_answer/.test(
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
    .replaceAll("{implementation_command}", "/implement-plan")
    .replaceAll("{report_link}", "[report.md](.agents/tasks/task-slug/evidence/screen/report.md)")
    .replaceAll("{child_slug}", "child-slug")
    .replaceAll("{child_start_command}", 'archon workflow run delivery-lean --base epic-slug --input task_dir=.agents/tasks/child-slug "Child prompt"')
    .replaceAll("{review_check}", "Review the named behavior and evidence.")
    .replaceAll("{known_limits}", "None.")
    .replaceAll("{needed}", "The exact input file that triggers the crash.")
    .replaceAll("{completed_phase}", "1")
    .replaceAll("{next_phase}", "2")
    .replaceAll("{task_dir}", ".agents/tasks/task-slug");
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

const FRESH_SESSION_SENTENCE = "Start the next phase in a new session; continuing in this session carries this phase's context into the next one.";

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
    checkHandoff(raw, expected, rel(skillFile(file)), { terminal: expected === "show-me" });
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
  if (!/^\| Skill \| Artifact type \| Human gate \| Runs in \|$/m.test(content)) {
    fail("workflows/delivery.md", 0, "phase table must have the columns Skill, Artifact type, Human gate, Runs in");
  }
}

// 11. The Archon packs. The native packs are the source; the Oh My Pi flavor is generated from them and must be
// current. Every skill a pack names exists, every AI node runs in a fresh session, and each workflow directory
// holds exactly one YAML file (Archon's packaged layout) plus at least one dry-run fixture. Every pack that
// opens a task directory declares the `gates` input and node; every join after a gated include or the bugfix
// twins tolerates the skipped branch. When an Archon 0.10+ binary is on PATH, the packs must also load there
// without errors or warnings; without one, that check is skipped and reported.
const packsRoot = path.join(repoRoot, ".archon", "workflows");
const { build: buildPacks, listNative } = await import("./build-packs.mjs");
let archonChecked = "skipped (no archon 0.10+ on PATH)";
if (!fs.existsSync(path.join(packsRoot, "delivery"))) {
  fail(".archon/workflows/delivery", 0, "missing the native delivery packs");
} else {
  for (const stale of buildPacks({ write: false }).filter((r) => r.stale)) {
    fail(rel(stale.target), 0, stale.orphan ? "generated pack has no native source; run node scripts/build-packs.mjs" : "generated Oh My Pi flavor is stale; run node scripts/build-packs.mjs");
  }
  for (const flavor of ["delivery", "delivery-omp"]) {
    for (const dir of fs.readdirSync(path.join(packsRoot, flavor), { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const yamls = fs.readdirSync(path.join(packsRoot, flavor, dir.name)).filter((f) => f.endsWith(".yaml"));
      if (yamls.length !== 1) fail(rel(path.join(packsRoot, flavor, dir.name)), 0, `a workflow directory holds exactly one YAML file (found ${yamls.length})`);
    }
  }
  for (const { dir, file } of listNative()) {
    const full = path.join(packsRoot, "delivery", dir, file);
    const content = read(full);
    const lines = content.split("\n");
    const expectedName = `delivery-${dir}`;
    if (!lines.includes(`name: ${expectedName}`)) fail(rel(full), 1, `workflow name must be "${expectedName}" (the directory name)`);
    for (const match of content.matchAll(/\$(?:INPUTS|task\.output)\.skills_dir\/([a-z0-9-]+)\/SKILL\.md/g)) {
      if (!skillSet.has(match[1])) fail(rel(full), content.slice(0, match.index).split("\n").length, `names unknown skill "${match[1]}"`);
    }
    // Every `$id.output...` and `$LOOP_PREV.id.output...` outside a comment names a node or include alias
    // this file declares.
    const declared = new Set([...content.matchAll(/^\s*- id: (\S+)$/gm)].map((m) => m[1]));
    const code = lines.map((l) => (/^\s*#/.test(l) ? "" : l)).join("\n");
    for (const match of code.matchAll(/\$(?:LOOP_PREV\.)?([a-z][a-z0-9-]*)\.output\b/g)) {
      if (!declared.has(match[1])) fail(rel(full), code.slice(0, match.index).split("\n").length, `references \`$${match[1]}.output\` but declares no node "${match[1]}"`);
    }
    lines.forEach((line, index) => {
      const prompt = /^(\s*)prompt: \|$/.exec(line);
      if (!prompt) return;
      // The node's keys sit at the prompt's indent, from the preceding `- id:` line to the next one.
      const keyIndent = prompt[1].length;
      let start = index;
      while (start > 0 && !new RegExp(`^${" ".repeat(keyIndent - 2)}- id: `).test(lines[start])) start--;
      let end = index + 1;
      while (end < lines.length && !new RegExp(`^${" ".repeat(keyIndent - 2)}- id: `).test(lines[end]) && !(lines[end].trim() !== "" && lines[end].length - lines[end].trimStart().length < keyIndent - 2)) end++;
      const node = lines.slice(start, end);
      if (!node.some((l) => l === `${" ".repeat(keyIndent)}context: fresh`)) fail(rel(full), start + 1, "every prompt node declares `context: fresh`");
    });
    // Top-level nodes: id, the indent-4 keys, and the `depends_on` list.
    const nodes = [];
    lines.forEach((line, index) => {
      const id = /^ {2}- id: (\S+)$/.exec(line);
      if (id) nodes.push({ id: id[1], line: index + 1, keys: {} });
      const key = /^ {4}([a-z_]+): ?(.*)$/.exec(line);
      if (key && nodes.length) nodes.at(-1).keys[key[1]] = key[2];
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    // A pack with a gated phase declares the `gates` input and node (resolve-reviews has no gate).
    if (nodes.some((n) => ["delivery-gate-phase", "delivery-implement"].includes(n.keys.include))) {
      if (!/^ {2}gates:\n {4}default: all$/m.test(content)) fail(rel(full), 1, "a pack with a gated phase declares input `gates` with `default: all`");
      if (!byId.has("gates")) fail(rel(full), 1, "a pack with a gated phase has a `gates` node");
    }
    // A gated include or a `when:`-guarded twin leaves one branch skipped; an unconditional join after it must
    // not wait for it. A `when:` node after a twin (bugfix `not-reproduced`) is meant to skip with it.
    const gated = new Set(nodes.filter((n) => ["delivery-gate-phase", "delivery-implement"].includes(n.keys.include) || "when" in n.keys).map((n) => n.id));
    for (const node of nodes) {
      const deps = /^\[(.*)\]$/.exec(node.keys.depends_on ?? "");
      if ("when" in node.keys || !deps || !deps[1].split(",").some((d) => gated.has(d.trim()))) continue;
      if (node.keys.trigger_rule !== "none_failed_min_one_success") fail(rel(full), node.line, `\`${node.id}\` follows a gated branch and needs \`trigger_rule: none_failed_min_one_success\``);
    }
    const fixtures = path.join(packsRoot, "delivery", dir, "fixtures");
    if (!fs.existsSync(fixtures) || !fs.readdirSync(fixtures).some((f) => f.endsWith(".stubs.yaml"))) fail(rel(fixtures), 0, "every pack declares at least one dry-run fixture (fixtures/<name>.stubs.yaml)");
    // Twins: a gate condition on `== 'true'` has a sibling on `!= 'true'` over the same value, so one branch
    // always runs. Other `when:` nodes (the optional review pass) are single.
    const whens = [...content.matchAll(/^\s*when: "(\$[A-Za-z0-9_.-]*gate[A-Za-z0-9_.-]*) (==|!=) 'true'"$/gm)].map((m) => `${m[1]} ${m[2]}`);
    for (const w of whens) {
      const twin = w.endsWith("==") ? w.replace(/==$/, "!=") : w.replace(/!=$/, "==");
      if (!whens.includes(twin)) fail(rel(full), lines.findIndex((l) => l.includes(`when: "${w} 'true'"`)) + 1, `\`when: "${w} 'true'"\` has no twin branch \`${twin} 'true'\``);
    }
  }
  const archon = archonBinary();
  if (archon) {
    try {
      const out = execFileSync(archon, ["workflow", "list", "--cwd", repoRoot, "--json"], { encoding: "utf8", env: { ...process.env, DO_NOT_TRACK: "1" }, stdio: ["ignore", "pipe", "ignore"], timeout: 120000 });
      const listed = JSON.parse(out);
      const names = new Set();
      for (const workflow of listed.workflows) {
        if (!workflow.name.startsWith("delivery-")) continue;
        names.add(workflow.name);
        for (const warning of workflow.parseWarnings ?? []) fail(`.archon/workflows (${workflow.name})`, 0, `archon warning: ${warning.slice(0, 200)}`);
      }
      for (const error of listed.errors) fail(`.archon/workflows/${error.filename}`, 0, `archon: ${error.error.slice(0, 300)}`);
      for (const { dir } of listNative()) {
        for (const name of [`delivery-${dir}`, `delivery-${dir}-omp`]) if (!names.has(name)) fail(`.archon/workflows (${name})`, 0, "archon does not list this workflow");
      }
      archonChecked = `checked with ${archon}`;
    } catch (error) {
      fail(".archon/workflows", 0, `archon workflow list failed: ${String(error.message).split("\n")[0]}`);
    }
  }
}

// The first `archon` on PATH whose version is 0.10 or later, else null. `archon --version` prints
// `Archon CLI vX.Y.Z` on its first line.
function archonBinary() {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, "archon");
    if (!dir || !fs.existsSync(candidate)) continue;
    try {
      const version = /v(\d+)\.(\d+)\./.exec(execFileSync(candidate, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20000 }));
      if (version && (Number(version[1]) > 0 || Number(version[2]) >= 10)) return candidate;
    } catch {
      // Not a usable archon; keep looking.
    }
  }
  return null;
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
    `ok: ${skillNames.length} skills, ${answerFiles.length} answer templates, ${HUMAN_REVIEW_TEMPLATES.length} human-review templates, ${bannedHits} banned tokens, packs ${archonChecked}${generated ? ` (generated tree ${root})` : ""}`,
  );
}
