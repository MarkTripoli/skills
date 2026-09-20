import assert from "node:assert/strict";
import test from "node:test";
import disagreement from "../evals/scenarios/iterate-evidence-label-disagreement.mjs";
import zeroLimit from "../evals/scenarios/iterate-evidence-zero-limit.mjs";
import noProgress from "../evals/scenarios/iterate-evidence-no-progress.mjs";
import viewerBlocked from "../evals/scenarios/iterate-evidence-viewer-blocked.mjs";

function coverageRow(flow, result) {
  return `| ${flow} | target | R1 | recorded and inspected | unchanged check | ${result} | Static states only |`;
}

function charterRow(id, action) {
  return `| ${id} | target | Chromium 1280×720 | ${action} | Specified count | spec.md | yes |`;
}

function check(scenario, coverage, charter = []) {
  const bounded = scenario === noProgress;
  const blocked = scenario === viewerBlocked;
  return scenario.phases[0].check({ artifact: {
    fm: {
      type: "evidence-iteration",
      status: blocked ? "blocked" : "failed",
      stop_reason: blocked ? "blocker" : bounded ? "no-progress" : "exhaustion",
      limit: blocked ? "3" : bounded ? "1" : "0",
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

for (const scenario of [disagreement, zeroLimit, noProgress, viewerBlocked]) {
  const increment = scenario === viewerBlocked ? "untested" : "failed";
  const reset = scenario === viewerBlocked ? "untested" : "passed";
  const coverage = [coverageRow("F1", increment), coverageRow("F2", reset)];

  test(`${scenario.slug}: Activate and Click map receipt-local IDs to the same counter actions`, () => {
    for (const verb of ["Activate", "Click"]) {
      const charter = [charterRow("F1", `${verb} Add one exactly once from 0`), charterRow("F2", `${verb} Reset once`)];
      assert.deepEqual(check(scenario, coverage, charter), [], verb);
      assert.deepEqual(check(scenario, [...coverage].reverse(), [...charter].reverse()), [], `${verb}, reordered`);
      assert.deepEqual(check(scenario, [
        coverageRow("F1 Increment, Chromium 1280×720", increment),
        coverageRow("F2 Reset, same configuration", reset),
      ], charter), [], `${verb}, semantic suffix`);
      assert.equal(check(scenario, coverage).length, 2, "mapping is receipt-local");
      assert.ok(check(scenario, [
        coverageRow("F1", "passed"), coverageRow("F2", "failed"),
      ], charter).length >= 2, `${verb}, reversed or inspected outcomes`);
    }
  });

  test(`${scenario.slug}: configuration separators preserve grounded identity and conflicts`, () => {
    const charter = [charterRow("F1 Increment", "Click Add one once"), charterRow("F2 Reset", "Click Reset once")];
    for (const separator of [", ", "; ", " / "]) {
      assert.deepEqual(check(scenario, [
        coverageRow(`F1 Increment${separator}Chromium 1280×720`, increment),
        coverageRow(`F2 Reset${separator}same configuration`, reset),
      ], charter), []);
      assert.equal(check(scenario, [
        coverageRow(`F1 Increment${separator}Reset`, increment),
        coverageRow(`F2 Reset${separator}Increment`, reset),
      ], charter).length, 2);
      assert.equal(check(scenario, [
        coverageRow(`increment-frame.png${separator}Chromium`, increment),
        coverageRow(`reset-frame.png${separator}Chromium`, reset),
      ]).length, 2);
    }
  });

  test(`${scenario.slug}: explicit mappings reject false, ambiguous and conflicting actions`, () => {
    const charter = [charterRow("F1", "Click Add one exactly once from 0"), charterRow("F2", "Click Reset once")];
    for (const action of ["Click Add one twice from 0", "Click Add one and Reset once", "Do not Click Add one once"]) {
      assert.ok(check(scenario, coverage, [charterRow("F1", action), charter[1]]).length > 0, action);
      assert.equal(check(scenario, coverage, [...charter, charterRow("F1", action)]).length, 2, `duplicate: ${action}`);
    }
    assert.equal(check(scenario, coverage, [...charter, charterRow("F1", "Click Reset once")]).length, 2);
    assert.equal(check(scenario, [
      coverageRow("F1 Reset", increment), coverageRow("F2 Increment", reset),
    ], charter).length, 2, "semantic labels cannot contradict mapped actions");
  });

  test(`${scenario.slug}: mapping and coverage still require exactly seven columns`, () => {
    const charter = [charterRow("F1", "Click Add one exactly once from 0"), charterRow("F2", "Click Reset once")];
    assert.deepEqual(check(scenario, coverage, charter), []);
    for (const malformed of [
      [`| F1 | R1 | ${increment} | Static states only |`, `| F2 | R1 | ${reset} | Static states only |`],
      coverage.map((row) => `${row} extra |`),
    ]) {
      assert.equal(check(scenario, malformed, charter).length, 2);
    }
    for (const malformed of [
      charter.map((row) => row.replace(" | spec.md", "")),
      charter.map((row) => `${row} extra |`),
    ]) {
      assert.equal(check(scenario, coverage, malformed).length, 2);
    }
  });
}

test("viewer-blocked: semantic and charter-mapped flows must both remain exclusively untested", () => {
  const coverage = [coverageRow("Increment", "untested"), coverageRow("Reset", "untested")];
  assert.deepEqual(check(viewerBlocked, coverage), []);
  for (const result of ["passed", "failed"]) {
    for (const flow of ["Increment", "Reset", "Unmapped"]) {
      assert.ok(check(viewerBlocked, [...coverage, coverageRow(flow, result)]).length > 0, `${flow}: ${result}`);
    }
  }
  assert.ok(check(viewerBlocked, [coverageRow("Increment", "passed"), coverageRow("Reset", "failed")]).length > 0);
  assert.ok(check(viewerBlocked, [coverageRow("Increment", "failed"), coverageRow("Reset", "passed")]).length > 0);
  assert.ok(check(viewerBlocked, [coverage[0]]).length > 0, "both flows are required");
});

test("viewer-blocked: filenames, unmapped IDs and ambiguous labels cannot supply flow identity", () => {
  for (const labels of [
    ["increment-frame.png", "reset-frame.png"],
    ["INC-001", "RST-001"],
    ["F1 Increment", "F2 Reset"],
    ["Increment, Reset", "Reset"],
  ]) {
    assert.equal(check(viewerBlocked, labels.map((label) => coverageRow(label, "untested"))).length, 2, labels.join(", "));
  }
  assert.equal(check(viewerBlocked, [
    coverageRow("Increment", "untested"), coverageRow("Reset", "untested"),
  ], [charterRow("Increment", "Click Reset once")]).length, 2);
});
