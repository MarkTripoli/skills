import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { artifacts, newest } from "../evals/lib.mjs";
import { initTaskArtifacts, reserveArtifactIteration, recordArtifact } from "../shared/task-artifacts.mjs";
import { verdictProblems } from "../evals/deliver-grade.mjs";

test("resumeProblems wants the recorded unblock check rerun, the status read, no rebuild and a stop that moved on", async () => {
  const { resumeProblems } = await import("../evals/scenarios/deliver-resume.mjs");
  const status = (check) => `---\nslug: x\n---\nreq\n\n## Status\nblocked: something; unblock check: \`${check}\`\n\n## Decisions\n`;
  const before = [{ file: "task.md", text: status("git remote get-url origin") }];
  const bash = (command) => ({ name: "bash", args: { command } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-sessions-"));
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-task-"));
  const setStatus = (check) => fs.writeFileSync(path.join(taskDir, "task.md"), status(check));
  const write = (calls) => fs.writeFileSync(path.join(dir, "s.jsonl"), [{ type: "session", id: "s", timestamp: "2026-09-30T00:00:00Z" }, ...calls.map((c) => ({ type: "message", timestamp: "2026-09-30T00:00:01Z", message: { role: "assistant", content: [{ type: "toolCall", name: c.name, arguments: c.args }] } }))].map((r) => JSON.stringify(r)).join("\n"));
  const good = [bash("node /d/deliver/contract.mjs status .agents/tasks/x"), bash("git remote   get-url origin")];
  const problems = (extra = {}) => resumeProblems({ live: false, before, sessionDir: dir, taskDir, ...extra });
  write(good);
  setStatus("gh auth status");
  assert.deepEqual(problems(), []);
  // A dot inside the backticked check belongs to the command: two checks that differ only after it are different checks.
  write([bash("node /d/deliver/contract.mjs status t"), bash("git config --get remote.origin.url")]);
  const dotted = [{ file: "task.md", text: status("git config --get remote.origin.url") }];
  setStatus("git config --get remote.upstream.url");
  assert.deepEqual(problems({ before: dotted }), []);
  setStatus("git config --get remote.origin.url");
  assert.ok(problems({ before: dotted }).some((p) => p.includes("the stop did not move on")));
  setStatus("test -f .git/config");
  assert.ok(problems({ before: [{ file: "task.md", text: status("test -f .git/HEAD") }] }).every((p) => !p.includes("did not move on")));
  // The whole stop in one code span, as deliver_answer.md shows it: the command carries no stray backtick, in grade and live mode.
  write(good);
  const wrapped = (check) => `---\nslug: x\n---\nreq\n\n## Status\n\`blocked: no remote; unblock check: ${check}\`\n\n## Decisions\n`;
  setStatus("gh auth status");
  assert.deepEqual(problems({ before: [{ file: "task.md", text: wrapped("git remote get-url origin") }] }), []);
  fs.writeFileSync(path.join(taskDir, "task.md"), wrapped("gh auth status"));
  assert.deepEqual(problems({ before: [{ file: "task.md", text: wrapped("git remote get-url origin") }] }), []);
  fs.writeFileSync(path.join(taskDir, "task.md"), wrapped("git remote get-url origin"));
  assert.ok(problems({ before: [{ file: "task.md", text: wrapped("git remote get-url origin") }] }).some((p) => p.includes("did not move on")));
  setStatus("gh auth status");
  write(good);
  // The stale stop: the run reran its check, saw it pass and wrote the same stop again.
  setStatus("git remote get-url origin");
  assert.ok(problems().some((p) => p.includes("the stop did not move on")));
  fs.rmSync(path.join(taskDir, "task.md"));
  assert.ok(problems().some((p) => p.includes("records no unblock check")));
  setStatus("gh auth status");
  write([bash("node /d/deliver/contract.mjs status t")]);
  assert.ok(problems().some((p) => p.includes("reran the recorded unblock check")));
  write([bash("git remote get-url origin")]);
  assert.ok(problems().some((p) => p.includes("contract.mjs status")));
  write([...good, bash('git commit -m "fix: again"')]);
  assert.ok(problems().some((p) => p.includes("ran git commit")));
  assert.ok(resumeProblems({ live: false, before: [{ file: "task.md", text: "## Status\nblocked: x\n" }], sessionDir: dir, taskDir }).some((p) => p.includes("no unblock check command")));
  // Live: HEAD where the first run left it, and the old check passing now that the remote exists.
  write(good);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "resume-repo-"));
  const git = (...argv) => spawnSync("git", argv, { cwd: repo, encoding: "utf8" }).stdout.trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "e@example.com");
  git("config", "user.name", "E");
  git("commit", "-q", "--allow-empty", "-m", "chore: a");
  const head = git("rev-parse", "HEAD");
  const liveBefore = [{ file: "task.md", text: status("test -d .git") }];
  assert.deepEqual(resumeProblems({ live: true, before: liveBefore, sessionDir: dir, taskDir, repo, setup: { head } }).filter((p) => !p.includes("reran the recorded")), []);
  git("commit", "-q", "--allow-empty", "-m", "chore: b");
  assert.ok(resumeProblems({ live: true, before: liveBefore, sessionDir: dir, taskDir, repo, setup: { head } }).some((p) => p.includes("HEAD moved")));
  // A dotted check that passes once the remote exists runs whole, in an environment without the operator's Slack.
  git("remote", "add", "origin", "/tmp/elsewhere.git");
  const dottedLive = [{ file: "task.md", text: status("git config --get remote.origin.url") }];
  assert.ok(!resumeProblems({ live: true, before: dottedLive, sessionDir: dir, taskDir, repo, setup: { head: git("rev-parse", "HEAD") } }).some((p) => p.includes("still fails")));
  const envProbe = [{ file: "task.md", text: status('test -z "$SLACK_BOT_OAUTH_TOKEN"') }];
  process.env.SLACK_BOT_OAUTH_TOKEN = "x";
  try {
    assert.ok(!resumeProblems({ live: true, before: envProbe, sessionDir: dir, taskDir, repo, setup: { head: git("rev-parse", "HEAD") } }).some((p) => p.includes("still fails")), "the check runs without the operator's Slack variables");
  } finally {
    delete process.env.SLACK_BOT_OAUTH_TOKEN;
  }
  const wrappedLive = [{ file: "task.md", text: wrapped("test -d .git") }];
  assert.ok(!resumeProblems({ live: true, before: wrappedLive, sessionDir: dir, taskDir, repo, setup: { head: git("rev-parse", "HEAD") } }).some((p) => p.includes("still fails")), "the wrapped check runs without a stray backtick");
  const failing = [{ file: "task.md", text: status("false") }];
  assert.ok(resumeProblems({ live: true, before: failing, sessionDir: dir, taskDir, repo, setup: { head: git("rev-parse", "HEAD") } }).some((p) => p.includes("still fails (exit 1)")));
  for (const d of [dir, taskDir, repo]) fs.rmSync(d, { recursive: true, force: true });
});

test("activeReservation reads an escaped pipe inside a step cell as part of that cell", async () => {
  const { activeReservation } = await import("../evals/iterate-evidence.mjs");
  const base = "---\nstatus: in-progress\nstop_reason: none\nconsumed_rounds: 1\nlimit: 3\n---\n### Round 1\n- Reservation persisted at: this boundary before mutation.\n- Consumed count / authorized limit: 1 / 3.\n- Attempted finding IDs: IE-001.\n- Current step: repair pending.";
  const table = (cell) => `${base}\n\n| Step | State |\n|---|---|\n| Repair | ${cell} |\n`;
  assert.equal(activeReservation(table("pending"), 1, 3, "IE-001", true), true);
  assert.equal(activeReservation(table("pending \\| done"), 1, 3, "IE-001", true), false, "the cell says done after the pipe");
});

test("a redirect heuristic does not mistake an arrow function or a require for a write", async () => {
  const { wrote } = await import("../evals/sessions.mjs");
  const bash = (command) => ({ calls: [{ name: "bash", args: { command } }] });
  assert.equal(wrote(bash(`node -e 'import("./a.mjs").then(r=>import("./src/timeout.mjs"))'`), "src/timeout.mjs"), false);
  assert.equal(wrote(bash("echo x > src/timeout.mjs"), "src/timeout.mjs"), true);
  assert.equal(wrote(bash("echo x | tee -a ./src/timeout.mjs"), "src/timeout.mjs"), true);
  assert.equal(wrote(bash("cat a >> 'src/timeout.mjs'; ls"), "src/timeout.mjs"), true);
});

test("skillLoadProblems binds safe shell readers to successful complete output and rejects unresolved or foreign provenance", async (t) => {
  const { readSessions, skillLoadProblems } = await import("../evals/sessions.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-reader-sessions-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const skill = "---\nname: review-code\ndescription: Review the change.\n---\n\n# Review Code\nInspect the diff and record findings.\n";
  const check = (command, { text = skill, isError = false, exitCode = 0, receipt = true } = {}) => {
    const events = [
      { type: "session", id: "r", parentSession: "parent.jsonl" },
      { type: "session_init", agent: "agent-implementation-reviewer" },
      { type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "read-skill", name: "bash", arguments: { command } }] } },
      ...(receipt ? [{ type: "message", message: { role: "toolResult", toolCallId: "read-skill", isError, details: { exitCode }, content: [{ type: "text", text }] } }] : []),
    ];
    fs.writeFileSync(path.join(dir, "r.jsonl"), events.map((event) => JSON.stringify(event)).join("\n"));
    return skillLoadProblems({ sessions: readSessions(dir), names: ["review-code"] });
  };
  const command = "S=/x/results/1/.dist/skills; cat $S/review-code/SKILL.md $S/review-code/references/t.md";
  assert.deepEqual(check(command, { text: `${skill}\n# Template\nRecord findings.\n\n\nWall time: 0.00 seconds` }), []);
  assert.deepEqual(check("cat .omp/skills/review-code/SKILL.md"), []);
  assert.deepEqual(check('S="/x/results/1/.dist/skills" && cat "${S}/review-code/SKILL.md"'), []);
  for (const result of [{ receipt: false }, { isError: true }, { exitCode: 1 }, { text: ".omp/skills/review-code/SKILL.md" }, { text: `${skill}\n[Output truncated]` }]) {
    assert.ok(check("cat .omp/skills/review-code/SKILL.md", result).some((p) => p.includes("no child session completely read")), JSON.stringify(result));
  }
  for (const opaque of [
    "cat .omp/skills/review-code/SKILL.md | head -c 100",
    "cat .omp/skills/review-code/SKILL.md; printf done",
    "echo .omp/skills/review-code/SKILL.md",
    "node -e 'require(\"fs\").readFileSync(\".omp/skills/review-code/SKILL.md\")'",
    "S=/x/.dist/skills; cat '$S/review-code/SKILL.md'",
    "cat .omp/skills/review-code/references/t.md .omp/skills/review-code/SKILL.md",
    "cat .omp/skills/review-code/SKILL.md .omp/skills/verify-implementation/SKILL.md",
    "cat $(echo .omp/skills/review-code/SKILL.md)",
  ]) assert.ok(check(opaque).some((p) => p.includes("no child session completely read")), opaque);
  assert.ok(check("cat $SKILLS/review-code/SKILL.md").some((p) => p.includes("$SKILLS/review-code/SKILL.md")));
  assert.ok(check("cat $ROOT/.dist/skills/review-code/SKILL.md").some((p) => p.includes("$ROOT/.dist/skills/review-code/SKILL.md")));
  assert.ok(check("S=/home/u/.omp/agent/skills && cat ${S}/review-code/SKILL.md").some((p) => p.includes("/home/u/.omp/agent/skills/review-code/SKILL.md")));
});

test("the evidence subject's environment keeps Slack out of reach in both shapes, and the stub directory is removed after", async () => {
  const { isolatedEnv, disposeIsolatedEnv } = await import("../evals/lib.mjs");
  const { subjectEnvironment } = await import("../evals/iterate-evidence.mjs");
  const isolated = isolatedEnv({ PATH: "/usr/bin", SLACK_BOT_OAUTH_TOKEN: "x", SLACK_AGENT_BOT_TOKEN: "y", KEEP: "1" });
  const shapes = [
    subjectEnvironment({ isolated, observer: "/o.json", pauseFile: "/p" }),
    subjectEnvironment({ isolated, observer: "/o.json", blocked: true, home: "/h", credential: { name: "ANTHROPIC_OAUTH_TOKEN", token: "t" }, playwright: "/pw" }),
  ];
  for (const env of shapes) {
    assert.deepEqual(Object.keys(env).filter((k) => /^SLACK_(?!AGENT_ENV_FILE$)/i.test(k)), []);
    assert.equal(env.SLACK_AGENT_ENV_FILE, isolated.SLACK_AGENT_ENV_FILE);
    const stub = path.join(env.PATH.split(path.delimiter)[0], "slack-coordinator");
    assert.equal(spawnSync(stub, { encoding: "utf8" }).status, 1, "the first slack-coordinator on PATH fails");
    assert.ok(!fs.existsSync(env.SLACK_AGENT_ENV_FILE));
  }
  assert.equal(shapes[0].ITERATE_EVIDENCE_CAPTURE_PAUSE, "/p");
  assert.equal(shapes[1].ANTHROPIC_OAUTH_TOKEN, "t");
  assert.equal(shapes[1].KEEP, undefined, "the isolated viewer case keeps none of the operator's environment");
  const stubs = path.dirname(isolated.SLACK_AGENT_ENV_FILE);
  assert.ok(fs.existsSync(stubs));
  disposeIsolatedEnv(isolated);
  assert.ok(!fs.existsSync(stubs));
  disposeIsolatedEnv({ SLACK_AGENT_ENV_FILE: "/tmp/other/file" });
  assert.ok(fs.existsSync("/tmp"), "a directory that is not a no-slack stub is never removed");
});

test("spawnIsolated removes the no-slack stub directory when the process ends, and both runners use it", async () => {
  const { isolatedEnv, spawnIsolated } = await import("../evals/lib.mjs");
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "fake-omp-"));
  fs.writeFileSync(path.join(bin, "omp"), "#!/bin/sh\necho ran\n", { mode: 0o755 });
  const isolated = isolatedEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  const stubs = path.dirname(isolated.SLACK_AGENT_ENV_FILE);
  assert.ok(fs.existsSync(stubs));
  let out = "";
  const child = spawnIsolated("omp", [], { env: isolated, isolated, stdio: ["ignore", "pipe", "ignore"] });
  child.stdout.on("data", (d) => (out += d));
  await new Promise((resolve) => child.once("close", resolve));
  assert.equal(out.trim(), "ran");
  assert.ok(!fs.existsSync(stubs), "the stub directory is gone after close");
  // A command that cannot start is cleaned up too.
  const missing = isolatedEnv({ PATH: bin });
  const failing = spawnIsolated("definitely-not-a-command", [], { env: missing, isolated: missing, stdio: "ignore" });
  failing.on("error", () => {});
  await new Promise((resolve) => failing.once("error", resolve));
  assert.ok(!fs.existsSync(path.dirname(missing.SLACK_AGENT_ENV_FILE)));
  fs.rmSync(bin, { recursive: true, force: true });
});

test("grading a whole run skips an evidence scenario it never recorded", async () => {
  const { gradeEvidenceScenario } = await import("../evals/iterate-evidence.mjs");
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-"));
  const result = await gradeEvidenceScenario({ name: "iterate-evidence", phases: [{ skill: "iterate-evidence" }] }, runDir);
  fs.rmSync(runDir, { recursive: true, force: true });
  assert.equal(result.skipped, true);
  assert.equal(result.ok, true);
});

test("a failed citation check names the fact, not [object Object]", async () => {
  const { cited } = await import("../evals/acme-chain.mjs");
  const { expect } = await import("../evals/lib.mjs");
  const matcher = cited("60 requests per minute");
  assert.ok(matcher.test("The limit is 60 requests per minute (acme-status-api.md).\n\nOther."));
  const problem = expect.matches("research: vendor rate limit", "Nothing relevant.", matcher);
  assert.match(problem, /paragraph that states 60 requests per minute/);
  assert.doesNotMatch(problem, /object Object/);
});

test("ompShim sends a nested omp session to its own directory and leaves the runner's own call alone", async () => {
  const { ompShim } = await import("../evals/lib.mjs");
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "fake-omp-"));
  const nested = path.join(bin, "nested");
  fs.writeFileSync(path.join(bin, "omp"), "#!/bin/sh\nprintf '%s\\n' \"$@\"\n", { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  const shim = ompShim(nested, env);
  const run = (...argv) => spawnSync(path.join(shim, "omp"), argv, { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  assert.deepEqual(run("-p", "--model", "m", "go"), ["--session-dir", nested, "-p", "--model", "m", "go"]);
  assert.deepEqual(run("-p", "--session-dir", "/elsewhere", "go"), ["-p", "--session-dir", "/elsewhere", "go"]);
  assert.ok(fs.existsSync(nested));
  fs.rmSync(bin, { recursive: true, force: true });
  fs.rmSync(shim, { recursive: true, force: true });
});

test("live evals run without the operator's Slack", async () => {
  const { isolatedEnv } = await import("../evals/lib.mjs");
  const env = isolatedEnv({ PATH: "/usr/bin", SLACK_BOT_OAUTH_TOKEN: "x", SLACK_AGENT_BOT_TOKEN: "y", KEEP: "1" });
  const [stubs, rest] = env.PATH.split(path.delimiter);
  assert.equal(rest, "/usr/bin");
  assert.equal(env.KEEP, "1");
  assert.equal(env.SLACK_BOT_OAUTH_TOKEN, undefined);
  assert.equal(env.SLACK_AGENT_BOT_TOKEN, undefined);
  assert.ok(!fs.existsSync(env.SLACK_AGENT_ENV_FILE));
  try {
    assert.equal(spawnSync(path.join(stubs, "slack-coordinator")).status, 1);
  } finally {
    fs.rmSync(stubs, { recursive: true, force: true });
  }
});

test("indexed evaluation selection ignores unregistered numbered files and rejects tampering", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "indexed-eval-"));
  const dir = path.join(root, "task");
  fs.mkdirSync(dir);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initTaskArtifacts(dir);
  const save = (summary) => {
    const allocated = reserveArtifactIteration(dir, "research", "sources");
    fs.writeFileSync(path.join(dir, allocated.writePath), `---\ntype: sources\nsummary: ${summary}\n---\n# Source\n${summary}\n`);
    return recordArtifact(dir, "research", "sources", "sources", allocated.writePath);
  };
  const first = save("before");
  const second = save("after");
  fs.writeFileSync(path.join(dir, "99-sources-unregistered.md"), "---\ntype: sources\nsummary: decoy\n---\nDecoy");
  assert.equal(newest(dir, "sources").record.id, second.id);
  assert.deepEqual(artifacts(dir).map((a) => a.record.id), [second.id, first.id]);
  fs.appendFileSync(path.join(dir, first.path), "tampered");
  assert.throws(() => newest(dir, "sources"), /SHA-256/);
});

test("review grading preserves receipt history and bounds only unresolved blocking episodes", () => {
  const row = (round, status) => ({ checkpoint: "phase-1", type: "slice-review", round, status });
  assert.deepEqual(verdictProblems([row(1, "changes"), row(2, "approve")]), []);
  assert.ok(verdictProblems([row(1, "approve"), row(2, "changes")]).some((p) => p.includes("expected approve")));
  assert.ok(verdictProblems([row(4, "approve")]).some((p) => p.includes("review rounds")));
  assert.ok(verdictProblems([row(1, "approve"), row(1, "approve")]).some((p) => p.includes("duplicate round")));
  const approvals = Array.from({ length: 5 }, (_, i) => row(i + 1, "approve"));
  assert.deepEqual(verdictProblems(approvals.toReversed()), [], "successor approvals do not consume the repair allowance");
  const lateChanges = [...approvals, row(6, "changes"), row(7, "changes"), row(8, "changes")];
  assert.ok(!verdictProblems(lateChanges).some((p) => p.includes("review repairs")), "no implicit cap bounds late blockers");
  assert.ok(verdictProblems(lateChanges, 3).some((p) => p.includes("review repairs")), "only the owner's cap bounds late blockers");
  assert.deepEqual(verdictProblems([...lateChanges, row(9, "approve")]), [], "a valid approval closes the blocking episode");
});

test("review grading refuses continuation after stalled blockers without weakening immutable rounds", () => {
  const row = (round, status, blocking) => ({ checkpoint: "phase-1", type: "slice-review", round, status, blocking });
  assert.deepEqual(verdictProblems([row(1, "changes", ["F1", "F2"]), row(2, "changes", ["F1"]), row(3, "approve", [])]), []);
  assert.ok(verdictProblems([row(1, "changes", ["F1"]), row(2, "changes", ["F1"]), row(3, "approve", [])]).some(problem => problem.includes("no progress")));
  assert.ok(verdictProblems([row(1, "changes", ["F1"]), row(1, "approve", [])]).some(problem => problem.includes("duplicate round")));
});

test("PRD grading accepts EARS actor/response forms and rejects non-obligations", async () => {
  const { earsProblems } = await import("../evals/scenarios/convert-prd.mjs");
  assert.deepEqual(earsProblems([
    "- WHEN the daily timer fires at 09:00, the system shall send the digest.",
    "- IF delivery fails, THEN the system shall retry the next day.",
    "- WHILE the account is suspended, the system shall omit billing alerts.",
    "- WHERE email is enabled, the system shall deliver email.",
    "- The system shall retain the account time zone.",
  ].join("\n")), []);
  assert.equal(earsProblems("- It is desirable that alerts shall be fast.").length, 1);
});
