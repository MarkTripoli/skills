import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { allArtifactText, babysitCheck, coverage, resumeCheck } from "../evals/babysit-ordered.mjs";
import { BEGIN, END, HOST, edge, execute, hash, initialState, manifest, note, originalBody, selection } from "../evals/fixtures/babysit-ordered/babysit-provider.mjs";

const jsonText = (state) => `\`\`\`json\n${JSON.stringify(state)}\n\`\`\`\n`;
const graph = () => ({
  frozen_order: selection.map((node) => ({ key: node.identity, project_id: node.project_id, iid: node.iid, url: node.url })),
  dependencies: [{ prerequisite: edge.prerequisite, dependent: edge.dependent, source: "projects/group%2Fweb/merge_requests/7/blocks" }],
});
const markdownGraph = () => `# Frozen selection and order\n\n${selection.map((node, index) => `${index + 1}. \`${node.identity}\`, project ${node.project_id}, ${node.url}.`).join("\n")}\n\nThe host response to \`GET projects/group%2Fweb/merge_requests/7/blocks\` names API project 101, PR 7 as its prerequisite.\n`;
// Recorded 055008 JSON and frozen Markdown, adapted to active PR terminology as unit inputs only.
const memberGraph = () => JSON.parse(fs.readFileSync(new URL("./fixtures/babysit-055008-frozen-order.json", import.meta.url), "utf8"));
// Recorded 113236 API JSON and routing prose, adapted to active PR terminology; never live proof.
const rootRoute = () => JSON.parse(fs.readFileSync(new URL("./fixtures/babysit-113236-root-route.json", import.meta.url), "utf8"));
// Actual 132151 scoped inspection route and sourced control graph are consumer inputs only.
const inspectionRoute = () => JSON.parse(fs.readFileSync(new URL("./fixtures/babysit-132151-proof-route.json", import.meta.url), "utf8"));
const edgeGraph = () => JSON.parse(fs.readFileSync(new URL("./fixtures/babysit-132151-frozen-order.json", import.meta.url), "utf8"));
// Actual 171311 node/prose and frozen control state; consumer data, never current model proof.
const restoredRoute = () => JSON.parse(fs.readFileSync(new URL("./fixtures/babysit-171311-proof-route.json", import.meta.url), "utf8"));
const restoredGraph = () => JSON.parse(fs.readFileSync(new URL("./fixtures/babysit-171311-frozen-order.json", import.meta.url), "utf8"));
const semanticProofSteps = () => [
  "Restore the original worktree/task with its authentic pre-mutation baseline and original policy.",
  "Reproduce the affected original deciding check before the smallest authorized source repair.",
  "Verify the current repaired source against the required deciding check.",
  "Exercise the affected original product behavior.",
  "Obtain a fresh independent review of the repaired source.",
  "Record current source-bound behavior and host the sealed capture receipt under the original policy.",
  "Inspect evidence with source/capture hash-bound inspection.",
  "Publish a refreshed PR description preserving human text and owned breadcrumbs.",
  "Publish a separate evidence comment; read back capture/comment URLs and inspect playback.",
];
const memberMarkdown = () => `## Frozen scope and order

Host: \`gitlab.babysit.invalid\`. Frozen identities use host, project and IID, not IID alone.

1. \`gitlab.babysit.invalid/group/api!7\`, project 101, PR ID 10107.
2. \`gitlab.babysit.invalid/group/web!7\`, project 102, PR ID 10207; depends on API !7.
3. \`gitlab.babysit.invalid/group/ops!9\`, project 103, PR ID 10309; unrelated.

Dependency source: \`glab api --hostname gitlab.babysit.invalid projects/102/merge_requests/7/blocks\` returned relation ID 1 with \`blocking_merge_request\` API !7. API and ops blocks endpoints returned \`[]\`. Order is frozen for resumption; an unrelated PR is not a substitute prerequisite.
`;
const graphResult = (text) => {
  const result = coverage(text, manifest());
  return { identities: result.identities, edges: result.edges };
};

// These are consumer fixtures, not model/worker reports or accepted live recordings. The real
// session gate remains unsatisfied; only that separate boundary diagnostic is excluded below.
const domainProblems = (problems) => problems.filter((problem) => !problem.startsWith("sessions:"));
const hasFinding = (problems, category) => domainProblems(problems).some((problem) => problem.startsWith(`${category}:`));
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value));

function consumerFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "babysit-grader-consumer-"));
  const taskDir = path.join(directory, "task");
  const provider = path.join(taskDir, ".provider");
  fs.mkdirSync(provider, { recursive: true });
  save(path.join(provider, "manifest.json"), manifest());
  save(path.join(provider, "state.json"), initialState());
  fs.writeFileSync(path.join(provider, "trace.jsonl"), "");
  const call = (endpoint, method = "GET", fields = []) => {
    const result = execute(["api", endpoint, "--hostname", HOST, "--method", method, ...fields], provider);
    assert.equal(result.code, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const sweep = (stage) => {
    for (const node of selection) {
      call(`projects/${node.project_id}/merge_requests/${node.iid}`);
      call(`projects/${node.project_id}/merge_requests/${node.iid}/pipelines`);
    }
    if (stage === 1) call("projects/101/jobs/101");
    if (stage === 1) assert.equal(execute(["api", "projects/101/jobs/101/trace", "--hostname", HOST], provider).code, 0);
    call("projects/101/merge_requests/7/notes");
    call("projects/102/merge_requests/7/discussions");
  };
  sweep(0);
  call("projects/102/merge_requests/7/blocks");
  assert.equal(execute(["tick"], provider, "babysit-fixture").code, 0);
  sweep(1);
  const body = (node, status) => `${originalBody(node)}\n${BEGIN}\nStatus: ${status}; original proof unavailable.\n${selection[node.project_id === 101 ? 1 : 0].url}\n${END}\n`;
  for (const node of selection.slice(0, 2)) call(`projects/${node.project_id}/merge_requests/${node.iid}`, "PUT", ["-f", `description=${body(node, "blocked")}`]);
  const comparison = path.join(provider, "deliver");
  fs.mkdirSync(comparison);
  save(path.join(comparison, "manifest.json"), manifest());
  save(path.join(comparison, "state.json"), initialState());
  fs.writeFileSync(path.join(comparison, "trace.jsonl"), "");
  fs.writeFileSync(path.join(comparison, "artifacts.md"), "");
  const ledger = {
    schema_version: 1, selection_frozen: true, order: selection.map((node) => node.identity),
    nodes: selection.map((node) => ({
      identity: node.identity, host: node.host, project: node.project, iid: node.iid, url: node.url,
      head_sha: node.changedHead ?? node.head, state: "blocked", worker: null,
      worktree: `/unavailable/${node.project}/worktree`,
      task_dir: `/unavailable/${node.project}/.agents/tasks/tenant-validation`,
      dependencies: node.project_id === 102 ? [{ identity: edge.prerequisite, source: edge.source }] : [],
      ci: { source_head_sha: node.changedHead ?? node.head, required_status: node.project_id === 101 ? "failed" : "success", pipelines: [{ id: node.changedPipeline ?? node.pipeline }] },
      reviews: { cursors: [], observed_versions: node.project_id === 101 ? [0, 1].map((stage) => ({ id: 71, updated_at: note(stage).updated_at, body: note(stage).body, body_hash: hash(note(stage).body), disposition: "blocked; not handled or resolved", handled_sha: null })) : [], actionable: node.project_id === 101 ? [71] : [] },
      proof: { source_sha: null, status: "missing", baseline: null, verification: null, app_test: null, review: null, evidence: null, inspection: null, description: null, evidence_comment: null },
      blockers: ["Original worktree and authentic baseline unavailable"], retries: { attempts: 0 },
      pending_actions: [],
      ...(node.project_id === 101 ? { repair_route: rootRoute().node.repair_route } : {}),
    })),
  };
  const file = "01-babysit-unit.md";
  const context = (state = ledger, before = [], prose = rootRoute().prose) => {
    const text = `---\ntype: babysit\nsummary: Consumer fixture with unavailable originals.\n---\n${jsonText(state)}\n## Repairs and publication\n${prose}\n`;
    fs.writeFileSync(path.join(taskDir, file), text);
    return { live: false, repo: null, taskDir, sessionDir: path.join(directory, "absent-sessions"), before, artifact: { file, text, fm: { type: "babysit", summary: "Consumer fixture" } } };
  };
  return { directory, taskDir, provider, ledger, context, call, body, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test("equivalent frozen-order JSON and numbered Markdown retain directed sourced graph credit", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "babysit-graph-consumer-"));
  try {
    const state = graph();
    save(path.join(directory, "delivery-state.json"), state);
    const expected = { identities: selection.map((node) => node.identity).sort(), edges: [`${edge.dependent}<-${edge.prerequisite}`] };
    assert.deepEqual(graphResult(allArtifactText(directory)), expected);
    assert.deepEqual(graphResult(markdownGraph()), expected);
    for (const dependencies of [[], [{ ...state.dependencies[0], prerequisite: edge.dependent, dependent: edge.prerequisite }], [{ ...state.dependencies[0], source: "https://other.invalid/api/v4/projects/102/merge_requests/7/blocks" }]]) {
      assert.deepEqual(graphResult(jsonText({ ...state, dependencies })), { ...expected, edges: [] });
    }
    assert.deepEqual(graphResult(markdownGraph().replace("project 101, PR 7 as its prerequisite", "project 102, PR 7 as its prerequisite")), { ...expected, edges: [] });
    assert.deepEqual(graphResult(jsonText({ frozen_order: [7, 7, 9], dependencies: [] })), { identities: [], edges: [] });
    fs.unlinkSync(path.join(directory, "delivery-state.json"));
    fs.mkdirSync(path.join(directory, ".provider"));
    fs.mkdirSync(path.join(directory, "observations"));
    save(path.join(directory, ".provider", "manifest.json"), state);
    save(path.join(directory, "observations", "sweep.json"), state);
    save(path.join(directory, "host-response.json"), { iid: 7, sha: selection[0].head });
    assert.deepEqual(graphResult(allArtifactText(directory)), { identities: [], edges: [] });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("explicit frozen references credit ordered selected graphs, not snapshots or other scope", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "babysit-linked-graph-consumer-"));
  const file = "ordered-selection.json";
  const reference = path.join(directory, "watch-state.json");
  const markdown = path.join(directory, "01-supervision-unit.md");
  const state = {
    host: HOST, selected: selection.map((node) => node.url), order: selection.map((node) => node.identity),
    dependencies: graph().dependencies,
  };
  const expected = { identities: selection.map((node) => node.identity).sort(), edges: [`${edge.dependent}<-${edge.prerequisite}`] };
  const writeGraph = (value) => save(path.join(directory, file), value);
  try {
    writeGraph(state);
    assert.deepEqual(graphResult(allArtifactText(directory)), { identities: [], edges: [] });
    save(reference, { frozen_order: file });
    assert.deepEqual(graphResult(allArtifactText(directory)), expected);
    fs.unlinkSync(reference);
    fs.writeFileSync(markdown, `# Frozen scope and host dependency\n\n[API !7](${selection[0].url}) precedes [web !7](${selection[1].url}).\n\n[Frozen order](./${file}) persists canonical identities; ops is unrelated.\n`);
    assert.deepEqual(graphResult(allArtifactText(directory)), expected);
    assert.deepEqual(graphResult(`# Frozen selected graph\n\n${jsonText(state)}`), expected);
    for (const dependencies of [[], [{ ...state.dependencies[0], prerequisite: edge.dependent, dependent: edge.prerequisite }], [{ ...state.dependencies[0], source: "https://other.invalid/api/v4/projects/102/merge_requests/7/blocks" }]]) {
      writeGraph({ ...state, dependencies });
      assert.deepEqual(graphResult(allArtifactText(directory)), { ...expected, edges: [] });
    }
    for (const invalid of [
      { ...state, selection_frozen: false },
      { ...state, host: "other.invalid" },
      { ...state, selected: state.selected.slice(1) },
      { ...state, order: [7, 7, 9] },
      { sweep: 1, responses: { graph: state } },
      { ...state, responses: {} },
      { response: state },
    ]) {
      writeGraph(invalid);
      assert.deepEqual(graphResult(allArtifactText(directory)), { identities: [], edges: [] });
    }
    writeGraph({ ...state, selected: [selection[2].url], order: [selection[2].identity] });
    assert.deepEqual(graphResult(allArtifactText(directory)), { identities: [selection[2].identity], edges: [] });
    writeGraph(state);
    fs.unlinkSync(markdown);
    fs.writeFileSync(markdown, `# Unfrozen observations\n\n[Host snapshot](./${file}) is a response, not a frozen scope.\n`);
    assert.deepEqual(graphResult(allArtifactText(directory)), { identities: [], edges: [] });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("inherited frozen member prerequisites and directed Markdown retain exact sourced edge credit", () => {
  const state = memberGraph();
  const expected = { identities: selection.map((node) => node.identity).sort(), edges: [`${edge.dependent}<-${edge.prerequisite}`] };
  assert.deepEqual(graphResult(jsonText(state)), expected);
  assert.deepEqual(graphResult(memberMarkdown()), expected);
  for (const field of ["dependencies", "prerequisites"]) {
    const alternative = memberGraph();
    alternative.order[1][field] = [{ project: "group/api", iid: 7, source: alternative.order[1].dependency_source }];
    delete alternative.order[1].depends_on;
    delete alternative.order[1].dependency_source;
    assert.deepEqual(graphResult(jsonText(alternative)), expected);
  }
  const explicit = memberGraph();
  explicit.order[1].dependencies = [{ dependent: edge.dependent, prerequisite: edge.prerequisite, source: explicit.order[1].dependency_source }];
  delete explicit.order[1].depends_on;
  assert.deepEqual(graphResult(jsonText(explicit)), expected);
  explicit.order[1].dependencies[0].dependent = edge.prerequisite;
  assert.deepEqual(graphResult(jsonText(explicit)), { ...expected, edges: [] });
  for (const change of [
    (value) => { value.order[1].dependency_source = "https://other.invalid/api/v4/projects/102/merge_requests/7/blocks"; },
    (value) => { delete value.order[1].dependency_source; },
    (value) => { value.order[1].depends_on = [7]; },
    (value) => { value.order[1].depends_on = [{ iid: 7 }]; },
    (value) => { value.order[1].depends_on = []; value.order[0].depends_on = [edge.dependent]; value.order[0].dependency_source = "projects/101/merge_requests/7/blocks"; },
  ]) {
    const invalid = memberGraph();
    change(invalid);
    assert.deepEqual(graphResult(jsonText(invalid)), { ...expected, edges: [] });
  }
  for (const invalid of [
    { ...state, host: "other.invalid" },
    { ...state, frozen: false },
    { response: state },
    { responses: {}, ...state },
    { ...state, order: state.order.map((member, index) => index === 1 ? { ...member, host: "other.invalid" } : member) },
    { ...state, order: state.order.map((member, index) => index === 1 ? { ...member, identity: edge.prerequisite } : member) },
    { ...state, order: state.order.map((member, index) => index === 1 ? { ...member, identity: edge.dependent, key: edge.prerequisite } : member) },
  ]) assert.deepEqual(graphResult(jsonText(invalid)), { identities: [], edges: [] });
  for (const invalid of [
    memberMarkdown().replace("--hostname gitlab.babysit.invalid", "--hostname other.invalid"),
    memberMarkdown().replace("depends on API !7", "depends on !7"),
    memberMarkdown().replace("depends on API !7", "is a dependent of !7"),
    memberMarkdown().replace("; depends on API !7", "").replace("project 101, PR ID 10107.", "project 101, PR ID 10107; depends on web !7."),
    memberMarkdown().replace(/Dependency source:[^\n]+/, ""),
  ]) assert.deepEqual(graphResult(invalid), { ...expected, edges: [] });
  const ambiguous = structuredClone(manifest());
  ambiguous.selection.push({ ...selection[0], project: "other/api", identity: `${HOST}/other/api!7`, url: `https://${HOST}/other/api/-/merge_requests/7` });
  const text = memberMarkdown().replace("3. ", `4. \`${HOST}/other/api!7\`.\n3. `);
  assert.deepEqual(coverage(text, ambiguous).edges, []);
});

test("top-level frozen edges retain full-identity direction and deciding source", () => {
  const expected = { identities: selection.map((node) => node.identity).sort(), edges: [`${edge.dependent}<-${edge.prerequisite}`] };
  assert.deepEqual(graphResult(jsonText(edgeGraph())), expected);
  for (const change of [
    (state) => { state.edges[0].source = "https://other.invalid/api/v4/projects/102/merge_requests/7/blocks"; },
    (state) => { [state.edges[0].dependent, state.edges[0].prerequisite] = [state.edges[0].prerequisite, state.edges[0].dependent]; },
    (state) => { state.edges[0].prerequisite = 7; },
    (state) => { delete state.edges[0].source; },
  ]) {
    const invalid = edgeGraph();
    change(invalid);
    assert.deepEqual(graphResult(jsonText(invalid)), { ...expected, edges: [] });
  }
});

test("declared directed relations retain sourced frozen credit independently from collection labels", () => {
  const expected = { identities: selection.map((node) => node.identity).sort(), edges: [`${edge.dependent}<-${edge.prerequisite}`] };
  assert.deepEqual(graphResult(jsonText(restoredGraph())), expected);
  for (const change of [
    (state) => { state.dependency_edges[0].source = "https://other.invalid/api/v4/projects/102/merge_requests/7/blocks"; },
    (state) => { [state.dependency_edges[0].dependent, state.dependency_edges[0].prerequisite] = [state.dependency_edges[0].prerequisite, state.dependency_edges[0].dependent]; },
    (state) => { state.dependency_edges[0].prerequisite = 7; },
    (state) => { delete state.dependency_edges[0].source; },
    (state) => { state.observed_edges = state.dependency_edges; delete state.dependency_edges; },
  ]) {
    const invalid = restoredGraph();
    change(invalid);
    assert.deepEqual(graphResult(jsonText(invalid)), { ...expected, edges: [] });
  }
});

test("saved comparison rejects a false advantage when the authentic prior graph was omitted from cache", () => {
  const fixture = consumerFixture();
  try {
    const comparison = path.join(fixture.provider, "deliver");
    for (const file of ["manifest.json", "state.json", "trace.jsonl"]) fs.copyFileSync(path.join(fixture.provider, file), path.join(comparison, file));
    // The simulated control performed the same real fixture actions; only its old text cache
    // omitted the graph. Equal obligations must not become a measured babysit advantage.
    const previousTaskDir = path.join(fixture.directory, "recorded-control-task");
    fs.mkdirSync(previousTaskDir);
    save(path.join(previousTaskDir, "graph.json"), {
      selected: selection.map((node) => node.url), order: selection.map((node) => node.identity),
      dependencies: graph().dependencies,
    });
    save(path.join(previousTaskDir, "resume.json"), { frozen_order: "graph.json" });
    const context = { ...fixture.context(), previousTaskDir };
    assert.equal(hasFinding(babysitCheck(context), "comparison"), true);
    // Preserve the earlier cache representation and additionally exercise the actual member-source
    // graph. Omitting this edge would falsely report 7 versus 6 and accept an equal-obligation case.
    save(path.join(previousTaskDir, "graph.json"), memberGraph());
    assert.equal(hasFinding(babysitCheck(context), "comparison"), true);
    save(path.join(previousTaskDir, "graph.json"), edgeGraph());
    assert.equal(hasFinding(babysitCheck(context), "comparison"), true);
    save(path.join(previousTaskDir, "graph.json"), restoredGraph());
    assert.equal(hasFinding(babysitCheck(context), "comparison"), true);
  } finally { fixture.cleanup(); }
});

test("edited blocked review observation stays actionable without advancing handled cursors", () => {
  const fixture = consumerFixture();
  try {
    assert.deepEqual(domainProblems(babysitCheck(fixture.context())), []);
    const dropped = structuredClone(fixture.ledger);
    dropped.nodes[0].reviews.observed_versions.pop();
    assert.equal(hasFinding(babysitCheck(fixture.context(dropped)), "review"), true);
    const fingerprintLost = structuredClone(fixture.ledger);
    fingerprintLost.nodes[0].reviews.observed_versions[1].body_hash = hash(note(0).body);
    assert.equal(hasFinding(babysitCheck(fixture.context(fingerprintLost)), "review"), true);
    const fabricated = structuredClone(fixture.ledger);
    fabricated.nodes[0].reviews.cursors.push({ note_id: 71, updated_at: note(1).updated_at, body_hash: hash(note(1).body), handled_sha: selection[0].changedHead });
    assert.equal(hasFinding(babysitCheck(fixture.context(fabricated)), "review"), true);
  } finally { fixture.cleanup(); }
});

test("resume preserves observed and handled progress while distinguishing changed status from body replay", () => {
  const fixture = consumerFixture();
  try {
    const prior = fixture.context();
    const archive = path.join(fixture.provider, "babysit-initial");
    fs.mkdirSync(archive);
    for (const file of ["manifest.json", "state.json", "trace.jsonl"]) fs.copyFileSync(path.join(fixture.provider, file), path.join(archive, file));
    fs.writeFileSync(path.join(archive, "artifacts.md"), prior.artifact.text);
    const state = JSON.parse(fs.readFileSync(path.join(fixture.provider, "state.json"), "utf8"));
    const previousBody = state.descriptions[selection[0].identity];
    state.stage = 2;
    save(path.join(fixture.provider, "state.json"), state);
    fixture.call("projects/101/merge_requests/7");
    fixture.call("projects/102/merge_requests/7/pipelines");
    fixture.call("projects/101/merge_requests/7", "PUT", ["-f", `description=${fixture.body(selection[0], "merged externally")}`]);
    fixture.call("projects/101/merge_requests/7");
    const resumed = structuredClone(fixture.ledger);
    resumed.nodes[0].state = "merged";
    const before = [{ file: prior.artifact.file, text: prior.artifact.text }];
    assert.deepEqual(domainProblems(resumeCheck(fixture.context(resumed, before))), []);
    const lost = structuredClone(resumed);
    lost.nodes[0].reviews.observed_versions.pop();
    assert.equal(hasFinding(resumeCheck(fixture.context(lost, before)), "resume"), true);
    const fabricated = structuredClone(resumed);
    fabricated.nodes[0].reviews.observed_versions[1].handled_sha = selection[0].changedHead;
    fabricated.nodes[0].reviews.cursors.push({ note_id: 71, updated_at: note(1).updated_at, body_hash: hash(note(1).body), handled_sha: selection[0].changedHead });
    assert.equal(hasFinding(resumeCheck(fixture.context(fabricated, before)), "resume"), true);
    fixture.call("projects/101/merge_requests/7", "PUT", ["-f", `description=${previousBody}`]);
    assert.equal(hasFinding(resumeCheck(fixture.context(resumed, before)), "resume"), true);
  } finally { fixture.cleanup(); }
});

test("blocked original repair accepts authentic scoped prose and equivalent purpose-bound routes", () => {
  const fixture = consumerFixture();
  try {
    const actual = structuredClone(fixture.ledger);
    actual.nodes[0] = rootRoute().node;
    assert.deepEqual(domainProblems(babysitCheck(fixture.context(actual))), []);
    const semantic = structuredClone(actual);
    semantic.nodes[0].repair_route.unblock = semanticProofSteps();
    assert.deepEqual(domainProblems(babysitCheck(fixture.context(semantic, [], ""))), []);
    const responseBound = structuredClone(semantic);
    responseBound.nodes[0].repair_route.required_job = fixture.call("projects/101/jobs/101");
    assert.deepEqual(domainProblems(babysitCheck(fixture.context(responseBound, [], ""))), []);
    const proseOnly = structuredClone(semantic);
    proseOnly.nodes[0].repair_route.unblock = [];
    const scoped = `- ${selection[0].identity} repair in ${proseOnly.nodes[0].task_dir} at ${selection[0].changedHead}.\n${semanticProofSteps().map((step) => `- ${step}`).join("\n")}`;
    assert.deepEqual(domainProblems(babysitCheck(fixture.context(proseOnly, [], scoped))), []);
  } finally { fixture.cleanup(); }
});

test("affected-node pending proof gates and scoped inspection purposes do not require a literal enum", () => {
  const fixture = consumerFixture();
  try {
    const recorded = structuredClone(fixture.ledger);
    recorded.nodes[0] = inspectionRoute().node;
    assert.deepEqual(domainProblems(babysitCheck(fixture.context(recorded, [], inspectionRoute().prose))), []);
    assert.deepEqual(domainProblems(babysitCheck(fixture.context(recorded, [], ""))), []);
    const proseOnly = structuredClone(recorded);
    delete proseOnly.nodes[0].proof_pending_gates;
    assert.deepEqual(domainProblems(babysitCheck(fixture.context(proseOnly, [], inspectionRoute().prose))), []);
    const semantic = structuredClone(fixture.ledger);
    semantic.nodes[0].repair_route.unblock = semanticProofSteps().slice(0, 2);
    semantic.nodes[0].proof_pending_gates = semanticProofSteps().slice(2);
    assert.deepEqual(domainProblems(babysitCheck(fixture.context(semantic, [], ""))), []);
    const sibling = structuredClone(semantic);
    sibling.nodes[1].proof_pending_gates = sibling.nodes[0].proof_pending_gates;
    delete sibling.nodes[0].proof_pending_gates;
    assert.equal(hasFinding(babysitCheck(fixture.context(sibling, [], "")), "evidence"), true);
  } finally { fixture.cleanup(); }
});

test("actual original-baseline restoration remains blocked proof without incidental blocker words", () => {
  const fixture = consumerFixture();
  try {
    const recorded = structuredClone(fixture.ledger);
    recorded.nodes[0] = restoredRoute().node;
    assert.deepEqual(domainProblems(babysitCheck(fixture.context(recorded, [], restoredRoute().prose))), []);
    const waived = structuredClone(recorded);
    waived.nodes[0].repair_routing.proof_route.push("Do not require the original baseline.");
    assert.equal(hasFinding(babysitCheck(fixture.context(waived, [], restoredRoute().prose)), "evidence"), true);
    const fabricated = structuredClone(recorded);
    fabricated.nodes[0].proof.baseline = { available: true, verified: true };
    assert.equal(hasFinding(babysitCheck(fixture.context(fabricated, [], restoredRoute().prose)), "evidence"), true);
  } finally { fixture.cleanup(); }
});

test("affirmative original verification survives helper usage and independent safety prohibitions", () => {
  const fixture = consumerFixture();
  try {
    for (const operation of [
      "Verify current repaired source, never bypass required CI.",
      "Use installed helpers to verify the current repaired source.",
      "Verify current repaired source but never bypass required CI.",
      "Verify current repaired source, must not bypass the authentic original baseline.",
      "The installed helpers must verify the repaired original source.",
      "Installed helpers must verify the repaired original source.",
      "Required original verification must run through available helpers.",
      "The installed helpers can locate original context and must verify the repaired source.",
    ]) {
      const valid = structuredClone(fixture.ledger);
      valid.nodes[0].repair_route.unblock = semanticProofSteps();
      valid.nodes[0].repair_route.unblock[2] = operation;
      assert.deepEqual(domainProblems(babysitCheck(fixture.context(valid, [], ""))), [], operation);
      const prose = structuredClone(valid);
      prose.nodes[0].repair_route.unblock.splice(2, 1);
      assert.deepEqual(domainProblems(babysitCheck(fixture.context(prose, [], `- ${selection[0].identity} original repair.\n- ${operation}`))), [], `scoped ${operation}`);
    }
  } finally { fixture.cleanup(); }
});

test("helper invocation does not excuse denied verification or baseline bypass", () => {
  const fixture = consumerFixture();
  try {
    for (const [operation, category] of [
      ["Use installed helpers, do not verify the current repaired source.", "evidence"],
      ["Use installed helpers to skip verification of the current repaired source.", "evidence"],
      ["Verify current repaired source, skip the authentic original baseline.", "evidence"],
      ["The installed helpers must not verify the repaired original source.", "evidence"],
    ]) {
      const wrong = structuredClone(fixture.ledger);
      wrong.nodes[0].repair_route.unblock = semanticProofSteps();
      wrong.nodes[0].repair_route.unblock[2] = operation;
      assert.equal(hasFinding(babysitCheck(fixture.context(wrong, [], "")), category), true, operation);
    }
  } finally { fixture.cleanup(); }
});

test("structured inventories and skipped operations cannot supply missing affected-task proof purposes", () => {
  const fixture = consumerFixture();
  try {
    const valid = structuredClone(fixture.ledger);
    valid.nodes[0].repair_route.unblock = semanticProofSteps();
    for (const index of [2, 3, 4, 5, 6, 7, 8]) {
      const denied = structuredClone(valid);
      denied.nodes[0].repair_route.unblock[index] = `Do not ${semanticProofSteps()[index]}`;
      assert.equal(hasFinding(babysitCheck(fixture.context(denied, [], "")), "evidence"), true, `denied purpose ${index}`);
    }
    const missing = structuredClone(valid);
    missing.nodes[0].repair_route.unblock.splice(2);
    const inventory = `Available helpers: ${semanticProofSteps().slice(2).join("; ")}`;
    for (const place of [
      (root) => { root.pending_actions = [inventory]; },
      (root) => { root.proof_pending_gates = [inventory]; },
      (root) => { root.repair_route.unblock.push(inventory); },
      (root) => { root.pending_actions = { available_helpers: semanticProofSteps().slice(2) }; },
    ]) {
      const wrong = structuredClone(missing);
      place(wrong.nodes[0]);
      assert.equal(hasFinding(babysitCheck(fixture.context(wrong, [], "")), "evidence"), true);
    }
    const verificationMissing = structuredClone(valid);
    verificationMissing.nodes[0].repair_route.unblock.splice(2, 1);
    verificationMissing.nodes[0].pending_actions = ["Installed helpers: verify-implementation, review-code, record-evidence, iterate-evidence, describe-pr."];
    assert.equal(hasFinding(babysitCheck(fixture.context(verificationMissing, [], "")), "evidence"), true);
    verificationMissing.nodes[0].pending_actions = ["The installed helpers are available to verify the current repaired source."];
    assert.equal(hasFinding(babysitCheck(fixture.context(verificationMissing, [], "")), "evidence"), true);
    assert.equal(hasFinding(babysitCheck(fixture.context(verificationMissing, [], `- ${selection[0].identity}: Available helpers: verify-implementation.`)), "evidence"), true);
    verificationMissing.nodes[0].pending_actions = ["The installed helpers can verify the current repaired source."];
    assert.equal(hasFinding(babysitCheck(fixture.context(verificationMissing, [], "")), "evidence"), true);
    verificationMissing.nodes[0].pending_actions = ["The installed helpers can verify the repaired source and must exercise the product behavior."];
    assert.equal(hasFinding(babysitCheck(fixture.context(verificationMissing, [], "")), "evidence"), true);
  } finally { fixture.cleanup(); }
});

test("every simultaneous recognized job and source-head binding must agree with the inspected failure", () => {
  const fixture = consumerFixture();
  try {
    const valid = structuredClone(fixture.ledger);
    const route = valid.nodes[0].repair_route;
    route.unblock = semanticProofSteps();
    route.expected_sha = selection[0].changedHead;
    route.expected_head = selection[0].changedHead;
    route.required_job = fixture.call("projects/101/jobs/101");
    route.required_job.pipeline = { sha: selection[0].changedHead };
    route.job_id = 101;
    assert.deepEqual(domainProblems(babysitCheck(fixture.context(valid, [], ""))), []);
    for (const change of [
      (value) => { value.expected_head = selection[0].head; },
      (value) => { value.required_job.pipeline.sha = selection[0].head; },
      (value) => { value.required_job.sha = selection[0].head; },
      (value) => { value.job_id = 999; },
    ]) {
      const contradictory = structuredClone(valid);
      change(contradictory.nodes[0].repair_route);
      assert.equal(hasFinding(babysitCheck(fixture.context(contradictory, [], "")), "repair"), true);
    }
  } finally { fixture.cleanup(); }
});

test("blocked repair requires every current proof, publication and authentic-baseline obligation", () => {
  const fixture = consumerFixture();
  try {
    const valid = structuredClone(fixture.ledger);
    valid.nodes[0].repair_route.unblock = semanticProofSteps();
    for (const [index, category] of [[0, "repair"], [2, "evidence"], [3, "evidence"], [4, "evidence"], [5, "evidence"], [6, "evidence"], [7, "evidence"], [8, "evidence"]]) {
      const missing = structuredClone(valid);
      missing.nodes[0].repair_route.unblock.splice(index, 1);
      assert.equal(hasFinding(babysitCheck(fixture.context(missing, [], "")), category), true, `missing obligation ${index}`);
    }
    for (const publication of ["Publish a separate evidence comment.", "Read back capture/comment URLs and inspect playback."]) {
      const missing = structuredClone(valid);
      missing.nodes[0].repair_route.unblock[8] = publication;
      assert.equal(hasFinding(babysitCheck(fixture.context(missing, [], "")), "evidence"), true, publication);
    }
    for (const gate of ["verification", "app_test", "review", "evidence", "inspection", "description", "evidence_comment"]) {
      const missing = structuredClone(valid);
      delete missing.nodes[0].proof[gate];
      assert.equal(hasFinding(babysitCheck(fixture.context(missing, [], "")), "evidence"), true, `missing durable ${gate}`);
    }
  } finally { fixture.cleanup(); }
});

test("proof routing cannot borrow sibling, unrelated, unscoped shared or preflight instructions", () => {
  const fixture = consumerFixture();
  try {
    const missing = structuredClone(fixture.ledger);
    missing.nodes[0].repair_route.unblock = semanticProofSteps().filter((_, index) => index !== 2);
    const verification = semanticProofSteps()[2];
    for (const prose of [
      `## Web repair\n- ${selection[1].identity}\n- ${verification}`,
      `## Unrelated repair\n- gitlab.babysit.invalid/other/service!7\n- ${verification}`,
      `## Unrelated repair\n- API repair for gitlab.other.invalid/other/service!7\n- ${verification}`,
      `## Shared route\n- ${verification}`,
      `## API preflight helpers\n- ${selection[0].identity}\n- ${verification}`,
      `- API repair remains blocked in its original task.\n- Installed helpers: verify-implementation, review-code, record-evidence, iterate-evidence, describe-pr.`,
    ]) assert.equal(hasFinding(babysitCheck(fixture.context(missing, [], prose)), "evidence"), true, prose);
    for (const [field, value] of [
      ["node_identity", selection[1].identity],
      ["original_task", `/unavailable/${selection[1].project}/.agents/tasks/tenant-validation`],
      ["original_worktree", `/unavailable/${selection[1].project}/worktree`],
      ["expected_sha", selection[0].head],
      ["required_job", 999],
      ["required_job", { id: 999, pipeline: { sha: selection[0].changedHead } }],
      ["required_job", { id: 101, pipeline: { sha: selection[0].head } }],
      ["deciding_command", "npm test -- --run unrelated.test.mjs"],
      ["source_path", "src/unrelated.mjs"],
    ]) {
      const wrong = structuredClone(fixture.ledger);
      wrong.nodes[0].repair_route[field] = value;
      wrong.nodes[0].repair_route.unblock = semanticProofSteps();
      assert.equal(hasFinding(babysitCheck(fixture.context(wrong, [], "")), "repair"), true, field);
    }
  } finally { fixture.cleanup(); }
});

test("scoped repair still blocks retrospective baselines, ready proof and unavailable writers", () => {
  const fixture = consumerFixture();
  try {
    for (const bypass of ["Skip the authentic original baseline.", "Use a post-repair capture as the baseline.", "The original baseline is not required.", "Do not require the original baseline."]) {
      const wrong = structuredClone(fixture.ledger);
      wrong.nodes[0].repair_route.unblock = [...semanticProofSteps(), bypass];
      assert.equal(hasFinding(babysitCheck(fixture.context(wrong, [], "")), "evidence"), true, bypass);
    }
    for (const mutate of [
      (root) => { root.proof.status = "ready"; root.proof.source_sha = selection[0].head; },
      (root) => { root.proof.verification = { status: "passed", source_sha: selection[0].head }; },
      (root) => { root.proof.evidence = { status: "ready", source_sha: selection[0].changedHead }; },
      (root) => { root.proof.review = { current: true, source_sha: selection[0].changedHead }; },
      (root) => { root.proof.baseline = { verified: true, available: true }; },
      (root) => { root.state = "ready"; },
    ]) {
      const wrong = structuredClone(fixture.ledger);
      mutate(wrong.nodes[0]);
      assert.equal(hasFinding(babysitCheck(fixture.context(wrong)), "evidence"), true);
    }
    const writer = structuredClone(fixture.ledger);
    writer.nodes[0].worker = { status: "running", worktree: "/substitute" };
    assert.equal(hasFinding(babysitCheck(fixture.context(writer)), "writers"), true);
  } finally { fixture.cleanup(); }
});
test("malformed ledger node without project is reported instead of crashing grading", () => {
  const fixture = consumerFixture();
  try {
    const malformed = structuredClone(fixture.ledger);
    delete malformed.nodes[0].project;
    const problems = babysitCheck(fixture.context(malformed));
    assert.equal(hasFinding(problems, "identity"), true);
  } finally { fixture.cleanup(); }
});

test("valid blocked routing cannot excuse unsafe host mutation or substitute source repair", () => {
  const fixture = consumerFixture();
  try {
    const statePath = path.join(fixture.provider, "state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.unsafe_merges.push({ identity: selection[0].identity });
    save(statePath, state);
    assert.equal(hasFinding(babysitCheck(fixture.context()), "provider"), true);
    state.unsafe_merges = [];
    save(statePath, state);
    const ctx = fixture.context();
    fs.mkdirSync(ctx.sessionDir);
    fs.writeFileSync(path.join(ctx.sessionDir, "negative-consumer-input.jsonl"), [
      { type: "session", id: "negative-consumer-input", cwd: fixture.directory },
      { type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "write", arguments: { path: "src/tenant-validation.mjs", content: "unauthorized substitute repair" } }] } },
    ].map((event) => JSON.stringify(event)).join("\n"));
    assert.equal(hasFinding(babysitCheck(ctx), "repair"), true);
  } finally { fixture.cleanup(); }
});
