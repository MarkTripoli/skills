import assert from "node:assert/strict";
import test from "node:test";
import disagreement from "../evals/scenarios/iterate-evidence-label-disagreement.mjs";
import zeroLimit from "../evals/scenarios/iterate-evidence-zero-limit.mjs";
import noProgress from "../evals/scenarios/iterate-evidence-no-progress.mjs";

function coverageRow(flow, result) {
  return `| ${flow} | target | R1 | recorded and inspected | unchanged check | ${result} | Static states only |`;
}

function charterRow(id, action) {
  return `| ${id} | target | Chromium 1280×720 | ${action} | Specified count | spec.md | yes |`;
}

function check(scenario, coverage, charter = []) {
  const bounded = scenario === noProgress;
  return scenario.phases[0].check({ artifact: {
    fm: {
      type: "evidence-iteration",
      status: "failed",
      stop_reason: bounded ? "no-progress" : "exhaustion",
      limit: bounded ? "1" : "0",
      consumed_rounds: bounded ? "1" : "0",
    },
    text: [
      "## Scope", "", "### Targets and regression charter", "", ...charter,
      "", "## Findings", "", "| IE-001 | increment | open |",
      "", "## Final coverage", "", ...coverage,
    ].join("\n"),
  } });
}

for (const scenario of [disagreement, zeroLimit, noProgress]) {
  test(`${scenario.slug}: verdicts belong to their named flows, not row positions`, () => {
    assert.deepEqual(check(scenario, [coverageRow("Reset", "passed"), coverageRow("Increment", "failed")]), []);
    const swapped = check(scenario, [coverageRow("Increment", "passed"), coverageRow("Reset", "failed")]);
    assert.equal(swapped.length, 2);
    assert.ok(swapped.some((problem) => problem.includes("increment coverage")));
    assert.ok(swapped.some((problem) => problem.includes("Reset requires")));
  });

  test(`${scenario.slug}: stable IDs require this receipt's explicit action mapping`, () => {
    const coverage = [coverageRow("INC-alpha", "failed"), coverageRow("RST-beta", "passed")];
    const charter = [charterRow("INC-alpha", "Activate Add one exactly once from 0"), charterRow("RST-beta", "Activate Reset once")];
    assert.equal(check(scenario, coverage).length, 2);
    assert.deepEqual(check(scenario, coverage, charter), []);
    assert.equal(check(scenario, coverage).length, 2, "a previous receipt cannot supply the mapping");
    assert.equal(check(scenario, coverage, [charterRow("INC-alpha", "Activate Reset"), charterRow("RST-beta", "Activate Add one once")]).length, 2);
  });

  test(`${scenario.slug}: retained semantic and F1/F2 receipt forms remain supported`, () => {
    assert.deepEqual(check(scenario, [
      coverageRow("Increment / Chromium 153.0.8010.12, 1280×720", "failed"),
      coverageRow("Reset / same configuration", "passed"),
    ]), []);
    const charter = [charterRow("F1", "Activate Add one exactly once"), charterRow("F2", "Activate Reset")];
    assert.deepEqual(check(scenario, [coverageRow("F1", "failed"), coverageRow("F2", "passed")], charter), []);
    assert.deepEqual(check(scenario, [
      coverageRow("F1, one Add one from fresh 0, Chromium 1280x720", "failed"),
      coverageRow("F2, Reset from actual nonzero 2, same page/configuration", "passed"),
    ], charter), []);
    assert.deepEqual(check(scenario, [
      coverageRow("F1 Increment, Chromium 1280×720", "failed"),
      coverageRow("F2 Reset, Chromium 1280×720", "passed"),
    ], [charterRow("F1 Increment", "Activate Add one exactly once"), charterRow("F2 Reset", "Activate Reset once")]), []);
  });

  test(`${scenario.slug}: conflicting declarations cannot rescue swapped coverage`, () => {
    const coverage = [coverageRow("F1", "failed"), coverageRow("F2", "passed")];
    const charter = [charterRow("F1", "Activate Add one once"), charterRow("F2", "Activate Reset")];
    assert.equal(check(scenario, coverage, [...charter, charterRow("F1", "Activate Reset")]).length, 2);
    assert.equal(check(scenario, [coverageRow("F1 Reset", "failed"), coverageRow("F2 Increment", "passed")], charter).length, 2);
    assert.equal(check(scenario, [coverageRow("Increment", "failed"), coverageRow("Reset", "passed")], [charterRow("Increment", "Activate Reset")]).length, 2);
    assert.equal(check(scenario, [coverageRow("F1, Reset from actual nonzero 2", "failed"), coverageRow("F2, one Add one from fresh 0", "passed")], charter).length, 2);
    assert.equal(check(scenario, [coverageRow("Increment, Reset", "failed"), coverageRow("Reset", "passed")]).length, 2);
  });

  test(`${scenario.slug}: filenames and ID-like prefixes do not identify flows`, () => {
    assert.equal(check(scenario, [coverageRow("increment-frame.png", "failed"), coverageRow("reset-frame.png", "passed")]).length, 2);
    assert.equal(check(scenario, [coverageRow("INC-001", "failed"), coverageRow("RST-001", "passed")]).length, 2);
    assert.equal(check(scenario, [coverageRow("F1 Increment", "failed"), coverageRow("F2 Reset", "passed")]).length, 2);
  });

  test(`${scenario.slug}: favorable rows cannot hide contradictory coverage of the same flow`, () => {
    const problems = check(scenario, [
      coverageRow("Increment", "failed"), coverageRow("Reset", "passed"),
      coverageRow("Increment", "passed"), coverageRow("Reset", "failed"),
    ]);
    assert.equal(problems.length, 2);
  });
}
