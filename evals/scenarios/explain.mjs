import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { expect, failures } from "../lib.mjs";

const git = (repo, ...argv) => execFileSync("git", argv, { cwd: repo, encoding: "utf8" }).trim();

// The fixture seeds a delivered change's evidence: captured CLI probe output before and after, receipts and a PR
// description whose "roughly 10x" overstates the measured 91.5 ms to 36.6 ms. Setup commits the change itself, so the
// receipts name real commits. The pages must carry the measured numbers, not the PR's claim (naming it beside its
// correction is the skill's rule for disagreeing sources), name what was not measured (Windows), draw the
// engineer mechanism in Mermaid, add no images (there is no footage), and pass page.mjs.
export function setup({ repo, taskDir }) {
  const base = git(repo, "rev-parse", "HEAD");
  const change = path.join(taskDir, ".change");
  fs.cpSync(change, repo, { recursive: true });
  fs.rmSync(change, { recursive: true, force: true });
  git(repo, "add", "src/store.mjs", "bench/send-probe.mjs");
  git(repo, "commit", "-q", "-m", "perf(store): append delivery log entries as JSON Lines");
  const head = git(repo, "rev-parse", "HEAD");
  const tokens = { "{{BASE_SHA}}": base, "{{HEAD_SHA}}": head, "{{BASE_SHORT}}": base.slice(0, 7), "{{HEAD_SHORT}}": head.slice(0, 7) };
  const fill = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) fill(file);
      else fs.writeFileSync(file, Object.entries(tokens).reduce((text, [token, value]) => text.replaceAll(token, value), fs.readFileSync(file, "utf8")));
    }
  };
  fill(taskDir);
  return { head, headShort: head.slice(0, 7), pagesDir: fs.mkdtempSync(path.join(os.tmpdir(), "skills-explain-pages-")) };
}

// The run's pinned page check, so a later style change cannot fail an old recording. It calls the module's pure check()
// and checkText() rather than the CLI, which restores a retyped style block: grading never changes a recording.
const PURE_CHECK = `
  const [script, file] = process.argv.slice(1);
  const { check, checkText } = await import(script);
  const text = (await import("node:fs")).readFileSync(file, "utf8");
  const problems = /\\.md$/i.test(file) ? checkText(text) : check(text, file);
  for (const p of problems) console.log(\`\${p.line}: \${p.message}\`);
`;
export function pageCheck(skillsDir, file) {
  const script = pathToFileURL(path.join(skillsDir, "explain", "scripts", "page.mjs")).href;
  const run = spawnSync("node", ["--input-type=module", "-e", PURE_CHECK, script, file], { encoding: "utf8" });
  if (run.status !== 0) return [`${path.basename(file)}: page check failed to run: ${run.stderr.trim().split("\n")[0]}`];
  return run.stdout.trim().split("\n").filter(Boolean).map((line) => `${path.basename(file)}:${line}`);
}

// Reader-facing text: tag content plus alt, aria-label and title values.
export const readerText = (html) =>
  (html ?? "")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]*>/g, (tag) => ` ${[...tag.matchAll(/\s(?:alt|aria-label|title)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => `${m[1] ?? m[2]}.`).join(" ")} `);

// The PR's claim in any wording: 10x, tenfold, an order of magnitude, or 90% or more off the time.
// The measured gain is 60% less time; 90% or more, ten times and an order of magnitude are all the PR's claim.
const TEN_X = /\b10\s?(?:x|×)|\b(?:10|ten)[\s-]?(?:times|fold)|order[\s-]of[\s-]magnitude|\b(?:9\d|100)(?:\.\d+)?\s?(?:%|percent)\s+(?:less|faster|lower|shorter|fewer|quicker|reduction|drop|cut|speedup|speed-up|improvement|gain|saving)|\b(?:by|cut|down|dropped|fell|reduced|reduction of)\s+(?:9\d|100)(?:\.\d+)?\s?(?:%|percent)/i;
// A correction is a conflict word, the claim negated ("not the summary's 10x"), or the measured result (both medians, the
// 2.5x ratio, 60% less time): in the next sentence, or in the same one only after a contrast word, so "10x, as the PR says:
// 91.5 to 36.6 ms" does not count. Known limit: an attributed claim followed by a sentence of measured numbers passes.
const MEASURED = /91\.5[\s\S]*36\.6|36\.6[\s\S]*91\.5|\b2\.5\s?(?:x|×|times)|\b60(?:\.\d)?\s?(?:%|percent)/i;
// "does not match" and "does not support" deny the claim only beside the measured result, not in an unrelated sentence.
const DENIED = /conflict|overstat|unsupported|not supported|contradict|does not hold|(?:does not match|do(?:es)? not support)(?=[\s\S]*(?:91\.5[\s\S]*36\.6|36\.6[\s\S]*91\.5))|(?:91\.5[\s\S]*36\.6|36\.6[\s\S]*91\.5)[\s\S]*(?:does not match|do(?:es)? not support)|\bnot\s+(?:the|that|this|its|what)\b[^.;]{0,60}?(?:summary|claim|description|\bPR\b|pull request|10)/i;

// The claim negated beside the measured result ("about 2.5x, not 10x") is a correction, not a statement.
const NEGATED = /\b(?:not|rather than|instead of)\s+(?:about\s+|roughly\s+|~)?(?:10\s?(?:x|×)|ten[\s-]?(?:times|fold))/gi;

// Sentences that state the PR's 10x as the page's own fact. Naming the claim is fine when the sentence attributes it to
// the summary and it or the next sentence corrects it, or when the sentence only negates it beside the measured result.
export function overstated(texts) {
  const sentences = texts.join("\n").split(/(?<=[.;!?])\s+|\n+/);
  const corrected = (s, next) => DENIED.test(s) || DENIED.test(next ?? "") || MEASURED.test(next ?? "") || MEASURED.test(/\b(?:but|however|whereas|while|yet|although)\b([\s\S]*)/i.exec(s)?.[1] ?? "");
  const claims = (s) => TEN_X.test(MEASURED.test(s) ? s.replace(NEGATED, " ") : s);
  return sentences.filter((s, i) => claims(s) && !(/summary|description|claim|pull request|\bPR\b|says|stated/i.test(s) && corrected(s, sentences[i + 1])));
}

// The reply follows the answer template, and explaining a change leaves HEAD and the tree as setup left them.
export const replyProblems = (answer) => [
  ...["Pages saved:", "Summary:", "Share text:", "Published:", "Not shown:"].map((label) => (answer.includes(label) ? null : `reply: missing "${label}" from the answer template`)),
  /^```/m.test(answer) ? "reply: a terminal reply has no fenced block" : null,
];
export const repoProblems = (live, repo, seeded) => [
  live && seeded?.head && git(repo, "rev-parse", "HEAD") !== seeded.head ? "git: HEAD moved; explaining a change commits nothing" : null,
  live && git(repo, "status", "--porcelain") ? `git: repository left dirty:\n${git(repo, "status", "--porcelain")}` : null,
];

export function pagesDirectory({ pagesDir, taskDir, setup: seeded, live }) {
  if (pagesDir) return pagesDir;
  if (seeded?.pagesDir) return seeded.pagesDir;
  if (!live) return path.join(taskDir, "pages"); // legacy recordings only
  throw new Error("live explain evaluation requires an external pages directory");
}

function pagesCheck(ctx) {
  const { live, repo, taskDir, answer, skillsDir, setup: seeded } = ctx;
  const pages = pagesDirectory(ctx);
  const read = (name) => (fs.existsSync(path.join(pages, name)) ? fs.readFileSync(path.join(pages, name), "utf8") : null);
  const engineer = read("engineer.html");
  const executive = read("executive.html");
  const slack = read("slack.md");
  const text = readerText;
  const stated = overstated([engineer, executive].map(text).concat(slack ?? ""));
  const pageProblems = (name, html) => (html === null ? [`pages: ${name} missing`] : pageCheck(skillsDir, path.join(pages, name)));
  const head = live ? seeded?.headShort : /commit: ([0-9a-f]{7})/.exec(fs.readFileSync(path.join(taskDir, "02-evidence-jsonl-log.md"), "utf8"))?.[1];
  return failures(
    pageProblems("engineer.html", engineer),
    pageProblems("executive.html", executive),
    pageProblems("slack.md", slack),
    expect.matches("engineer: measured large-log medians", text(engineer), /91\.5\s*ms[\s\S]*36\.6\s*ms|36\.6\s*ms[\s\S]*91\.5\s*ms/),
    expect.matches("engineer: small logs gain nothing", text(engineer), /40\.3[\s\S]{0,400}43\.0|43\.0[\s\S]{0,400}40\.3/),
    expect.matches("engineer: untested Windows named", text(engineer), /Windows/),
    expect.matches("engineer: the changed file", text(engineer), /src\/store\.mjs/),
    head ? expect.matches("engineer: the delivered commit", text(engineer), new RegExp(head)) : "engineer: no head commit to look for",
    expect.matches("engineer: mechanism drawn in Mermaid", engineer ?? "", /<pre class="mermaid">/),
    expect.matches("executive: a measured number", text(executive), /91\.5|36\.6/),
    expect.matches("slack: a measured number", text(slack), /91\.5|36\.6/),
    stated.length ? `pages: the PR's unmeasured 10x claim stated as fact: "${stated[0].trim().slice(0, 160)}"` : null,
    expect.excludes("pages: no images or video, since the evidence has none", [engineer, executive].join("\n"), /<(?:img|video)\b/i),
    ...replyProblems(answer),
    ...repoProblems(live, repo, seeded),
    live && pages.startsWith(`${taskDir}${path.sep}`) ? "pages: shareable output must stay outside the task root" : null,
  );
}

export default {
  slug: "jsonl-log",
  title: "Keep notifyctl send fast as the delivery log grows",
  workflow: "oneshot",
  fixtures: ["explain"],
  request: "`notifyctl send` slows down as `outbox/log.json` grows, because every send rewrites the whole log. Make a send cost the same on a large log, and keep existing logs readable by `list`.",
  phases: [
    {
      skill: "explain",
      terminal: true,
      setup,
      request: [
        "The change is delivered and its evidence is recorded in this task directory. Build the engineer and executive pages and the Slack message for it.",
        "Record no new evidence and change no code. There is no pull request host and no publishing tool here.",
      ].join("\n"),
      check: pagesCheck,
    },
  ],
};
