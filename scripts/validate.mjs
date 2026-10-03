#!/usr/bin/env node
// Validates the skill collection: layout, frontmatter, shared links, reference files,
// answer-template handoffs, human-review templates, and banned host tokens.
// Usage: node scripts/validate.mjs [--root <dir>]
// Exit 1 with one `file:line: message` per failure.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanSkills } from "./lib/layout.mjs";
import { ADJACENT_HELPERS } from "./lib/build.mjs";
import { validateTaskArtifacts } from "./lib/validate-task-artifacts.mjs";
import { validateInstructionSize } from "./lib/validate-instruction-size.mjs";
import { SUBJECT_PATTERN, MAX_SUBJECT_LENGTH } from "./check-commits.mjs";
import { resolveTaskRoot } from "../shared/task-root.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = rootIndex === -1 ? repoRoot : path.resolve(args[rootIndex + 1] ?? "");
const generated = root !== repoRoot;

const EXPECTED_SKILL_COUNT = 61;
const SHARED_LINKS = {
  "shared/WRITING.md": "https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md",
  "shared/CONVENTIONS.md": "https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md",
};
const LINE6 =
  "Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.";

const RESEARCH_VARIANTS = { full: "create-design-discussion", lean: "create-structure-outline", prd: "create-prd" };
// The deliver skill's by-hand reply names the first skill of the routed chain.
const DELIVER_VARIANTS = { bugfix: "record-evidence --baseline", oneshot: "record-evidence --baseline", lean: "create-research-questions", full: "create-research-questions", prd: "create-research", epic: "create-research-questions", program: "create-research" };
// A sources reply hands off to the chain's first skill, or to the skill that owns a document being converted;
// a oneshot with sources to gather starts with research.
const SOURCES_VARIANTS = { ...DELIVER_VARIANTS, oneshot: "create-research", "product-document": "create-prd", "technical-document": "create-tdd" };
const POST_MUTATION_VARIANTS = { verify: "verify-implementation", app: "test-app", review: "review-code" };
const BASELINE_VARIANTS = { oneshot: "iterate-implementation", bugfix: "reproduce-bug", plan: "implement-plan", outline: "implement-outline", reviews: "resolve-pr-reviews" };
const INSPECTION_VARIANTS = { passed: "describe-pr", repair: "iterate-implementation", verify: "verify-implementation", app: "test-app", review: "review-code", capture: "record-evidence" };
// review-artifact-comments hands off to the command the edited artifact's own phase offers next, keyed by artifact type.
const COMMENT_VARIANTS = { "research-questions": "create-research", research: "create-design-discussion", "design-discussion": "create-plan", "design-prd": "create-tdd", "design-tdd": "create-plan", "structure-outline": "implement-outline", plan: "implement-plan", "epic-plan": "start-epic-delivery", reproduction: "fix-bug", implementation: "verify-implementation" };
const TERMINAL_ANSWER = "<terminal>";

// answer file -> skill named in the final fence, or TERMINAL_ANSWER when no skill follows.
const ANSWER_INVENTORY = {
  "babysit/references/babysit_final_answer.md": TERMINAL_ANSWER,
  "ci-commit/references/commit_final_answer.md": "review-code",
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
  "deliver/references/deliver_answer.md": TERMINAL_ANSWER,
  "describe-pr/references/pr_description_final_answer.md": "resolve-pr-reviews",
  "explain/references/explain_answer.md": TERMINAL_ANSWER,
  "fix-code-review/references/code_review_fixes_answer.md": POST_MUTATION_VARIANTS,
  "fix-bug/references/fix_answer.md": POST_MUTATION_VARIANTS,
  "gather-sources/references/sources_final_answer.md": SOURCES_VARIANTS,
  "group-review/references/group_review_decisions_answer.md": TERMINAL_ANSWER,
  "group-review/references/group_review_posted_answer.md": TERMINAL_ANSWER,
  "herd-next/references/herd_next_answer.md": TERMINAL_ANSWER,
  "herd-next/references/herd_next_skipped_answer.md": TERMINAL_ANSWER,
  "implement-outline/references/implementation_final_answer.md": "verify-implementation",
  "implement-outline/references/implementation_phase_final_answer.md": "implement-outline",
  "implement-plan/references/implementation_final_answer.md": "verify-implementation",
  "implement-plan/references/implementation_phase_final_answer.md": "implement-plan",
  "iterate-design-discussion/references/design_discussion_final_answer.md": "create-plan",
  "iterate-design-discussion/references/design_discussion_review_answer.md": "iterate-design-discussion",
  "iterate-evidence/references/evidence_iteration_passed_answer.md": TERMINAL_ANSWER,
  "iterate-evidence/references/evidence_iteration_stopped_answer.md": TERMINAL_ANSWER,
  "iterate-evidence/references/evidence_delivery_answer.md": INSPECTION_VARIANTS,
  "iterate-implementation/references/implementation_final_answer.md": "verify-implementation",
  "iterate-implementation/references/implementation_phase_final_answer.md": "implement-plan",
  "iterate-plan/references/plan_final_answer.md": "implement-plan",
  "iterate-prd/references/prd_final_answer.md": "create-tdd",
  "iterate-prd/references/prd_review_answer.md": "iterate-prd",
  "iterate-research/references/research_final_answer.md": RESEARCH_VARIANTS,
  "iterate-research-questions/references/research_questions_final_answer.md": "create-research",
  "iterate-structure-outline/references/structure_outline_final_answer.md": "implement-outline",
  "iterate-tdd/references/tdd_final_answer.md": "create-plan",
  "iterate-tdd/references/tdd_review_answer.md": "iterate-tdd",
  "jira-issue-refinement/references/refinement_applied_answer.md": TERMINAL_ANSWER,
  "jira-issue-refinement/references/refinement_draft_answer.md": TERMINAL_ANSWER,
  "record-evidence/references/evidence_baseline_answer.md": BASELINE_VARIANTS,
  "record-evidence/references/evidence_final_answer.md": "iterate-evidence",
  "record-evidence/references/evidence_standalone_answer.md": TERMINAL_ANSWER,
  "reproduce-bug/references/reproduction_not_reproduced_answer.md": TERMINAL_ANSWER,
  "reproduce-bug/references/reproduction_reproduced_answer.md": "fix-bug",
  "resolve-pr-reviews/references/pr_review_approved_answer.md": TERMINAL_ANSWER,
  "resolve-pr-reviews/references/pr_review_monitored_answer.md": TERMINAL_ANSWER,
  "resolve-pr-reviews/references/pr_review_pending_answer.md": "resolve-pr-reviews",
  "review-artifact-comments/references/comments_final_answer.md": COMMENT_VARIANTS,
  "review-code/references/code_review_blocked_answer.md": TERMINAL_ANSWER,
  "review-code/references/code_review_clean_answer.md": "record-evidence",
  "review-code/references/code_review_findings_answer.md": "fix-code-review",
  "show-me/references/show_me_final_answer.md": TERMINAL_ANSWER,
  "start-epic-delivery/references/epic_delivery_final_answer.md": TERMINAL_ANSWER,
  "test-app/references/app_test_passed_answer.md": "review-code",
  "test-app/references/app_test_failed_answer.md": "iterate-implementation",
  "test-app/references/app_test_blocked_answer.md": TERMINAL_ANSWER,
  "verify-implementation/references/verification_passed_answer.md": { app: "test-app", review: "review-code" },
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
  "implement-outline/references/implementation_phase_final_answer.md": true, // resumes on @{source_file}
  "implement-plan/references/implementation_phase_final_answer.md": true,
  "iterate-implementation/references/implementation_phase_final_answer.md": true,
  "test-app/references/app_test_failed_answer.md": true,
  "verify-implementation/references/verification_failed_answer.md": true,
  // Next skill reviews the whole diff or pull request, or resolves the newest artifact itself; bare command.
  "ci-commit/references/commit_final_answer.md": false, // describe-pr acts on the PR
  "create-research/references/research_final_answer.md": false, // design/outline/prd read newest research, exclude questions
  "iterate-research/references/research_final_answer.md": false,
  "gather-sources/references/sources_final_answer.md": false,
  "describe-pr/references/pr_description_final_answer.md": false, // resolve-pr-reviews acts on the PR
  "fix-code-review/references/code_review_fixes_answer.md": false, // review-code reviews the whole diff
  "fix-bug/references/fix_answer.md": false,
  "verify-implementation/references/verification_passed_answer.md": false,
  "review-code/references/code_review_clean_answer.md": false, // describe-pr
  "implement-outline/references/implementation_final_answer.md": false,
  "implement-plan/references/implementation_final_answer.md": false,
  "iterate-implementation/references/implementation_final_answer.md": false,
  "record-evidence/references/evidence_final_answer.md": true,
  "record-evidence/references/evidence_baseline_answer.md": false,
  "iterate-evidence/references/evidence_delivery_answer.md": false,
  "test-app/references/app_test_passed_answer.md": false,
  "reproduce-bug/references/reproduction_reproduced_answer.md": false, // fix-bug reads newest reproduction
  "resolve-pr-reviews/references/pr_review_pending_answer.md": false, // acts on the PR
  // review-artifact-comments fills {next_command} per artifact type; the skill adds @<file> where its table shows it.
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

// The one Mermaid form the Execution DAG templates allow; the full-with-sources eval parses exactly this form.
const DAG_FORM = "Use only this Mermaid form: a `flowchart` line (or `graph`) with a direction TD, TB, BT, LR or RL, then one statement or chain per line, where each node is an id of letters, digits and underscores followed by a double-quoted label in square brackets, a bare id repeats a node already defined, and nodes are joined by `-->` or `-.->` arrows with an optional `|edge label|`; no other Mermaid syntax (no other shapes, `%%` comments, `:::`, `@{`, `subgraph`, `style` or `class` lines, `&`, `;`, `==>`, multi-line or unquoted labels).";
const DAG_WORKFLOWS = { "design-discussion": ["full"], tdd: ["prd", "program"] };
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
  new RegExp(["ady", "ton"].join(""), "i"),
];

const WORKFLOW_OPTIONAL_SKILLS = new Set(["extract-figma-visuals", "feature-conformance", "jev-ui", "land-pr-stack"]);
const SKIP_DIRS = new Set([".git", ".backups", ".omo", ".worktrees", ".ci-go", "node_modules", "dist", "results", ".cache"]);
const SKIP_FILES = new Set(["scripts/validate.mjs", ".skill-lock.json"]);
const SKIP_BINARY_MEDIA = /\.(mp4|m4v|mov|webm|avi|mkv|wav|mp3)$/i;

const BARE_IMPERATIVES = new Set("Run Create Help Operate Control Export Derive Merge Record Inspect Fix Centralize Execute Configure Choose Address Apply Revise Refine Update Draft Research Review Validate Fetch Decompose Orchestrate Implement Author Post".split(" "));

// Independent installs make each create/iterate pair carry its own copy, so the copies must stay byte-identical.
// Members are `<skill>/<path>` (resolved through skillDirs) or `shared/<file>` (read from the repository).
const pair = (file, a = "create", b = "iterate") => { const [stem, ...rest] = file.split("|"); return [`${a}-${stem}/references/${rest[0]}`, `${b}-${stem}/references/${rest[0]}`]; };
const DUPLICATE_SETS = [
  pair("design-discussion|design_discussion_template.md"),
  pair("design-discussion|execution_dag.md"),
  pair("prd|prd_template.md"),
  pair("tdd|tdd_template.md"),
  pair("tdd|execution_dag.md"),
  pair("structure-outline|structure_outline_template.md"),
  pair("plan|plan_template.md"),
  ["implement-plan/references/implementation_final_answer.md", "implement-outline/references/implementation_final_answer.md"],
  ["create-epic-plan/scripts/check-children.mjs", "start-epic-delivery/scripts/check-children.mjs"],
  ["shared/SLICING.md", "create-epic-plan/references/slicing.md"],
];

// Files under a skill's references/ that SKILL.md need not name, as `<skill>/<path under references/>`: reason.
const UNNAMED_REFERENCES = {};

// Real slash commands of host CLIs that are not skills.
const NON_SKILL_COMMANDS = {
  permissions: "Claude Code command named in deliver/references/tool_approval.md",
  status: "Codex command named in deliver/references/tool_approval.md",
  settings: "Oh My Pi command named in deliver/references/tool_approval.md",
  blocks: "GitLab pull request dependency API path segment named in babysit/references/gitlab.md",
  blockees: "GitLab pull request dependency API path segment named in babysit/references/gitlab.md",
  tmp: "directory path, not a command",
  usr: "directory path, not a command",
  etc: "directory path, not a command",
  var: "directory path, not a command",
  dev: "directory path, not a command",
  home: "directory path, not a command",
};

const failures = [];
const fail = (file, line, message) => failures.push(`${file}:${line}: ${message}`);
const rel = (file) => path.relative(root, file);
const read = (file) => fs.readFileSync(file, "utf8");
const excludedTaskRoots = new Set([path.join(root, ".agents", "tasks")]);
try {
  excludedTaskRoots.add(resolveTaskRoot(root).absoluteRoot);
} catch (error) {
  fail("AGENTS.md", 0, error.message);
}

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const defaultTasks = entry.name === "tasks" && path.basename(dir) === ".agents";
      if (!SKIP_DIRS.has(entry.name) && !defaultTasks && !excludedTaskRoots.has(full)) out.push(...listFiles(full));
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
    .replaceAll("{source_file}", "01-plan.md")
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
validateTaskArtifacts({ root, repoRoot, skills: layout.skills, generated, fail });

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
  const descText = fmDescription.replace(/^(["'])(.*)\1$/, "$2");
  if (!descText.includes("Use when")) fail(rel(file), 3, 'description must contain "Use when" followed by the trigger');
  if (/^Run for\b/.test(descText)) fail(rel(file), 3, 'description must not start with "Run for"');
  else if (BARE_IMPERATIVES.has(descText.split(/\s/)[0])) fail(rel(file), 3, `description must be third person; it starts with the bare imperative "${descText.split(/\s/)[0]}"`);

  if (lines[5] !== LINE6) fail(rel(file), 6, "line 6 must be the shared writing-guide and conventions sentence");
  if (generated && !lines[7]?.startsWith("Runtime: ")) fail(rel(file), 8, "generated skills carry `Runtime: <name>.` on line 8");

  for (const [target, url] of Object.entries(SHARED_LINKS)) {
    const count = content.split(url).length - 1;
    if (count !== 1) fail(rel(file), 6, `must link ${target} exactly once (found ${count})`);
    if (!fs.existsSync(path.join(repoRoot, target))) fail(target, 0, "shared document missing from the repository");
  }

  for (const match of content.matchAll(/(?:(\.\.\/)?([a-z0-9-]+)\/)?references\/([A-Za-z0-9_.-]+)/g)) {
    const fileName = match[3].replace(/\.+$/, "");
    const owner = match[2] || name;
    const linkStart = content.lastIndexOf("](", match.index);
    const linkEnd = linkStart === -1 ? -1 : content.indexOf(")", linkStart);
    if (linkEnd >= match.index && /^https?:\/\//i.test(content.slice(linkStart + 2, linkEnd))) continue;
    const referenced = path.join(skillDirs.get(owner) || path.resolve(skillDirs.get(name), "..", owner), "references", fileName);
    // Canonical skills use the manual contract; installers supply these registered optional adjacent helpers.
    const optionalHelper = !generated && skillDirs.has(owner) && ADJACENT_HELPERS.includes(fileName) && fs.existsSync(path.join(repoRoot, "shared", fileName));
    if (!fs.existsSync(referenced) && !optionalHelper) {
      const line = content.slice(0, match.index).split("\n").length;
      fail(rel(file), line, `references/${fileName} does not exist`);
    }
  }
}

// 4b. Duplicate templates stay identical; discover each create/iterate artifact_template.html pair.
const memberPath = (member) => (member.startsWith("shared/") ? path.join(repoRoot, member) : skillFile(member));
const duplicateSets = [...DUPLICATE_SETS];
for (const name of skillNames) {
  const stem = /^create-(.+)$/.exec(name)?.[1];
  const html = `references/artifact_template.html`;
  if (stem && fs.existsSync(skillFile(`${name}/${html}`)) && skillSet.has(`iterate-${stem}`) && fs.existsSync(skillFile(`iterate-${stem}/${html}`))) duplicateSets.push([`${name}/${html}`, `iterate-${stem}/${html}`]);
}
for (const [first, ...others] of duplicateSets) {
  const firstPath = memberPath(first);
  if (!fs.existsSync(firstPath)) { fail(rel(firstPath), 0, `duplicate-set member missing (must equal ${others.map((o) => rel(memberPath(o))).join(", ")})`); continue; }
  for (const other of others) {
    const otherPath = memberPath(other);
    if (!fs.existsSync(otherPath)) fail(rel(otherPath), 0, `duplicate-set member missing (must equal ${rel(firstPath)})`);
    else if (!fs.readFileSync(firstPath).equals(fs.readFileSync(otherPath))) fail(rel(otherPath), 0, `must be byte-identical to ${rel(firstPath)}`);
  }
}

// 4c. Reference reachability, and skill names in SKILL.md and references resolve to skills.
for (const name of skillNames) {
  const dir = skillDirs.get(name);
  const skillText = read(path.join(dir, "SKILL.md"));
  const refDir = path.join(dir, "references");
  const refFiles = fs.existsSync(refDir) ? listFiles(refDir) : [];
  for (const file of refFiles) {
    const inRefs = path.relative(refDir, file).split(path.sep).join("/");
    // Runtime builders distribute these validated executable companions; they are not authored references.
    if (generated && ADJACENT_HELPERS.includes(inRefs)) continue;
    if (`${name}/${inRefs}` in UNNAMED_REFERENCES) continue;
    const base = path.basename(file).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`(?<![A-Za-z0-9_.-])${base}(?![A-Za-z0-9_-])`).test(skillText)) fail(rel(file), 0, `not named in ${name}/SKILL.md; link it from the step that reads it, or add it to UNNAMED_REFERENCES with a reason`);
  }
  for (const file of [path.join(dir, "SKILL.md"), ...refFiles.filter((f) => /\.(md|html)$/.test(f))]) {
    const text = read(file);
    const unknown = (found, index, kind) => {
      if (skillSet.has(found) || (kind === "slash" && found in NON_SKILL_COMMANDS)) return;
      fail(rel(file), text.slice(0, index).split("\n").length, `${kind === "slash" ? "/" : ""}${found} is not a skill name${kind === "slash" ? "; for a host command or a path, add it to NON_SKILL_COMMANDS" : ""}`);
    };
    for (const m of text.matchAll(/installed \*{0,2}`([^`]+)`\*{0,2} skill/g)) unknown(m[1], m.index, "name");
    for (const m of text.matchAll(/\b[Ii]nvoke(?: the)? \*{0,2}`([a-z][a-z0-9-]*)`/g)) unknown(m[1], m.index, "name");
    for (const m of text.matchAll(/`\/([a-z][a-z0-9-]*)(?=[` ])/g)) unknown(m[1], m.index, "slash");
    for (const block of fences(text)) for (const line of block.body.split("\n")) {
      const first = /^\s*\/([a-z][a-z0-9-]*)(?=\s|$)/.exec(line)?.[1];
      if (first) unknown(first, block.index, "slash");
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
  const match = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)( --baseline)?( @\S+)?$/.exec(body);
  if (!match) fail(label, 0, `fence must hold one /<skill>[ --baseline][ @<file>] line, found "${body}"`);
  if (match && !skillSet.has(match[1])) fail(label, 0, `fence names unknown skill "${match[1]}"`);
  if (match && `${match[1]}${match[2] || ""}` !== expectedSkill) fail(label, 0, `fence names "${match[1]}${match[2] || ""}", expected "${expectedSkill}"`);
  if (match?.[2] && match[1] !== "record-evidence") fail(label, 0, "--baseline is supported only by record-evidence");
  if (match && wantsArtifact === true && !match[3]) {
    fail(label, 0, `fence must name the artifact this phase wrote, "/${expectedSkill} @<file>", because ${expectedSkill} acts on that specific file`);
  }
  if (match && wantsArtifact === false && match[3]) {
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
// Generated trees carry no workflows/, so read it from the repository, as the other workflow checks do.
const dagWorkflows = read(path.join(repoRoot, "workflows", "delivery.md"));
const gatesLine = /^`gates` values: .*$/m.exec(dagWorkflows)?.[0] ?? "";
const gateDefault = /`(\w+)` \(default\)/.exec(gatesLine)?.[1];
const gateLegacy = /older `all` reads as `(\w+)`/.exec(gatesLine)?.[1];
if (!gateDefault || !gateLegacy) fail("workflows/delivery.md", 0, "## Gates must state the default gates value and what older `all` reads as");
// The design-discussion and TDD templates keep the instruction in references/execution_dag.md and point to it from the section.
const dagSource = (file) => file.replace(/[^/]+_template\.md$/, "execution_dag.md");
for (const file of EXECUTION_DAG_TEMPLATES) {
  const template = skillFile(file);
  if (!fs.existsSync(template)) { fail(rel(template), 0, "execution-DAG template missing"); continue; }
  const section = sectionOf(read(template), "### Execution DAG");
  if (section.count !== 1) { fail(rel(template), 0, `must contain exactly one "### Execution DAG" heading (found ${section.count})`); continue; }
  if (!section.body.includes("```mermaid")) fail(rel(template), 0, "Execution DAG must draw the workflow chain as a Mermaid flowchart");
  const full = skillFile(dagSource(file));
  if (!section.body.includes("references/execution_dag.md")) fail(rel(template), 0, "Execution DAG must point to references/execution_dag.md");
  if (!fs.existsSync(full)) { fail(rel(full), 0, "Execution DAG instruction missing"); continue; }
  const body = read(full);
  // Installed skills cannot read workflows/delivery.md, so each template must state its chains verbatim.
  for (const name of DAG_WORKFLOWS[file.split("/")[0].replace(/^(create|iterate)-/, "")]) {
    const chain = dagWorkflows.match(new RegExp(`^\\| \`${name}\` \\| (.+?) \\|`, "m"))?.[1];
    if (!chain) fail("workflows/delivery.md", 0, `no \`${name}\` row in the choices table`);
    else if (!new RegExp(`\`${name}\`(?:: | chain is: )${chain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(?=\\s|$)`).test(body)) fail(rel(full), 0, `Execution DAG must state the \`${name}\` chain from workflows/delivery.md verbatim, labeled \`${name}\`: or \`${name}\` chain is:, then a full stop: ${chain}`);
  }
  if (!body.includes(DAG_FORM)) fail(rel(full), 0, "Execution DAG must state the allowed Mermaid form verbatim: " + DAG_FORM);
  const gateRule = body.split("Gate rule:")[1] ?? "";
  for (const value of ["plan", "none", "all"]) if (!gateRule.includes(`\`${value}\``)) fail(rel(full), 0, `Execution DAG must state the "Gate rule:" naming the \`${value}\` gates value`);
  if (gateDefault && gateLegacy) {
    if (!gateRule.includes(`\`${gateDefault}\` (the default`)) fail(rel(full), 0, `Execution DAG must state the "Gate rule:" default as \`${gateDefault}\` (the default, from workflows/delivery.md)`);
    if (!gateRule.includes(`\`all\` reads as \`${gateLegacy}\``)) fail(rel(full), 0, `Execution DAG must state the "Gate rule:" legacy reading: \`all\` reads as \`${gateLegacy}\``);
  }
}
// The create and iterate copies of a template must carry the same section, so one cannot drift from the other.
for (const file of EXECUTION_DAG_TEMPLATES.filter((f) => f.startsWith("create-"))) {
  const pair = file.replace(/^create-/, "iterate-");
  if (!EXECUTION_DAG_TEMPLATES.includes(pair) || !fs.existsSync(skillFile(file)) || !fs.existsSync(skillFile(pair))) continue;
  const text = (f) => read(skillFile(dagSource(f)));
  if (fs.existsSync(skillFile(dagSource(file))) && fs.existsSync(skillFile(dagSource(pair))) && text(file) !== text(pair)) fail(rel(skillFile(dagSource(pair))), 0, `Execution DAG must equal the one in ${dagSource(file)}`);
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
    if (skill.group !== "delivery" || skill.name.startsWith("agent-") || WORKFLOW_OPTIONAL_SKILLS.has(skill.name)) continue;
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

// 13b. A skill that names EARS or `shall` carries all five shapes from shared/SLICING.md in its own text,
// because an installed skill cannot read the guide. The shapes come from the guide's acceptance-criteria table.
const slicing = read(path.join(repoRoot, "shared", "SLICING.md"));
const earsTable = slicing.split("## Acceptance criteria")[1]?.split(/\n## /)[0] ?? "";
const earsShapes = earsTable.split("\n").filter((row) => row.startsWith("|") && row.includes("shall")).map((row) => row.split("|")[2].replaceAll("`", "").trim());
if (earsShapes.length < 5) {
  fail("shared/SLICING.md", 0, `parsed ${earsShapes.length} EARS shapes from the Acceptance criteria table; expected 5`);
} else {
  for (const skill of layout.skills) {
    const text = listFiles(skill.dir).filter((file) => file.endsWith(".md")).map(read).join("\n").replaceAll("`", "");
    // A prose `shall` triggers the check on purpose: a skill that writes `shall` carries the form.
    if (!/\bEARS\b/.test(text) && !/\bshall\b/i.test(text)) continue;
    for (const shape of earsShapes) {
      if (!text.includes(shape)) fail(rel(path.join(skill.dir, "SKILL.md")), 0, `names EARS or shall but lacks "${shape}" from shared/SLICING.md; installed copies cannot read the guide`);
    }
  }
}

validateInstructionSize({ root, generated, fail });

report();

function report() {
  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    console.error(`\n${failures.length} problem(s)`);
    process.exit(1);
  }
  console.log(
    `ok: ${skillNames.length} skills, ${answerFiles.length} answer templates, ${HUMAN_REVIEW_TEMPLATES.length} human-review templates, ${EXECUTION_DAG_TEMPLATES.length} execution-DAG templates, ${WORK_BREAKDOWN_TEMPLATES.length} work-breakdown templates, ${bannedHits} banned tokens${generated ? ` (generated tree ${root})` : ""}`,
  );
}
