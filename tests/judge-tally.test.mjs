import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_RUBRIC, readRubric, readVotes, report, tally } from "../skills/writing/technical-writing/scripts/judge-tally.mjs";

const text = "The build cache stores each **compiled module** under a key made from its inputs.\n\nWe ask Ines to approve the shared cache by March 12, 2027.";
const quote = "The build cache stores each compiled module under a key";
const general = readRubric(fs.readFileSync(DEFAULT_RUBRIC, "utf8"));
// A decision rubric shaped like the one a sibling RFC checker ships: 14 questions, two where yes is the fault,
// four that must pass, and no n/a. Inline so this test does not depend on another skill being installed.
const DECISION_RUBRIC = "## The questions\n\n1. Question 1?\n2. Question 2?\n3. Question 3?\n4. Question 4?\n5. Question 5?\n6. Question 6?\n7. Question 7?\n8. Question 8?\n9. Question 9?\n10. Question 10?\n11. Question 11?\n12. Question 12?\n13. Question 13?\n14. Question 14?\n\n## Scoring key\n\n```text\nquestions: 14\nyes is the fault: 12 14\nmust pass: 1 2 3 4\nn/a allowed: no\n```\n";
const decision = readRubric(DECISION_RUBRIC, "decision rubric");
// One reader who passes every question of a rubric, then overrides by question number.
const reader = (rubric, overrides = {}) => Object.keys(rubric.questions).map(Number).map((question) => ({ question, answer: rubric.faultWhenYes.includes(question) ? "no" : "yes", quote, ...overrides[question] }));

test("the shipped rubrics parse and their keys match their questions", () => {
  assert.equal(Object.keys(general.questions).length, 15);
  assert.deepEqual(general.faultWhenYes, [13, 14, 15]);
  assert.ok(general.allowNa);
  assert.equal(Object.keys(decision.questions).length, 14);
  assert.deepEqual(decision.faultWhenYes, [12, 14]);
  assert.deepEqual(decision.mustPass, [1, 2, 3, 4]);
  assert.throws(() => readRubric("## The questions\n\n1. A?\n\n## Scoring key\n\n```text\nquestions: 2\n```\n"), /lists 1 questions/);
});

test("three readers who pass everything give judged 100 and the weighted total", () => {
  const result = tally(text, [reader(general), reader(general), reader(general)], general, 90);
  assert.equal(result.judged, 100);
  assert.equal(result.combined, 94);
});

test("the majority decides, and a quote that is not in the text turns a yes into a no", () => {
  const no = { 2: { answer: "no" } };
  assert.equal(tally(text, [reader(general, no), reader(general), reader(general)], general, 100).questions[1].outcome, "pass");
  assert.equal(tally(text, [reader(general, no), reader(general, no), reader(general)], general, 100).questions[1].outcome, "fail");
  const invented = { 2: { quote: "The cache was approved by the whole platform team" } };
  const result = tally(text, [reader(general, invented), reader(general, invented), reader(general)], general, 100);
  assert.equal(result.questions[1].outcome, "fail");
  assert.equal(result.questions[1].unverified.length, 2);
  assert.equal(tally(text, [reader(general, { 2: { quote: "The build" } })], general, 100).questions[1].outcome, "fail");
});

test("an unsupported claim of a fault does not count as a fault", () => {
  const fault = { 13: { answer: "yes", quote: "This paragraph is not in the text at all" } };
  assert.equal(tally(text, [reader(general, fault), reader(general, fault), reader(general)], general, 100).questions[12].outcome, "pass");
  const real = { 13: { answer: "yes", quote } };
  assert.equal(tally(text, [reader(general, real), reader(general, real), reader(general)], general, 100).questions[12].outcome, "fail");
});

test("n/a leaves the count where the rubric allows it and is no answer where it does not", () => {
  const na = { 9: { answer: "n/a" } };
  const result = tally(text, [reader(general, na), reader(general, na), reader(general)], general, 100);
  assert.equal(result.counted, 14);
  assert.equal(result.judged, 100);
  const strict = { 9: { answer: "n/a" } };
  assert.equal(tally(text, [reader(decision, strict), reader(decision, strict), reader(decision)], decision, 100).questions[8].outcome, "fail");
});

test("a failed must-pass question is a verdict beside the score and does not lower it", () => {
  const fail = { 2: { answer: "no" } };
  const result = tally(text, [reader(decision, fail), reader(decision, fail), reader(decision)], decision, 100);
  assert.equal(result.judged, 93);
  assert.equal(result.combined, 97);
  assert.deepEqual(result.notReady, [2]);
  assert.deepEqual(tally(text, [reader(decision), reader(decision), reader(decision)], decision, 100).notReady, []);
});

test("fixes carry their gain, rank must-pass first, and add up to the ceiling", () => {
  const fail = { 2: { answer: "no", fix: "State in the Proposal what the team gives up.", needs: "" }, 7: { answer: "no", fix: "Name the owner.", needs: "the owner and the date" } };
  const groups = [{ label: "listed words", penalty: 4, hits: 4 }, { label: "filler and hedges", penalty: 0.2, hits: 1 }];
  const result = tally(text, [reader(decision, fail), reader(decision, fail), reader(decision, { 7: fail[7] })], decision, 90, groups);
  assert.deepEqual(result.fixes.map((f) => [f.kind, f.number ?? f.text, f.gain]), [["question", 2, 2.9], ["question", 7, 2.9], ["script", "listed words", 2.4]]);
  assert.equal(result.fixes[0].proposals.length, 2);
  assert.equal(result.fixes[1].proposals[0].needs, "the owner and the date");
  assert.equal(result.combined, 88);
  assert.equal(result.ceiling, 96);
  assert.ok(!result.fixes[0].agreed && result.fixes[1].agreed);
  assert.match(report("rfc.md", result, decision), /\+2\.9 {2}question 2 \(must pass\) \(readers split; may be noise\)\n {6}fix: State in the Proposal[^\n]*\n {6}1 more reader proposed a fix/);
});

test("a reply wrapped in a code fence or a sentence still reads, and a reply with no JSON names the format", () => {
  assert.deepEqual(readVotes('Here are my answers:\n```json\n{"answers":[{"question":1,"answer":"Yes","quote":"q"}]}\n```'), [{ question: 1, answer: "yes", quote: "q", fix: "", needs: "" }]);
  assert.throws(() => readVotes("I think it is fine."), /holds no JSON object/);
});
