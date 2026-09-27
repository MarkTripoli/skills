# Publication proof policy map

Scope: document the existing `describe-pr` publication sequence and Atomic proof observations for the next child that implements a gate. This map is policy and fixture guidance only; it introduces no runtime gate and changes no existing behavior.

## Evidence model

The current `describe-pr` path requires a current `evidence.recording` receipt, readable hosted capture, and any current `review.verification` artifact when present. The receipt identifies its tested code commit. Indexed task artifacts may be committed after that tested commit without invalidating the capture; a behavior-changing difference does invalidate it and requires fresh evidence. This exception is narrow: only indexed task-artifact commits qualify. Any substantive source or other unindexed change is outside the exception.

Atomic's observed proof checks are narrower and should not be treated as the future publication decision itself: it requires current proof for evidence and PR description, an evidence status of `passed` or `untested` represented in Results, nonempty Sessions, a commit in Revision, a hosted PR-description capture URL, local capture evidence, and for `untested`, a nonempty substantive Caveats section. A valid description includes both the same hosted capture URL and a distinct GitHub issue-comment permalink in its Evidence section. Atomic does not establish the comprehensive base/head/substantive-diff policy described for the next child.

## Decision table

| Situation | Draft may host capture? | Ready publication | Required interpretation |
|---|---:|---:|---|
| Capture upload is the only missing prerequisite; PR is draft solely to host it | Yes | No | Draft hosting is provisional. Return to evidence recording, verify the hosted URL, and complete the receipt; draft existence is not proof and cannot authorize ready status. |
| Tested code commit is behind HEAD only by indexed task-artifact commits | Yes | Eligible, subject to every other row | Reuse evidence for the tested code revision. Confirm artifact-only advancement; do not generalize this exception to arbitrary docs/source changes. |
| Source or other substantive change differs from tested/reviewed revision | Yes, as a draft if needed for capture | No; stale | Re-record evidence and obtain review for the changed code before final publication. |
| Review artifact is current and clean | Yes | Eligible, subject to remaining proof | Clean review is necessary where review is required; absent, stale, or non-clean review cannot be promoted to clean by capture evidence. |
| Verification is required by task/policy | Yes | Only with current passing verification | Missing, stale, or failed required verification blocks ready publication. When verification is not required, do not invent a new mandatory verification step. |
| Capture result is `passed` | Yes | Eligible, subject to remaining proof | Capture must be current for tested code and hosted/readable; evidence and review constraints still apply. |
| Capture result is `untested` | Yes | Not sufficient by itself | Preserve the explicit caveat. Atomic accepts an untested evidence artifact only with substantive caveats; this is not a passing verification or a basis to claim tested acceptance. A future gate must not silently convert untested into passed. |
| Hosted capture exists but evidence comment absent or not distinct | Yes | No | Publish a separate comment containing capture URL, result, tested code SHA, and current PR head SHA; verify its permalink and content before final body. |
| Evidence comment verified; final indexed description not yet recorded/published | Yes | No | Ordering: provisional draft body → separate evidence comment and read-back → record one final indexed description with capture and comment URLs → commit artifact/index → publish that exact body → re-fetch and verify body, URLs, and comment → mark ready. |
| Explicit bypass/override requested | Draft only, if capture hosting needed | Never pass through bypass | This enabler defines no bypass mechanism. A later gate may report an audited override as incomplete/overridden, but it must not claim pass or relax mandatory proof. |

## Transition boundaries

1. Draft creation or edit can host the capture only; provisional body and pending comment are not final proof.
2. Evidence is reusable across HEAD movement only when every intervening commit is an indexed task artifact and tested code remains unchanged.
3. Clean review and passing proof bind to the substantive code being published. Any substantive difference after review/capture is stale, not a soft warning.
4. Verification is conditional on an explicit requirement. If required, it must be current and passing.
5. `untested` remains visibly untested with concrete caveats; it never means successful verification.
6. Final readiness follows verified hosted capture, distinct read-back comment, immutable indexed final body containing both links, and publication/read-back equality. No bypass changes this order or makes incomplete evidence complete.

## Runnable fixtures

`node --test tests/publication-proof-policy.test.mjs` exercises the table against `shared/publication-proof-policy.mjs`, a policy-only decision over normalized proof observations. Nothing calls this function from a publication workflow yet. The next child must derive currentness, indexed-artifact-only advancement, distinct hosted comment and final body read-back from actual Git and hosted records; caller-supplied booleans alone are not proof.
