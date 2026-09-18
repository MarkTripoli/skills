---
task: i-m-curious-what
type: plan
summary: "Five phases port jev-review's handling of the TypeSafe System One contract into judge.mjs and the review-loop skills: retry with retry-after plus a named oversized-request error and recorded model and usage in systemOne(); true/false criteria on the five gate questions; provenance lines in the verification and pull-request review templates; a new axis-coverage command that scores how far each of the five review axes was examined; and the previous round's finding identifiers carried into the next code review. It fixes the design's five open questions as B, C, C, B (scoped to skill-made calls), and A, and records why provenance for the pack-made gate calls stays in the run log. Every phase is verified by node --test tests/judge.test.mjs against the in-process stub, which gains status sequencing and a retry-after header."
repo: MarkTripoli/skills
branch: i-m-curious-what
sha: bfc8342
---

# Review Loop Judgment Implementation Plan

## Overview

Port four behaviors of `NiazMorshed2007/jev-review` into this collection's review and verification loops, plus the two optional behaviors the design left as questions. No jev-review code is vendored; both are clients of the same TypeSafe System One endpoint, so what transfers is the handling of that contract.

## Current State Analysis

### Key Discoveries:

- `systemOne()` makes one HTTP attempt and turns any non-OK status into a single generic `Unavailable`, so a rate limit and a missing key read the same to an operator. - `skills/delivery/typed-judgment/judge.mjs:56-80`
- `main()` exits 3 on `Unavailable`, and every caller's contract is "nonzero exit means apply your own rule". A new failure kind extends that shape instead of bypassing it. - `skills/delivery/typed-judgment/judge.mjs:549-555`
- `noul()` takes `instructions` only; `choice()` and `score()` already take a second `criteria` argument. The five questions the two loops gate on are all `noul`. - `skills/delivery/typed-judgment/judge.mjs:82-84,119-162`
- The response's `model` and `usage` are read and discarded; only `body.answers` is returned. - `skills/delivery/typed-judgment/judge.mjs:71-73`
- `review-status` and `verification-status` are run by pack bash nodes with `2>/dev/null`, after the artifact is written and by a process that writes no artifact. - `.archon/workflows/delivery/review/delivery-review.yaml:45-67`
- The judgments that already reach a committed artifact are the ones a skill makes itself: `grade-steps` into the verification table's Confidence column, `triage-threads` into the `helper triage` line. - `skills/delivery/verify-implementation/SKILL.md:28`, `skills/delivery/resolve-pr-reviews/references/pr_review_template.md:25`
- `review-code` calls `judge.mjs` nowhere today. Its `## Five-Axis Assessment` has one free-text `assessment and evidence:` bullet per axis, so an axis the session skipped is indistinguishable from a clean one. - `skills/delivery/review-code/references/code_review_template.md:43-63`
- Rounds are tracked only by artifact number; nothing in `review-code` reads the previous round. - `skills/delivery/review-code/SKILL.md:14-24`
- `tests/judge.test.mjs` runs `judge.mjs` as a child process against an in-process stub that asserts the outbound body. The stub answers every request with 200 and has no way to return a status sequence or a header. - `tests/lib/typesafe-stub.mjs:18-39`
- `npm test` runs `scripts/validate.mjs`, `sync-plugin --check`, `build-packs --check`, then `node --test tests/`. `sync-plugin` regenerates only `agents/agent-*.md` from worker skills, so editing a non-worker `SKILL.md` needs no resync.

## Desired End State

A rate limit or an overload costs a short wait inside the existing timeout, not the gate. An oversized request says so and is not retried. Each gate question carries the true/false boundary it is judged against. Every judgment a skill records in an artifact records the model version and token counts beside it. A review that skipped an axis is caught by a scored coverage question rather than by a reader, and the next round knows which findings the previous round raised.

Verified by `node --test tests/judge.test.mjs` for every `judge.mjs` change and by `node scripts/validate.mjs` for the template and skill edits.

## What We're NOT Doing

- No dependency on jev-review, no MCP server, no copied source, no zod or any other runtime dependency.
- No change to the downgrade-only asymmetry of `review-status` and `verification-status`, the four-round review cap, the three-round verification cap, the five review axes, or the six-value category enum.
- No 19-dimension rubric (design question 1, option C) and no automatic request splitting (design question 5, option B).
- No change to `.archon/workflows/**` YAML. The pack nodes keep calling `review-status` and `verification-status` exactly as they do now.
- The byte-identical pair `agents/agent-implementation-reviewer.md` and `skills/delivery/agent-implementation-reviewer/SKILL.md` stays as it is.
- No reconciliation of the vendor's two contradictory token-budget pages. The ceiling stays unpublished and no threshold here depends on a number.

## Execution Strategy

The design left five questions open. This plan fixes them:

| Design question | Decision | Why |
|---|---|---|
| 1. Dimension scoring | B: score the five existing axes for coverage | Catches the real failure mode (an axis asserted without evidence) without a third vocabulary. Phase 4. |
| 2. Previous round as input | C: finding identifiers and titles only | Closes the audit gap at the smallest anchoring cost. Phase 5. |
| 3. Retry placement | C: inside `systemOne()`, attempts from an env variable, bounded by `JUDGE_TIMEOUT` | One choke point; the operator-visible contract stays "nonzero exit means apply your own rule". Phase 1. |
| 4. Provenance location | B, scoped to the calls a skill makes | Phase 3. See below. |
| 5. Oversized request | A: a distinct non-retryable error | The ceiling is unpublished, so a fixed threshold goes stale and splitting changes judgment semantics. Phase 1. |

Decision 4 departs from the design's wording in one way. The design recommends a provenance line in the code-review and verification artifacts, but `review-status` and `verification-status` are run by pack bash nodes that write no artifact and discard stderr. Putting a file write inside `judge.mjs` would break the helper's read-only contract, and threading the line back would touch ten YAML files across two pack flavors. So provenance lands in the artifact for every judgment a skill records (`grade-steps`, `triage-threads`, and the new `axis-coverage`), and the pack-made gate verdicts, which are recorded in no artifact today, keep their provenance in the run log only.

Transport: `systemOne()` stores the answered call's `model` and `usage` in a module-level `lastCall`, and `main()` writes one stderr line after any command that got an answer. The `--json` shapes stay untouched because pack nodes parse them.

Phase order follows dependency: Phase 1 adds `lastCall`, which Phases 3 and 4 record; Phase 4 adds a command whose provenance line uses the Phase 1 stderr format. Phases 2 and 5 are independent and can move.

---

## Phase 1: Retry, the oversized-request error, and recorded provenance in `systemOne()`

### Goal

A 429, a 529, or any 5xx is retried inside the existing timeout; a `400 max_tokens_exceeded` is named and never retried; the model version and token counts of an answered call reach stderr in one parseable line.

### Required Edits:

#### 1.1 The error classes, the retry helpers, and the provenance slot

**File**: `skills/delivery/typed-judgment/judge.mjs`
**Changes**: Replace the single `class Unavailable extends Error {}` at line 49 with the class pair and the three helpers.

```js
class Unavailable extends Error {}
// A request the service rejected as too large. Exits 3 like any other unavailability; the message names
// the cause so the caller splits its input instead of checking the key.
class TooLarge extends Unavailable {}

// Model version and token counts of the most recent answered call, for the artifact that records the judgment.
export let lastCall = null;

// The vendor's transient set: rate limits, its own 529, and any server error.
const retryable = (status) => status === 429 || status >= 500;
// Resolves early when the call's deadline fires, so `JUDGE_TIMEOUT` still bounds the whole call.
const wait = (ms, signal) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});
// `retry-after` is seconds or an HTTP-date; a wait longer than 5s is not worth the attempt.
const retryAfter = (response) => {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const ms = Number.isFinite(Number(header)) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, 5000) : null;
};
```

#### 1.2 The attempt loop

**File**: `skills/delivery/typed-judgment/judge.mjs`
**Changes**: `systemOne()` (lines 56-80) wraps its single `fetch` in an attempt loop. The `AbortController` and the `finally { clearTimeout(timer) }` stay outside the loop, so one deadline covers every attempt.

```diff
+  const retries = Number.isInteger(Number(process.env.JUDGE_RETRIES)) ? Number(process.env.JUDGE_RETRIES) : 2;
   const controller = new AbortController();
   const timer = setTimeout(() => controller.abort(), seconds * 1000);
+  const request = {
+    method: "POST",
+    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
+    body: JSON.stringify({ state, model: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest", questions }),
+    signal: controller.signal,
+  };
   try {
-    const response = await fetch(`${base}/v1/systemone`, { ... });
-    if (!response.ok) throw new Unavailable(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
-    const body = await response.json();
-    if (!body || typeof body.answers !== "object") throw new Unavailable("response has no answers");
-    return body.answers;
+    for (let attempt = 0; ; attempt++) {
+      const response = await fetch(`${base}/v1/systemone`, request);
+      if (!response.ok) {
+        const text = (await response.text()).slice(0, 300);
+        if (response.status === 400 && text.includes("max_tokens_exceeded")) throw new TooLarge(`request too large for the model: ${text}`);
+        if (retryable(response.status) && attempt < retries) { await wait(retryAfter(response) ?? 250 * 2 ** attempt, controller.signal); continue; }
+        throw new Unavailable(`HTTP ${response.status}: ${text}`);
+      }
+      const body = await response.json();
+      if (!body || typeof body.answers !== "object") throw new Unavailable("response has no answers");
+      lastCall = { model: body.model ?? null, usage: body.usage ?? null };
+      return body.answers;
+    }
   } catch (error) {
```

The `catch` and `finally` blocks are unchanged: `TooLarge` is an `Unavailable`, so it passes through and exits 3 with its own message. A network error is still not retried, matching the design's retry set.

#### 1.3 The provenance line

**File**: `skills/delivery/typed-judgment/judge.mjs`
**Changes**: In `main()`, between the `switch` and the `process.stdout.write` at line 544.

```js
  if (lastCall) process.stderr.write(`judge: model ${lastCall.model ?? "unknown"}, tokens ${lastCall.usage?.input_tokens ?? "?"} in / ${lastCall.usage?.output_tokens ?? "?"} out\n`);
```

A command that made no call (`extract-json` with a contained object, `slug` with one candidate) leaves `lastCall` null and writes nothing.

#### 1.4 The header comment

**File**: `skills/delivery/typed-judgment/judge.mjs`
**Changes**: Line 29, add the new variable to the env list.

```diff
-// Env: TYPESAFE_API_KEY (required), TYPESAFE_BASE_URL, TYPESAFE_DEFAULT_MODEL, JUDGE_TIMEOUT (seconds, default 20).
+// Env: TYPESAFE_API_KEY (required), TYPESAFE_BASE_URL, TYPESAFE_DEFAULT_MODEL, JUDGE_TIMEOUT (seconds,
+// default 20, the bound on the whole call), JUDGE_RETRIES (transient retries, default 2).
```

#### 1.5 Status sequencing in the stub

**File**: `tests/lib/typesafe-stub.mjs`
**Changes**: `startStub` takes a second options argument. The request is recorded before the status check so a retried attempt is counted.

```diff
-export function startStub(decide) {
+export function startStub(decide, options = {}) {
   const requests = [];
+  const statuses = [...(options.statuses ?? [])];
       const payload = JSON.parse(body);
       requests.push(payload);
+      const status = statuses.shift();
+      if (status) {
+        response.writeHead(status, options.retryAfter === undefined ? {} : { "retry-after": String(options.retryAfter) });
+        response.end(status === 400 ? '{"error":"max_tokens_exceeded"}' : `{"error":"status ${status}"}`);
+        return;
+      }
```

#### 1.6 Tests

**File**: `tests/judge.test.mjs`
**Changes**: One new test after the existing verification-status test, and one updated assertion.

```js
test("judge systemOne: a rate limit or a 5xx is retried inside the timeout, an oversized request is not, and an answered call names its model", async () => {
  const review = tmp("08-code-review-x.md", "# Review\n");
  const once = await startStub(() => noul(0.1), { statuses: [429], retryAfter: 0 });
  try {
    const result = await judge(["review-status", review, "clean"], once.env);
    assert.equal(result.out, "clean");
    assert.equal(once.requests.length, 2, "the rate-limited attempt is sent again");
    assert.match(result.err, /judge: model jev-stub, tokens 1 in \/ 1 out/);
  } finally { once.close(); }
  const twice = await startStub(() => noul(0.1), { statuses: [500, 503] });
  try {
    assert.equal((await judge(["review-status", review, "clean"], twice.env)).out, "clean");
    assert.equal(twice.requests.length, 3, "two retries by default");
  } finally { twice.close(); }
  const exhausted = await startStub(() => noul(0.1), { statuses: [500, 500, 500] });
  try {
    const result = await judge(["review-status", review, "clean"], exhausted.env);
    assert.equal(result.code, 3);
    assert.match(result.err, /judge: unavailable: HTTP 500/);
    assert.equal(exhausted.requests.length, 3, "the attempt count bounds the retries");
  } finally { exhausted.close(); }
  const off = await startStub(() => noul(0.1), { statuses: [429] });
  try {
    assert.equal((await judge(["review-status", review, "clean"], { ...off.env, JUDGE_RETRIES: "0" })).code, 3);
    assert.equal(off.requests.length, 1, "JUDGE_RETRIES=0 sends one request");
  } finally { off.close(); }
  const big = await startStub(() => noul(0.1), { statuses: [400] });
  try {
    const result = await judge(["review-status", review, "clean"], big.env);
    assert.equal(result.code, 3);
    assert.match(result.err, /request too large/);
    assert.equal(big.requests.length, 1, "an oversized request is never retried");
  } finally { big.close(); }
});
```

The `extract-json` unclear assertion at `tests/judge.test.mjs:117` compares stderr for equality and now sees the provenance line as a second line:

```diff
-    assert.deepEqual(unclear, { code: 0, out: "Something else entirely", err: "judge: status could not be recovered from the answer" });
+    assert.equal(unclear.code, 0);
+    assert.equal(unclear.out, "Something else entirely");
+    assert.match(unclear.err, /judge: status could not be recovered from the answer/);
```

The no-key assertions at lines 29 and 33 are unchanged: no call is made, so no provenance line is written.

#### 1.7 The latency claim

**File**: `workflows/delivery.md`
**Changes**: Line 168, replace "Calls take under a second."

```diff
-Calls take under a second.
+One attempt takes under a second; a rate-limited or failing attempt is retried twice (`JUDGE_RETRIES`) inside `JUDGE_TIMEOUT`, so the worst case is the timeout, 20 seconds by default, and not the round trip.
```

**File**: `skills/delivery/typed-judgment/SKILL.md`
**Changes**: Line 11, the same correction to "Calls take well under a second and a few thousand tokens." Line 22, add `JUDGE_RETRIES` to the env sentence and name the new failure:

```diff
-`TYPESAFE_BASE_URL` points the helper at another endpoint (tests use a stub); `TYPESAFE_DEFAULT_MODEL` picks the model; `JUDGE_TIMEOUT` is seconds, default 20.
+`TYPESAFE_BASE_URL` points the helper at another endpoint (tests use a stub); `TYPESAFE_DEFAULT_MODEL` picks the model; `JUDGE_TIMEOUT` is seconds, default 20, and bounds the whole call; `JUDGE_RETRIES` is how many transient failures (429, 529, any 5xx) are retried with `retry-after` or exponential backoff, default 2. A request the service rejects as too large exits 3 with `request too large for the model`, is never retried, and means the caller should send fewer questions.
```

### Success Criteria:

#### Automated Verification:

- [x] `node --test tests/judge.test.mjs`
- [x] `npm test`

human-gated: false

---

## Phase 2: True/false criteria on the five gate questions

### Goal

Each question the review, verification, and bugfix loops route on states the boundary it is judged against, in the same call site as the instruction.

### Required Edits:

#### 2.1 The builder

**File**: `skills/delivery/typed-judgment/judge.mjs`
**Changes**: Line 82.

```diff
-const noul = (instructions) => ({ type: "noul", instructions });
+const noul = (instructions, criteria) => ({ type: "noul", instructions, ...(criteria ? { criteria } : {}) });
```

#### 2.2 The five gate questions

**File**: `skills/delivery/typed-judgment/judge.mjs`
**Changes**: Add a criteria object to `reviewStatus`'s `open_major` and `blocked` (lines 122-123), `reproductionStatus`'s `shown` (line 138), and `verificationStatus`'s `open_fail` and `blocked` (lines 151-152). Instructions are unchanged. No other `noul` call gains criteria in this phase.

```js
    open_major: noul("The code review in `review` lists at least one finding of critical or major severity, or marked required or blocking, that is not recorded as fixed or declined.", {
      true: "An entry under Critical and Required Findings is still open, or an advisory describes a defect that meets the critical or major bar.",
      false: "Only advisories remain, or every gating finding is recorded as fixed or declined with evidence.",
    }),
    blocked: noul("The reviewer states the review could not be completed: a required check could not run, the diff could not be obtained, or the review is marked blocked.", {
      true: "The scope could not be pinned or a required check could not run, so part of the change went unreviewed.",
      false: "The pinned scope was reviewed; a check that ran and failed is a finding, not a block.",
    }),
```

```js
    shown: noul("`reproduction` records a concrete attempt, a command or steps with their observed result, whose outcome exhibits the reported behavior, and names the code that causes it.", {
      true: "A command or steps are recorded with their observed result, the result exhibits the reported behavior, and the causing code is named.",
      false: "The attempt is described but not run, the observed result does not show the reported behavior, or no causing code is named.",
    }),
```

```js
    open_fail: noul("The verification record in `verification` lists at least one repository check or acceptance item whose verdict is fail, or a finding that is not recorded as resolved.", {
      true: "An item in the table has verdict fail, or a finding is recorded without a resolution.",
      false: "Every item is pass, or the only non-pass items are untested and recorded as such, and no finding is left open.",
    }),
    blocked: noul("The verifier states the checks could not be run for a reason outside the change: a missing toolchain, dependency, service, or credential, or the verification is marked blocked.", {
      true: "A toolchain, dependency, service, credential, or data the checks need is missing, so the checks could not run.",
      false: "The checks ran; a check that ran and failed is a failure, not a block.",
    }),
```

#### 2.3 Tests

**File**: `tests/judge.test.mjs`
**Changes**: Inside the existing "review-status and reproduction-status" test (line 58), after the first `judge` call, assert the outbound body. Inside the existing `plan-remaining` test (line 37), assert that a question with no stated boundary sends none.

```js
    const gate = stub.requests[0].questions.open_major;
    assert.deepEqual(Object.keys(gate), ["type", "instructions", "criteria"]);
    assert.match(gate.criteria.false, /Only advisories remain/);
```

```js
    assert.ok(!("criteria" in stub.requests[0].questions.remaining), "a question with no stated boundary sends none");
```

### Success Criteria:

#### Automated Verification:

- [x] `node --test tests/judge.test.mjs`
- [x] `npm test`

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- One live `review-status` call with `TYPESAFE_API_KEY` set, confirming the endpoint accepts `criteria` on a `noul` question rather than rejecting the body; recorded in the verification artifact's `## Items` table.

---

## Phase 3: Provenance in the artifacts that already record a judgment

### Goal

A reader of a verification artifact or a pull-request review artifact sees which model version answered and what the request cost, beside the verdict it already shows.

### Required Edits:

#### 3.1 The verification template

**File**: `skills/delivery/verify-implementation/references/verification_template.md`
**Changes**: Line 18.

```diff
-- Graded by: [typed-judgment helper (`grade-steps --kind command`), or own judgment because the helper was unavailable]
+- Graded by: [typed-judgment helper (`grade-steps --kind command`), or own judgment because the helper was unavailable; model `<model>`, tokens `<n>` in / `<m>` out, or `unavailable`]
```

#### 3.2 The verify-implementation step

**File**: `skills/delivery/verify-implementation/SKILL.md`
**Changes**: Step 7 (line 28), append after the "Exit 0:" sentence.

```text
Each answered run writes one line to stderr, `judge: model <model>, tokens <n> in / <m> out`; do not discard stderr, and copy that line's model and counts into the `Graded by:` line so a later disagreement can be attributed to a version. Write `unavailable` there when no call was answered.
```

#### 3.3 The pull-request review template

**File**: `skills/delivery/resolve-pr-reviews/references/pr_review_template.md`
**Changes**: Line 25.

```diff
-- helper triage: fix | discuss | decline | clarify | undecided, confidence 0.00, requests_change 0.00 (or `unavailable`)
+- helper triage: fix | discuss | decline | clarify | undecided, confidence 0.00, requests_change 0.00, model `<model>`, tokens 0 in / 0 out (or `unavailable`)
```

#### 3.4 The resolve-pr-reviews step

**File**: `skills/delivery/resolve-pr-reviews/SKILL.md`
**Changes**: Line 28, append the same stderr instruction, naming the `helper triage` field as the destination.

#### 3.5 The recording rule

**File**: `skills/delivery/typed-judgment/SKILL.md`
**Changes**: The `## Rules` bullet "Record the judgment where the skill's template has a place for it" gains the provenance sentence.

```diff
-- Record the judgment where the skill's template has a place for it (the answer word and its probability or confidence), so a reader can see why the workflow branched.
+- Record the judgment where the skill's template has a place for it (the answer word and its probability or confidence), so a reader can see why the workflow branched. An answered call writes `judge: model <model>, tokens <n> in / <m> out` to stderr; record that model and those counts on the same line, so two artifacts that disagree can be compared by version. `jev-latest` resolves to a moving version, which is the reason to pin it in the record.
```

### Success Criteria:

#### Automated Verification:

- [x] `node scripts/validate.mjs`
- [x] `grep -q 'tokens' skills/delivery/verify-implementation/references/verification_template.md`
- [x] `grep -q 'tokens' skills/delivery/resolve-pr-reviews/references/pr_review_template.md`
- [x] `npm test`

human-gated: false

---

## Phase 4: `axis-coverage`, so a skipped review axis is not a clean one

### Goal

Each of the five review axes is scored for how far it was examined against the pinned scope, and the review session revises any axis that comes back asserted or skipped before saving.

### Required Edits:

#### 4.1 The command

**File**: `skills/delivery/typed-judgment/judge.mjs`
**Changes**: Add the scale, the axes, and the function near the other artifact-reading commands; add the header usage line and the `main()` case.

```js
//   axis-coverage <artifact.md>                  covered | asserted | skipped | unclear per review axis
```

```js
// The five axes of `review-code`, scored for coverage rather than quality: the failure the loop cannot
// otherwise see is an axis asserted without evidence, which reads the same as an axis with nothing to report.
const AXES = {
  correctness: "Correctness: requirements, boundary cases, failure paths, test validity, state, and lifecycle",
  readability: "Readability and Simplicity: names, flow, organization, unnecessary abstraction, dead code",
  architecture: "Architecture: ownership, dependencies, duplication, coupling, boundaries",
  security: "Security: untrusted input, authorization, secrets, encoding, boundary validation",
  performance: "Performance: unbounded work, N+1 access, blocking calls, hot-path allocation",
};
const AXIS_COVERAGE = [
  "Not examined: the section is empty, absent, or says nothing about the change",
  "Asserted: a verdict with no evidence from the change, or a restatement of the heading",
  "Partial: evidence from some changed code, leaving part of the pinned scope unexamined",
  "Examined: evidence named from the changed code across the pinned scope, or a stated reason the axis does not apply",
];

async function axisCoverage(file) {
  const review = fs.readFileSync(file, "utf8");
  const answers = await systemOne({ review }, Object.fromEntries(Object.entries(AXES).map(([key, axis]) =>
    [key, score(`How far does the code review in \`review\` examine the change it pins on this axis: ${axis}`, AXIS_COVERAGE)])));
  const rows = Object.keys(AXES).map((key) => {
    const a = answers[key];
    const level = Number(argmax(a.probabilities));
    const verdict = a.confidence < T.safe ? "unclear" : level >= 2 ? "covered" : level === 1 ? "asserted" : "skipped";
    return { axis: key, verdict, level, score: Number(a.score.toFixed(2)), confidence: a.confidence };
  });
  return { text: rows.map((r) => `${r.axis}\t${r.verdict}\t${r.level}\t${r.confidence}`).join("\n"), json: rows };
}
```

```diff
     case "verification-status": need(2, "<artifact.md> <claimed>"); result = await verificationStatus(rest[0], rest[1]); break;
+    case "axis-coverage": need(1, "<artifact.md>"); result = await axisCoverage(rest[0]); break;
```

`T.safe` is the existing majority bar at `judge.mjs:39`; no new constant.

#### 4.2 The template

**File**: `skills/delivery/review-code/references/code_review_template.md`
**Changes**: `## Five-Axis Assessment` (line 43) gains a provenance line, and each of the five axis sections gains one coverage line beside its existing bullet.

```diff
 ## Five-Axis Assessment
 
+- helper axis-coverage: model `<model>`, tokens `<n>` in / `<m>` out (or `unavailable`)
+
 ### Correctness
 
 - assessment and evidence:
+- helper coverage: covered | asserted | skipped | unclear, level 0-3, confidence 0.00 (or `unavailable`)
```

#### 4.3 The review-code step

**File**: `skills/delivery/review-code/SKILL.md`
**Changes**: `## Save` (line 66), between writing the artifact and the commit sentence.

```text
Then run `node <skills dir>/typed-judgment/judge.mjs axis-coverage <the saved file> --json`, where `<skills dir>` is the directory that holds this skill (in a checkout, `skills/delivery`). Record each row's verdict, level, and confidence on that axis's `helper coverage` line, and the stderr provenance line under the heading. An axis that comes back `skipped` or `asserted` was not examined against the pinned scope: examine it, rewrite that section with evidence from the changed code or the reason the axis does not apply, save again, and run the command once more. Run it at most twice and record what the second run says. A finding the second pass turns up is a finding like any other and can change the status. Exit 3, no `node`, no `TYPESAFE_API_KEY`, or an `unclear` row: write `unavailable` on the lines it would have filled, decide those axes yourself, and say under `## Review Limits` that judgments were skipped.
```

#### 4.4 The command tables

**File**: `skills/delivery/typed-judgment/SKILL.md`
**Changes**: A row in `## Commands` after `verification-status`, and `review-code` added to the skill list in `## When it runs` (line 14).

```text
| `axis-coverage <artifact.md>` | `covered`, `asserted`, `skipped`, or `unclear` per review axis, with a level 0 to 3 | `review-code` |
```

**File**: `workflows/delivery.md`
**Changes**: A row in the typed-judgment table (line 170 onward), and `review-code` added to the skill list at line 176 and to the `typed-judgment` row of the skill table at line 241.

```text
| Whether each review axis was examined or only asserted | `review-code` save step | `axis-coverage` | the session's own reading |
```

#### 4.5 Tests

**File**: `tests/judge.test.mjs`

```js
test("judge axis-coverage: one level per review axis, an unsure level goes back to the reviewer", async () => {
  let level = 3; let confidence = 0.9;
  const stub = await startStub((id, question) => score(level, question.criteria, confidence));
  try {
    const review = tmp("08-code-review-x.md", "# Code Review\n\n## Five-Axis Assessment\n");
    assert.match((await judge(["axis-coverage", review], stub.env)).out.split("\n")[0], /^correctness\tcovered\t3\t/);
    assert.deepEqual(Object.keys(stub.requests.at(-1).questions), ["correctness", "readability", "architecture", "security", "performance"]);
    assert.equal(stub.requests.at(-1).state.review, fs.readFileSync(review, "utf8"), "the artifact text is the state");
    level = 1;
    assert.match((await judge(["axis-coverage", review], stub.env)).out.split("\n")[0], /^correctness\tasserted\t1\t/);
    level = 0;
    assert.match((await judge(["axis-coverage", review], stub.env)).out.split("\n")[0], /^correctness\tskipped\t0\t/);
    confidence = 0.4;
    assert.match((await judge(["axis-coverage", review], stub.env)).out.split("\n")[0], /^correctness\tunclear\t0\t/);
    confidence = 0.9;
    assert.equal(JSON.parse((await judge(["axis-coverage", review, "--json"], stub.env)).out).length, 5);
    assert.equal((await judge(["axis-coverage"], stub.env)).code, 2);
  } finally { stub.close(); }
});
```

### Success Criteria:

#### Automated Verification:

- [x] `node --test tests/judge.test.mjs`
- [x] `node scripts/validate.mjs`
- [x] `npm test`

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- One review round run with the key set, confirming the five extra `score` questions do not push the request past the unpublished ceiling (`request too large for the model` would be the signal); recorded in the verification artifact's `## Items` table.

---

## Phase 5: The previous round's finding identifiers

### Goal

A fix round's review records what the previous round raised and what happened to it, without inheriting the previous reviewer's reasoning.

### Required Edits:

#### 5.1 The template

**File**: `skills/delivery/review-code/references/code_review_template.md`
**Changes**: New section after `## Scope` (line 21).

```markdown
## Previous Round

- previous artifact:
- CR-001 Short title: fixed | still open | declined

`None.` in the first round. Identifiers and titles only, from the previous artifact's `## Critical and Required Findings`; a finding still open is raised again below under a new identifier.
```

#### 5.2 The review-code step

**File**: `skills/delivery/review-code/SKILL.md`
**Changes**: Append to `## Requirements and tests` (line 24).

```text
When the task directory holds an earlier `NN-code-review-*.md`, read only the `### CR-...` heading lines under its `## Critical and Required Findings`, and no finding body. Record each one in `## Previous Round` as `fixed`, `still open`, or `declined`, decided from the current diff and the fix round's recorded reason, never from the previous reviewer's reasoning. A `still open` entry is raised again under `## Critical and Required Findings` with a new identifier so the gate counts it; a finding the previous round did not raise is judged on its own.
```

### Success Criteria:

#### Automated Verification:

- [x] `node scripts/validate.mjs`
- [x] `grep -q '## Previous Round' skills/delivery/review-code/references/code_review_template.md`
- [x] `npm test`

human-gated: false

---

## Human Review

### Review targets

- The five design-question decisions in `## Execution Strategy`, and the one departure from the design's recommendation: provenance reaches an artifact only for the judgments a skill makes, because the pack bash nodes that run `review-status` and `verification-status` write no artifact.
- Phase 1: that `JUDGE_TIMEOUT` bounding every attempt together, rather than each attempt, is the contract you want, and that `JUDGE_RETRIES` defaulting to 2 copies jev-review correctly.
- Phase 2: the true/false wording of the five gate questions, which is what the loops will route on.
- Phase 4: whether five extra `score` questions per review round are worth catching an asserted axis, and whether `review-code` should run `judge.mjs` at all, since it would be the first review-loop skill to do so and it re-saves its artifact after the coverage pass.
- Phase 5: whether carrying finding identifiers forward anchors the next reviewer more than it helps the audit trail.
- Changed-file ownership: Phases 1 and 2 are `judge.mjs` and its tests only; Phases 3 and 5 are templates and skill prose only; Phase 4 crosses both. No `.archon/workflows/**` file is touched in any phase.

### Verify

- [ ] Confirm the five design-question decisions (1B, 2C, 3C, 4B scoped to skill-made calls, 5A) are the ones to build.
- [ ] Confirm the retry set (429, 529, any 5xx) and the two-retry default are what this collection should copy, given no live call has been made from this environment.
- [ ] Confirm that `criteria` on a `noul` question is accepted by the live endpoint, or accept that Phase 2 ships unverified behind the existing exit-3 fallback.
- [ ] Confirm that pinning a resolved model version string into committed task artifacts is acceptable.
- [ ] Confirm that `review-code` may call `judge.mjs` and re-save its artifact after the coverage pass.

### Known limits

- `TYPESAFE_API_KEY` is unset here. The retry set, the `400 max_tokens_exceeded` body, and the acceptance of `criteria` on a `noul` question come from the vendor's documentation and jev-review's published source, not from an observed call; the stub is the only contract test.
- If the endpoint rejects `criteria` as an unknown field, every gate judgment exits 3 and each loop routes on the session's own unchecked claim, which is today's behavior on any outage. The deferred live check in Phase 2 is what would catch it.
- Provenance reaches a committed artifact only for judgments a skill makes. The pack-made `review-status` and `verification-status` verdicts are recorded in no artifact today and keep their model and usage in the run log only.
- `axis-coverage` adds five `score` questions per review round to a request whose token ceiling is unpublished and may move.
- A retried call can take up to `JUDGE_TIMEOUT` instead of under a second. The backoff wait resolves early on the deadline, so the call does not overshoot it, but a `retry-after` longer than 5 seconds is ignored above that cap and the retry may be sent sooner than the service asked.
</content>
</invoke>
