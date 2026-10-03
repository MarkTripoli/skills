import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { checkSkillPractices } from "../scripts/check-skill-practices.mjs";

const temps = [];
after(() => temps.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const GOOD = { name: "demo-skill", description: "Checks demo things. Use when the user runs /demo-skill.", body: "# Demo\n\nDo the thing.\n" };

// Builds skills/demo-skill/ from overrides and extra files; returns the failures of one rule.
async function run(rule, { files = {}, dir = "demo-skill", ...over } = {}, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "practices-"));
  temps.push(root);
  const s = { ...GOOD, ...over };
  const write = (rel, text) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  write(`skills/${dir}/SKILL.md`, `---\nname: ${s.name}\ndescription: ${s.description}\n---\n\n${s.body}`);
  for (const [rel, text] of Object.entries(files)) write(`skills/${dir}/${rel}`, text);
  for (const [rel, text] of Object.entries(extra)) write(rel, text);
  const result = await checkSkillPractices(root);
  return result.failures.filter((f) => f.rule === rule);
}

test("frontmatter-yaml: passes a plain description; fails a mid-value colon-space that YAML reads as a nested mapping", async () => {
  assert.deepEqual(await run("frontmatter-yaml"), []);
  assert.deepEqual(await run("frontmatter-yaml", { description: '"Plans work: then builds it. Use when asked."' }), [], "a quoted value may hold a colon-space");
  assert.ok((await run("frontmatter-yaml", { description: "Plans work: then builds it. Use when asked." })).length > 0);
});

const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n");

test("name: passes a kebab-case name", async () => assert.deepEqual(await run("name"), []));
for (const bad of ["x".repeat(65), "Demo_Skill", "claude-helper", "my-anthropic-tool", "a<b>"]) {
  test(`name: fails ${bad.slice(0, 20)}`, async () => assert.ok((await run("name", { name: bad })).length > 0));
}

test("description: passes third person with Use when", async () => assert.deepEqual(await run("description"), []));
test("description: allows i.e., I/O and a quoted user phrase; still fails a bare I", async () => {
  for (const ok of ["Checks things, i.e. demos. Use when asked.", "Profiles disk I/O. Use when asked.", 'Reviews diffs. Use when a user asks "can you review this".']) assert.deepEqual(await run("description", { description: ok.includes('"') ? `'${ok}'` : ok }), [], ok);
  assert.equal((await run("description", { description: "Then I run. Use when asked." })).length, 1);
});
for (const bad of ["", "x".repeat(1025), "Does <b>things</b>. Use when asked.", "I can help. Use when asked.", "Helps you. Use when asked.", "Use your tools. Use when asked.", "We check. Use when asked.", "Checks our code. Use when asked."]) {
  test(`description: fails ${JSON.stringify(bad.slice(0, 24))}`, async () => assert.ok((await run("description", { description: bad })).length > 0));
}

test("body-lines: passes 499 lines, fails 500", async () => {
  assert.deepEqual(await run("body-lines", { body: lines(480) }), []);
  assert.deepEqual(await run("body-lines", { body: `${lines(498)}\n` }), [], "the blank line after the frontmatter counts; the trailing newline is not a line");
  assert.equal((await run("body-lines", { body: `${lines(499)}\n` })).length, 1);
  assert.equal((await run("body-lines", { body: lines(500) })).length, 1);
});

test("nested-reference: passes when SKILL.md links both, fails when it links only one", async () => {
  const files = { "references/a.md": "See [b](b.md).\n", "references/b.md": "Leaf.\n" };
  assert.deepEqual(await run("nested-reference", { files, body: "Read `references/a.md` and `references/b.md`.\n" }), []);
  const [f] = await run("nested-reference", { files, body: "Read [a](references/a.md).\n" });
  assert.equal(f.path, "skills/demo-skill/references/a.md");
  assert.equal(f.line, 1);
});

test("nested-reference: fails a link into another skill's references and a link from an html reference", async () => {
  const other = { "skills/other/SKILL.md": "---\nname: other\ndescription: Does it. Use when asked.\n---\n\nRead `references/x.md`.\n", "skills/other/references/x.md": "Leaf.\n" };
  const [f] = await run("nested-reference", { files: { "references/a.md": "See [x](../../other/references/x.md).\n" }, body: "Read `references/a.md`.\n" }, other);
  assert.equal(f.path, "skills/demo-skill/references/a.md");
  const files = { "references/a.html": "<p>see `references/b.md`</p>\n", "references/b.md": "Leaf.\n" };
  assert.equal((await run("nested-reference", { files, body: "Read `references/a.html`.\n" })).length, 1);
});

test("nested-reference: a root path containing references/ does not make links out of references/ cross-skill", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "practices-"));
  temps.push(root);
  const base = path.join(root, "references", "r");
  fs.mkdirSync(path.join(base, "skills/demo-skill/references"), { recursive: true });
  fs.writeFileSync(path.join(base, "skills/demo-skill/SKILL.md"), "---\nname: demo-skill\ndescription: Checks demo things. Use when the user runs /demo-skill.\n---\n\nRead `references/a.md`.\n");
  fs.writeFileSync(path.join(base, "skills/demo-skill/references/a.md"), "See [s](../SKILL.md).\n");
  assert.deepEqual((await checkSkillPractices(base)).failures.filter((f) => f.rule === "nested-reference"), []);
});

test("nested-reference: a backticked references/ path counts as a link", async () => {
  const files = { "references/a.md": "Then `references/b.md`.\n", "references/b.md": "Leaf.\n" };
  assert.equal((await run("nested-reference", { files, body: "Read `references/a.md`.\n" })).length, 1);
});

test("reference-toc: passes short files, long files with a contents list and templates; fails a long bare file", async () => {
  const body = "Read `references/r.md` and `references/x_template.md`.\n";
  assert.deepEqual(await run("reference-toc", { files: { "references/r.md": lines(100) }, body }), []);
  assert.deepEqual(await run("reference-toc", { files: { "references/r.md": `# R\n\n## Contents\n- a\n\n${lines(120)}` }, body }), []);
  assert.deepEqual(await run("reference-toc", { files: { "references/x_template.md": lines(150) }, body }), []);
  assert.deepEqual(await run("reference-toc", { files: { "references/x_final_answer.md": lines(150) }, body }), []);
  assert.deepEqual(await run("reference-toc", { files: { "references/r.md": `${lines(100)}\n` }, body }), [], "100 lines with a trailing newline");
  assert.equal((await run("reference-toc", { files: { "references/r.md": `${lines(101)}\n` }, body })).length, 1);
});

test("windows-path: passes forward slashes, fails a backslash path", async () => {
  assert.deepEqual(await run("windows-path", { body: "Run `scripts/x.py`.\n" }), []);
  assert.deepEqual(await run("windows-path", { body: "Match `\\d+` and `\\b`.\n" }), []);
  assert.equal((await run("windows-path", { body: "Run `scripts\\x.py`.\n" })).length, 1);
});

test("time-sensitive: passes a plain date-free rule and dates inside details or Old patterns; fails a dated rule", async () => {
  assert.deepEqual(await run("time-sensitive", { body: "Use the v2 API.\n" }), []);
  assert.deepEqual(await run("time-sensitive", { body: "<details>\n<summary>Legacy (deprecated August 2025)</summary>\nOld.\n</details>\n" }), []);
  assert.deepEqual(await run("time-sensitive", { body: "## Old patterns\n\nChanged in September 2026.\n\n## Next\n" }), []);
  assert.equal((await run("time-sensitive", { body: "Before August 2025, use the old API.\n" })).length, 1);
  assert.equal((await run("time-sensitive", { body: "Checked September 2026.\n" })).length, 1);
  assert.equal((await run("time-sensitive", { body: "Valid as of 2026.\n" })).length, 1);
  assert.equal((await run("time-sensitive", { body: "## Old patterns\n\n## Current\n\nSince March 2026 it works.\n" })).length, 1);
});

test("time-sensitive and windows-path: no false positives on quantities, fenced dates and escaped dots", async () => {
  assert.deepEqual(await run("time-sensitive", { body: "Retry after 2000 ms; stop at until 2048 tokens.\n\n```\nreleased March 2026\n```\n" }), []);
  assert.deepEqual(await run("windows-path", { body: "Match `api\\.github\\.com`.\n" }), []);
});

test("runtime-mcp-name: passes <server>:<tool>, fails mcp__ names", async () => {
  assert.deepEqual(await run("runtime-mcp-name", { body: "Call `<server>:get_issue`.\n" }), []);
  assert.equal((await run("runtime-mcp-name", { body: "Call mcp__jira__get_issue.\n" })).length, 1);
});

test("script-intent: passes a named script and a test file; fails an unnamed script", async () => {
  const files = { "scripts/run.mjs": "//\n", "scripts/test_run.py": "#\n", "scripts/run.test.mjs": "//\n", "scripts/test-run.mjs": "//\n" };
  assert.deepEqual(await run("script-intent", { files, body: "Run `node scripts/run.mjs`.\n" }), []);
  assert.deepEqual(await run("script-intent", { files, body: "Run `node scripts/run.mjs`.\n" }), []);
  const [f] = await run("script-intent", { files, body: "Nothing here.\n" });
  assert.equal(f.path, "skills/demo-skill/scripts/run.mjs");
});

test("script-intent: a substring of another file name does not count as naming", async () => {
  const [f] = await run("script-intent", { files: { "scripts/x.py": "#\n", "scripts/index.py": "#\n" }, body: "Run `node scripts/index.py`.\n" });
  assert.equal(f.path, "skills/demo-skill/scripts/x.py");
});

test("script-intent: a reference may name the script", async () => {
  assert.deepEqual(await run("script-intent", { files: { "scripts/run.mjs": "//\n", "references/r.md": "Run scripts/run.mjs.\n" }, body: "See `references/r.md`.\n" }), []);
});

test("emphasis: passes plain rules, code fences, inline code and quoted strings; fails bare words", async () => {
  assert.deepEqual(await run("emphasis", { body: "Do it.\n\n```\nNEVER do this\n```\n\nThe fixture says `MUST` and \"ALWAYS\".\n" }), []);
  assert.equal((await run("emphasis", { body: "You MUST do it.\n" })).length, 1);
  for (const word of ["CRITICAL", "IMPORTANT", "NEVER", "ALWAYS"]) assert.equal((await run("emphasis", { body: `${word}: stop.\n` })).length, 1);
  assert.equal((await run("emphasis", { body: "Read `references/r.md`.\n", files: { "references/r.md": "NEVER skip.\n" } })).length, 1);
});

test("eval-coverage: passes a covered skill and an exempt skill; fails an uncovered skill", async () => {
  const scenario = (skill) => ({ "evals/scenarios/s.mjs": `export default { phases: [{ skill: ${JSON.stringify(skill)} }] };\n` });
  assert.deepEqual(await run("eval-coverage", {}, scenario("demo-skill")), []);
  assert.equal((await run("eval-coverage", {}, scenario("other"))).length, 1);
  assert.deepEqual(await run("eval-coverage", { dir: "land-pr-stack", name: "land-pr-stack", description: "Lands. Use when asked." }, scenario("other")), []);
  assert.deepEqual(await run("eval-coverage", {}, { "evals/scenarios/s.mjs": 'export default { covers: ["demo-skill"], phases: [{ skill: "other" }] };\n' }), [], "a scenario's covers counts");
  assert.deepEqual(await run("eval-coverage", {}, { "evals/scenarios/s.mjs": 'export default { phases: [{ skill: "other", covers: ["demo-skill"] }] };\n' }), [], "a phase's covers counts");
});

test("eval-coverage: skipped when the tree has no evals/scenarios", async () => assert.deepEqual(await run("eval-coverage"), []));

test("CLI: exits 1 with path:line: rule lines, and --json is machine-readable", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "practices-cli-"));
  temps.push(root);
  fs.mkdirSync(path.join(root, "skills", "bad"), { recursive: true });
  fs.writeFileSync(path.join(root, "skills", "bad", "SKILL.md"), "---\nname: bad\ndescription: I help.\n---\n\nBody.\n");
  const script = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "scripts", "check-skill-practices.mjs");
  const text = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
  assert.equal(text.status, 1);
  assert.match(text.stderr, /^skills\/bad\/SKILL\.md:3: description: .* \(Writing effective descriptions\)$/m);
  const json = spawnSync(process.execPath, [script, "--root", root, "--json"], { encoding: "utf8" });
  assert.equal(json.status, 1);
  assert.equal(JSON.parse(json.stdout).failures[0].rule, "description");
});
