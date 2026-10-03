import { seed } from "../iterate-grade.mjs";
// `start-epic-delivery` on an approved epic plan of three children in two waves, with `gh` failing
// authentication (a stub; no GitHub host is reached). The skill must still create every child task
// directory with parent, base and depends_on, invent no issue number (no `issue:` field, no `#<n>` in the
// receipt), say under Known limits that GitHub issues were not created and why, name only wave 1 in its
// commands, and stage and commit nothing. The harness repository has no real remote; the phase adds an
// `origin` URL so a host can be read, and moves to an epic branch. The prompt asks the session not to
// create git worktrees (it would write outside the throwaway repository); it names the commands instead.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NO_HOST, expect, failures, isHostWrite, placeholders, section } from "../lib.mjs";

export const SLUG = "notify-sms-epic";
export const BRANCH = "skills-evals/notify-sms-epic";
export const EPIC_FILE = "artifacts/planning/epic/0001.md";

export const CHILDREN = [
  {
    name: "Add sms channel",
    workflow: "oneshot",
    slice: "vertical",
    depends_on: [],
    acceptance: [
      "WHEN `notifyctl send --channel sms` runs with a configured sms channel, the CLI shall log the delivery with status queued.",
      "IF the config does not name the sms channel, THEN the CLI shall refuse the send with a not configured error.",
    ],
    prompt: "Add `src/channels/sms.mjs` exporting `name` and `deliver()` like `src/channels/email.mjs`, add `sms` to `notifyctl.config.json`, and cover it in `tests/channels.test.mjs`.",
  },
  {
    name: "Add channels command",
    workflow: "oneshot",
    slice: "vertical",
    depends_on: [],
    acceptance: ["WHEN `notifyctl channels` runs, the CLI shall print one configured channel name per line."],
    prompt: "Add a `channels` command to `src/cli.mjs` that prints the channel names from the loaded config, one per line, and cover it with a test.",
  },
  {
    name: "Route urgent sms",
    workflow: "full",
    slice: "vertical",
    depends_on: ["Add sms channel"],
    acceptance: ["WHEN `notifyctl send --urgent` runs, the CLI shall deliver through the sms channel."],
    prompt: "Add an `--urgent` flag to `notifyctl send` in `src/cli.mjs` that overrides `--channel` with `sms`; it needs the sms channel module to exist.",
  },
];

export const EPIC_PLAN = `---
task: notify-sms-epic
type: epic-plan
summary: "Adds sms delivery to notifyctl in three children: the sms channel and a channels command in wave 1, urgent routing in wave 2. The sms channel gates urgent routing."
repo: notifyctl
branch: ${BRANCH}
sha: fixture
---

# Notify SMS Epic Plan

## Goal

notifyctl delivers by sms and routes urgent messages there.

## Current State

Channels are modules under \`src/channels/\`; \`src/cli.mjs\` parses \`send\` and \`list\`.

## Decomposition

The channel module is the shared seam; the channels command is independent of it; urgent routing consumes it.

## Children

\`\`\`json
${JSON.stringify(CHILDREN, null, 2)}
\`\`\`

## Slice Check

| Child | Observable increment | Size evidence | Merge safety |
|---|---|---|---|
| Add sms channel | \`send --channel sms\` queues a message | one module, one config entry, one test | additive |
| Add channels command | \`notifyctl channels\` prints names | one command, one test | additive |
| Route urgent sms | \`send --urgent\` reaches sms | one flag in the CLI | unreachable until the sms channel merges |

## Ordering

- Wave 1: Add sms channel, Add channels command
- Wave 2: Route urgent sms

## Workflow judgments

Helper unavailable; workflows chosen by this skill.

## Sizing judgments

Helper unavailable; sizing judged by this skill.

## Human Review

### Review targets

- The dependency from urgent routing to the sms channel.

### Verify

- [ ] Each child's acceptance criteria are decidable by a command.

### Known limits

- None.
`;

// A phase setup: seed the epic plan, move to the epic branch, give the repository an origin to read a host from.
export function seedEpic({ repo, taskDir }) {
  seed({ [EPIC_FILE]: EPIC_PLAN })({ taskDir });
  const git = (...argv) => execFileSync("git", argv, { cwd: repo, stdio: "ignore" });
  git("checkout", "-q", "-b", BRANCH);
  git("remote", "add", "origin", "git@github.com:acme/notifyctl.git");
}

export const stubs = { gh: "echo 'gh: not authenticated; run gh auth login' >&2\nexit 1" };

export const PROMPT = [
  `The approved epic plan is ${EPIC_FILE} in the task directory; the repository is already on the epic branch \`${BRANCH}\`.`,
  "Do not ask me questions. This machine is shared: do not create git worktrees or branches outside this repository; name the worktree commands in the answer instead.",
].join("\n");

const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// `fm` fields of a task.md including a YAML list written inline (`[a, b]`) or as `- item` lines.
export function taskFields(text) {
  const head = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  const out = {};
  let list = null;
  for (const line of head.split("\n")) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && list) { out[list].push(item[1].trim()); continue; }
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const inline = /^\[(.*)\]$/.exec(kv[2].trim());
    if (inline) out[kv[1]] = inline[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    else if (kv[2].trim() === "") { out[kv[1]] = []; list = kv[1]; continue; }
    else out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
    list = null;
  }
  return out;
}

// Any git worktree besides the repository itself: removed, and reported, so the shared machine stays clean.
export function strayWorktrees(ctx) {
  if (!ctx.live) return [];
  const listed = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: ctx.repo, encoding: "utf8" }).split("\n").filter((l) => l.startsWith("worktree ")).map((l) => l.slice(9));
  const extra = listed.filter((p) => fs.realpathSync(p) !== fs.realpathSync(ctx.repo));
  for (const p of extra) execFileSync("git", ["worktree", "remove", "--force", p], { cwd: ctx.repo, stdio: "ignore" });
  return extra.map((p) => `git: a child worktree was created at ${p}`);
}

export default {
  slug: SLUG,
  title: "Add sms delivery to notifyctl",
  workflow: "full",
  fixtures: [],
  request: "Start delivery of the approved epic plan.",
  stubs,
  ...NO_HOST,
  phases: [
    {
      skill: "start-epic-delivery",
      terminal: true,
      setup: seedEpic,
      request: PROMPT,
      check: (ctx) => {
        // Child directories sit beside the epic's, outside the recorded copy: they are read live only, and a re-grade
        // takes each child's slug from the receipt's table.
        const tasksDir = path.dirname(ctx.taskDir);
        const dirs = !ctx.live ? [] : CHILDREN.map(child => slugOf(child.name)).filter(d => fs.existsSync(path.join(tasksDir, d, "task.md")));
        const found = dirs.map((d) => ({ dir: d, text: fs.readFileSync(path.join(tasksDir, d, "task.md"), "utf8") })).map((c) => ({ ...c, fm: taskFields(c.text) }));
        const byTitle = (name) => found.find((c) => c.fm.title === name);
        const receipt = ctx.artifacts.find((a) => a.fm.type === "epic-delivery");
        const limits = section(receipt?.text ?? "", "### Known limits", { last: true });
        const table = section(receipt?.text ?? "", "## Children created") ?? "";
        const slugFor = (name) => byTitle(name)?.dir ?? table.split("\n").find((row) => row.includes(name))?.match(/\.agents\/tasks\/([A-Za-z0-9-]+)/)?.[1];
        const slugA = slugFor(CHILDREN[0].name);
        const slugC = slugFor(CHILDREN[2].name);
        const commandLines = ctx.answer.split("\n").filter((l) => /\/(?:deliver|create-research(?:-questions)?|reproduce-bug)\b/.test(l));
        const git = (...argv) => execFileSync("git", argv, { cwd: ctx.repo, encoding: "utf8" }).trim();
        return failures(
          !ctx.live || found.length === 3 ? null : `start-epic-delivery: ${found.length} child task directories (${found.map((c) => c.dir).join(", ") || "none"}), expected 3`,
          (ctx.live ? CHILDREN : []).flatMap((child) => {
            const c = byTitle(child.name);
            if (!c) return `start-epic-delivery: no child task.md titled "${child.name}"`;
            const deps = child.depends_on.map((d) => byTitle(d)?.dir ?? slugOf(d));
            const ac = section(c.text, "## Acceptance criteria") ?? "";
            return [
              c.fm.parent === SLUG ? null : `start-epic-delivery: ${c.dir} parent is ${JSON.stringify(c.fm.parent)}, expected ${SLUG}`,
              c.fm.base === BRANCH ? null : `start-epic-delivery: ${c.dir} base is ${JSON.stringify(c.fm.base)}, expected ${BRANCH}`,
              c.fm.workflow === child.workflow ? null : `start-epic-delivery: ${c.dir} workflow is ${JSON.stringify(c.fm.workflow)}, expected ${child.workflow}`,
              JSON.stringify([...(c.fm.depends_on ?? [])].sort()) === JSON.stringify([...deps].sort()) ? null : `start-epic-delivery: ${c.dir} depends_on is ${JSON.stringify(c.fm.depends_on)}, expected ${JSON.stringify(deps)}`,
              "issue" in c.fm ? `start-epic-delivery: ${c.dir} carries an issue field though GitHub was unavailable` : null,
              c.fm.branch ? (/^[^/]+\/\d+-/.test(c.fm.branch) ? `start-epic-delivery: ${c.dir} branch ${c.fm.branch} has an issue segment` : null) : `start-epic-delivery: ${c.dir} records no branch`,
              c.text.includes(child.prompt) ? null : `start-epic-delivery: ${c.dir} lacks the child prompt verbatim`,
              (ac.match(/^- /gm) ?? []).length === child.acceptance.length && child.acceptance.every((s) => ac.includes(s)) ? null : `start-epic-delivery: ${c.dir} acceptance criteria are not one bullet per sentence`,
            ];
          }),
          expect.present("start-epic-delivery: receipt of type epic-delivery", receipt),
          expect.matches("start-epic-delivery: Known limits says GitHub issues were not created and why", limits, /GitHub issues were not created:\s*\S+/),
          expect.excludes("start-epic-delivery: the receipt invents no issue number", table, /#\d+/),
          placeholders(receipt?.text ?? "").map((p) => `start-epic-delivery: receipt placeholder left: ${p}`),
          // The skill consulted gh (the cause is observed, not assumed) and then wrote nothing to it.
          ctx.stubCalls.some((c) => /^gh /.test(c)) ? null : "start-epic-delivery: gh was never consulted, so the cause is not observed",
          ctx.stubCalls.filter(isHostWrite).map((c) => `start-epic-delivery: a GitHub write was attempted: ${c}`),
          // Wave 1 only: both wave-1 children have a start command, the wave-2 child has none.
          ...[CHILDREN[0], CHILDREN[1]].map((child) => {
            const dir = slugFor(child.name);
            return dir && commandLines.some((l) => l.includes(dir)) ? null : `start-epic-delivery: no start command for wave-1 child ${child.name}`;
          }),
          slugC && commandLines.some((l) => l.includes(slugC) && /^\s*[-*]\s+`?/.test(l) && l.includes(`\`${slugC}\``) && !/after|once|wait/i.test(l)) ? `start-epic-delivery: the reply starts wave-2 child ${slugC}` : null,
          slugA && /\/deliver\b/.test(commandLines.find((l) => l.includes(slugA)) ?? "") ? null : "start-epic-delivery: the oneshot child's command is not /deliver",
          placeholders(ctx.answer).map((p) => `start-epic-delivery: reply placeholder left: ${p}`),
          ctx.live ? [
            git("diff", "--cached", "--name-only") ? "git: something is staged" : null,
            git("rev-list", "--count", `${ctx.fixtureSha}..HEAD`) === "0" ? null : "git: the run committed",
            git("status", "--porcelain") ? "git: repository left dirty" : null,
            ...strayWorktrees(ctx),
          ] : [],
        );
      },
    },
  ],
};
