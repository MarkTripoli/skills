---
type: implementation
completed_phase: 1
summary: "Phase 1 of the review-loop judgment plan is implemented in `systemOne()`: a 429, a 529, or any 5xx is retried up to `JUDGE_RETRIES` times (default 2) with `retry-after` or exponential backoff inside the one `JUDGE_TIMEOUT` deadline, a `400 max_tokens_exceeded` throws the non-retryable `TooLarge` and exits 3 with `request too large for the model`, and an answered call records its model and token counts in the exported `lastCall`, which `main()` writes to stderr as `judge: model <model>, tokens <n> in / <m> out`. The test stub now serves a status sequence and a `retry-after` header, which Phase 4's `axis-coverage` tests reuse. Phases 3 and 4 consume the stderr provenance format recorded here."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/i-m-curious-what/task.md`
- plan artifact: `.agents/tasks/i-m-curious-what/04-plan-review-loop-judgment.md`
- phase range: Phase 1 of 5

## Child Workers
- implementer: none; performed inline, because this session has no subagent mechanism available (the `agent-implementer` role was executed by this session per the conventions' Child workers rule).
- reviewer: none; the diff was read against the plan's Required Edits inline.

## Completed Work
- `TooLarge extends Unavailable`, the exported `lastCall` slot, and the `retryable`, `wait`, and `retryAfter` helpers replace the lone `Unavailable` class. `skills/delivery/typed-judgment/judge.mjs:51-71`
- `systemOne()` wraps its `fetch` in an attempt loop with the request object, the `AbortController`, and the `finally { clearTimeout(timer) }` outside it, so one `JUDGE_TIMEOUT` deadline covers every attempt and the backoff wait resolves early on abort. `skills/delivery/typed-judgment/judge.mjs:78-111`
- A `400` whose body contains `max_tokens_exceeded` throws `TooLarge` before the retry branch, so an oversized request is never re-sent. `skills/delivery/typed-judgment/judge.mjs:97`
- An answered call stores `body.model` and `body.usage` in `lastCall`; `main()` writes one stderr line after the `switch` and before `process.stdout.write`, so a command that made no call writes nothing. `skills/delivery/typed-judgment/judge.mjs:103,576`
- The header env list names `JUDGE_RETRIES` and states that `JUDGE_TIMEOUT` bounds the whole call. `skills/delivery/typed-judgment/judge.mjs:29-30`
- `startStub(decide, options)` takes `statuses` and `retryAfter`; the request is recorded before the status check, so a retried attempt is counted. Existing callers in four test files pass one argument and are unaffected. `tests/lib/typesafe-stub.mjs:18-34`
- One new test covers the five behaviors: a `429` with `retry-after: 0` is re-sent and the provenance line appears, two 5xx retries succeed on the third attempt, three 5xx exhaust the budget and exit 3, `JUDGE_RETRIES=0` sends one request, and a `400 max_tokens_exceeded` exits 3 with `request too large` after one request. `tests/judge.test.mjs:100-134`
- The `extract-json` unclear assertion compares stderr by match instead of equality, because the provenance line is now a second stderr line. `tests/judge.test.mjs:152-154`
- The latency claim is corrected in both places that made it. `workflows/delivery.md:168`, `skills/delivery/typed-judgment/SKILL.md:10`
- `JUDGE_RETRIES`, the retry set, and the `request too large for the model` exit are documented in the availability section. `skills/delivery/typed-judgment/SKILL.md:20`

## Automated Verification
- command: `node --test tests/judge.test.mjs`
- result: pass, 9 of 9 tests, `duration_ms 4910`
- evidence: the new test `judge systemOne: a rate limit or a 5xx is retried inside the timeout, an oversized request is not, and an answered call names its model` passes in 1803ms, which is the backoff waits.

- command: `npm test`
- result: pass, 62 of 62 tests, `duration_ms 26002`
- evidence: the first run failed only `tests/install.test.mjs` with `Cannot find package '@clack/prompts' imported from scripts/install.mjs`, because this worktree had no `node_modules`. `npm ci` installed 115 packages from the committed `package-lock.json` and the suite is green. No source file was changed for it; `package.json` and `package-lock.json` are untouched.

## Deferred Human Evidence

- None for this phase. Phase 2 defers one live `review-status` call confirming the endpoint accepts `criteria` on a `noul` question, and Phase 4 defers one live review round confirming five extra `score` questions stay under the unpublished token ceiling.

## Commit Handoff
The phase commit was created after both checks were green, staging the five changed code and documentation paths explicitly. `.agents/tasks/` files and the untracked `.backups/phase1-judge-retry/` rollback copies are not in it.

## Human Review

### Review targets

- `skills/delivery/typed-judgment/judge.mjs:78-111`, the attempt loop: one `JUDGE_TIMEOUT` deadline bounds every attempt together, not each attempt, so a retried call can take up to the timeout instead of under a second.
- `skills/delivery/typed-judgment/judge.mjs:66-71`, `retryAfter`: a `retry-after` longer than 5 seconds is capped at 5, so the retry may be sent sooner than the service asked.
- `skills/delivery/typed-judgment/judge.mjs:83`, the `JUDGE_RETRIES` parse: an unset variable defaults to 2, and an empty string parses to 0, which disables retries.
- `tests/lib/typesafe-stub.mjs:18`, the second `startStub` argument, imported by `tests/judge.test.mjs`, `tests/packs.test.mjs`, `tests/dispatch.test.mjs`, and `tests/build-packs.test.mjs`.

### Verify

- `node --test tests/judge.test.mjs` passes, 9 of 9.
- `npm test` passes, 62 of 62, after `npm ci` in a fresh worktree.
- The retry set is 429, 529, and any 5xx; a network error and a `400 max_tokens_exceeded` are not retried.
- `judge: model <model>, tokens <n> in / <m> out` is the stderr format Phases 3 and 4 copy into their templates.

### Known limits

- `TYPESAFE_API_KEY` is unset here, so the retry set, the `400 max_tokens_exceeded` body shape, and the `model` and `usage` response fields come from the vendor's documentation and jev-review's published source; the stub is the only contract test.
- A retried call can take up to `JUDGE_TIMEOUT` (20 seconds by default) rather than under a second. The backoff wait resolves early on the deadline, so the call does not overshoot it.
- `tests/install.test.mjs` needs `node_modules`; a worktree without `npm ci` fails that test for a reason unrelated to any phase of this plan.
