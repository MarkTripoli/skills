#!/usr/bin/env node
// Validates the skill collection: layout, frontmatter, shared links, reference files,
// answer-template handoffs, human-review templates, banned host tokens, and the optional Atomic workflow.
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

const EXPECTED_SKILL_COUNT = 44;
const SHARED_LINKS = {
  "shared/WRITING.md": "https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md",
  "shared/CONVENTIONS.md": "https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md",
};
const LINE6 =
  "Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.";

const RESEARCH_VARIANTS = { full: "create-design-discussion", lean: "create-structure-outline", prd: "create-prd" };
// The deliver skill's by-hand reply names the first skill of the routed chain.
const DELIVER_VARIANTS = { bugfix: "reproduce-bug", oneshot: "review-code", lean: "create-research-questions", full: "create-research-questions", prd: "create-research", epic: "create-research-questions", program: "create-research" };
// A sources reply hands off to the chain's first skill, or to the skill that owns a document being converted;
// a oneshot with sources to gather starts with research.
const SOURCES_VARIANTS = { ...DELIVER_VARIANTS, oneshot: "create-research", "product-document": "create-prd", "technical-document": "create-tdd" };
const TERMINAL_ANSWER = "<terminal>";

// answer file -> skill named in the final fence, or TERMINAL_ANSWER when no skill follows.
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
  "deliver/references/deliver_atomic_answer.md": TERMINAL_ANSWER,
  "deliver/references/deliver_ended_answer.md": TERMINAL_ANSWER,
  "deliver/references/deliver_hand_answer.md": DELIVER_VARIANTS,
  "describe-pr/references/pr_description_final_answer.md": "resolve-pr-reviews",
  "fix-code-review/references/code_review_fixes_answer.md": "review-code",
  "fix-bug/references/fix_answer.md": "review-code",
  "gather-sources/references/sources_final_answer.md": SOURCES_VARIANTS,
  "herd-next/references/herd_next_answer.md": TERMINAL_ANSWER,
  "herd-next/references/herd_next_skipped_answer.md": TERMINAL_ANSWER,
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
  "record-evidence/references/evidence_standalone_answer.md": TERMINAL_ANSWER,
  "reproduce-bug/references/reproduction_not_reproduced_answer.md": TERMINAL_ANSWER,
  "reproduce-bug/references/reproduction_reproduced_answer.md": "fix-bug",
  "resolve-pr-reviews/references/pr_review_approved_answer.md": TERMINAL_ANSWER,
  "resolve-pr-reviews/references/pr_review_pending_answer.md": "resolve-pr-reviews",
  "review-artifact-comments/references/comments_final_answer.md": "iterate-implementation",
  "review-code/references/code_review_blocked_answer.md": TERMINAL_ANSWER,
  "review-code/references/code_review_clean_answer.md": "describe-pr",
  "review-code/references/code_review_findings_answer.md": "fix-code-review",
  "show-me/references/show_me_final_answer.md": TERMINAL_ANSWER,
  "start-epic-delivery/references/epic_delivery_final_answer.md": TERMINAL_ANSWER,
  "test-app/references/app_test_passed_answer.md": "describe-pr",
  "test-app/references/app_test_failed_answer.md": "iterate-implementation",
  "test-app/references/app_test_blocked_answer.md": TERMINAL_ANSWER,
  "verify-implementation/references/verification_passed_answer.md": "review-code",
  "verify-implementation/references/verification_failed_answer.md": "iterate-implementation",
  "verify-implementation/references/verification_blocked_answer.md": TERMINAL_ANSWER,
};

// Whether a forward handoff fence must carry `@<file>`. `true` when the next skill acts on the specific
// artifact this phase produced and documents honoring a `@file` argument, so a bare command would leave it
// guessing (the create-research bug); `false` when the next skill reviews the whole diff or pull request, or
// resolves the newest artifact of a type itself and would reject or mis-read a named file. Every non-terminal
// answer in ANSWER_INVENTORY is listed; the two are kept in sync by the check below. The tie to each next
// skill's input contract is in its SKILL.md `## Input`/step-2 read rule.
const FENCE_ARTIFACT = {
  // Next skill expands, implements, iterates, or acts on the artifact just written; carries @<file>.
  "create-design-discussion/references/design_discussion_final_answer.md": true, // create-plan reads the named design artifact
  "iterate-design-discussion/references/design_discussion_final_answer.md": true,
  "create-design-discussion/references/design_discussion_review_answer.md": true, // iterate-design-discussion resolves @file
  "iterate-design-discussion/references/design_discussion_review_answer.md": true,
  "create-tdd/references/tdd_final_answer.md": true, // create-plan
  "iterate-tdd/references/tdd_final_answer.md": true,
  "create-tdd/references/tdd_program_review_answer.md": true, // iterate-tdd resolves @file
  "create-tdd/references/tdd_system_review_answer.md": true,
  "iterate-tdd/references/tdd_review_answer.md": true,
  "create-prd/references/prd_final_answer.md": true, // create-tdd reads a named file
  "iterate-prd/references/prd_final_answer.md": true,
  "create-prd/references/prd_review_answer.md": true, // iterate-prd resolves @file
  "iterate-prd/references/prd_review_answer.md": true,
  "create-plan/references/plan_final_answer.md": true, // implement-plan honors @file
  "iterate-plan/references/plan_final_answer.md": true,
  "create-structure-outline/references/structure_outline_final_answer.md": true, // implement-outline honors @file
  "iterate-structure-outline/references/structure_outline_final_answer.md": true,
  "create-research-questions/references/research_questions_final_answer.md": true, // create-research uses the named questions file
  "iterate-research-questions/references/research_questions_final_answer.md": true,
  "create-epic-plan/references/epic_plan_final_answer.md": true, // start-epic-delivery uses the named plan
  "review-code/references/code_review_findings_answer.md": true, // fix-code-review resolves the @file review
  "implement-outline/references/implementation_phase_final_answer.md": true, // resumes on @{plan_file}
  "implement-plan/references/implementation_phase_final_answer.md": true,
  "iterate-implementation/references/implementation_phase_final_answer.md": true,
  "record-evidence/references/evidence_failed_answer.md": true, // iterate-implementation on @{plan_file}
  "test-app/references/app_test_failed_answer.md": true,
  "verify-implementation/references/verification_failed_answer.md": true,
  // Next skill reviews the whole diff or pull request, or resolves the newest artifact itself; bare command.
  "ci-commit/references/commit_final_answer.md": false, // describe-pr acts on the PR
  "create-research/references/research_final_answer.md": false, // design/outline/prd read newest research, exclude questions
  "iterate-research/references/research_final_answer.md": false,
  "deliver/references/deliver_hand_answer.md": false, // chain's first skill reads task.md
  "gather-sources/references/sources_final_answer.md": false,
  "describe-pr/references/pr_description_final_answer.md": false, // resolve-pr-reviews acts on the PR
  "fix-code-review/references/code_review_fixes_answer.md": false, // review-code reviews the whole diff
  "fix-bug/references/fix_answer.md": false,
  "verify-implementation/references/verification_passed_answer.md": false,
  "review-code/references/code_review_clean_answer.md": false, // describe-pr
  "implement-outline/references/implementation_final_answer.md": false,
  "implement-plan/references/implementation_final_answer.md": false,
  "iterate-implementation/references/implementation_final_answer.md": false,
  "record-evidence/references/evidence_final_answer.md": false,
  "test-app/references/app_test_passed_answer.md": false,
  "reproduce-bug/references/reproduction_reproduced_answer.md": false, // fix-bug reads newest reproduction
  "resolve-pr-reviews/references/pr_review_pending_answer.md": false, // acts on the PR
  // review-artifact-comments is a general feedback skill that need not own a plan; its pointer stays bare.
  "review-artifact-comments/references/comments_final_answer.md": false,
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
  "test-app/references/app_test_template.md",
  "verify-implementation/references/verification_template.md",
];

const EXECUTION_DAG_TEMPLATES = [
  "create-design-discussion/references/design_discussion_template.md",
  "iterate-design-discussion/references/design_discussion_template.md",
  "create-tdd/references/tdd_template.md",
  "iterate-tdd/references/tdd_template.md",
];

const WORK_BREAKDOWN_TEMPLATES = [
  "create-tdd/references/tdd_template.md",
  "iterate-tdd/references/tdd_template.md",
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

const STANDALONE_SKILLS = new Set(["jev-ui"]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "results", ".cache"]);
const SKIP_FILES = new Set(["scripts/validate.mjs", ".skill-lock.json"]);
const SKIP_BINARY_MEDIA = /\.(mp4|m4v|mov|webm|avi|mkv|wav|mp3)$/i;

const failures = [];
const fail = (file, line, message) => failures.push(`${file}:${line}: ${message}`);
const rel = (file) => path.relative(root, file);
const read = (file) => fs.readFileSync(file, "utf8");

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...listFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
    // Symlinks, sockets, and anything a tool is writing while we walk are not the collection's files.
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
    .replaceAll("{child_issue}", "#12")
    .replaceAll("{child_start_command}", "/deliver .agents/tasks/child-slug")
    .replaceAll("{review_check}", "Review the named behavior and evidence.")
    .replaceAll("{known_limits}", "None.")
    .replaceAll("{needed}", "The exact input file that triggers the crash.")
    .replaceAll("{completed_phase}", "1")
    .replaceAll("{next_phase}", "2")
    .replaceAll("{task_dir}", ".agents/tasks/task-slug")
    .replaceAll("{run_location}", "`/repo` on branch `task-slug`");
}

// Research answers carry `{next_command}`, filled per workflow type by the skill; render one per type.
function renderWorkflowVariant(input, workflow, variants) {
  if (!input.includes("{next_command}")) return null;
  return input.replaceAll("{next_command}", `/${variants[workflow]}`);
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

// The handoff sentence names where the next session opens: `Open a new session in <run location>, then run:`.
// `<run location>` is the `{run_location}` slot every forward template fills from observed git state; it must be
// non-empty and single-line, so a reply cannot drop the location the way the old fixed sentence did.
const FRESH_SESSION_RE = /^Open a new session in (.+), then run:$/m;
const FRESH_SESSION_PREFIX = "Open a new session in ";
const NEXT_ACTION_LABEL = "Next action:";

// Shared conventions also own the commit subject rule checked below.
const conventionsFile = path.join(repoRoot, "shared", "CONVENTIONS.md");
const conventionsLines = read(conventionsFile).split("\n");

function checkHandoff(content, expectedSkill, label, { terminal = false, wantsArtifact = null } = {}) {
  const blocks = fences(content);
  const freshSentences = content.split(FRESH_SESSION_PREFIX).length - 1;
  const nextActionLabels = content.split(NEXT_ACTION_LABEL).length - 1;
  if (terminal) {
    if (blocks.length !== 0) fail(label, 0, `terminal reply must have no fenced blocks, found ${blocks.length}`);
    if (freshSentences !== 0) fail(label, 0, "terminal reply must not carry the fresh-session sentence");
    if (nextActionLabels !== 0) fail(label, 0, "terminal reply must not carry a next-action label");
    return;
  }
  if (blocks.length !== 1) return fail(label, 0, `expected exactly one fenced block, found ${blocks.length}`);
  const [block] = blocks;
  if (block.lang.toLowerCase() !== "text") fail(label, 0, `final fence must be a text fence, found "${block.lang}"`);
  const body = block.body.trim();
  const match = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)( @\S+)?$/.exec(body);
  if (!match) fail(label, 0, `fence must hold one /<skill>[ @<file>] line, found "${body}"`);
  if (match && !skillSet.has(match[1])) fail(label, 0, `fence names unknown skill "${match[1]}"`);
  if (match && match[1] !== expectedSkill) fail(label, 0, `fence names "${match[1]}", expected "${expectedSkill}"`);
  if (match && wantsArtifact === true && !match[2]) {
    fail(label, 0, `fence must name the artifact this phase wrote, "/${expectedSkill} @<file>", because ${expectedSkill} acts on that specific file`);
  }
  if (match && wantsArtifact === false && match[2]) {
    fail(label, 0, `fence must be the bare command "/${expectedSkill}"; ${expectedSkill} resolves its own input, and a named file would mislead it`);
  }
  if (content.slice(block.end).trim() !== "") fail(label, 0, "nothing may follow the command fence");
  if (freshSentences !== 1) fail(label, 0, `must carry the fresh-session sentence exactly once before the fence (found ${freshSentences})`);
  if (nextActionLabels !== 1) fail(label, 0, `must carry the next-action label exactly once before the fence (found ${nextActionLabels})`);
  const preamble = content.slice(0, block.index).trimEnd();
  const sentence = FRESH_SESSION_RE.exec(preamble);
  if (!sentence || sentence[1].trim() === "") {
    fail(label, 0, "the fresh-session sentence must be `Open a new session in <run location>, then run:` with a non-empty location");
  } else if (!preamble.endsWith(sentence[0])) {
    fail(label, 0, "the command fence must follow the fresh-session sentence immediately");
  }
  if (!preamble.slice(0, preamble.length - (sentence ? sentence[0].length : 0)).trimEnd().endsWith(NEXT_ACTION_LABEL)) {
    fail(label, 0, "the next-action label must sit immediately before the fresh-session sentence");
  }
}

for (const [file, expected] of Object.entries(ANSWER_INVENTORY)) {
  const full = skillFile(file);
  if (!fs.existsSync(full)) continue;
  const raw = fillTemplate(read(full));
  if (expected === TERMINAL_ANSWER) {
    checkHandoff(raw, null, rel(skillFile(file)), { terminal: true });
    if (file in FENCE_ARTIFACT) fail(rel(skillFile(file)), 0, "terminal answer must not appear in FENCE_ARTIFACT");
    continue;
  }
  if (!(file in FENCE_ARTIFACT)) {
    fail(rel(skillFile(file)), 0, "answer template missing from FENCE_ARTIFACT; declare whether its fence carries @<file>");
    continue;
  }
  const wantsArtifact = FENCE_ARTIFACT[file];
  if (typeof expected === "object") {
    for (const [workflow, skill] of Object.entries(expected)) {
      const rendered = renderWorkflowVariant(raw, workflow, expected);
      if (!rendered) {
        fail(rel(skillFile(file)), 0, `missing workflow variant for ${workflow}`);
        continue;
      }
      checkHandoff(rendered, skill, `${rel(skillFile(file))} (${workflow})`, { wantsArtifact });
    }
  } else {
    checkHandoff(raw, expected, rel(skillFile(file)), { wantsArtifact });
  }
}
// FENCE_ARTIFACT must not name an answer the inventory does not.
for (const file of Object.keys(FENCE_ARTIFACT)) {
  if (!(file in ANSWER_INVENTORY)) fail(rel(skillFile(file)), 0, "FENCE_ARTIFACT names an answer missing from ANSWER_INVENTORY");
  else if (ANSWER_INVENTORY[file] === TERMINAL_ANSWER) fail(rel(skillFile(file)), 0, "FENCE_ARTIFACT names a terminal answer");
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

// 6b. The execution-DAG and work-breakdown sections. Separate from the human-review loop above: its four
// headings are shared by all 20 templates, while these belong to a four-file and a two-file subset.
const sectionOf = (content, heading) => {
  const parts = content.split(`\n${heading}\n`);
  return { count: parts.length - 1, body: parts[1]?.split("\n#")[0] ?? "" };
};
for (const file of EXECUTION_DAG_TEMPLATES) {
  const full = skillFile(file);
  if (!fs.existsSync(full)) { fail(rel(full), 0, "execution-DAG template missing"); continue; }
  const { count, body } = sectionOf(read(full), "### Execution DAG");
  if (count !== 1) { fail(rel(full), 0, `must contain exactly one "### Execution DAG" heading (found ${count})`); continue; }
  if (!body.includes("```mermaid")) fail(rel(full), 0, "Execution DAG must draw the composed chain as a Mermaid flowchart");
}
for (const file of WORK_BREAKDOWN_TEMPLATES) {
  const full = skillFile(file);
  if (!fs.existsSync(full)) { fail(rel(full), 0, "work-breakdown template missing"); continue; }
  const { count, body } = sectionOf(read(full), "### Engineering Work Breakdown");
  if (count !== 1) { fail(rel(full), 0, `must contain exactly one "### Engineering Work Breakdown" heading (found ${count})`); continue; }
  if (!body.includes("```mermaid")) fail(rel(full), 0, "Engineering Work Breakdown must draw the work items as a Mermaid flowchart");
  if (!/^Critical path:/m.test(body)) fail(rel(full), 0, "Engineering Work Breakdown must state one `Critical path:` line");
  if (!body.includes("| Item | Depends on | Can run in parallel with | Proof it is done |")) fail(rel(full), 0, "Engineering Work Breakdown must carry the four-column work-item table");
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
  if (/\.(png|jpg|jpeg|gif|ico|woff2?|zip)$/i.test(file) || SKIP_BINARY_MEDIA.test(file)) continue;
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
    if (skill.group !== "delivery" || skill.name.startsWith("agent-") || STANDALONE_SKILLS.has(skill.name)) continue;
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

// 11. Atomic is an optional installation, not a prerequisite for reading or building skills.
// Check the repository entry statically; never import the runtime or start a workflow here.
if (!generated) {
  const entry = path.join(repoRoot, "atomic", "workflows", "delivery.ts");
  if (!fs.existsSync(entry)) {
    fail("atomic/workflows/delivery.ts", 0, "missing the optional delivery workflow source");
  } else {
    const content = read(entry);
    if (!/\bexport\s+default\b/.test(content)) fail(rel(entry), 0, "the Atomic workflow must have a default export");
    if (!/\bname\s*:\s*["']delivery["']/.test(content)) fail(rel(entry), 0, "the Atomic workflow must register as delivery");
  }
}

// 12. Generated runtimes carry exactly the canonical portable skill inventory.
if (generated) {
  const canonicalNames = new Set(scanSkills(path.join(repoRoot, "skills")).skills.map((skill) => skill.name));
  for (const name of canonicalNames) {
    if (!skillSet.has(name)) fail("skills", 0, `generated tree is missing canonical skill "${name}"`);
  }
  for (const name of skillSet) {
    if (!canonicalNames.has(name)) fail("skills", 0, `generated tree includes unknown skill "${name}"`);
  }
}

// 13. The commit subject rule the conventions document is the rule the commit-msg hook and CI enforce.
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
    `ok: ${skillNames.length} skills, ${answerFiles.length} answer templates, ${HUMAN_REVIEW_TEMPLATES.length} human-review templates, ${EXECUTION_DAG_TEMPLATES.length} execution-DAG templates, ${WORK_BREAKDOWN_TEMPLATES.length} work-breakdown templates, ${bannedHits} banned tokens${generated ? ` (generated tree ${root})` : ", Atomic entry checked"}`,
  );
}

