import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { frontmatter } from "../evals/lib.mjs";
import { readRecords } from "../evals/deliver-grade.mjs";
import { readSessions, sessionProblems, skillLoadProblems } from "../evals/sessions.mjs";

// Safe projections of the actual retained scratch-write run, not a rewritten live result.
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/deliver-small-bug-native-scratch.json", import.meta.url), "utf8"));
const records = fixture.records.map((r) => ({ ...r, file: r.path, group: frontmatter(r.text).checkpoint, reviewer_model: frontmatter(r.text).reviewer_model }));
const economy = "anthropic/claude-sonnet-5-5";
const strongest = "anthropic/claude-opus-5-5";
const digest = (text) => createHash("sha256").update(text).digest("hex");
const calls = (s) => s.events.filter((r) => r.message?.role === "assistant").flatMap((r) => r.message.content).filter((p) => p.type === "toolCall");
const capture = (t, change = () => {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "native-deliver-scratch-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = structuredClone(fixture.sessions);
  change(source);
  for (const s of source) fs.writeFileSync(path.join(dir, s.file), s.events.map((r) => JSON.stringify(r)).join("\n"));
  return readSessions(dir);
};
const problems = (sessions, reviews = records) => sessionProblems({ sessions, records: reviews, subjects: ["fix(retry): cap backoff delay at maxMs"], economy, strongest, timesPreserved: true, changed: ["src/retry.mjs"] });
const review = (type) => records.find((r) => r.type === type);
// Consumer boundaries use the actual native call/result shape from the retained 053312
// read receipts. Only disposable copies receive these synthetic complete/limited outputs.
const finalSkills = [
  { file: "FinalCodeReviewer.jsonl", name: "review-code", path: "/relocated/run/.dist/skills/review-code/SKILL.md" },
  { file: "FinalVerifier.jsonl", name: "verify-implementation", path: ".omp/skills/verify-implementation/SKILL.md" },
];
const skillText = (name) => `---\nname: ${name}\ndescription: Inspect the change.\n---\n\n# Review\nRun the required checks and record findings.\n`;
const nativeRead = (skill, { raw = false, id = `load-${skill.name}` } = {}) => {
  const text = skillText(skill.name);
  const lines = text.trimEnd().split("\n");
  return [
    { type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name: "read", arguments: { path: `${skill.path}${raw ? ":raw" : ""}` } }] } },
    { type: "message", message: { role: "toolResult", toolCallId: id, toolName: "read", isError: false, content: [{ type: "text", text: raw ? text : `[${skill.path}#1829]\n${lines.map((line, i) => `${i + 1}:${line}`).join("\n")}` }], details: { totalLines: lines.length, meta: { source: { type: "path", value: skill.path } } } } },
  ];
};
const withSkillReads = (t, mutate = () => {}) => capture(t, (source) => {
  for (const skill of finalSkills) {
    const session = source.find((s) => s.file === skill.file);
    const events = nativeRead(skill);
    mutate(events, session, skill);
    session.events.push(...events);
  }
});
const skillProblems = (sessions) => skillLoadProblems({ sessions, names: finalSkills.map((skill) => skill.name) });
const incompleteFinals = (sessions) => {
  const found = skillProblems(sessions);
  for (const skill of finalSkills) assert.ok(found.some((p) => p.includes(`completely read ${skill.name}/SKILL.md`)), skill.name);
};

test("actual scratch writes and literal shell heredoc bind six independent authors, but missing final skills still fail", (t) => {
  const sessions = capture(t);
  assert.deepEqual(problems(sessions), []);
  for (const record of records) {
    assert.equal(digest(record.text), record.sha256);
    const authors = sessions.filter((s) => s.authoredWrites.some((w) => w.sha256 === record.sha256));
    assert.equal(authors.length, 1);
    assert.equal(authors[0].child, true);
    assert.equal(authors[0].model, strongest);
    assert.ok(authors[0].authoredWrites.some((w) => w.path.startsWith("/tmp/dsb/") && w.sha256 === record.sha256));
  }
  assert.equal(new Set(records.map((r) => sessions.find((s) => s.authoredWrites.some((w) => w.sha256 === r.sha256)).id)).size, 6);
  incompleteFinals(sessions);
});

test("successful whole native reads prove both final skills without requiring capture paths on disk", (t) => {
  const sessions = withSkillReads(t);
  assert.deepEqual(skillProblems(sessions), []);
  assert.deepEqual(problems(sessions), [], "complete skill loads do not weaken native scratch authorship");
});

test("truncated or omitted native results cannot prove complete final instructions", (t) => {
  const cases = [
    // Actual retained marker and metadata, not an unsuccessful call.
    (result) => {
      result.content[0].text += "\n\n[Some lines truncated to 768 chars]";
      result.details.meta.limits = { columnTruncated: { maxColumn: 768, unit: "chars" } };
    },
    (result) => { result.details.meta.limits = { columnTruncated: { maxColumn: 768, unit: "chars" } }; },
    (result) => { result.content[0].text += "\n\n[Showing lines 1-7 of 20. Use :8 to continue]"; },
    (result) => { result.content[0].text = result.content[0].text.replace("\n5:", "\n…\n5:"); },
    (result) => { result.content[0].text = result.content[0].text.replace("\n5:\n", "\n"); },
    (result) => { result.details.totalLines += 1; },
  ];
  for (const mutate of cases) {
    const sessions = withSkillReads(t, (events) => mutate(events[1].message));
    incompleteFinals(sessions);
    assert.deepEqual(problems(sessions), []);
  }
});

test("an actual complete raw followup recovers from a truncated native read", (t) => {
  const sessions = withSkillReads(t, (events, _session, skill) => {
    events[1].message.content[0].text += "\n\n[Some lines truncated to 768 chars]";
    events[1].message.details.meta.limits = { columnTruncated: { maxColumn: 768, unit: "chars" } };
    events.push(...nativeRead(skill, { raw: true, id: `raw-${skill.name}` }));
  });
  assert.deepEqual(skillProblems(sessions), []);
  assert.deepEqual(problems(sessions), []);
});

test("raw native completeness rejects malformed declared line counts but supports count-less whole output", (t) => {
  for (const totalLines of ["100", null, true, -1, 0.5]) {
    incompleteFinals(withSkillReads(t, (events, _session, skill) => {
      events.splice(0, events.length, ...nativeRead(skill, { raw: true }));
      events[1].message.details.totalLines = totalLines;
    }));
  }
  const sessions = withSkillReads(t, (events, _session, skill) => {
    events.splice(0, events.length, ...nativeRead(skill, { raw: true }));
    delete events[1].message.details.totalLines;
  });
  assert.deepEqual(skillProblems(sessions), []);
});

test("raw selectors, prompt claims, missing or failed receipts and path-only results are not complete reads", (t) => {
  const cases = [
    (events) => { events.pop(); },
    (events) => { events[1].message.isError = true; },
    (events) => { events[1].message.details.exitCode = 1; },
    (events) => { events[1].message.toolCallId = "unrelated-call"; },
    (events) => { events[1].message.content[0].text = events[0].message.content[0].arguments.path; },
    (events, session, skill) => {
      session.events.push({ type: "message", message: { role: "user", content: [{ type: "text", text: `Read ${skill.path}:raw completely.\n${skillText(skill.name)}` }] } });
      events.length = 0;
    },
    (events, _session, skill) => {
      events.splice(0, events.length, ...nativeRead(skill, { raw: true }));
      events.pop();
    },
    (events, _session, skill) => {
      events.splice(0, events.length, ...nativeRead(skill, { raw: true }));
      events[1].message.content[0].text += "\n[Output truncated]";
    },
    (events, _session, skill) => {
      events.splice(0, events.length, ...nativeRead(skill, { raw: true }));
      events[0].message.content[0].arguments.path += ":1-7";
    },
  ];
  for (const mutate of cases) incompleteFinals(withSkillReads(t, mutate));
});

test("complete observed bytes do not excuse global, unresolved or non-child skill provenance", (t) => {
  for (const location of ["/home/u/.omp/agent/skills", "$ROOT/.dist/skills", "skill://"]) {
    const sessions = withSkillReads(t, (events, _session, skill) => {
      events[0].message.content[0].arguments.path = location === "skill://" ? `skill://${skill.name}` : `${location}/${skill.name}/SKILL.md`;
      // A good followup proves completeness but must not erase the foreign attempt.
      events.push(...nativeRead(skill, { raw: true, id: `recovery-${skill.name}` }));
    });
    assert.ok(skillProblems(sessions).some((p) => p.includes("not from the run's .dist/skills")), location);
  }
  const sessions = capture(t, (source) => {
    const parent = source.find((s) => s.events.some((event) => event.type === "session" && !event.parentSession));
    for (const skill of finalSkills) parent.events.push(...nativeRead(skill));
  });
  incompleteFinals(sessions);
});

test("scratch authorship rejects unsuccessful native writes and path-only or metadata claims", (t) => {
  const verification = review("verification");
  const cases = [
    (s, call) => { s.events = s.events.filter((r) => r.message?.toolCallId !== call.id); },
    (s, call) => { s.events.find((r) => r.message?.toolCallId === call.id).message.isError = true; },
    (s, call) => { s.events.find((r) => r.message?.toolCallId === call.id).message.details = { exitCode: 1 }; },
    (_s, call) => { call.arguments.content += "\nUnreviewed parent edit.\n"; },
    (_s, call) => { call.arguments.path = `.agents/tasks/deliver-small-bug/${verification.file}`; delete call.arguments.content; },
    (_s, call) => { call.arguments = { path: call.arguments.path, sha256: verification.sha256, reviewer_model: strongest }; },
  ];
  for (const mutate of cases) {
    const sessions = capture(t, (source) => {
      const verifier = source.find((s) => s.file === "FinalVerifier.jsonl");
      mutate(verifier, calls(verifier).find((c) => c.name === "write"));
    });
    assert.ok(problems(sessions, [verification]).includes(`sessions: no session wrote ${verification.file}`));
  }
});

test("literal shell authoring requires a successful quoted body with no executable tail", (t) => {
  const code = review("code-review");
  const cases = [
    (s, call) => { s.events.find((r) => r.message?.toolCallId === call.id).message.isError = true; },
    (s, call) => { s.events.find((r) => r.message?.toolCallId === call.id).message.details = { exitCode: 1 }; },
    (_s, call) => { call.arguments.command = call.arguments.command.replace("<<'EOF'", "<<EOF"); },
    (_s, call) => { call.arguments.command += "\nprintf extra >> /tmp/dsb/code-review.md"; },
    (_s, call) => { call.arguments.command = call.arguments.command.replace("cat >", "cat >>"); },
    (_s, call) => { call.arguments.command = call.arguments.command.replace("/tmp/dsb &&", "/tmp/unrelated &&"); },
    (_s, call) => { call.arguments.command = call.arguments.command.replace("cat > /tmp/dsb/code-review.md", "cat > $(echo /tmp/dsb/code-review.md)"); },
    (_s, call) => { call.arguments.command = `node -e ${JSON.stringify(`require('fs').writeFileSync('/tmp/dsb/code-review.md', ${JSON.stringify(code.text)})`)}`; },
    (_s, call) => { call.name = "eval"; call.arguments = { language: "js", code: `await tool.write(${JSON.stringify({ path: "/tmp/dsb/code-review.md", content: code.text })})` }; },
  ];
  for (const mutate of cases) {
    const sessions = capture(t, (source) => {
      const reviewer = source.find((s) => s.file === "FinalCodeReviewer.jsonl");
      mutate(reviewer, calls(reviewer).find((c) => c.arguments.command?.includes("cat >")));
    });
    assert.ok(problems(sessions, [code]).includes(`sessions: no session wrote ${code.file}`));
  }
});

test("quoted shell data stays literal and exact rather than being evaluated", (t) => {
  const code = review("code-review");
  const text = `${code.text}\nLiteral shell bytes: $(touch /never-execute) ${"${HOME}"} \`uname\`\n`;
  const sessions = capture(t, (source) => {
    const reviewer = source.find((s) => s.file === "FinalCodeReviewer.jsonl");
    calls(reviewer).find((c) => c.arguments.command?.includes("cat >")).arguments.command = `cat > '/tmp/dsb/code-review.md' <<'EOF'\n${text}EOF\n`;
  });
  assert.deepEqual(problems(sessions, [{ ...code, sha256: digest(text) }]), []);
  assert.ok(problems(sessions, [{ ...code, sha256: digest(text.trimEnd()) }]).includes(`sessions: no session wrote ${code.file}`));
});

test("scratch publication cannot attribute modified bytes or promote the publisher into an author", (t) => {
  const sessions = capture(t);
  const verification = review("verification");
  const parent = sessions.find((s) => !s.child);
  assert.deepEqual(parent.authoredWrites, []);
  assert.ok(problems(sessions, [{ ...verification, sha256: digest(`${verification.text}\nParent correction.\n`) }]).includes(`sessions: no session wrote ${verification.file}`));
  const claimed = capture(t, (source) => {
    const verifier = source.find((s) => s.file === "FinalVerifier.jsonl");
    const write = calls(verifier).find((c) => c.name === "write");
    delete write.arguments.content;
    const result = verifier.events.find((r) => r.message?.toolCallId === write.id);
    result.message.content = [{ type: "text", text: JSON.stringify({ path: verification.path, sha256: verification.sha256, reviewer_model: strongest }) }];
  });
  assert.ok(problems(claimed, [verification]).includes(`sessions: no session wrote ${verification.file}`));
});

test("legacy review discovery also binds actual scratch-authored bytes and rejects later corrections", (t) => {
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-scratch-review-"));
  t.after(() => fs.rmSync(taskDir, { recursive: true, force: true }));
  const file = path.join(taskDir, "01-code-review.md");
  fs.writeFileSync(file, review("code-review").text);
  const selected = readRecords(taskDir);
  assert.deepEqual(selected.problems, []);
  const sessions = capture(t);
  assert.deepEqual(problems(sessions, selected.records), []);
  fs.appendFileSync(file, "\nA later publisher correction.\n");
  const changed = readRecords(taskDir);
  assert.deepEqual(changed.problems, []);
  assert.ok(problems(sessions, changed.records).includes("sessions: no session wrote 01-code-review.md"));
});
