---
date: 2026-09-18T01:57:44Z
git_commit: e46f4df
branch: i-m-curious-what
repository: MarkTripoli/skills
topic: "Review loop scoring and gating, and the TypeSafe System One API this collection shares with jev-review"
type: research
summary: "The review-code and verify-implementation loops both gate on a workflow-level status read from an artifact's frontmatter, cross-checked once by a typed-judgment call that can only move the status toward the more conservative outcome. Both loops depend on skills/delivery/typed-judgment/judge.mjs, whose systemOne() helper sends one of three typed question shapes (noul/choice/score) to the TypeSafe System One API and reads back only the answers field of a response that also carries model and usage. TypeSafe's public documentation, and the source of the linked jev-review repository (an independent MCP wrapper around the same endpoint), describe request/response fields and error behavior judge.mjs does not currently use or handle. agents/agent-implementation-reviewer.md and its SKILL.md wrapper are byte-identical; resolve-pr-reviews tracks rounds only through the task directory's artifact sequence."
tags: [research, codebase]
status: complete
---

# Research: Review loop scoring and gating, and the TypeSafe System One API this collection shares with jev-review

**Date**: 2026-09-18T01:57:44Z
**Git Commit**: e46f4df
**Branch**: i-m-curious-what
**Repository**: MarkTripoli/skills

## Research Question

1. In `skills/delivery/review-code/references/code_review_template.md`, what fields and severity/finding structure does the current code-review artifact capture, and how are findings categorized or scored? (analyze)
2. In `workflows/delivery.md`, what are the current stopping conditions and round limits for the review-code / fix-code-review loop group, and what currently triggers a `blocked` outcome? (analyze)
3. In `skills/delivery/typed-judgment/judge.mjs`, what request does the helper currently send to the TypeSafe System One API at `api.typesafe.ai`, and what response fields does it parse? (analyze)
4. What does `agents/agent-implementation-reviewer.md` currently instruct the reviewer subagent to compare and report, and how does its behavior compare to the SKILL.md wrapper at `skills/delivery/agent-implementation-reviewer/SKILL.md`? (analyze)
5. In `skills/delivery/resolve-pr-reviews/SKILL.md`, how does the current process track review rounds, reviewer identity, and thread state across iterations? (analyze)
6. What does `skills/delivery/verify-implementation/SKILL.md` currently check before a task enters the review loop, and how does a pass/fail/blocked verdict currently route to the next phase? (analyze)
7. On the TypeSafe System One API at `https://api.typesafe.ai/v1/systemone` (model `jev-latest`), what question types, input schema, and response schema does the API currently document or expose beyond what `judge.mjs` sends and reads today? (web)

## Research Methodology

This document records current behavior only; it does not recommend implementation work. Six named repository files (`skills/delivery/review-code/references/code_review_template.md`, `workflows/delivery.md`, `skills/delivery/typed-judgment/judge.mjs`, `agents/agent-implementation-reviewer.md`, `skills/delivery/agent-implementation-reviewer/SKILL.md`, `skills/delivery/resolve-pr-reviews/SKILL.md`, `skills/delivery/verify-implementation/SKILL.md`) were read completely by this session before dispatching workers. Five `agent-codebase-analyzer` child workers and one `agent-web-search-researcher` child worker each analyzed one question or a pair of questions sharing an area. This session then verified every worker's `path:line` citations by hand against the cited files (`diff` for the two implementation-reviewer files; direct reads of `tests/judge.test.mjs`, `tests/lib/typesafe-stub.mjs`, and the three `resolve-pr-reviews/references/` templates; and two direct fetches of `github.com/NiazMorshed2007/jev-review` and `docs.typesafe.ai/api.md` to corroborate the web worker's schema claims).

### Known limits

- `TYPESAFE_API_KEY` is unset in this environment. `judge.mjs`'s own `route-question`, `rerank`, `cite`, and `coverage` commands could not run, so this session routed questions to worker roles, ordered evidence, checked every `path:line` claim, and checked question coverage by hand instead.
- The TypeSafe System One schema findings in Finding 5 come from TypeSafe's public documentation and the jev-review repository's public source, read from this environment without a live API key; no request was made to the real endpoint, so exact wire behavior (error bodies, live score/legend shape) is documented, not independently executed here.
- TypeSafe's own `docs.typesafe.ai/primitives.md` and `docs.typesafe.ai/models.md` state the combined state-plus-questions token budget differently (roughly 32,000 tokens versus a 64k-total/32k-single-question split); the web worker treated `models.md` as the more detailed page, and this document does not resolve the discrepancy further.
- `console.typesafe.ai` is login-gated; its playground, API-key management, and decode/share-link pages could not be inspected from this environment.
- The `tests/judge.test.mjs` and `tests/lib/typesafe-stub.mjs` line ranges in Finding 4 came from the child worker's own line-numbered read; this session confirmed their content but did not re-count every line boundary digit-exact.

## Summary

The review-code and verify-implementation loops share one gating pattern: an AI session self-reports a status in JSON, a `judge.mjs` typed-judgment call checks that claim against the saved artifact and can only move it toward the more conservative outcome, and a deterministic `until_bash`/`cancel:` node routes on the checked result. `review-code`'s code-review artifact records findings on two independent severity tracks (critical/major gates the loop; minor/trivial/info, filed as advisories, never does) but the template itself never states the `clean | findings | blocked` enum that the workflow actually routes on — that enum exists only in `workflows/delivery.md`. Both loops depend on the same helper, `skills/delivery/typed-judgment/judge.mjs`, whose `systemOne()` function sends exactly one of three typed question shapes (`noul`, `choice`, `score`) inside `{state, model, questions}` to `POST https://api.typesafe.ai/v1/systemone`, and reads back only the response's `answers` field — discarding `model` and `usage`. TypeSafe's public documentation describes request/response fields `judge.mjs` does not use (an optional `criteria` on `noul` questions, a `legend` field on `score` answers, structured non-string `instructions`/`criteria`, a `GET /v1/models` endpoint, and 401/422/429/529 error codes with no retry logic in `judge.mjs`). The task's linked repository, `NiazMorshed2007/jev-review`, is an independent MCP server wrapping that same endpoint; its committed source documents an undocumented `400 max_tokens_exceeded` error and a broader retry policy (429/529/any 5xx, `retry-after` header, exponential backoff) that TypeSafe's own docs omit. Separately, `agents/agent-implementation-reviewer.md` and `skills/delivery/agent-implementation-reviewer/SKILL.md` are byte-identical, and `resolve-pr-reviews` tracks review rounds only through the task directory's incrementing artifact number, records reviewer identity as an unstructured `author` field, and assigns thread disposition through the same four-way vocabulary (`fix`/`discuss`/`decline`/`clarify`) in both its typed-judgment call and its manual fallback.

## Detailed Findings

### 1. The code-review artifact scores findings on two severity tracks, but the workflow-level gate enum lives outside the template

`skills/delivery/review-code/references/code_review_template.md` defines one artifact with two separate finding sections, each carrying its own severity enum and its own six-value category enum (`Functional correctness | Security and privacy | Data integrity and integration | Performance and scalability | Stability and availability | Maintainability and code quality`, `code_review_template.md:79,93`):

- **Critical and Required Findings** (`code_review_template.md:71-85`): gated — line 73 reads "Gate: critical- or major-severity findings only." Each entry (`CR-001`, etc.) carries `type: Nitpick | Potential issue | Refactor suggestion` (77), `severity: critical | major` (78), `category` (79), `location: path:line` (80), `failure mode` (81), `evidence or reproduction` (82), and `fix direction` (83). `None.` is permitted only "after the complete pinned scope has been reviewed and every suspected issue has been rejected with evidence" (85).
- **Advisories** (`code_review_template.md:87-98`): same `type` enum (91) and category enum (93), but `severity: minor | trivial | info` (92), with `evidence` (95) and `suggestion` (96) instead of failure-mode/fix-direction fields. "Advisories do not trigger a fix round" (98).

A third, independent classification sits in `## Verdict` (`code_review_template.md:105-109`): `decision: approve | request_changes | blocked`, plus `overall code-health change` and `rationale`. The template's frontmatter (`code_review_template.md:1-10`) shows only one example `status: findings` value; it never enumerates the `clean | findings | blocked` set. That set is defined only where the workflow reads it, in `workflows/delivery.md:95`: "the node prompt asks for a JSON-only final answer `{status, artifact, summary}` after the code-review artifact is saved, `status` copied from the artifact's frontmatter (`clean`, `findings`, or `blocked`)." Neither file states how a body-level `## Verdict` `decision` maps to the frontmatter `status` the loop actually routes on.

#### Testing patterns

No tests found; the template is a markdown artifact specification, not executable code.

### 2. The review-code / fix-code-review loop is a four-round, ungated cycle whose claimed status can only be downgraded

`workflows/delivery.md:49` defines the `delivery-review` block as a `loop_group` with `max_iterations: 4` running `review-code`, then `fix-code-review` on findings. Per `workflows/delivery.md:89`, "this loop never had a gate" in any pack, regardless of that pack's `gates` input. The "Review until clean" section (`workflows/delivery.md:93-101`) spells out the routing:

```
clean   -> until_bash (test "$status" = clean) ends the loop           (line 97)
findings -> fix-code-review runs against the named artifact, loop repeats (line 98)
blocked -> a cancel: node stops the run: "Review blocked; resolve the    (line 99)
           blocker recorded in the newest code-review artifact, then
           run the workflow again."
```

"Four passes with findings still open fail the node" (`workflows/delivery.md:101`). Before that routing runs, a typed-judgment call checks the AI session's self-reported status against the artifact it just wrote: `workflows/delivery.md:173` lists "Is a review really clean" against command `review-status`, described as one that "only ever moves a claim toward `findings` or `blocked`" — i.e. a session's own `clean` claim can be pulled down to `findings`/`blocked` by this check, but a claimed `findings`/`blocked` is never pushed back up toward `clean`. `judge.mjs`'s own implementation of that check (`skills/delivery/typed-judgment/judge.mjs:119-133`) confirms the same asymmetry in code: `reviewStatus()` reads two probabilities (`open_major`, `blocked`) from the artifact text and only overrides the caller's `claimed` value toward `blocked` or `findings`, never toward `clean`, falling back to the raw `claimed` string when the two model judgments fall in the unclear band.

`review-code` runs at the `large` model tier and `fix-code-review` (nodes `fix-phase`/`fix-phase-auto`/`fix-review`) at `medium` (`workflows/delivery.md:191-192`). The same review-code/fix-code-review pair also runs, without its own nested loop, once per implementation phase when a pack sets `review_each_phase=true` (`workflows/delivery.md:37,115`).

#### Testing patterns

No tests found; this is workflow-definition prose in `workflows/delivery.md`, not executable code.

### 3. verify-implementation applies the identical evidence-vs-claim, downgrade-only pattern before the review loop runs

`skills/delivery/verify-implementation/SKILL.md` runs in a session that "did not write the code" (`SKILL.md:8`) and re-executes, rather than trusts, every check and acceptance item the task's artifacts promise. It classifies items into three families before executing anything:

- **`C` (check) items** (`SKILL.md:22`): discovered from the manifest and CI configuration only (`package.json` scripts, `Makefile` targets, `Cargo.toml`, `go.mod`, `pyproject.toml`/`setup.cfg`/`tox.ini`, `Package.swift`, `build.gradle`, or `.github/workflows/*.yml`), "never from the receipts."
- **`T` (test-diff) items** (`SKILL.md:20`): every changed test/fixture/check file between the merge target and HEAD, graded on whether it "keeps this check's strength"; a deleted, skipped, or loosened check fails unless a plan phase asked for it explicitly.
- **`A` (acceptance) items** (`SKILL.md:24`): collected in a fixed priority order from `task.md`'s acceptance criteria, the plan's `## Desired End State` and phase `### Verify` boxes, implementation receipts' `### Verify` lines, and (for `bugfix` tasks) the reproduction command plus its regression test run against the merge target.

Every `C`/`A` command is executed by this session itself, "one at a time, with a timeout suited to the check," and "never take a result from a receipt, a summary, a CI badge, or an earlier session" (`SKILL.md:26`). Grading is deterministic first — "a `C` item whose command exits nonzero... is `fail` before anything is asked" (`SKILL.md:28`) — then the remaining rows go to `judge.mjs grade-steps --kind command` or `--kind diff`, with helper-unavailable or `unclear` rows decided by hand and flagged in `### Known limits`.

Status is set from the graded items (`SKILL.md:30-33`): `passed` (no `fail` verdicts), `failed` (at least one `fail`, itemized under `## Findings`), or `blocked` (a check could not run for a reason outside the change — explicitly never used for a code-caused failure). `workflows/delivery.md:105` shows the same downgrade-only check as the review loop applies here too: `verification-status` "only ever moving `passed` toward `failed` or `blocked`" against the saved verification artifact. Routing (`workflows/delivery.md:107-109`): `passed` ends the `delivery-verify` loop and the pack continues to review; `failed` runs `iterate-implementation` with the artifact's `## Findings` as feedback and re-verifies in a fresh session, three failed rounds failing the node; `blocked` commits the artifact and cancels the run with an instruction to supply "what the newest verification artifact's `## Missing` list names."

This session's own direct read of `judge.mjs` confirms the underlying `verificationStatus()` function (`skills/delivery/typed-judgment/judge.mjs:148-162`) mirrors `reviewStatus()`'s asymmetry: it asks two `noul` questions (`open_fail`, `blocked`) against the verification artifact text and only ever moves the caller's claimed status toward `failed` or `blocked`, never back toward `passed`.

#### Testing patterns

No tests found; `SKILL.md` is a process specification, not executable code.

### 4. judge.mjs sends exactly three typed question shapes to one endpoint and reads back only `answers`

`skills/delivery/typed-judgment/judge.mjs:56-80` defines the sole network call in the file, `systemOne(state, questions)`:

- Requires `TYPESAFE_API_KEY`; its absence throws before any request (`judge.mjs:57-58`).
- `POST` to `` `${TYPESAFE_BASE_URL || "https://api.typesafe.ai"}/v1/systemone` `` (`judge.mjs:59,64`), headers `{authorization: "Bearer <key>", "content-type": "application/json"}` (`judge.mjs:66`).
- Body: `JSON.stringify({state, model: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest", questions})` (`judge.mjs:67`).
- Timeout: `JUDGE_TIMEOUT` seconds (default 20), enforced with `AbortController` (`judge.mjs:60-62`).
- On a non-OK response, throws with the HTTP status and the first 300 characters of the response text (`judge.mjs:70`). On success, requires `body.answers` to exist and be an object, and returns it — `model` and `usage` on the response body are never read (`judge.mjs:71-73`).

Every command builds its `questions` map from three shape-builders (`judge.mjs:82-84`):

```js
noul   = (instructions) => ({type: "noul", instructions})              // yes/no probability, no criteria
choice = (instructions, criteria) => ({type: "choice", instructions, criteria})  // named-option map, .choice/.confidence/.probabilities
score  = (instructions, criteria) => ({type: "score", instructions, criteria})   // ordered-level array, .score/.probabilities
```

`noul` is used across nearly every command for binary/graded judgments (`reviewStatus`, `verificationStatus`, `reproductionStatus`, `sizeChildren`, `coverage`, `cite`, `neutral`, `gradeSteps`); `choice` wherever a named option set needs a confidence/probability distribution (`routeWorkflow`, `planRemaining`'s `next`, `triageThreads`'s `disposition`, `feedbackIntent`, `slug`, `autonomy`, `routeQuestion`); `score` for ordinal/severity judgments with an ordered criteria array (`tier`, `gradeSteps`'s `severity`, `rerank`). A shared threshold table `T = {yes: 0.8, no: 0.2, safe: 0.5, confident: 0.8, decisive: 0.9, triage: 0.7}` (`judge.mjs:39`) converts every returned probability into the small enumerated verdict each command prints. Errors are normalized to a single `Unavailable` class (`judge.mjs:49`), which `main()`'s catch turns into exit code 3 with a `judge: unavailable: <message>` stderr line (`judge.mjs:549-554`), except `extract-json`, which catches `Unavailable` itself and falls back to printing its raw input at exit 0 (`judge.mjs:215-219`).

#### Testing patterns

`tests/judge.test.mjs` spawns `judge.mjs` as a child process and asserts on stdout/exit code, using an in-process HTTP stub from `tests/lib/typesafe-stub.mjs` in place of the real API. The stub checks `authorization === "Bearer test-key"` (401 otherwise), parses the posted `{state, model, questions}` body, answers each question through the test's own `decide()` callback, and responds `{model: "jev-stub", answers, usage: {input_tokens, output_tokens}}` — confirming both the outbound request shape and that `judge.mjs` only ever consumes `answers` from that response. One test asserts the no-key path exits 3 with `"judge: unavailable: TYPESAFE_API_KEY is not set"`, and a dead-endpoint path (bad `TYPESAFE_BASE_URL`, short `JUDGE_TIMEOUT`) exits 3 with empty stdout.

### 5. TypeSafe's public documentation, and jev-review's own source, describe request/response fields and error behavior judge.mjs does not use

Public documentation lives at `docs.typesafe.ai` (confirmed reachable and matching judge.mjs's own request shape via a direct fetch of `docs.typesafe.ai/api.md` in this session). It documents `POST /v1/systemone` with the same three required request fields judge.mjs sends (`state`, `model`, `questions`), and a response of exactly `{model, answers, usage: {input_tokens, output_tokens}}` — confirming judge.mjs discards two of the three top-level response fields. Documented but unused by judge.mjs today:

- **`noul` optional `criteria`**: `{true: string, false: string}` clarifying the yes/no boundary. judge.mjs's `noul()` builder (`judge.mjs:82`) takes only `instructions`, with no parameter to pass this field, even though jev-review's own `noul` questions (`src/evaluation/questions.ts`, per the web worker) always populate it.
- **`choice` criteria values may be `null`** when an option name is self-explanatory (up to 255 options); judge.mjs always passes description strings.
- **`score` answers carry a `legend`** field (`{"0": "...", "1": "...", ...}`) echoing each level's description; every `score()` call site in judge.mjs reads only `.score`/`.probabilities`/`.confidence`.
- **Structured (non-string) `instructions`/`criteria`**: the docs' "Advanced: structure" page describes accepting `object|array|null` for these fields (nested `examples`, `what`/`not_for` boundaries, or dotted/indexed paths into `state`); every judge.mjs call site passes plain strings only.
- **Error codes** 401 (bad/missing key), 422 (validation failure, naming the offending field), 429 (rate limit), and 529 (overloaded) are documented, each distinct from judge.mjs's single generic `Unavailable` on any non-OK response (`judge.mjs:70`) — judge.mjs implements no retry or backoff.
- **`GET /v1/models`** returns `{models: [{name, description, release_date}]}`; judge.mjs never calls it, and does not log which concrete model version `jev-latest` resolved to for a given call.
- **Context and rate limits**: `docs.typesafe.ai/models.md` states 64k tokens combined per request (state + all questions) and 32k tokens for state plus the single longest question, plus 250,000 tokens/sec and 1,200 requests/minute rate limits, both "adjusting dynamically." judge.mjs has no token-budget awareness; commands such as `sizeChildren` and `gradeSteps` build one question triple per array item in a single request.
- **`confidence`**'s exact computation is explicitly unpublished ("a specialized topic that we'll keep to a separate cookbook"), described only as "a statistic computed from the probability distribution" with a recommended three-band usage pattern that matches judge.mjs's own threshold style.
- A dated jaggedness page (`docs.typesafe.ai/model-jaggedness/jev-1.13.md`, "last reviewed 2026-09-17") lists nine documented model failure modes for `jev-1.13` (the version `jev-latest` currently resolves to), including "no guaranteed structural invariants between semantically-linked questions" — i.e. a `noul` and an equivalent `choice` on the same fact are not guaranteed to agree.

The task's linked repository, `NiazMorshed2007/jev-review` (confirmed to exist via a direct fetch in this session), is a separate, local-first MCP server exposing one tool, `jev_review`, that evaluates code across 19 quality dimensions and "sends requests only to TypeSafe's Jev API" using a user-supplied key from `console.typesafe.ai`. Its committed TypeScript source documents API behavior TypeSafe's own pages omit:

- An **undocumented `400` error**: `{"detail": {"error_type": "max_tokens_exceeded", ...}}`, absent from `docs.typesafe.ai/api.md`'s 401/422/429/529 error table. jev-review's own README states the token ceiling triggering it "is not published in the API documentation or OpenAPI schema and may change."
- A broader **retry policy** than the docs recommend: retries on 429, 529, and any status ≥ 500 (not just the two documented retryable codes), honoring a `retry-after` header (seconds or HTTP-date, capped at 5s) with exponential backoff (`250 * 2^attempt`) as fallback, default `maxRetries: 2`, default 30s timeout — versus judge.mjs's single attempt with no retry.
- Its own zod schema for score answers (`jevScoreAnswerSchema`) validates `score` as `0..9` and requires `legend`/`probabilities`/`confidence` non-optional, using `.passthrough()` throughout as a defense against undocumented extra response fields.

jev-review's `jev_review` MCP tool has its own input contract, layered on top of the shared `{state, model, questions}` API, not part of TypeSafe's public schema: `{task?, diff?, files?: [{path, content}], repositoryContext?, previousEvaluation?}` (at least one of `task`/`diff`/`files`/`repositoryContext` required). Its `buildJevQuestions()` constructs exactly three questions per quality dimension — an `_applicable` noul, a `_score` score question against a fixed 10-level rubric, and a `_weakness` choice question — mapping straight onto the same three question types judge.mjs uses, with no synthetic overall score computed across dimensions.

`console.typesafe.ai` returned a login page ("Continue with Google" / email code) on a direct fetch in this session; its playground, API-key settings, and decode/share-link features could not be inspected from here.

#### Testing patterns

Not applicable — this finding is sourced from external documentation and a third party's published source, not from this repository's tests.

### 6. The two implementation-reviewer instruction files are byte-identical

`agents/agent-implementation-reviewer.md` and `skills/delivery/agent-implementation-reviewer/SKILL.md` are confirmed identical by direct `diff` in this session (no output, exit 0). Both, at the same line numbers, instruct the reviewer subagent to (`agents/agent-implementation-reviewer.md:14-48`):

- **Locate**: read a named plan file completely, or, given only a task directory, pick the newest artifact whose frontmatter `type` is `plan`, `structure-outline`, `design-tdd`, or `design-prd`, in that preference order; report "no comparison" if none exists (line 16).
- **Extract**: capture expected created/modified/deleted files, patterns, boundaries, criteria, and manual checks as concise notes, "no long quotes" (line 18).
- **Analyze**: resolve the base branch from the assignment, then the pull request/merge request, then the repository default; run `git status --short --branch`, `git diff --name-status <base>...HEAD`, and `git diff <base>...HEAD`, including uncommitted changes, reading only files that matter for behavior (line 20).
- **Categorize** into four buckets: **As planned**, **Deviations** (with expected vs. actual and a reason when evident), **Additions** (with rationale when visible), and **Missing** (distinguishing omissions from deferred work) (line 22).

Both files carry the same no-mutation rule ("never create, edit, delete, stage, or commit files, and never write into `.agents/tasks/`", line 26) and require the identical four-heading final output structure: `## Deviations from the plan` with `### Implemented as planned`, `### Deviations/surprises`, `### Additions not in plan`, and `### Items planned but not implemented` (lines 32-48).

#### Testing patterns

No tests found for either file.

### 7. resolve-pr-reviews tracks rounds by artifact number, reviewer identity as a raw field, and thread disposition through a shared four-way vocabulary

`skills/delivery/resolve-pr-reviews/SKILL.md` has no in-memory round counter; each invocation re-fetches live PR/MR state and writes one new numbered artifact. **Save** "take[s] the next artifact number" and writes `NN-pr-review-<summary>.md` (`SKILL.md:38`), so round 1 is `01-pr-review-*.md`, round 2 is `02-pr-review-*.md`, and so on — the artifact sequence in the task directory is the round history. Each round's artifact frontmatter records `base_sha:` and `head_sha:` (`references/pr_review_template.md:6-7`), and **Fetch state** says to "keep head SHA on conclusions" (`SKILL.md:24`), letting a later round detect whether the PR moved since the last saved round. Progression to another round is a human gate, not automatic: **Next** states "Repeated command is human gate; no poll/auto-run" (`SKILL.md:43`), and the pending-answer template tells the user directly that "Starting another review round does not record approval... Another review round has not started" (`references/pr_review_pending_answer.md:13,15`).

Reviewer identity is captured only as the raw `author` field pulled from the platform API when threads are written to a temporary triage file as `[{id, author, body, hunk}]` (`SKILL.md:27`); nothing in the skill normalizes or tracks reviewers as a roster across rounds, and the saved artifact's `## Review Target` section records URL, base/head, approval state, and required checks (`references/pr_review_template.md:14-19`) but no reviewer list.

Thread state and disposition: **Fetch state** pulls unresolved threads via `gh pr view --comments` / `gh api .../pulls/<number>/comments` (GitHub) or `glab mr note list` (GitLab), explicitly refusing to treat "green checks, no comments, or mergeability" as approval; "no open review threads + head approved" is the terminal check that saves an approved artifact and stops (`SKILL.md:24`). **Triage** sends threads to `judge.mjs triage-threads`, whose implementation (`skills/delivery/typed-judgment/judge.mjs:312-331`) asks, per thread, a 4-way `disposition` choice (`fix`/`discuss`/`decline`/`clarify`, criteria at `judge.mjs:316-321`), a `change` noul (does the thread ask for a change), and — only when the thread carries a `hunk` — an `addressed` noul (does the current code already satisfy the request). The returned `disposition` is nulled unless its confidence is at least `T.triage` (0.7, `judge.mjs:39`); below that bar `SKILL.md:28` says to "classify the rest yourself as `fix`, `discuss`, `decline`, `clarify`" — the same four-way vocabulary the helper uses. An `addressed` score of 0.8 or more is a signal to verify against the code before drafting a reply, not an automatic close (`SKILL.md:28`). If the helper is unavailable, every thread is classified by hand and the artifact's `helper triage` field is written `unavailable` with a `### Known limits` note (`SKILL.md:28`).

The saved artifact's `## Review Threads` section records, per thread (`references/pr_review_template.md:23-31`): `location`, `reviewer request`, a past-tense `disposition: fixed | discussed | declined | clarify` (the outcome of this round), a separate `helper triage: fix | discuss | decline | clarify | undecided, confidence 0.00, requests_change 0.00` line preserving the model's original present-tense suggestion and scores, `evidence`, `reply sent`, and `resolved`. **Apply** restricts `resolved:` to threads where "reply+action complete," and explicitly states "Never resolve declined/discussed/clarified without confirmed disposition" (`SKILL.md:34`) — non-`fix` dispositions require a human confirmation step (`SKILL.md:30`, "Wait for confirmation") before any thread of that kind can close.

#### Testing patterns

No tests found; `SKILL.md` and its `references/` templates are process/markdown specifications, not executable code.

## Code References

### Review loop and verification (this repository)

- `skills/delivery/review-code/references/code_review_template.md:1-115` - exhaustive: the whole code-review artifact template.
- `workflows/delivery.md:37,49,89,93-101,111,173,191-192,233-234` - representative: the `delivery-review` block definition, its gate exemption, the "Review until clean" routing narrative, the `review-status` typed-judgment table row, model tiers, and the Phase table rows for `review-code`/`fix-code-review`.
- `skills/delivery/verify-implementation/SKILL.md:1-53` - exhaustive: the whole verify-implementation skill.
- `workflows/delivery.md:50,103-111` - the `delivery-verify` block definition and the "Verify before review" narrative.

### Typed-judgment vendor integration

- `skills/delivery/typed-judgment/judge.mjs:1-556` - exhaustive: the whole helper; in particular `systemOne` (56-80), the `noul`/`choice`/`score` builders (82-84), the threshold table `T` (39), `reviewStatus` (119-133), and `verificationStatus` (148-162).
- `tests/judge.test.mjs`, `tests/lib/typesafe-stub.mjs` - representative: unit coverage of the helper against an in-process stand-in for the TypeSafe endpoint.

### Subagent instruction duplication

- `agents/agent-implementation-reviewer.md:1-49` and `skills/delivery/agent-implementation-reviewer/SKILL.md:1-49` - exhaustive; confirmed byte-identical via `diff`.

### Pull-request review tracking

- `skills/delivery/resolve-pr-reviews/SKILL.md:1-45` - exhaustive.
- `skills/delivery/resolve-pr-reviews/references/pr_review_template.md:1-58`, `pr_review_pending_answer.md:1-22`, `pr_review_approved_answer.md:1-6` - exhaustive.

### External vendor API (TypeSafe System One / jev-review)

- `https://docs.typesafe.ai/api.md`, `/primitives.md`, `/primitives/choice.md`, `/primitives/score.md`, `/primitives/noul.md`, `/primitives/advanced.md`, `/confidence.md`, `/models.md`, `/model-jaggedness/jev-1.13.md` - representative sample of the public documentation set fetched by the web worker and, for `/api.md`, independently re-fetched by this session.
- `https://github.com/NiazMorshed2007/jev-review` (`README.md`, `src/jev/client.ts`, `src/jev/schema.ts`, `src/mcp/server.ts`, `src/evaluation/input.ts`) - representative sample of the wrapper's source; existence and README summary independently re-fetched by this session.

## Architecture Documentation

`skills/delivery/typed-judgment/judge.mjs` is the single point of contact between this repository and the TypeSafe System One API: every other file discussed here reaches the vendor only through `systemOne()`. The review loop (Finding 2) and the verify loop (Finding 3) are structurally parallel consumers of that helper: both have an AI session self-report a status as JSON, both cross-check that claim with one `judge.mjs` call against the artifact the session just wrote, and both typed-judgment checks (`reviewStatus`, `verificationStatus`) share the same asymmetric rule — a claim can only move toward the more conservative outcome (`findings`/`blocked`, or `failed`/`blocked`), never back toward the favorable one. Both loops then hand the checked status to the same kind of deterministic `until_bash`/`cancel:` node in `workflows/delivery.md`.

The code-review artifact's two severity tracks (Finding 1) are the human-facing input to that pattern, but the mapping from the artifact's own `## Verdict` `decision` (approve/request_changes/blocked) or its per-finding severities to the frontmatter `status` (clean/findings/blocked) that the workflow actually reads is not stated in either file read for this research; the enum the workflow depends on exists only in `workflows/delivery.md:95`.

`NiazMorshed2007/jev-review` (Finding 5) is architecturally independent of this collection: it shares no code with this repository and is invoked, if at all, only by a person or agent outside this task's git history. The only connection is that it is a second, independent client of the same TypeSafe System One endpoint `judge.mjs` calls, built on the identical `{state, model, questions}` / `{answers}` contract but exercising more of that contract (optional `noul` criteria, a fixed 10-level score rubric per quality dimension) and handling more of its documented and undocumented error surface (retries on 429/529/5xx, a `400 max_tokens_exceeded` case TypeSafe's own docs do not list) than `judge.mjs` currently does.

The subagent-instruction duplication (Finding 6) and the resolve-pr-reviews round/identity/disposition tracking (Finding 7) are independent of the scoring/gating pattern above; they were researched as separate, unconnected areas per the research questions and this document keeps them separate rather than forcing a link that the evidence does not show.

## Open Questions

- Whether `skills/delivery/agent-implementation-reviewer/SKILL.md` is generated or synced from `agents/agent-implementation-reviewer.md`, or the two are maintained by hand in parallel, was not determined; no build or sync script for this pair was inspected.
- The discrepancy between `docs.typesafe.ai/primitives.md`'s and `docs.typesafe.ai/models.md`'s stated combined token budget for `state` plus `questions` was not reconciled; it is an inconsistency in TypeSafe's own external documentation, not something this repository's code can resolve.

There are 2 open questions that need review; you can ask for another research pass, provide the answers, or tell me to remove them as irrelevant.
