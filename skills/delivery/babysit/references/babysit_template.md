---
type: babysit
summary: "[Frozen selection and dependency order; actual outcome and blocking prerequisites.]"
---

Use this as a starting point for a run that needs a checkpoint. Omit unused optional fields/sections, or keep a simpler readable ledger; preserve selection, authority, dependency facts and consequential action outcomes on resume.

# Babysit [scope]

## Selection and authority

- Request: [verbatim owner scope and intent]
- Sources: [paginated discovery, exact host/project/author/epic constraints]
- Authority: [dated owner instruction, selected identities, allowed fixes/publication/cancellation/merges; separate history rewrite and Jira keys]
- Runtime: [active session/scheduler, inline/worker support, stop condition]

## Dependency order and risks

| Identity | Selected | Prerequisites and source | Head | CI/review/required proof | State | Blocker or next action |
|---|---|---|---|---|---|---|
| [host/project!IID] | [yes/no] | [identities + provenance] | [SHA] | [observed facts] | [observed/repairing/blocked/ready/queued/merged/cancelled] | [action] |

Topological order: [full identities or actual cycle]. Unknown semantic order and external prerequisites: [source facts and affected descendants].

## Durable state

Replace example values with observed data and keep the format already used on resume. Add fields as they become relevant; preserve prior action outcomes. Unknown essential readiness blocks that action, while unused optional proof/helper fields do not block ordinary work.

```json
{
  "schema_version": 1,
  "selection_frozen": true,
  "selection": {"request": "", "sources": [], "frozen_at": null},
  "authority": {"observe": true, "fix": false, "description": false, "cancel": false, "merge": false, "retarget": false, "history_rewrite": false, "jira_keys": [], "scope": [], "source": null},
  "nodes": [{
    "identity": "host/group/project!1",
    "host": "host",
    "project": "group/project",
    "project_id": null,
    "iid": 1,
    "url": null,
    "selected": true,
    "source_project": null,
    "source_branch": null,
    "target_branch": null,
    "head_sha": null,
    "worktree": null,
    "task_dir": null,
    "dependencies": [{"identity": "host/group/prerequisite!2", "source": null, "observed_at": null}],
    "risks": [],
    "capabilities": {"host_version": null, "trains": null, "required_checks": null, "branch_protection": null, "observed_at": null},
    "ci": {"source_head_sha": null, "pipelines": [], "required_status": null},
    "reviews": {"cursors": [], "observed_versions": [], "actionable": [], "approval_state": null, "discussions": null},
    "proof": {"requirements": [], "source_sha": null, "status": null, "baseline": null, "verification": null, "app_test": null, "review": null, "evidence": null, "inspection": null, "description": null, "evidence_comment": null},
    "state": "observed",
    "train": {"entry": null, "pipeline": null, "composition": [], "observed_at": null},
    "blockers": [],
    "worker": null,
    "retries": {"fingerprint": null, "attempts": 0, "no_progress": 0, "last_result": null, "next_at": null},
    "pending_actions": [],
    "last_observed_at": null
  }],
  "order": [],
  "frontier": [],
  "operations": [],
  "slack": {"mode": "none", "run_id": null, "channel": null, "thread_ts": null, "last_check": null},
  "jira": {"issue": null, "authority": null, "comment_id": null},
  "watch": {"active": false, "session": null, "scheduler": null, "poll_seconds": 30},
  "checkpoint": {"saved_at": null, "next_action": null, "stop_reason": null}
}
```

## Repairs and publication

- [repair/action, input SHA, deciding log or note version, root-cause change, relevant checks, pushed SHA; required proof/publication readbacks when applicable]

## Outcome and limits

- Merged: [host-confirmed identities + merge observations]
- Queued: [actual entry and synthetic pipeline, not merged]
- Blocked: [identity + missing prerequisite + unblock check]
- Cancelled: [observed cancellation/removal or raced merge]
- Remaining: [identity + next action]
- Limits: [host/tool/evidence access, simulation boundary, train/description races, inactive watcher]
- Resume: [current canonical checkpoint link; indexed resume resolves its current successor]
