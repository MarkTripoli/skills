# GitLab readiness is observed, not assumed

Discover the actual host version, project features and permission when choosing commands. Examples use `HOST`, `PROJECT` (numeric ID or URL-encoded **complete** namespace), `IID`, and encoded `TARGET`; substitute observed values. Pin `--hostname` on every call. Use the project's PR IID, not its global `id`. [glab API](https://docs.gitlab.com/cli/api/) uses `-f` for strings, `-F` for typed booleans/numbers or `@file` fields.

## Discovery and requirements

```sh
glab api --hostname "$HOST" version
glab api --hostname "$HOST" "projects/$PROJECT"
glab api --hostname "$HOST" --method GET "projects/$PROJECT/merge_requests" -f state=opened --paginate
glab api --hostname "$HOST" --method GET merge_requests -f state=opened -f scope=created_by_me --paginate
glab api --hostname "$HOST" "projects/$PROJECT/merge_requests/$IID"
glab api --hostname "$HOST" "projects/$PROJECT/protected_branches" --paginate
```

Filter scoped results by observed author, exact projects and real linked issue/epic relationships; title matches are candidates only. Explicit URL selection still reads each PR and its project. Resolve forks' source project and protect the source-branch lock separately. [Projects API](https://docs.gitlab.com/api/projects/#retrieve-a-project) provides merge settings. Record `merge_trains_enabled`, `merge_pipelines_enabled`, required successful pipeline/discussion settings, external checks, branch rules, merge method and squash policy. Missing fields are unknown, not false. Inspect applicable branch rules/settings through available host APIs; inaccessible requirements block enrollment/merge. A 404 can mean hidden/unsupported or wrong credentials, never verified-disabled.

## Prerequisites and current readiness

```sh
glab api --hostname "$HOST" "projects/$PROJECT/merge_requests/$IID/blocks" --paginate
glab api --hostname "$HOST" "projects/$PROJECT/merge_requests/$IID/blockees" --paginate
glab api --hostname "$HOST" "projects/$PROJECT/merge_requests/$IID/pipelines" --paginate
glab api --hostname "$HOST" "projects/$PROJECT/merge_requests/$IID/approval_state"
glab api --hostname "$HOST" "projects/$PROJECT/merge_requests/$IID/approvals"
glab api --hostname "$HOST" "projects/$PROJECT/merge_requests/$IID/status_checks"
glab api --hostname "$HOST" "projects/$PROJECT/merge_requests/$IID/discussions" --paginate
glab api --hostname "$HOST" "projects/$PROJECT/merge_requests/$IID/notes" --paginate
glab api --hostname "$HOST" "projects/$PROJECT/pipelines/$PIPELINE_ID"
glab api --hostname "$HOST" "projects/$PROJECT/pipelines/$PIPELINE_ID/jobs" --paginate
glab api --hostname "$HOST" "projects/$PROJECT/jobs/$JOB_ID/trace"
```

[Dependency reads](https://docs.gitlab.com/api/merge_requests/#retrieve-merge-request-dependencies): dependent `/blocks` lists prerequisites; prerequisite `/blockees` lists dependents. Hidden `blocking_merge_request` stays unresolved. Native dependencies require the feature on the dependent project; unavailable feature does not erase locally evidenced edges. No documented `/depends_on` endpoint. Creating host dependencies is a separate authorized mutation, not necessary for the ledger.

[Approval rules](https://docs.gitlab.com/api/merge_request_approvals/) use applicable `approval_state` rules, not counts alone. Evaluate `detailed_merge_status`; `checking`/`approvals_syncing` is not ready. Read all actionable bot/human notes, including non-resolvable notes; notes being non-resolvable does not make their requested change optional. Preserve edited note versions.

A branch pipeline passes source proof only when SHA equals current PR head and the required jobs/checks passed. Missing/running/cancelled/skipped/failed required checks are not passing. PR [merged-results and train pipelines](https://docs.gitlab.com/ci/pipelines/merge_trains/#merge-train-workflow) have synthetic target+earlier-cars+PR SHAs. Record ID/SHA/ref/status and authenticated PR/train association separately from `source_head_sha`; don't reject the synthetic SHA just because it differs, or accept an unrelated green synthetic pipeline. Reevaluate association and train composition each observation. Synthetic failures route logs against that composition, not blindly source-only CI. Refetch PR head after collecting readiness; changed head invalidates conclusions.

## Native train or verified ordinary route

Require all transitive prerequisites **host-confirmed merged**, current required CI/review/readiness, any explicitly required delivery proof, and scoped merge authority immediately before either call. Cross-project children cannot queue behind unmerged parents. Persist expected source SHA before the call.

```sh
glab api --hostname "$HOST" --method GET "projects/$PROJECT/merge_trains/$TARGET" -f scope=active -f sort=asc --paginate
glab api --hostname "$HOST" "projects/$PROJECT/merge_trains/merge_requests/$IID"
glab api --hostname "$HOST" --method POST "projects/$PROJECT/merge_trains/merge_requests/$IID" -f "sha=$HEAD_SHA" -F auto_merge=true
```

Use [explicit train enrollment](https://docs.gitlab.com/api/merge_trains/) when configured/required and supported. Ordinary merge API historically bypassed trains before 19.1; don't substitute it for train enrollment. Enrollment/auto-merge accepted means `queued`, never `merged`. Follow entry and PR readbacks until `state: merged` before releasing children.

Only verified-disabled trains/queues permit the configured [ordinary merge API](https://docs.gitlab.com/api/merge_requests/#merge-a-merge-request):

```sh
glab api --hostname "$HOST" --method PUT "projects/$PROJECT/merge_requests/$IID/merge" -f "sha=$HEAD_SHA" -F auto_merge=true
```

Honor configured merge/squash method; never set skip-train/immediate bypass, weaken checks or branch protection, or override approvals. Unknown merge capabilities block that operation, not independent diagnostics or repairs. A 409 source-head mismatch invalidates the readiness check; refetch and recheck rather than replacing the SHA blindly. Retarget/history rewrite requires authority and refreshed CI plus any applicable source-bound proof.

## New review can race a queued merge

[GitLab documents](https://docs.gitlab.com/ci/pipelines/merge_trains/#add-a-merge-request-to-a-merge-train) that new conversations after enrollment do not reliably block/remove a train car. On actionable review, changed head or invalid required proof, request authorized cancellation and read PR/train state back. Without cancellation authority, seek it and report unsafe queued exposure; polling does not make it atomic.

Use [cancel-auto-merge](https://docs.gitlab.com/api/merge_requests/#cancel-auto-merge) `POST projects/$PROJECT/merge_requests/$IID/cancel_auto_merge` only when host supports 19.5+; older documented path is `POST .../cancel_merge_when_pipeline_succeeds`. No documented DELETE train-car endpoint. Cancellation response is not removal proof and may succeed after merge. Record a raced merge as observed merged with a safety incident, not cancelled/approved; block dependent mutations until the owner resolves it. Immediate API call and readback reduce exposure but cannot guarantee atomic review/merge exclusion.

## Full descriptions have an ownership race

[PR update](https://docs.gitlab.com/api/merge_requests/#update-a-merge-request) accepts a full description, with no documented atomic expected-description/If-Match guard. Fetch latest body, replace only owned markers, refetch before PUT and recompute on change, serialize own writers, then read back preservation. Use `-F "description=@$FILE"`. Concurrent human edits can still race; defer if ownership cannot be reconciled. See [visibility](visibility.md) for exact markers. Source-backed instructions are not evidence of a real train, merge, Slack or Jira execution.
