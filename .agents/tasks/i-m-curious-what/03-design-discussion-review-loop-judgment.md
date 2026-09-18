---
task: i-m-curious-what
type: design-discussion
summary: "Four behaviors from NiazMorshed2007/jev-review are portable into this collection's review loops because jev-review and judge.mjs are independent clients of the same TypeSafe System One endpoint: retry and typed error handling on transient vendor failures, true/false criteria on the yes/no gate questions, recorded model version and token usage per judgment, and a distinct signal for the undocumented 400 max_tokens_exceeded case. Its 19-dimension scoring rubric, its previous-evaluation input, and its schema-validation layer are the three choices a plan needs decided before it can size the work; the retry placement and the recording location are the other two. No jev-review code is vendored and the downgrade-only gate asymmetry, the four-round cap, and the five review axes stay as they are."
repo: MarkTripoli/skills
branch: i-m-curious-what
sha: 771fcea
---

### Summary of change request

Decide which of jev-review's behaviors to adopt in the `review-code` / `fix-code-review` loop and the typed-judgment helper both review and verification gate on. jev-review shares no code with this collection; it is a second client of the same TypeSafe System One endpoint, so what transfers is its handling of that API, not its product surface.

### Current State

- A review round ends when the session that wrote the code-review artifact self-reports `clean`, `findings`, or `blocked`; a typed-judgment call re-reads the saved artifact and can pull that claim toward `findings` or `blocked`, never back toward `clean`. Verification gates the same way.
- One transient vendor failure removes that cross-check for the round. A single HTTP attempt is made with no retry; a rate limit, an overload, or a slow answer past the timeout is reported as "judgments were skipped" and the loop routes on the session's own unchecked claim. An operator reading the run cannot tell a missing API key from a rate limit.
- The yes/no gate questions state what to look for but not where the boundary sits, so the borderline cases the loop actually argues over (an advisory that reads like a major finding, a check that could not run versus a check that failed) are decided without a stated true/false rule.
- Every round starts cold. Round two re-reads the diff, the task, and the implementation source, but not round one's findings, so a finding fixed in round one and a finding reintroduced in round two look the same to the reviewer.
- An artifact records the judgment word and its confidence but not which model version answered. `jev-latest` resolves to a moving version, and the vendor publishes a dated failure-mode page per version, so a disagreement between two rounds cannot be attributed to a version change after the fact.
- A request that packs one question triple per item, as the per-step and per-child commands do, has no size ceiling in this collection. The vendor returns an undocumented `400` for an oversized request; today that reads as a generic outage, and the caller retries nothing and splits nothing.

### Desired End State

- A rate limit or an overload costs a short wait, not the gate. When the vendor still cannot answer, the reply names the round that ran unchecked and why, distinguishing no-key from rate-limited from oversized.
- Each yes/no gate question carries the true/false boundary it is judged against, in the same place the instruction already lives.
- A reviewer can see, from the artifact alone, which model version produced each recorded judgment and what the request cost.
- An oversized request says so, and the caller either splits or reports a size failure rather than a vendor outage.
- Optionally, depending on the decisions below: a later round knows what the previous round found, and the review's axis coverage is scored rather than asserted.

### What we're not doing

- No dependency on jev-review, no MCP server, and no copied source. It targets a different host and shares nothing with this collection but the endpoint contract.
- No schema-validation dependency. jev-review uses zod; this collection has no runtime dependencies and will not gain one for four field checks.
- No change to the downgrade-only asymmetry of `review-status` and `verification-status`, to the four-round review cap, or to the three-round verification cap.
- No change to the five review axes or the six-value category enum unless Design Question 1 chooses the rubric option.
- The byte-identical pair `agents/agent-implementation-reviewer.md` and `skills/delivery/agent-implementation-reviewer/SKILL.md` stays as it is; it is unrelated to the API contract and belongs in its own task.
- The vendor's own documentation disagrees with itself about the combined token budget (roughly 32k on one page, a 64k-total/32k-single-question split on another). This work does not resolve that; it treats the ceiling as unpublished, as jev-review's own README does.

### Proposed End State Architecture

`judge.mjs` stays the only point of contact with the vendor. Every proposal below lands either inside `systemOne()` and the three question builders, or in skill and template prose. No new file, no new client, no new dependency.

| jev-review behavior | judge.mjs today | proposed |
|---|---|---|
| Retries 429, 529, and any 5xx; honors `retry-after` (seconds or HTTP-date, capped at 5s); exponential backoff `250 * 2^attempt`; `maxRetries: 2` | One attempt; any non-OK status becomes one generic `Unavailable` | Same retry set and backoff, bounded by an env-tunable attempt count, inside `systemOne()` |
| Names the undocumented `400 max_tokens_exceeded` explicitly | Reads as a generic outage | Distinct, non-retryable message the caller can act on |
| `noul` questions always carry `criteria: {true, false}` | `noul()` takes `instructions` only, with no parameter to pass criteria | Optional second argument; populated first on the gate questions |
| Score answers validated with `legend`, `probabilities`, `confidence` required; `.passthrough()` for unknown fields | Reads `answers` only; `model` and `usage` discarded | Record `model` and `usage` with the judgment; read `legend` where a score is shown to a human |
| Three questions per quality dimension against a fixed 10-level rubric, 19 dimensions, no synthetic overall score | Severity and category assigned as prose by the review session | Design Question 1 |
| Accepts `previousEvaluation` as tool input | Each round starts cold | Design Question 2 |

The retry and the error split, in the one function that owns them:

```diff
-    if (!response.ok) throw new Unavailable(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
+    if (!response.ok) {
+      const text = (await response.text()).slice(0, 300);
+      if (response.status === 400 && text.includes("max_tokens_exceeded")) throw new TooLarge(text);
+      if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
+        await wait(retryAfter(response) ?? 250 * 2 ** attempt);  // retry-after capped at 5s
+        continue;
+      }
+      throw new Unavailable(`HTTP ${response.status}: ${text}`);
+    }
```

The boundary on a gate question, at the two call sites the review loop routes on:

```diff
-const noul = (instructions) => ({ type: "noul", instructions });
+const noul = (instructions, criteria) => ({ type: "noul", instructions, ...(criteria ? { criteria } : {}) });
```

```diff
     open_major: noul("The code review in `review` lists at least one finding of critical or major
-      severity, or marked required or blocking, that is not recorded as fixed or declined."),
+      severity, or marked required or blocking, that is not recorded as fixed or declined.", {
+      true: "An entry under Critical and Required Findings is still open, or an advisory describes a
+        defect that meets the critical or major bar.",
+      false: "Only advisories remain, or every gating finding is recorded as fixed or declined with
+        evidence.",
+    }),
```

What the work touches:

```text
skills/delivery/typed-judgment/judge.mjs        # systemOne retry, TooLarge, noul criteria, model+usage
tests/judge.test.mjs                            # retry, retry-after, 400, exhausted-attempts paths
tests/lib/typesafe-stub.mjs                     # status sequencing and retry-after in the stub
skills/delivery/review-code/references/         # where the judgment provenance line is recorded
workflows/delivery.md                           # the "calls take under a second" claim, if retry changes it
```

### Design Questions

#### How much of jev-review's dimension scoring to adopt

Decide whether severity and axis coverage stay prose judgments by the review session, or become typed score questions.

- Option A: adopt nothing. Severity and category stay prose; only the gate questions change. Smallest diff; keeps the review artifact readable as it is; leaves an axis the session skipped invisible to the loop.
- Option B: score the five existing axes for coverage, not quality. One `score` question per axis asking how much of the pinned scope that axis was actually examined against, with the answers recorded in the artifact's `## Five-Axis Assessment`. Catches the real failure mode (an axis asserted without evidence) without inventing a new vocabulary, and reuses the existing `score` builder and the existing headings. Adds five questions per round to one request.
- Option C: adopt the 19-dimension rubric with the `_applicable` / `_score` / `_weakness` triple per dimension. Highest fidelity to jev-review; replaces the five axes and the six categories with a third vocabulary; 57 questions per round against an unpublished token ceiling; the vendor's own jaggedness page warns that semantically linked questions carry no structural invariants, so an `_applicable` of false alongside a nonzero `_score` is possible and needs its own reconciliation rule.

Recommendation: Option B. The gap the research found is not that severity is mis-scored; it is that the template's gate enum and its verdict vocabulary are not connected, and that a skipped axis reads as a clean axis. Option C imports a rubric this collection's templates do not speak and multiplies the request size the same research flags as unbounded.

#### Whether a review round reads the previous round's artifact

Decide whether `review-code` gets jev-review's `previousEvaluation` equivalent: the newest `NN-code-review-*.md` as an input.

- Option A: keep rounds cold. No anchoring on a previous reviewer's mistakes; every round is an independent read; a fixed finding can be raised again and a reintroduced one is not called out as a regression.
- Option B: read the previous round's findings and require each to be marked fixed, still open, or declined with evidence in the new artifact. Makes fix rounds auditable and makes a reintroduced finding visible; risks the session treating the previous verdict as settled instead of re-deriving it.
- Option C: read the previous round's `## Critical and Required Findings` identifiers only, not their bodies. Enough to track disposition, not enough to inherit the previous reasoning.

Recommendation: Option C. It closes the audit gap the research names (rounds are tracked only by artifact number) at the smallest anchoring cost, and it matches how `resolve-pr-reviews` already carries disposition forward per thread without re-quoting the thread.

#### Where the retry lives and what it costs the loop

Decide whether retry applies to every `judge.mjs` command or only to the gate commands.

- Option A: inside `systemOne()`, so every command retries. One place to own the policy; raises the worst case for all fifteen commands; `workflows/delivery.md` currently tells operators "calls take under a second" and that line would need to state the retried worst case.
- Option B: only `review-status`, `verification-status`, and `reproduction-status` retry, through a wrapper. Keeps the fast path fast; puts the policy in two places; the commands that build one question per item, which are the ones most likely to hit a rate limit, would not retry.
- Option C: retry in `systemOne()` with attempts read from an env variable defaulting to 2, and a total wall-clock bound so `JUDGE_TIMEOUT` still describes the whole call rather than one attempt.

Recommendation: Option C. Retry belongs at the one choke point, and binding it to the existing timeout keeps the operator-visible contract ("nonzero exit means apply your own rule") unchanged while making the exit rarer.

#### Where the model version and usage are recorded

Decide where the discarded `model` and `usage` response fields surface.

- Option A: `--json` output only. Zero template churn; invisible in the artifact a human reads, which is where the research says the judgment already lives.
- Option B: one line in the artifact beside the existing verdict and confidence, following the `helper triage: ... confidence 0.00` shape `resolve-pr-reviews` already uses. Visible where the decision is read; needs a field added to the code-review and verification templates.
- Option C: stderr only, so it lands in the run log and not in committed history.

Recommendation: Option B, with the model version and token counts on the same line as the verdict. The reason to record it is post-hoc attribution when two rounds disagree, and that comparison is done by reading two artifacts.

#### How an oversized request is handled

Decide what happens when the vendor rejects a request as too large.

- Option A: fail fast with a distinct message and let the skill's own fallback rule apply, same as any other unavailability, but named so the operator knows to split the input rather than check the key.
- Option B: split and retry automatically for the per-item commands, sending the question map in chunks and merging the answers. Removes the failure for the commands that cause it; chunking changes what the model sees at once, so answers are no longer conditioned on the full question set.
- Option C: refuse to send above a configured question count, chosen below the observed ceiling.

Recommendation: Option A. The ceiling is unpublished and moves, so a fixed threshold in Option C goes stale, and Option B changes judgment semantics to work around a limit no caller has yet hit in this repository.

### Resolved Design Questions

#### jev-review is a reference, not a dependency

No jev-review code is vendored, imported, or run. It is a local-first MCP server for a different host that shares only the `{state, model, questions}` request and `{model, answers, usage}` response contract with `judge.mjs`. The transferable part is its handling of that contract, which the research documented from its published source.

Rejected: adding it as a git dependency or running its `jev_review` tool from a skill step. Both would put a second vendor client in the review path, and the collection's typed-judgment rule requires exactly one named command per decision with a deterministic fallback.

#### Every change lands in judge.mjs and in skill prose

`systemOne()` is the single network call in this collection, and the typed-judgment convention states that only a step or node that names a command calls it. Adding retry, a size error, criteria, or provenance therefore changes one function, three builders, the call sites that opt in, their tests, and the templates that record the answer.

Rejected: a separate HTTP client, an abstraction layer over the vendor, or a per-skill retry. Each would duplicate the fallback contract that already exists at exit code 3.

### Patterns to follow

#### One choke point, one error class, one fallback contract

Every vendor call goes through `systemOne()`; every failure becomes `Unavailable`, which `main()` turns into exit 3 so the caller applies its own rule. A new failure kind extends that shape rather than bypassing it. - `skills/delivery/typed-judgment/judge.mjs:56-80`

```js
if (!response.ok) throw new Unavailable(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
```

```js
class TooLarge extends Unavailable {}   // exits 3 like the rest; the message names the cause
```

#### Thresholds and asymmetry stay in the helper

The threshold table and the downgrade-only rule are the safety property of both loops; new questions read through the same table instead of introducing their own constants. - `skills/delivery/typed-judgment/judge.mjs:39,119-133`

```js
const T = { yes: 0.8, no: 0.2, safe: 0.5, confident: 0.8, decisive: 0.9, triage: 0.7 };
```

#### The artifact records the judgment, not just the branch

A template that consumes a typed judgment keeps the answer word and its confidence on one line so a reader sees why the workflow branched. Provenance follows the same line. - `skills/delivery/resolve-pr-reviews/references/pr_review_template.md:23-31`

```text
- helper triage: fix | discuss | decline | clarify | undecided, confidence 0.00, requests_change 0.00
```

```text
- helper review-status: findings, confidence 0.00, model jev-1.13, tokens 8421 in / 96 out
```

#### The stub is the contract test

`tests/judge.test.mjs` runs `judge.mjs` as a child process against an in-process HTTP stub that asserts the outbound `{state, model, questions}` body and returns `{model, answers, usage}`. Retry, `retry-after`, and the 400 case are testable there with no network. - `tests/judge.test.mjs`, `tests/lib/typesafe-stub.mjs`

## Human Review

### Review targets

- Design Question 1: whether axis-coverage scoring is worth five extra questions per review round, or severity stays entirely prose.
- Design Question 2: whether carrying finding identifiers between rounds anchors the next reviewer more than it helps the audit trail.
- Design Question 3: whether raising the worst-case latency of every `judge.mjs` command is acceptable, given `workflows/delivery.md` currently promises sub-second calls.
- Design Question 4: whether model version and token counts belong in committed artifacts.
- Design Question 5: whether the unpublished token ceiling deserves automatic splitting now or a named error.
- The two resolved decisions: jev-review stays a reference, and all changes stay inside `judge.mjs` plus skill prose.
- The exclusions, in particular that the five axes, the four-round cap, and the downgrade-only asymmetry are untouched.

### Verify

- [ ] Each of the five design questions has a chosen option, or an instruction to drop it as irrelevant.
- [ ] Confirm the retry set (429, 529, any 5xx) and the two-attempt default are what this collection should copy, given no live call has been made from this environment.
- [ ] Confirm that recording the resolved model version in a committed artifact is acceptable, since it pins a vendor version string into task history.

### Known limits

- `TYPESAFE_API_KEY` is unset in this environment. No request was made to the real endpoint, so the retry set, the `400 max_tokens_exceeded` body, and the `legend` field shape are taken from the vendor's public documentation and jev-review's published source, not observed.
- The token ceiling that triggers the 400 is unpublished and, per jev-review's own README, may change; no threshold in this design depends on a specific number.
- The vendor's documentation disagrees with itself about the combined state-plus-questions budget; this design treats the ceiling as unknown rather than reconciling the two pages.
- jev-review's source was read through the research phase's fetches, not from a local checkout; its retry constants and zod schema are cited from that reading.
