import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { frontmatter } from "../evals/lib.mjs";
import { readRecords, verdictProblems } from "../evals/deliver-grade.mjs";
import { readSessions, sessionProblems } from "../evals/sessions.mjs";
import { initTaskArtifacts, reserveArtifactIteration, recordArtifact } from "../shared/task-artifacts.mjs";

// Selected, unmodified native events from the failed live run named in the fixture's source field.
// The retained archive is not loaded, mutated or regraded by these regressions.
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/deliver-small-bug-native.json", import.meta.url), "utf8"));
const economy = "anthropic/claude-sonnet-5-5";
const strongest = "anthropic/claude-opus-5-5";
const digest = (text) => createHash("sha256").update(text).digest("hex");
const writes = (events) => events.filter((r) => r.message?.role === "assistant").flatMap((r) => r.message.content).filter((p) => p.type === "toolCall" && p.name === "write");
const authored = (record) => fixture.sessions.flatMap((s) => writes(s.events)).find((c) => digest(c.arguments.content) === record.sha256);
const reviewRecords = fixture.records.map((r) => {
  const info = frontmatter(authored(r).arguments.content);
  return { ...r, file: r.path, group: info.checkpoint, reviewer_model: info.reviewer_model };
});
const recordedSessions = (t, mutate = () => {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "native-deliver-sessions-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = structuredClone(fixture.sessions);
  mutate(source);
  for (const s of source) fs.writeFileSync(path.join(dir, s.file), s.events.map((r) => JSON.stringify(r)).join("\n"));
  return readSessions(dir);
};
const problems = (sessions, records = reviewRecords) => sessionProblems({ sessions, records, subjects: ["fix(retry): cap backoff delay at maxMs"], economy, strongest, timesPreserved: true, changed: ["src/retry.mjs"] });

test("native task children, not the publishing parent, authored all six indexed reviews", (t) => {
  const sessions = recordedSessions(t);
  assert.deepEqual(problems(sessions), []);
  const childWriters = reviewRecords.map((r) => sessions.filter((s) => s.stagedWrites.some((w) => w.sha256 === r.sha256)));
  assert.ok(childWriters.every((who) => who.length === 1 && who[0].child && who[0].agent === "agent-implementation-reviewer" && who[0].model === strongest));
  assert.equal(new Set(childWriters.map(([s]) => s.id)).size, 6);
  // Publication may happen after authoring, but matching immutable bytes are still the child's review.
  assert.deepEqual(problems(sessions, reviewRecords.map((r) => ({ ...r, mtime: Date.parse("2026-10-02T00:00:00Z") }))), []);
});

test("native staging attribution requires the successful write result and exact published bytes", (t) => {
  const code = reviewRecords.find((r) => r.group === "final" && r.type === "code-review");
  const cases = [
    (events, id) => events.filter((r) => r.message?.toolCallId !== id),
    (events, id) => events.map((r) => r.message?.toolCallId === id ? { ...r, message: { ...r.message, isError: true } } : r),
    (events) => {
      writes(events)[0].arguments.content += "\nParent correction not reviewed.\n";
      return events;
    },
  ];
  for (const change of cases) {
    const sessions = recordedSessions(t, (source) => {
      const reviewer = source.find((s) => s.file === "FinalCodeReviewer.jsonl");
      reviewer.events = change(reviewer.events, writes(reviewer.events)[0].id);
    });
    assert.ok(problems(sessions, [code]).some((p) => p === `sessions: no session wrote ${code.file}`));
  }
  const sessions = recordedSessions(t);
  assert.ok(problems(sessions, [{ ...code, sha256: "0".repeat(64) }]).some((p) => p.includes("no session wrote")));
});

test("native staging attribution preserves builder, orchestrator and strongest-model exclusions", (t) => {
  const code = reviewRecords.find((r) => r.type === "code-review");
  const parent = recordedSessions(t, (source) => {
    const events = source.find((s) => s.file === "FinalCodeReviewer.jsonl").events;
    delete events.find((r) => r.type === "session").parentSession;
  });
  assert.ok(problems(parent, [code]).some((p) => p.includes("the orchestrator wrote a review record")));
  const builder = recordedSessions(t, (source) => {
    source.find((s) => s.file === "FinalCodeReviewer.jsonl").events.find((r) => r.type === "session_init").agent = "agent-implementer";
  });
  assert.ok(problems(builder, [code]).some((p) => p.includes("the builder wrote a review record")));
  const weaker = recordedSessions(t, (source) => {
    source.find((s) => s.file === "FinalCodeReviewer.jsonl").events.find((r) => r.type === "session_init").resolvedModel = economy;
  });
  assert.ok(problems(weaker, [code]).some((p) => p.includes("expected the strongest candidate")));
  const leaked = recordedSessions(t, (source) => {
    const report = source.find((s) => s.file === "Builder.jsonl").events.filter((r) => r.message?.role === "assistant").flatMap((r) => r.message.content).find((p) => p.type === "text").text;
    source.find((s) => s.file === "FinalCodeReviewer.jsonl").events.find((r) => r.message?.role === "user").message.content[0].text += `\n${report}`;
  });
  assert.ok(problems(leaked, [code]).some((p) => p.includes("first prompt contains builder transcript text")));
});

test("one native child cannot supply both final reviews, and direct writes still enforce mtime", (t) => {
  const finals = reviewRecords.filter((r) => r.group === "final");
  const combined = recordedSessions(t, (source) => {
    const code = source.find((s) => s.file === "FinalCodeReviewer.jsonl");
    const verification = source.find((s) => s.file === "FinalVerifier.jsonl");
    code.events.push(...verification.events.filter((r) => r.type === "message" && r.message.role !== "user"));
    source.splice(source.indexOf(verification), 1);
  });
  assert.ok(problems(combined, finals).some((p) => p.includes("one session wrote both final records")));
  const code = finals.find((r) => r.type === "code-review");
  const direct = recordedSessions(t, (source) => {
    writes(source.find((s) => s.file === "FinalCodeReviewer.jsonl").events)[0].arguments.path = `.agents/tasks/deliver-small-bug/${code.file}`;
  });
  assert.ok(problems(direct, [{ ...code, mtime: Date.parse("2026-10-02T00:00:00Z") }]).some((p) => p.includes("changed after its session ended")));
});

test("authentic invalid historical reviews do not count, invalid current reviews and duplicate valid rounds still fail", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-deliver-records-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const taskDir = path.join(root, "deliver-small-bug");
  fs.mkdirSync(taskDir);
  initTaskArtifacts(taskDir);
  const save = (kind, variant, type, text) => {
    const allocation = reserveArtifactIteration(taskDir, kind, variant);
    fs.writeFileSync(path.join(taskDir, allocation.writePath), text);
    return recordArtifact(taskDir, kind, variant, type, allocation.writePath);
  };
  for (const plan of fixture.planArtifacts) save("planning", "plan", "plan", plan.text);
  const planRecords = fixture.records.filter((r) => r.type === "plan-review");
  const original = save("review", "plan", "plan-review", authored(planRecords[0]).arguments.content);
  assert.ok(readRecords(taskDir).problems.some((p) => p.includes("approve contradicts a failed check exit")), "the failed first record is current, so it must fail");
  save("review", "plan", "plan-review", authored(planRecords[1]).arguments.content);
  let graded = readRecords(taskDir);
  assert.deepEqual(graded.problems, []);
  assert.equal(graded.records.length, 1);
  assert.deepEqual(verdictProblems(graded.records), []);
  save("review", "plan", "plan-review", authored(planRecords[0]).arguments.content);
  graded = readRecords(taskDir);
  assert.ok(graded.problems.some((p) => p.includes("approve contradicts a failed check exit")), "a later failed current record cannot hide behind the prior approval");
  save("review", "plan", "plan-review", authored(planRecords[2]).arguments.content);
  graded = readRecords(taskDir);
  assert.deepEqual(graded.problems, []);
  assert.equal(graded.records.length, 2);
  assert.ok(verdictProblems(graded.records).some((p) => p.includes("duplicate round records")), "a plan successor does not reset valid round history");
  fs.appendFileSync(path.join(taskDir, original.path), "\nTampered historical record.\n");
  assert.ok(readRecords(taskDir).problems.some((p) => p.startsWith("index:") && p.includes("SHA-256")), "historical invalidity never bypasses immutable digest validation");
});

test("legacy corrected review history skips invalid earlier attempts but keeps a failed latest record", (t) => {
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-native-reviews-"));
  t.after(() => fs.rmSync(taskDir, { recursive: true, force: true }));
  for (const plan of fixture.planArtifacts) {
    const file = path.join(taskDir, plan.record.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, plan.text);
  }
  const planRecords = fixture.records.filter((r) => r.type === "plan-review");
  const save = (name, record) => fs.writeFileSync(path.join(taskDir, name), authored(record).arguments.content);
  save("01-plan-review.md", planRecords[0]);
  assert.ok(readRecords(taskDir).problems.some((p) => p.includes("approve contradicts a failed check exit")));
  save("02-plan-review.md", planRecords[1]);
  let graded = readRecords(taskDir);
  assert.deepEqual(graded.problems, []);
  assert.equal(graded.records.length, 1);
  save("03-plan-review.md", planRecords[0]);
  assert.ok(readRecords(taskDir).problems.some((p) => p.includes("03-plan-review.md")));
  save("04-plan-review.md", planRecords[2]);
  graded = readRecords(taskDir);
  assert.deepEqual(graded.problems, []);
  assert.ok(verdictProblems(graded.records).some((p) => p.includes("duplicate round records")));
});
