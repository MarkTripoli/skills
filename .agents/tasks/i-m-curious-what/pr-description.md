Task: `i-m-curious-what`

## Purpose

A rate-limited or overloaded TypeSafe System One call used to read to a gate exactly like a missing API key and cost it its judgment; this change retries transient failures inside the existing timeout, names an oversized request, states the true/false boundary on the five gate questions, records the model and token counts beside every judgment a skill writes into an artifact, scores how far each review axis was actually examined, and carries the previous round's finding identifiers into the next code review.

## Special things to note

- `review-code` now posts its saved artifact to `api.typesafe.ai` for the `axis-coverage` call. The packed path already sent the same file through `review-status`, so the new exposure is a standalone `/review-code` run; the save step does not yet say so (advisory ADV-004 in [11-code-review-review-loop-judgment.md](.agents/tasks/i-m-curious-what/11-code-review-review-loop-judgment.md)).
- A `Retry-After` over five seconds is shortened to five and the attempt still goes out, so a service asking for a long pause is re-asked early; the retry count and `JUDGE_TIMEOUT` bound what that costs, and the comment above the clamp now says so (ADV-002, fixed in 85b45b0). The same commit makes a blank `JUDGE_RETRIES` read as unset rather than as zero retries, which `Number("")` had made it (ADV-003).
- No `.archon/workflows/**` YAML changed. All 37 pack invocations already end in `2>/dev/null`, so the new stderr provenance line cannot contaminate a parsed value, and the retry landed inside `systemOne()` rather than per command so no pack opts in.

## Change outline

`systemOne()` keeps its signature, its `AbortController`, and its exit contract; the single attempt becomes a bounded loop and the answered call's version is parked in a module-level slot.

```diff
 export async function systemOne(state, questions) {
   const controller = new AbortController()
   const timer = setTimeout(() => controller.abort(), seconds * 1000)
+  const request = { ...init }                      // hoisted out of the loop
-  const response = await fetch(url, { ...init })
-  if (!response.ok) throw new Unavailable(...)
-  return body.answers
+  for (let attempt = 0; ; attempt++) {
+    const response = await fetch(url, request)
+    if (!response.ok) {
+      if (400 && /max_tokens_exceeded/) throw new TooLarge(...)   // never retried
+      if (retryable(status) && attempt < retries) { await wait(retryAfter ?? 250 * 2 ** attempt); continue }
+      throw new Unavailable(`HTTP ${status}: ...`)
+    }
+    lastCall = { model: body.model, usage: body.usage }
+    return body.answers
+  }
 }
 
 main()
+  if (lastCall) stderr: `judge: model <model>, tokens <n> in / <m> out`
   stdout: result
```

`retryable` is 429 and any 5xx; `wait()` resolves early on abort, so `JUDGE_TIMEOUT` still bounds the whole call rather than the round trip.

The new command asks one request with five `score` questions and turns each level into a verdict the save step acts on.

```text
axis-coverage <artifact.md>
  systemOne({review}, {correctness, readability, architecture, security, performance})
    level 3 | 2  -> covered     recorded, nothing re-examined
    level 1      -> asserted    axis examined again, section rewritten, saved, run once more
    level 0      -> skipped     same
    confidence < 0.8 -> unclear the session decides that axis itself
```

Five `noul` gate questions gained a `criteria` boundary; instructions and thresholds are untouched, so no status rule moved.

```diff
 review-status:       open_major, blocked
 reproduction-status: shown
 verification-status: open_fail, blocked
+  criteria: { true: "<what makes it true>", false: "<what makes it false>" }
```

Where the behavior lands:

```text
skills/delivery/
  typed-judgment/judge.mjs        retry, TooLarge, lastCall, axis-coverage, five criteria sets
  review-code/                    calls axis-coverage after saving; reads the previous round's CR ids
  verify-implementation/          records model and tokens on the `Graded by:` line
  resolve-pr-reviews/             records model and tokens on the `helper triage` line
  test-app/                       same line on the app test template's `Graded by:`
  create-epic-plan/               a `helper size-children:` line above the child table
tests/
  lib/typesafe-stub.mjs           additive: a status queue and an optional retry-after header
  judge.test.mjs                  two tests added, five assertions added, one loosened
.changeset/review-loop-judgment.md  minor
```

The loosened assertion is the `extract-json` unclear case, which compared stderr for equality and now matches it; the new provenance line joins stderr, so the equality could not hold, and that line is asserted exactly in the new `systemOne` test.

## Human Review

### Review targets

- `skills/delivery/typed-judgment/judge.mjs:97-108` — the retry loop's termination and its interaction with the deadline. Measured against the checked-in stub: `[429,429,429]` with `retry-after: 3` and `JUDGE_TIMEOUT=1` exits 3 in 1032 ms after one request; a single 429 with the same header exits 0 in 3075 ms after two.
- `skills/delivery/review-code/SKILL.md:70` — a skill step that calls `judge.mjs`, may rewrite its own artifact's axis sections, and re-saves. This is the first place a skill re-saves an artifact on a helper verdict.
- `judge.mjs:238` — `level >= 2 ? "covered"` means an axis examined against part of the pinned scope is not sent back. Plan `04:455` specifies this mapping; whether it is the right bar needs real rounds (ADV-005).
- The three verification rows the helper did not settle: `T1`, `T2`, `A14` in [10-verification-review-loop-judgment.md](.agents/tasks/i-m-curious-what/10-verification-review-loop-judgment.md).

### Verify

- [ ] Run `npm test`; it exits 0 with `tests 63, pass 63, fail 0` and `0 banned tokens`.
- [ ] Run `node scripts/check-commits.mjs main..HEAD`; it exits 0 with `ok: 17 subjects`.
- [ ] Re-decide the two fixes in 85b45b0: `JUDGE_RETRIES=" "` now takes two retries (asserted in `tests/judge.test.mjs`), and the comment at `judge.mjs:85-86` describes the 5s clamp the code performs.
- [ ] Re-decide `T1`: read `git diff main...HEAD -- tests/judge.test.mjs` against plan `04:229-234`; the only loosened assertion is the one the plan specifies.
- [ ] Re-decide `T2` and `A14`: the stub's options argument is additive, and `git show --stat d304a75` lists exactly six files.
- [ ] Confirm the two decisions a person owns: that pinning a resolved model version (`jev-1.13.0`) into a committed artifact is acceptable, and that `review-code` may call `judge.mjs` and re-save its own artifact.

### Known limits

- The real endpoint's oversized-request body is unconfirmed; the `max_tokens_exceeded` match is verified only against the checked-in stub, which was written to emit it. A mismatch yields `HTTP 400: <vendor text>` at the same exit 3, so only the message quality is at risk.
- The token ceiling is unpublished. One live `axis-coverage` round on an 86,656-byte artifact cost 23,534 input tokens without crossing it, which bounds the risk rather than removing it. On that artifact four of five rows came back `unclear`, which routes those axes to the session's own reading.
- `review-code`'s coverage pass and the four provenance instructions are prose a session reads. `validate.mjs` checks structure and banned tokens, so nothing in the suite proves a real run records those lines.
- Provenance now reaches all five skill-made call sites: f9114bf added the line to `test-app`'s app test template and `create-epic-plan`'s epic plan template (ADV-001). Those two templates carry the instruction only; like the other three, no test observes a session filling them in.
