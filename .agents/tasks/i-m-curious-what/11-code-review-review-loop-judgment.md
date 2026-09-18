---
type: code-review
date: 2026-09-17
branch: i-m-curious-what
base_branch: main
base_sha: 31d9b0ffce0773d00b37011a3dab0ed9e1c366e1
head_sha: b318166ae9d67cc7c5b7ebb055f4e8ade85e5ef7
status: clean
summary: "Reviewed the 11 source files the branch changes against `main` (200 changed lines: retry and provenance in `systemOne()`, true/false criteria on the five gate questions, a new `axis-coverage` command, and previous-round carry-over in `review-code`). No critical or major finding: the retry stays inside `JUDGE_TIMEOUT` (measured 1032 ms against a 3 s `retry-after` with `JUDGE_TIMEOUT=1`), the exit-code contract and every `--json` shape are unchanged, and all 37 pack call sites already discard the new stderr line. Six advisories remain, the two worth acting on being partial provenance rollout and a `Retry-After` clamp whose comment says the opposite of the code. The next phase describes the pull request."
---

# Code Review

## Scope

- merge base: `31d9b0ffce0773d00b37011a3dab0ed9e1c366e1` (`git merge-base origin/main HEAD`)
- reviewed HEAD: `b318166ae9d67cc7c5b7ebb055f4e8ade85e5ef7` on `i-m-curious-what`
- commits: 13 after the merge base; 5 feature commits (`56474a9`, `f697e4c`, `ae91316`, `d304a75`, `518d77f`) and 8 `docs(task)` artifact commits
- staged and unstaged changes: none; the tracked tree is clean at `b318166`
- task-owned untracked files: none
- excluded changes: the 11 files under `.agents/tasks/i-m-curious-what/` are task artifacts, not review subjects. Two untracked paths are present and outside the change, `.backups/` and `.ignore`; neither is in `.gitignore`, and neither is part of this diff.

Reviewed: `skills/delivery/typed-judgment/judge.mjs` (+96 -17), `skills/delivery/typed-judgment/SKILL.md`, `skills/delivery/review-code/SKILL.md`, `skills/delivery/review-code/references/code_review_template.md`, `skills/delivery/verify-implementation/SKILL.md`, `skills/delivery/verify-implementation/references/verification_template.md`, `skills/delivery/resolve-pr-reviews/SKILL.md`, `skills/delivery/resolve-pr-reviews/references/pr_review_template.md`, `tests/judge.test.mjs` (+62 -1), `tests/lib/typesafe-stub.mjs` (+8 -1), `workflows/delivery.md`. 200 changed lines over 11 files.

## Previous Round

None. No earlier `NN-code-review-*.md` exists in `.agents/tasks/i-m-curious-what/`.

## Requirements and Standards

- task or ticket: `.agents/tasks/i-m-curious-what/task.md` — "what we can steal from `NiazMorshed2007/jev-review` and implement in our review loops". It lists no acceptance criteria, so the plan's Desired End State is the standard applied here.
- implementation source: `04-plan-review-loop-judgment.md` (`plan`, sha `bfc8342`), five phases, each with its own receipt (`05`–`09`). Its Desired End State: a transient failure costs a short wait not the gate; an oversized request says so and is not retried; each gate question carries its true/false boundary; every judgment a skill records in an artifact records model and token counts; a skipped review axis is caught by a scored question; the next round knows what the previous round raised.
- verification: `10-verification-review-loop-judgment.md`, status `passed`, 22 items, no `fail` and no `untested`. Its `C1`–`C3`, `A7`–`A10`, `A13`, `A15`–`A19` are proven by a quoted command and output and were not re-run here. Its `## Findings` and `## Missing` are both `None.`; its three hand-decided rows (`T1`, `T2`, `A14`) and the `A5`/`A12` observation are read below.
- repository instructions: `shared/CONVENTIONS.md` "Typed judgments"; `skills/delivery/typed-judgment/SKILL.md` availability-and-fallback contract (exit 3 means the caller applies its own rule, never fail a step because the helper was unavailable). `npm test` runs `scripts/validate.mjs`, `sync-plugin --check`, `build-packs --check`, `node --test tests/`. Only `agents/agent-*.md` is generated from worker skills, so the non-worker `SKILL.md` edits here need no resync — consistent with `build-packs --check` passing.

## Change Profile

- intent and expected behavior: port four behaviors of the jev-review client of the same TypeSafe System One endpoint into this collection's review loops, plus two the design left open. No vendored code, no new dependency.
- change description quality: strong. Each of the five feature commit titles stands alone (`feat(typed-judgment): retry transient failures, record provenance`), and each body names the behavior, the motivation, the decision and its limit — `f697e4c` explicitly records what is *unchanged* (instructions, thresholds, downgrade-only status rules), and `56474a9` records why `jev-latest` is pinned into the record. No pull request exists yet, so `gh pr view` returns none and the base falls through to the repository default branch.
- implementation model and review model: the implementation receipts record no model. This review was produced by Claude Opus 5.
- changed-line size and logical cohesion: 200 changed lines across 11 files, one theme (the helper's handling of the endpoint contract, and the review loop's use of it). Inside the ~300-line coherent band; no split required.
- resulting large-file concerns: `judge.mjs` grows from ~540 to ~633 lines and holds 20 commands. It is still one file with one shape per command; no size gate is crossed.
- dependency or lockfile changes: none. `package.json` and any lockfile are untouched; `axis-coverage` adds no import.

## Tests Reviewed First

- behavior claimed by tests: `tests/judge.test.mjs` gains two tests. `judge axis-coverage` asserts the level-to-verdict mapping at each of the four levels (`covered` 3, `asserted` 1, `skipped` 0), that a confidence of 0.4 becomes `unclear`, that exactly the five axis ids are sent, that the artifact text is the state, that `--json` returns five rows, and that a missing argument exits 2. `judge systemOne` asserts the retry arithmetic by request count against a status queue: one 429 re-sent (2 requests), two 5xx then success (3), three 5xx exhausted at exit 3 (3), `JUDGE_RETRIES=0` (1), and a 400 `max_tokens_exceeded` at exit 3 after one request. It also asserts the provenance line exactly, `judge: model jev-stub, tokens 1 in / 1 out`. Three assertions were added to existing tests: `open_major` sends exactly `type, instructions, criteria` and its `false` criterion matches `/Only advisories remain/`, and `plan-remaining`'s boundary-free `remaining` question sends no `criteria` key.
- missing or misleading coverage: one assertion was loosened. The `extract-json` unclear case changed from `assert.deepEqual(unclear, {code, out, err})` to three separate assertions with `assert.match` on stderr. That is forced by the new provenance line joining stderr, it is specified in plan `04:229-234`, and the provenance line itself is asserted exactly in the new `systemOne` test, so no coverage left the suite. `tests/lib/typesafe-stub.mjs` is additive: a second `options = {}` argument, a status queue, an optional `retry-after`; the 401 path and the 200 path are unchanged and one-argument callers are unaffected. Two claims in the changed docs have no check in the suite: that the retry stays inside `JUDGE_TIMEOUT` when a backoff is pending, and that the real endpoint's oversized-request body contains `max_tokens_exceeded`. I confirmed the first by hand below; the second is unconfirmable here and its failure mode is a less specific message at the same exit code.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `7865` in / `73` out. One run; every axis came back `covered`, so no section was rewritten and no second run was needed.

### Correctness

- assessment and evidence: the retry loop at `skills/delivery/typed-judgment/judge.mjs:91-106` terminates on every path — it returns on a 2xx, throws `TooLarge` on a 400 carrying `max_tokens_exceeded`, retries only while `retryable(status) && attempt < retries`, and throws `Unavailable` otherwise. The `AbortController` and its `clearTimeout` in `finally` are unchanged, and `wait()` at `:60-64` resolves early on abort so a pending backoff cannot outlive the deadline. I measured that claim rather than trusting it: against the in-process stub with `statuses: [429,429,429]`, `retry-after: 3` and `JUDGE_TIMEOUT=1`, the command exited 3 in 1032 ms with `judge: unavailable: no answer within 1s` after 1 request; with a single 429 and the same `retry-after: 3`, it exited 0 with `clean` in 3075 ms after 2 requests. So the honoured wait is used when it fits and the deadline wins when it does not. The caller contract is unchanged: exit 0 answered, 2 usage, 3 unavailable, and `TooLarge` extends `Unavailable` so `main()`'s existing handler at `:628-632` still exits 3. Every `--json` shape a pack parses is untouched; `axis-coverage` is a new case in the switch at `:604` and displaces nothing. `noul()` at `:113` omits `criteria` when absent, which the `plan-remaining` assertion pins, so the four `noul` questions that state no boundary send the same body as before. The five questions that gained criteria (`open_major`, `blocked`, `shown`, `open_fail`, `blocked`) keep their instructions and thresholds, so no status rule moved; verification `A11` confirmed live that the endpoint accepts the new field (`jev-1.13.0`, exit 0, no 400). Two parse edges are real but bounded, recorded as ADV-003 and ADV-005.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: the new code matches the file's established shape — small arrow helpers above `systemOne`, one `async function` per command returning `{text, json}`, the same nested-ternary verdict style already used by `tier()` at `:457` and `rerank()` at `:546`. `AXES` and `AXIS_COVERAGE` at `:216-227` read as prose the model is asked to apply, and the comment above them names the failure the command exists to catch. Hoisting the request init out of the loop at `:84-89` is what makes the retry a three-line change rather than a restructure. Two concepts are introduced that nothing currently uses: `class TooLarge extends Unavailable {}` at `:54` is never matched by `instanceof` anywhere (`grep -rn TooLarge skills tests scripts` returns only its declaration and its single `throw`), so its whole effect is the message string; and `export let lastCall` at `:57` has no importer, since the tests spawn the CLI and read stderr. Recorded as ADV-006. No dead code and no unnecessary indirection otherwise.
- helper coverage: covered, level 3, confidence 0.99

### Architecture

- assessment and evidence: the retry sits at the one choke point every command already goes through, which is plan decision 3 (option C), so no command opts in or out and the operator-visible contract stays "nonzero exit means apply your own rule". Provenance travels by a module-level `lastCall` written at `:104` and read once in `main()` at `:622` rather than by changing `systemOne`'s return shape, which would have touched all 21 call sites; each command issues exactly one `systemOne()` call (confirmed by reading the 21 sites — they are one per command function, and `extract-json` makes zero or one), so the single slot is never stale within a process. The new stderr line is the one cross-cutting risk, and it is contained: all 37 pack invocations redirect it, `node "$judge" <cmd> ... 2>/dev/null`, as at `.archon/workflows/delivery/review/delivery-review.yaml:59` and `delivery-verify.yaml:66`, so no pack's parsed value can be contaminated. Ownership is respected — `judge.mjs` still writes no files, and the artifact write stays in the skill, which is why plan decision 4 scopes provenance to skill-made calls. The one seam left open is that the general recording rule in `typed-judgment/SKILL.md:56` now applies to five skill call sites while only three templates have a place for it; that is ADV-001.
- helper coverage: covered, level 3, confidence 0.99

### Security

- assessment and evidence: no new dependency, no shell invocation, no file write, no new secret path. The bearer key is built once into the reused request init at `:86` and appears in no log; the new stderr line at `:622` carries only a model name and two integers. Failure bodies are still truncated with `.slice(0, 300)` before reaching stderr, so the added 400-branch at `:98` cannot echo an unbounded response. The `retry-after` parser at `:65-70` is defensive against a hostile or broken header — it requires a finite number, rejects negatives, and caps the wait — so a header cannot stall the command past its deadline. The one change in data flow is that `review-code` now posts its saved artifact to `api.typesafe.ai`, and that artifact quotes changed source as finding evidence by template design. This is not new data for the packed path: `delivery-review.yaml:59` already sends the same file through `review-status`, whose `reviewStatus()` at `:153-154` reads the whole artifact as state. It is new for a standalone `/review-code`, and the collection states this kind of boundary elsewhere (`test-app/SKILL.md:34`: "The helper receives `steps.json` only; never send screenshots or code"), so the missing sentence is recorded as ADV-004.
- helper coverage: covered, level 3, confidence 0.94

### Performance

- assessment and evidence: `axis-coverage` sends one request carrying five `score` questions and one copy of the artifact, not five requests; `axisCoverage()` at `:229-236` builds the question map once and maps over `Object.keys(AXES)` afterwards, so the work is five constant-time reads. Verification `A12` measured the cost live at the pessimistic end: an 86,656-byte artifact cost 23,534 input tokens and 73 output tokens in a single answered call, and a realistic 1,226-token review also returned five rows. That is one extra call per review round. The retry adds at most `JUDGE_RETRIES` (default 2) further round trips, each bounded by the same `JUDGE_TIMEOUT` deadline, so the worst case for any command moves from one round trip to 20 seconds — a bound the packs already tolerated. Backoff is `250 * 2 ** attempt` (250 ms, 500 ms) or the server's `retry-after` capped at 5 s, so no unbounded sleep exists. No loop over an unbounded collection, no added allocation on a hot path, no blocking call.
- helper coverage: covered, level 3, confidence 0.99

## Verification Story

- command or inspection: `git merge-base origin/main HEAD`, `git status --short --branch`, `git diff --name-status <base>...HEAD`, `git diff <base>...HEAD`; read `judge.mjs:54-120` and `:214-236` and `:604-624` in full; `grep -rn "judge.mjs" .archon .github scripts skills workflows tests` and read every pack invocation's redirection; `grep -rn "TooLarge\|lastCall" skills tests scripts`; `node -e` over the `JUDGE_RETRIES` parse expression and the `retry-after` clamp; a temporary harness outside the repository driving the checked-in stub with a status queue and `JUDGE_TIMEOUT=1`.
- result: `JUDGE_RETRIES` parse — unset → 2, `""` → 0, `"  "` → 0, `"-1"` → -1, `"1.5"` → 2. `retry-after: 60` → a 5000 ms wait, then the request is sent again. Deadline harness — `[429,429,429]` with `retry-after: 3` and `JUDGE_TIMEOUT=1`: exit 3, 1032 ms elapsed, 1 request, `judge: unavailable: no answer within 1s`; `[429]` with `retry-after: 3` and the default timeout: exit 0, `clean`, 3075 ms, 2 requests. Pack redirections — all 37 `node "$judge"` invocations across `.archon/workflows/delivery/**` and `delivery-omp/**` end in `2>/dev/null`.
- manual, screenshot, or before-and-after evidence: not an interface change; no accessibility, keyboard, pointer, or responsive surface is touched. `10-verification-review-loop-judgment.md` carries the green-check evidence (`npm test` exit 0, `tests 63, pass 63, fail 0`; `check-commits.mjs` exit 0, `ok: 13 subjects`; four runtime builds exit 0), which is why those were not re-run here; the checks above are the ones the green suite does not cover.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Provenance reaches three of the five skill-made call sites

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `skills/delivery/test-app/references/app_test_template.md:17`, `skills/delivery/create-epic-plan/references/epic_plan_template.md:70`
- evidence: the plan's Desired End State is "Every judgment a skill records in an artifact records the model version and token counts beside it", and `typed-judgment/SKILL.md:56` now states that as a general rule. Phase 3 updated two templates. `test-app` grades with the same `grade-steps` command and its template carries the same line shape that was updated in `verification_template.md:18` — `- Graded by: [typed-judgment helper, or own judgment because the helper was unavailable]` — but was left unchanged, so the rule has no place to land there. `create-epic-plan/SKILL.md:54` fills a `## Sizing judgments` table from `size-children` and that table has no provenance column.
- suggestion: extend the same trailing clause used in `verification_template.md:18` (`; model <model>, tokens <n> in / <m> out, or unavailable`) to `app_test_template.md:17`, and add one provenance line above the `## Sizing judgments` table. Two one-line template edits; no skill logic changes.

### ADV-002 A `Retry-After` longer than five seconds is shortened, and the comment says the opposite

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `skills/delivery/typed-judgment/judge.mjs:65-70`
- evidence: the comment reads "a wait longer than 5s is not worth the attempt", which describes skipping the retry, but `Math.min(ms, 5000)` shortens the wait and sends the request anyway. Confirmed by `node -e` over the expression: `retry-after: 60` yields a 5000 ms wait. So a service asking for a 60-second pause is re-asked at 5 s, then again after the exponential fallback, which is the pattern that extends a rate limit rather than clearing it. Bounded in practice: two retries, one `JUDGE_TIMEOUT`, and the fallback on exhaustion is exit 3, which every caller already handles by applying its own rule.
- suggestion: pick one reading. Either return `null` when `ms > 5000` and let the exhaustion path run — which is what the comment describes — or reword the comment to say the wait is capped at 5 s and the attempt still goes out.

### ADV-003 `JUDGE_RETRIES` set to an empty or blank string silently disables retries

- type: Potential issue
- severity: trivial
- category: Stability and availability
- location: `skills/delivery/typed-judgment/judge.mjs:82`
- evidence: `Number.isInteger(Number(process.env.JUDGE_RETRIES)) ? Number(...) : 2` treats a blank value as the integer 0, because `Number("")` and `Number("  ")` are both 0. Confirmed: unset → 2, `""` → 0, `"  "` → 0. `typed-judgment/SKILL.md:20` and `workflows/delivery.md:168` both say the default is 2, so a wrapper that exports `JUDGE_RETRIES=` gets no retries and no warning, which is the behavior this change exists to remove. Verification `A19` records the same observation. A negative value is also accepted and means zero retries.
- suggestion: trim before parsing so a blank reads as unset (`Number((process.env.JUDGE_RETRIES ?? "").trim() || NaN)`), or clamp with `Math.max(0, ...)` and say in the SKILL that an empty value means zero.

### ADV-004 The save step sends the review artifact off the machine without saying so

- type: Potential issue
- severity: minor
- category: Security and privacy
- location: `skills/delivery/review-code/SKILL.md:70`
- evidence: `axisCoverage()` at `judge.mjs:230` posts the whole saved artifact as the request state, and the template asks every finding for "evidence or reproduction", so quoted source, file paths, and any secret a review quotes leave the machine on each round the key is set. The packed path already sends the same file (`delivery-review.yaml:59` → `review-status` → `judge.mjs:153`), so the marginal exposure is a standalone `/review-code` run, which sent nothing before. The collection states this boundary elsewhere in exactly this register: `test-app/SKILL.md:34`, "The helper receives `steps.json` only; never send screenshots or code".
- suggestion: one sentence in the save step naming what the helper receives, so a reviewer weighing whether to quote a credential as evidence knows where that quote goes.

### ADV-005 A partly examined axis reports as `covered`, and a large artifact mostly answers `unclear`

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `skills/delivery/typed-judgment/judge.mjs:234-235`
- evidence: level 2 of `AXIS_COVERAGE` reads "Partial: evidence from some changed code, leaving part of the pinned scope unexamined", and `level >= 2 ? "covered"` maps it to the verdict that `review-code/SKILL.md:70` does not re-examine — only `skipped` and `asserted` send the reviewer back. So the command cannot catch the case where an axis was examined against part of the pinned scope. Plan `04:455` specifies this exact mapping, so it is a decision rather than a deviation. Alongside it, verification `A12` observed four of five rows returning `unclear` at confidence 0.00 to 0.44 on an 86,656-byte artifact, and `unclear` routes an axis to the session's own reading, which is the behavior before this change. Both facts are already `## Human Review` items in `10-verification-review-loop-judgment.md`.
- suggestion: leave as specified for the first live rounds, then decide with real data whether `covered` should require level 3 and whether `T.safe` is the right confidence bar for a state this large. Nothing to change in this branch.

### ADV-006 Two concepts are introduced that nothing reads

- type: Refactor suggestion
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/typed-judgment/judge.mjs:54`, `skills/delivery/typed-judgment/judge.mjs:57`
- evidence: `class TooLarge extends Unavailable {}` is thrown once at `:98` and matched by `instanceof` nowhere — `grep -rn "TooLarge" skills tests scripts` returns only the declaration and that throw — so its entire effect is the message string, which `new Unavailable("request too large for the model: ...")` would carry equally; its own comment says "Exits 3 like any other unavailability". `export let lastCall` has no importer, because the tests spawn the CLI and assert the stderr line instead.
- suggestion: keep the subclass only if a caller is about to branch on it (the SKILL says an oversized request "means the caller should send fewer questions", which would be that branch); otherwise drop both the subclass and the `export` keyword and keep the message. Either is a one-line change.

## Dead Code and Dependency Review

- newly orphaned code: none. Nothing this change replaced was left behind: `systemOne`'s single-attempt body became the loop body rather than a second path, and no command, template section, or test was superseded. The two unread concepts in ADV-006 are new surface rather than orphaned code.
- dependency findings: none. No package was added, upgraded, or removed; `package.json` and the lockfile are untouched. The only external surface is the existing `api.typesafe.ai` endpoint, already reached by 37 pack call sites, and the change makes the collection more tolerant of that dependency failing rather than less.

## Verdict

- decision: approve
- overall code-health change: improved. A transient rate limit used to cost a gate its judgment and read identically to a missing key; it now costs a bounded wait and names itself. Five routing questions that left "true" to the model now state their boundary. A review axis asserted without evidence is now distinguishable from one with nothing to report, and the next round knows what the last one raised. The retry landed at the one choke point rather than per command, and the provenance side channel avoided a 21-site signature change — both keep the helper's contract exactly where it was.
- rationale: the pinned scope was reviewed in full against the merge base. Every acceptance item in `10-verification-review-loop-judgment.md` is `pass`, its `## Findings` and `## Missing` are `None.`, and the claims the green suite does not cover — that the retry stays inside `JUDGE_TIMEOUT`, that the parse edges behave as documented, that no pack call site reads the new stderr line — were confirmed here by measurement rather than accepted. Six advisories remain; none is critical or major, and none blocks the gate.

## Review Limits

- blocked or unavailable checks: no pull request exists, so the merge target fell through to the repository default branch (`origin/main`) rather than a PR base. The `axis-coverage` run above used the checkout's `skills/delivery/typed-judgment/judge.mjs`, because the installed copy at `~/.agents/skills/typed-judgment/judge.mjs` predates this branch and has no such command; the coverage lines therefore score this artifact with the code under review. The 400-branch's `max_tokens_exceeded` string match is verified only against the checked-in stub, which was written to emit it; verification `A12` reached 23,534 input tokens live without crossing the ceiling, so the real endpoint's oversized-request body is unconfirmed. Its failure mode is bounded — a mismatch yields `HTTP 400: <vendor text>` at the same exit 3, so only the message quality is at risk, not the caller's behavior.
- residual manual verification: the plan's five `## Human Review` boxes stay open for a person, in particular whether `review-code` may call `judge.mjs` and re-save its own artifact, and whether pinning a resolved model version into a committed artifact is acceptable. The `covered`-at-level-2 bar and the `unclear` rate on large artifacts (ADV-005) need real review rounds to settle, not another read of this diff.
