import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { scope, surfaces } from "../skills/assess-merge-risk/scripts/scope.mjs";
import { actionProblems, checkReport, lineCounter, retractedProblems, structureProblems } from "../skills/assess-merge-risk/scripts/check-report.mjs";
import scenario, { replyLevel, riskProblems, seededReport } from "../evals/scenarios/assess-merge-risk.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const script = path.join(here, "..", "skills", "assess-merge-risk", "scripts", "scope.mjs");
const checker = path.join(here, "..", "skills", "assess-merge-risk", "scripts", "check-report.mjs");
const temps = [];
after(() => temps.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (repo, file, text) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
};

// main: a global stylesheet, a page and notes. feat: changes the stylesheet, adds a migration, renames the notes.
// main then changes the same stylesheet line, so the trial merge conflicts on it.
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assess-merge-risk-"));
  temps.push(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "T");
  write(dir, "src/styles/global.css", ".btn { padding: 8px; }\n");
  write(dir, "src/pages/Home.tsx", "export const Home = () => null;\n");
  write(dir, "notes.md", "one\ntwo\nthree\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "init");
  git(dir, "checkout", "-q", "-b", "feat");
  write(dir, "src/styles/global.css", ".btn { padding: 12px; }\n");
  write(dir, "db/migrations/002_drop_name.sql", "ALTER TABLE users DROP COLUMN name;\n");
  git(dir, "mv", "notes.md", "guide.md");
  fs.appendFileSync(path.join(dir, "guide.md"), "four\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "feat: change things");
  git(dir, "checkout", "-q", "main");
  write(dir, "src/styles/global.css", ".btn { padding: 4px; }\n");
  git(dir, "commit", "-q", "-am", "style: tighter buttons");
  return dir;
}

test("scope reports commits on each side, the conflict, the overlap and each file with its surfaces", () => {
  const dir = repo();
  const s = scope(dir, "feat", "main");
  assert.equal(s.sourceCommits.length, 1);
  assert.equal(s.targetCommits.length, 1);
  assert.deepEqual(s.conflicts, ["src/styles/global.css"]);
  assert.deepEqual(s.overlap, ["src/styles/global.css"]);
  assert.match(s.mergedTree, /^[0-9a-f]{40,64}$/);
  const byFile = Object.fromEntries(s.files.map((f) => [f.file, f]));
  assert.deepEqual(byFile["db/migrations/002_drop_name.sql"], { status: "A", file: "db/migrations/002_drop_name.sql", added: 1, deleted: 0, surfaces: ["migration"] });
  assert.equal(byFile["guide.md"].status, "R");
  assert.equal(byFile["guide.md"].from, "notes.md");
  assert.equal(byFile["guide.md"].added, 1);
  assert.deepEqual(byFile["src/styles/global.css"].surfaces, ["shared-ui", "ui"]);
  assert.deepEqual(s.totals, { files: 3, added: 3, deleted: 1 });
});

test("the merged tree holds the code as it will be after the merge", () => {
  const dir = repo();
  git(dir, "checkout", "-q", "-b", "clean", "main");
  write(dir, "src/pages/Home.tsx", "export const Home = () => 'home';\n");
  git(dir, "commit", "-q", "-am", "feat: home text");
  git(dir, "checkout", "-q", "main");
  write(dir, "src/pages/About.tsx", "export const About = () => null;\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "feat: about page");
  const s = scope(dir, "clean", "main");
  assert.deepEqual(s.conflicts, []);
  const grep = git(dir, "grep", "-l", "export const", s.mergedTree);
  assert.match(grep, /src\/pages\/About\.tsx/);
  assert.match(grep, /src\/pages\/Home\.tsx/);
});

test("scope gives each source branch its own report file in the git directory", () => {
  const dir = repo();
  git(dir, "branch", "feature/a-b", "feat");
  const a = scope(dir, "feature/a-b", "main");
  assert.equal(path.join(fs.realpathSync(path.dirname(a.reportPath)), path.basename(a.reportPath)), path.join(fs.realpathSync(dir), ".git", "assess-merge-risk-feature-a-b.md"));
  git(dir, "update-ref", "refs/remotes/origin/feature/a-b", "feat");
  assert.equal(scope(dir, "origin/feature/a-b", "main").reportPath, a.reportPath);
  assert.notEqual(scope(dir, "feat", "main").reportPath, a.reportPath);
});

test("scope names a missing repository as the cause", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assess-merge-risk-norepo-"));
  temps.push(dir);
  assert.throws(() => scope(dir, "feat", "main"), /not inside a git repository/);
});

const row = (n, sev, reach, level, evidence = "`src/a.css:1`", intent = "Stated (MR description)") => `| ${n} | outcome | who | ${sev} | ${reach} | ${level} | ${evidence} | ${intent} |`;
const TAIL = ["Intent: hide one button. Read: commit abc. Not available: None.", "Merge: No conflicts; no file changed on both sides", "Not verified: None.", "Advisories: None."];
// Before merging gets one Test item per High or S4 row, or None.
const before = (rows) => {
  const blocking = rows.map((r) => r.split("|").map((c) => c.trim())).filter((c) => /^High/.test(c[6]) || /^S4/.test(c[4])).map((c) => c[1]);
  return blocking.length ? ["Before merging:", ...blocking.map((n, k) => `${k + 1}. Finding ${n}. Test: add tests/x.test.mjs asserting the button shows.`)].join("\n") : "Before merging: None.";
};
const report = (overall, ...rows) => [`**Merge risk: ${overall}**: \`feat\` into \`main\``, "One sentence on the outcome.", ["| # | What users would see | Who | Severity | Reach | Level | Evidence | Intent |", "|---|---|---|---|---|---|---|---|", ...rows].join("\n"), ...TAIL, before(rows)].join("\n\n");
const files = { "src/a.css": 3 };
const lines = (file) => files[file] ?? null;

test("check-report accepts levels that follow the table and named adjustments", () => {
  assert.deepEqual(checkReport(report("High", row(1, "S3", "Wide", "High"), row(2, "S1", "Narrow", "Low")), lines), []);
  assert.deepEqual(checkReport(report("Medium", row(1, "S2", "Wide", "Medium (down: flag)")), lines), []);
  assert.deepEqual(checkReport(report("High", row(1, "S3", "Narrow", "High (up: irreversible)")), lines), []);
  assert.deepEqual(checkReport(report("Medium", row(1, "S4", "Wide", "Medium (down: flag, down: tested)")), lines), []);
  assert.deepEqual(checkReport(report("Low", row(1, "S2", "Narrow", "Low (down: tested)")), lines), []);
});

test("check-report names each wrong level, adjustment, overall level and citation", () => {
  const has = (text, re) => checkReport(text, lines).some((p) => re.test(p));
  assert.ok(has(report("Low", row(1, "S3", "Wide", "Low")), /S3 with Wide reach is High in the table; with no adjustments it is High, not Low/));
  assert.ok(has(report("Medium", row(1, "S4", "Narrow", "Medium (down: tested)")), /it is High, not Medium/));
  assert.ok(has(report("Medium", row(1, "S4", "Narrow", "High (down: conditional)")), /does not apply to S4/));
  assert.ok(has(report("Low", row(1, "S1", "Wide", "Low (down: maybe)")), /unknown adjustment "down: maybe"/));
  assert.ok(has(report("Low", row(1, "S1", "Feature", "Low (down: flag, down: flag)")), /named twice/));
  assert.ok(has(report("Low", row(1, "S3", "Wide", "High")), /overall level is Low but the highest finding is High/));
  assert.ok(has(report("Low", row(1, "S1", "Narrow", "Low", "`src/a.css:9`")), /src\/a\.css:9 is past the end of the file \(3 lines\)/));
  assert.ok(has(report("Low", row(1, "S1", "Narrow", "Low", "`src/gone.css:1`")), /src\/gone\.css is in neither/));
  assert.ok(has(report("Low", row(1, "S1", "Narrow", "Low", "none")), /cites no path:line/));
  assert.ok(has(report("Low", row(1, "S9", "Huge", "Low")), /Severity "S9"/));
  assert.ok(has(report("Low", row(1, "S1", "Narrow", "Low", "`src/a.css:1`", "intended")), /Intent "intended" must start with/));
  assert.ok(has(report("Low", row(1, "S1", "Narrow", "Low", "`src/a.css:1`", "Specified")), /Intent Specified must name its source/));
  assert.ok(has(report("Low", row(1, "S1", "Narrow", "Low", "`src/a.css:1`", "Contradicts (`docs/prd.md:2`)")), /docs\/prd\.md is in neither/));
  assert.deepEqual(checkReport(report("Low", row(1, "S1", "Narrow", "Low", "`src/a.css:1`", "Unexplained")), lines), []);
  assert.deepEqual(checkReport(report("Low", row(1, "S1", "Narrow", "Low", "`src/a.css:1`", "Contradicts (`src/a.css:2`)")), lines), []);
  assert.ok(has(report("High", row(1, "S1", "Narrow", "Low"), row(2, "S3", "Wide", "High")), /rows go from highest level down; High follows Low/));
  assert.ok(has("Merge risk is low", /first line must start with \*\*Merge risk/));
  assert.ok(has("**Merge risk: Low**", /no finding rows/));
});

test("structure: the template's blocks, once each, in order, with only Retracted optional", () => {
  const good = report("Low", row(1, "S1", "Narrow", "Low"));
  assert.deepEqual(structureProblems(good), []);
  const withRetracted = good.replace("\n\nAdvisories:", "\n\nRetracted: the header finding; the backend ignores the header.\n\nAdvisories:");
  assert.deepEqual(structureProblems(withRetracted), []);
  const has = (text, re) => structureProblems(text).some((p) => re.test(p));
  assert.ok(has(good.replace("\n\nAdvisories:", "\n\nHeader finding retracted. The backend ignores it.\n\nBefore merging:"), /unexpected block after the table: "Header finding retracted/));
  assert.ok(has(good.replace("Merge: No conflicts; no file changed on both sides\n\n", ""), /missing the Merge: block/));
  assert.ok(has(good.replace("Merge: No conflicts", "Not verified: x.\n\nMerge: No conflicts"), /Not verified: appears 2 times/));
  assert.ok(has(withRetracted.replace(/Not verified: None\.\n\n(Retracted: [^\n]+)/, "$1\n\nNot verified: None."), /template order/));
  assert.ok(has(good.replace("Not verified: None.", "Not verified:"), /Not verified: is empty/));
  assert.ok(has(good.replace(" Not available: None.", ""), /Intent: must include Read: and Not available:/));
  assert.ok(has(good.replace("Advisories: None.\n\n", ""), /missing the Advisories: block/));
  assert.ok(has(good.replace(/Advisories: None\.\n\n(Before merging: None\.)/, "$1\n\nAdvisories: None."), /Before merging must be the last block/));
  assert.ok(has(`${good}\n\nThanks!`, /unexpected block after the table: "Thanks!"/));
  assert.ok(has(good.replace("One sentence on the outcome.\n\n", ""), /second block must be the one- or two-sentence summary/));
  assert.ok(has(good.replace("| # | What users would see |", "| # | Outcome |"), /table header must be exactly/));
  assert.ok(has(good.replace("| 1 | outcome", "| 2 | outcome"), /row 1 must be numbered 1/));
  assert.ok(has(`---\n\n${good}`, /first block must be the \*\*Merge risk/));
});

test("tests and local checks: High and S4 findings block, the rest are advisories", () => {
  const cellsOf = (text) => text.split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  const problems = (text) => actionProblems(text, cellsOf(text));
  const high = report("High", row(1, "S3", "Wide", "High"), row(2, "S1", "Narrow", "Low"));
  assert.deepEqual(problems(high), []);
  const local = high.replace(/1\. Finding 1\. Test: [^\n]+/, "1. Finding 1. Local check: run `npm start`, open /billing; expect the Cancel button.");
  assert.deepEqual(problems(local), []);
  const advisory = high.replace("Advisories: None.", "Advisories:\n- Finding 2. Test: add tests/heading.test.mjs asserting the heading text.");
  assert.deepEqual(problems(advisory), []);
  assert.deepEqual(problems(advisory.replace("Advisories:\n-", "Advisories:\n\n-")), []);
  const s4 = report("Medium", row(1, "S4", "Wide", "Medium (down: flag)"));
  assert.ok(s4.includes("1. Finding 1. Test:"));
  assert.deepEqual(problems(s4), []);

  const has = (text, re) => problems(text).some((p) => re.test(p));
  assert.ok(has(high.replace(/Before merging:\n[\s\S]*$/, "Before merging: None."), /finding 1 is High or S4: "Before merging:" stands alone/));
  assert.ok(has(report("Low", row(1, "S1", "Narrow", "Low")).replace("Before merging: None.", "Before merging:\n1. Finding 1. Test: add x."), /no finding is High or S4/));
  assert.ok(has(high.replace("1. Finding 1. Test:", "1. Finding 2. Test:"), /finding 2 is neither High nor S4; move its test to Advisories/));
  assert.ok(has(high.replace("1. Finding 1. Test:", "1. Finding 2. Test:"), /finding 1 is High or S4 but no Before merging item clears it/));
  assert.ok(has(high.replace("1. Finding 1. Test:", "1. Finding 1. Run:"), /needs "Test:" .* or "Local check:"/));
  assert.ok(has(local.replace("; expect the Cancel button.", "."), /Local check states the expected result/));
  assert.ok(has(high.replace(/1\. Finding 1\. Test: [^\n]+/, "1. Finding 1. Local check: open the site in a browser; expect the button."), /names at least one command the developer runs/));
  assert.ok(has(high.replace("1. Finding 1.", "1. Fix 1."), /must start with "1\. Finding <n>\."/));
  assert.ok(has(advisory.replace("- Finding 2.", "- Finding 1."), /finding 1 is High or S4: its test belongs under Before merging/));
  assert.ok(has(advisory.replace("Test: add", "Open the page and"), /must propose an integration test with "Test:"/));
  assert.ok(has(advisory.replace("- Finding 2.", "- Finding 9."), /names finding 9, which is not in the table/));
  assert.ok(has(high.replace("Advisories: None.", "Advisories:\nOpen the page."), /is not a list item/));
});

test("retracted items name what cleared them, what was seen, and the assessed commit for a run", () => {
  const base = report("Low", row(1, "S1", "Narrow", "Low")).replace("**Merge risk: Low**: `feat` into `main`", "**Merge risk: Low**: `feat` into `main` (abc1234def onto 9999999aaa)");
  const withItem = (item) => base.replace("\n\nAdvisories:", `\n\nRetracted:\n${item}\n\nAdvisories:`);
  const ok = withItem("- Cancel does nothing if billing.js fails. Cleared by: Local check for finding 1, run on `abc1234` by the developer. Observed: the serve log showed POST /subscription/cancel.");
  assert.deepEqual(retractedProblems(ok), []);
  assert.deepEqual(structureProblems(ok), []);
  assert.deepEqual(retractedProblems(withItem("- The header breaks CORS. Cleared by: the backend team's review; the header is allowed. Observed: no middleware reads it.")), []);
  const has = (text, re) => retractedProblems(text).some((p) => re.test(p));
  assert.ok(has(ok.replace("run on `abc1234` by", "run by"), /name the source commit it ran on/));
  assert.ok(has(ok.replace("Local check for finding 1, run on `abc1234` by", "local check by"), /name the source commit it ran on/));
  assert.ok(has(ok.replace("`abc1234`", "`fff0000`"), /ran on fff0000, not the assessed source abc1234def; a run on another commit clears nothing/));
  assert.ok(has(ok.replace(" Observed: the serve log showed POST /subscription/cancel.", ""), /needs "Observed:"/));
  assert.ok(has(ok.replace("Cleared by: Local check for finding 1, run on `abc1234` by the developer.", "Fixed."), /needs "Cleared by:"/));
  assert.ok(has(withItem("The header finding was wrong."), /is not a list item/));
  assert.ok(has(base.replace("\n\nAdvisories:", "\n\nRetracted: None.\n\nAdvisories:"), /stands alone/));
});

test("check-report CLI reads files from the merged tree or the merge base", () => {
  const dir = repo();
  const s = scope(dir, "feat", "main");
  const file = path.join(dir, ".git", "assess-merge-risk.md");
  fs.writeFileSync(file, report("High", row(1, "S4", "Feature", "High (up: irreversible)", "`db/migrations/002_drop_name.sql:1`, `notes.md:3`")));
  const counted = lineCounter(dir, [s.mergedTree, s.mergeBase]);
  assert.equal(counted("notes.md"), 3);
  const ok = spawnSync(process.execPath, [checker, file, "--tree", s.mergedTree, "--base", s.mergeBase], { cwd: dir, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), "ok");
  fs.writeFileSync(file, report("Low", row(1, "S4", "Feature", "Low")));
  const bad = spawnSync(process.execPath, [checker, file, "--tree", s.mergedTree, "--base", s.mergeBase], { cwd: dir, encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /check-report: finding 1: S4 with Feature reach is High/);
  write(dir, ".agents/tasks/x/03-prd-x.md", "# PRD\n\n1. Keep names.\n");
  fs.writeFileSync(file, report("High", row(1, "S4", "Feature", "High", "`db/migrations/002_drop_name.sql:1`", "Contradicts (`.agents/tasks/x/03-prd-x.md:3`)")));
  const untracked = spawnSync(process.execPath, [checker, file, "--tree", s.mergedTree, "--base", s.mergeBase], { cwd: dir, encoding: "utf8" });
  assert.equal(untracked.status, 0, untracked.stderr);
  const usage = spawnSync(process.execPath, [checker, file], { cwd: dir, encoding: "utf8" });
  assert.match(usage.stderr, /--tree and --base are required/);
});

test("citations use pinned source and reject tracked-only, escaping and symlinked working files", () => {
  const dir = repo();
  const s = scope(dir, "feat", "main");
  const counted = lineCounter(dir, [s.mergedTree, s.mergeBase]);
  write(dir, "src/new-only.ts", "unreviewed\n");
  git(dir, "add", "src/new-only.ts");
  assert.equal(counted("src/new-only.ts"), null);
  write(dir, "src/styles/global.css", "working copy\n".repeat(30));
  assert.ok(counted("src/styles/global.css") < 30);
  write(dir, ".custom-tasks/review/source.md", "Local intent source\n");
  assert.equal(counted(".custom-tasks/review/source.md"), 1);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "merge-risk-outside-"));
  temps.push(outside);
  write(outside, "private.md", "not repository evidence\n");
  assert.equal(counted(path.join(outside, "private.md")), null);
  assert.equal(counted(path.relative(dir, path.join(outside, "private.md"))), null);
  fs.symlinkSync(path.join(outside, "private.md"), path.join(dir, "escaped.md"));
  assert.equal(counted("escaped.md"), null);
});

test("surfaces tag by path and fall back to code", () => {
  assert.deepEqual(surfaces("src/auth/session.ts"), ["auth"]);
  assert.deepEqual(surfaces("package.json"), ["dependency"]);
  assert.deepEqual(surfaces("api/openapi.yaml"), ["api-contract"]);
  assert.deepEqual(surfaces("src/components/ui/Button.tsx"), ["shared-ui", "ui"]);
  assert.deepEqual(surfaces("tests/button.test.mjs"), ["test"]);
  assert.deepEqual(surfaces("src/lib/math.ts"), ["code"]);
});

test("CLI prints a summary, JSON with --json, and exits 1 with the cause on a bad ref", () => {
  const dir = repo();
  const text = spawnSync(process.execPath, [script, "feat", "--target", "main"], { cwd: dir, encoding: "utf8" });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /conflicts src\/styles\/global\.css/);
  assert.match(text.stdout, /\[migration\]\n {2}A db\/migrations\/002_drop_name\.sql \+1 -0/);
  assert.match(text.stdout, /next: write the report to \S+assess-merge-risk-feat\.md, then run until it prints ok:\n {2}node \S+check-report\.mjs \S+assess-merge-risk-feat\.md --tree [0-9a-f]{40} --base [0-9a-f]{40}\n?$/);
  const json = spawnSync(process.execPath, [script, "feat", "--json"], { cwd: dir, encoding: "utf8" });
  assert.equal(JSON.parse(json.stdout).target, "main");
  const bad = spawnSync(process.execPath, [script, "nope"], { cwd: dir, encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /"nope" does not name a commit/);
});

test("eval grader reads the level and requires the side-effect pages", () => {
  assert.equal(replyLevel("**Merge risk: High**: `a` into `main`"), "high");
  assert.equal(replyLevel("Merge risk: **Low**"), "low");
  assert.equal(replyLevel("no level"), null);
  const high = "**Merge risk: High**: hides Delete account on site/settings.html:6 and Cancel subscription on site/billing.html:6.";
  assert.deepEqual(riskProblems(high, { level: "high", mentions: ["settings.html", "billing.html"] }), []);
  assert.ok(riskProblems(high.replace("High", "Medium"), { level: "high" }).some((p) => /rates medium, expected high/.test(p)));
  assert.ok(riskProblems("**Merge risk: High**", { level: "high", mentions: ["billing.html"] }).some((p) => /names billing\.html/.test(p)));
  const contra = "**Merge risk: High**\n\n| 1 | No way to cancel | Subscribers | S3 | Feature | High | `site/billing.html:6` | Contradicts (`docs/prd/billing.md:6`) |";
  assert.deepEqual(riskProblems(contra, { level: "high", contradicts: "docs/prd/billing.md" }), []);
  assert.ok(riskProblems(contra.replace("Contradicts", "Stated"), { level: "high", contradicts: "docs/prd/billing.md" }).some((p) => /no finding is marked Contradicts/.test(p)));
  const cleared = "**Merge risk: Low**\n\n| 1 | Asks first | Subscribers | S1 | Feature | Low | `site/billing.js:4` | Stated (commit) |\n\nRetracted:\n- Cancel does nothing. Cleared by: Local check on `abcdef1234`. Observed: POST seen.\n\nAdvisories: None.\n\nBefore merging: None.";
  assert.deepEqual(riskProblems(cleared, { level: "low", retracted: "abcdef1234567", rows: 1 }), []);
  assert.ok(riskProblems(cleared.replace("`abcdef1234`", "`0000000`"), { level: "low", retracted: "abcdef1234567", rows: 1 }).some((p) => /no Retracted item clears a finding/.test(p)));
  assert.ok(riskProblems(cleared.replace("Before merging: None.", "Before merging:\n1. Finding 1. Test: x."), { level: "low", retracted: "abcdef1234567", rows: 1 }).some((p) => /Before merging still lists a check/.test(p)));
  assert.ok(riskProblems(cleared, { level: "low", retracted: "abcdef1234567", rows: 2 }).some((p) => /1 findings left, expected 2/.test(p)));
  for (const call of ["glab mr note 1 -m hi", "gh pr comment 1 --body hi"]) {
    assert.ok(riskProblems("**Merge risk: Low**", { level: "low", calls: [call] }).some((p) => /host write/.test(p)));
  }
});

test("eval setup builds every branch from main and leaves HEAD on main", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assess-merge-risk-eval-"));
  temps.push(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "T");
  git(dir, "commit", "-q", "--allow-empty", "-m", "init");
  const [first, second, third, fourth, fifth] = scenario.phases.map((p) => p.setup({ repo: dir }));
  assert.equal(first.main, fourth.main);
  assert.equal(first.main, fifth.main);
  assert.match(git(dir, "show", `${fifth.branch}:site/billing.js`), /window\.confirm/);
  // The seeded report sits where scope.mjs points and passes the checker as the first assessment would have left it.
  const s5 = scope(dir, fifth.branch, "main");
  assert.equal(fs.realpathSync(fifth.report), fs.realpathSync(s5.reportPath));
  assert.equal(fs.readFileSync(fifth.report, "utf8"), seededReport(fifth.tip, fifth.main));
  assert.deepEqual(checkReport(fs.readFileSync(fifth.report, "utf8"), lineCounter(dir, [s5.mergedTree, s5.mergeBase])), []);
  const removed = git(dir, "diff", "main", fourth.branch);
  assert.match(removed, /-.*Cancel subscription<\/button>/);
  assert.match(removed, /\+.*contact support/);
  assert.match(git(dir, "show", "main:docs/prd/billing.md"), /cancel their subscription from the billing page/);
  assert.equal(git(dir, "rev-parse", "--abbrev-ref", "HEAD"), "main");
  assert.equal(first.main, second.main);
  assert.equal(first.main, third.main);
  assert.match(git(dir, "diff", "main", third.branch), /\+body \{[^}]*font-size: 18px; \}/);
  assert.match(git(dir, "diff", "main", first.branch), /\+\.btn-danger \{ display: none; \}/);
  assert.match(git(dir, "diff", "main", second.branch), /\+<h1>Archived items<\/h1>/);
  assert.match(git(dir, "grep", "-l", "btn-danger", "main", "--", "site/*.html"), /settings\.html[\s\S]*billing\.html|billing\.html[\s\S]*settings\.html/);
});
