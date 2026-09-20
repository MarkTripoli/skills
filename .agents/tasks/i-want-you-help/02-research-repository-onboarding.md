---
date: 2026-09-20T06:35:32Z
git_commit: 4f2ae7206417a5e1d7f8868e6be2be3f2fbcff6b
branch: i-want-you-help
repository: skills
topic: "Repository onboarding, managed installation, and tracker contracts"
type: research
summary: "The installer reconciles selected, name-addressed skills and workers rather than maintaining an ownership manifest; only Codex configuration has an explicit managed block, while unrelated names and out-of-block state are preserved. Repository setup metadata is not created or schematized: `ai-utilities.json`, `ticketing.tool`, and `vcs.platform` appear only as optional inputs to PR-review guidance. Existing workflow conventions connect canonical skills, runtime generation, validation, documentation, tests, and optional Atomic orchestration, while current Linear, Jira Cloud, and GitHub contracts expose discovery plus provider-specific label operations but no documented label upsert."
tags: [research, codebase]
status: complete
---

# Research: Repository onboarding, managed installation, and tracker contracts

**Date**: 2026-09-20T06:35:32Z
**Git Commit**: 4f2ae7206417a5e1d7f8868e6be2be3f2fbcff6b
**Branch**: i-want-you-help
**Repository**: skills

## Research Question

1. How do `scripts/install.mjs` and its runtime adapters distinguish and reconcile collection-managed state from user-owned state across repeated installs, partial installs, uninstalls, and project or user scopes?
2. Where does the repository currently define, create, read, or document repository-level setup metadata, including `ai-utilities.json`, `ticketing.tool`, and `vcs.platform`?
3. Which current skills reference GitHub Issues, GitLab, `gh`, or `glab`, and what authentication checks, remote detection, mutations, rerun behavior, and failure reporting does each reference implement?
4. What existing files and checks record the rules and integration points for workflow skills across canonical sources, references, generated runtime resources, validation, documentation, and optional Atomic orchestration?
5. What existing tests and evaluations cover repeatable setup, preservation of unrelated repository or user state, provider-dependent behavior, and rerun outcomes?
6. Across Linear's, Atlassian's, and GitHub's current web documentation, what API or CLI contracts cover authentication, repository or project discovery, and repeatable label creation or update?

## Research Methodology

This document records current behavior only. It does not recommend implementation work, refactors, optimizations, or future changes.

Repository workers inspected installer, skill, validation, workflow, controller, test, and evaluation sources in the task worktree. A web worker checked current official Linear, Atlassian, GitHub, and GitHub CLI documentation on 2026-09-20.

### Known limits

- Citation judgments were skipped because the complete claim set exceeded the helper's request limit; repository pointers were checked manually against the cited lines.

## Summary

Installation ownership is positional. The installer plans selected names and destinations, replaces same-named skill directories and worker files, and removes only selected names. It does not persist an ownership manifest or distinguish a user-created resource from a collection resource when both have the same destination name. Codex configuration is the exception: marker comments delimit managed sections so surrounding user configuration and unselected managed worker sections survive partial operations.

No repository setup metadata lifecycle exists for `ai-utilities.json`, `ticketing.tool`, or `vcs.platform`. One skill treats those fields as optional provider hints and otherwise derives GitHub or GitLab from the remote.

Workflow behavior is recorded from canonical `skills/delivery/` sources through shared conventions, generated runtime trees, validation rules, workflow documentation, tests, and the optional Atomic controller. Provider integrations are guidance inside skills rather than a shared tracker abstraction. External provider APIs likewise differ: Linear has GraphQL label create/update mutations, Jira Cloud exposes labels as issue field values rather than standalone mutable resources, and GitHub has separate REST create and update endpoints. None documents a single label upsert operation.

## Detailed Findings

### 1. Selected names define installer ownership, while one marked block protects Codex configuration

The installer accepts project/global scope, selected skills, Atomic opt-in, and uninstall flags, then deduplicates repeated target and skill arguments (`scripts/install.mjs:44-74`). User scope resolves harness destinations below home or configured roots; project scope resolves below the current repository, and project-scoped Codex intentionally omits user-level workers and `config.toml` (`scripts/install.mjs:146-177`, `scripts/install.mjs:207-210`).

`plan()` computes all operations before writing. It closes dependencies, deduplicates shared destinations such as Codex and portable `.agents/skills`, and refuses a partial `--atomic` selection because Atomic consumes the complete portable collection (`scripts/install.mjs:180-216`). Runtime generation clears a temporary build tree, copies selected canonical skills, injects adapter notes, and emits worker definitions only for runtimes that support them (`scripts/lib/build.mjs:70-119`).

Application is name-addressed:

- Installing a skill removes and recopies its same-named destination directory (`scripts/install.mjs:240-244`, `scripts/install.mjs:294-305`).
- Installing a worker overwrites its same-named Markdown or TOML file; uninstall removes that selected file (`scripts/install.mjs:308-317`).
- Uninstall uses the explicitly requested names when present, while Atomic uninstall removes only the owned workflow entry and workflow tree (`scripts/install.mjs:294-305`, `scripts/install.mjs:335-349`).

The repository contains no install manifest or file-origin database. A same-named pre-existing skill or worker is therefore replaced or removed; unrelated names remain outside the operation. Codex configuration has a stronger boundary: marker comments identify the managed worker block, partial operations merge selected `[agents.<name>]` sections inside it, and text outside it survives (`scripts/install.mjs:41-42`, `scripts/install.mjs:245-291`, `scripts/install.mjs:320-333`).

#### Testing patterns

Installer tests use temporary homes and projects. They verify exact repeated `--skill` selection, runtime destination overrides, rejection of partial Atomic installation before any write, selected install/uninstall beside a foreign skill, partial Codex worker changes beside user configuration, repeated Atomic uninstall, and project-scope isolation from home state (`tests/install.test.mjs:58-65`, `tests/install.test.mjs:67-99`, `tests/install.test.mjs:101-146`, `tests/install.test.mjs:149-190`, `tests/install.test.mjs:203-222`). A portable dependency test also preserves a foreign skill while uninstalling only the selected consumer and retaining dependencies installed for it (`tests/install.test.mjs:224-261`).

### 2. Repository setup metadata is an optional read contract, not managed state

No `ai-utilities.json` file, schema, installer step, or metadata writer exists in the repository. The only current contract is prose in `resolve-pr-reviews`: prefer `ticketing.tool` and `vcs.platform` from `ai-utilities.json`; otherwise detect GitHub or GitLab from the remote, choose `gh` or `glab`, verify installation and authentication, and stop unless exactly one open pull request or merge request matches (`skills/delivery/resolve-pr-reviews/SKILL.md:18-24`).

This reference neither defines allowed field values nor creates, updates, or validates the file. The fallback behavior makes absence of the metadata an expected state rather than an installer error.

#### Testing patterns

No test or evaluation creates or reads `ai-utilities.json`, `ticketing.tool`, or `vcs.platform`. Installer tests cover destination state but not repository setup metadata.

### 3. Tracker references are distributed across six workflow skills

The current references have distinct responsibilities:

| Skill | Provider behavior |
|---|---|
| `start-epic-delivery` | Runs GitHub issue creation only when `gh auth status` succeeds and `origin` is a GitHub URL. It creates one epic label with failure ignored, creates child issues in dependency order, records each failed child as a known limit, and continues (`skills/delivery/start-epic-delivery/SKILL.md:22-32`). |
| `resolve-pr-reviews` | Uses optional setup metadata or remote detection, requires authenticated `gh`/`glab`, fetches GitHub comments/API data or GitLab notes, and repeats as a human-gated pending phase until the head is approved with no open threads (`skills/delivery/resolve-pr-reviews/SKILL.md:18-24`, `skills/delivery/resolve-pr-reviews/SKILL.md:38-43`). |
| `describe-pr` | Uses `gh` for GitHub and `glab` for GitLab to inspect, create, update, retitle, and publish PR/MR descriptions; when neither CLI is available it reports branch and base for manual creation (`skills/delivery/describe-pr/SKILL.md:29-44`, `skills/delivery/describe-pr/SKILL.md:71-81`). It names no separate authentication probe. |
| `review-code` | Resolves review base from `gh pr view` or `glab mr view`, falls back to task/default metadata, and stops when the base is unresolved (`skills/delivery/review-code/SKILL.md:16-22`). |
| `fix-code-review` | Repeats the same GitHub/GitLab base resolution, compares the recorded scope with current state, and preserves unrelated changes (`skills/delivery/fix-code-review/SKILL.md:16-22`). |
| `record-evidence` | Notes that `gh pr comment` cannot attach a local video and requires browser upload or a hosted link; it defines no remote or CLI-auth detection (`skills/delivery/record-evidence/SKILL.md:129-135`). |

No current skill uses `glab issue` or creates GitLab Issues. Existing GitLab paths concern merge requests and reviews. Provider mutation failure behavior is local to each skill rather than shared: epic issue failures become known limits, PR-description operations fall back to manual reporting when tooling is absent, and review resolution stops on ambiguous targeting.

#### Testing patterns

No automated test exercises authenticated GitHub/GitLab remote detection, label creation, issue creation, PR/MR mutation, or provider reruns. The documented offline boundary excludes live provider credentials (`docs/testing.md:15-23`), and live evals require provider credentials but prove only the phase they exercise (`docs/testing.md:59-73`).

### 4. Workflow skills flow from canonical sources into adapters, checks, docs, and optional orchestration

Canonical phase behavior lives under `skills/delivery/<name>/SKILL.md`; each skill's `references/` directory owns its artifact and reply templates. Shared writing and task/worktree/artifact/commit rules live in `shared/WRITING.md` and `shared/CONVENTIONS.md` (`shared/CONVENTIONS.md:5-21`, `shared/CONVENTIONS.md:55-68`, `shared/CONVENTIONS.md:106-124`, `shared/CONVENTIONS.md:142-173`).

Runtime adapters are generation inputs rather than alternate workflow sources. `buildRuntime()` reads canonical skills, inserts runtime notes, emits runtime-specific workers, and adds Codex metadata (`scripts/lib/build.mjs:1-18`, `scripts/lib/build.mjs:70-119`). The ordinary installer writes selected resources; `--atomic` additionally copies the optional controller tree and creates a top-level discovery entry (`scripts/install.mjs:180-216`, `scripts/install.mjs:335-369`).

Validation checks canonical frontmatter, required shared links, referenced files, answer-template inventories, handoff fences, human-review shapes, workflow-table coverage, optional Atomic registration, generated inventory equality, and commit-rule consistency (`scripts/validate.mjs:287-329`, `scripts/validate.mjs:331-489`, `scripts/validate.mjs:509-563`). `workflows/delivery.md` documents install paths, all supported chains, gates, verification/review routing, task ownership, and the phase table (`workflows/delivery.md:7-30`, `workflows/delivery.md:53-100`, `workflows/delivery.md:102-124`, `workflows/delivery.md:138-180`).

Optional orchestration registers one `delivery` workflow with typed inputs including `workflow`, `gates`, models, verification, branch, and base (`atomic/workflows/delivery.ts:9-33`). It reuses task metadata, observes artifact boundaries, applies native gates, selects only eligible transitions, and launches every selected skill through a fresh stage (`atomic/workflows/delivery.ts:34-69`, `atomic/workflows/delivery.ts:84-128`, `atomic/lib/controller.mjs:8-30`, `atomic/lib/controller.mjs:176-220`).

#### Testing patterns

`npm test` aggregates validation, plugin synchronization, and unit tests; the documentation separates those offline checks from live skill evals and Atomic runtime proof (`docs/testing.md:3-23`). Installer tests cover generated destinations and ownership. Controller tests cover blocked completed plans, malformed-source revision, persisted no-progress recovery, resumed worktree ownership, and refusal of unrelated worktrees (`tests/atomic-controller.test.mjs:27-60`, `tests/atomic-controller.test.mjs:62-109`, `tests/atomic-controller.test.mjs:200-218`).

### 5. Existing repeatability proof is strongest for installer state and controller boundaries

The direct installer coverage establishes these rerun properties:

- Repeating selection yields deterministic requested names (`tests/install.test.mjs:58-65`).
- Partial install/uninstall preserves unrelated skill names, unselected worker sections, and surrounding Codex configuration (`tests/install.test.mjs:101-146`).
- Atomic installation preserves unrelated skills, workflows, and session state; full uninstall can run twice without removing those resources (`tests/install.test.mjs:149-190`).
- Project-scoped Atomic installation and uninstall leave home and overridden global roots unchanged (`tests/install.test.mjs:203-222`).

Controller tests establish rerun outcomes at workflow boundaries rather than tracker-provider boundaries: impossible completed plans block, malformed plans route to revision and then resume, no-progress receipts persist recovery state, and a partial retry can recover its owned worktree (`tests/atomic-controller.test.mjs:27-54`, `tests/atomic-controller.test.mjs:62-109`, `tests/atomic-controller.test.mjs:200-210`).

Live evals execute each phase in a fresh model session, reject artifact-number reuse, require artifact-only commits, and reject changes outside `.agents/` (`evals/run.mjs:195-220`, `evals/run.mjs:239-289`). Source-backed scenarios confirm that external provider facts can survive research into later design and plan artifacts, but these fixture contracts do not exercise provider APIs (`evals/scenarios/full-with-sources.mjs:1-5`, `evals/scenarios/full-with-sources.mjs:42-60`).

#### Testing patterns

The repository explicitly distinguishes offline checks, live skill evals, and Atomic runtime runs, and states that one does not prove another (`docs/testing.md:1-36`). No existing test supplies live Linear, Atlassian, GitHub, or GitLab credentials for label or issue mutation.

### 6. Current provider contracts support discovery and separate label operations, not a common upsert

#### Linear uses GraphQL connections and label mutations

Linear accepts GraphQL requests at `POST https://api.linear.app/graphql`. Personal API keys use `Authorization: <API_KEY>`; OAuth tokens use `Authorization: Bearer <ACCESS_TOKEN>`. The OAuth contract documents authorization, token, and revocation endpoints plus scopes including `read`, `write`, `issues:create`, `comments:create`, and `admin` ([Linear GraphQL API](https://linear.app/developers/graphql), [Linear OAuth 2.0](https://linear.app/developers/oauth-2-0-authentication)).

The GraphQL API exposes `viewer`, `teams`, and `projects` for workspace/team/project discovery. Its current schema exposes `issueLabels`, `issueLabelCreate`, `issueLabelUpdate`, and `issueLabelDelete`; labels may carry a `teamId` ([Linear current GraphQL schema](https://studio.apollographql.com/public/Linear-API/variant/current/home)). The public documentation does not define a create-or-update mutation, documented duplicate-name merge, or stable duplicate-conflict status.

#### Jira Cloud treats labels as issue field values

Jira Cloud REST API v3 supports API-token Basic authentication with `email:api_token` and OAuth 2.0 endpoint scopes ([Atlassian Basic auth](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/), [REST v3 authentication](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/#authentication), [OAuth scopes](https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/)). Project discovery uses paginated `GET /rest/api/3/project/search`; single-project lookup uses `GET /rest/api/3/project/{projectIdOrKey}` ([Jira project endpoints](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-projects/)).

`GET /rest/api/3/label` lists label strings, but Jira Cloud documents no standalone create-label or update-label endpoint. Labels are fields supplied through `POST /rest/api/3/issue` and `PUT /rest/api/3/issue/{issueIdOrKey}` ([Jira label endpoints](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-labels/), [Jira issue endpoints](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)). A global label upsert or duplicate-label conflict contract is therefore not documented.

#### GitHub separates repository discovery, create, and update

GitHub REST requests use `Authorization: Bearer <TOKEN>`, `Accept: application/vnd.github+json`, and the current documented version header `X-GitHub-Api-Version: 2026-03-10`. GitHub CLI authenticates interactively with `gh auth login` or noninteractively through `GH_TOKEN`; Actions can use `GITHUB_TOKEN` ([GitHub REST authentication](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api), [GitHub REST with CLI](https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api?tool=cli)).

Repository discovery uses `GET /repos/{owner}/{repo}` or paginated `GET /orgs/{org}/repos` ([GitHub repository endpoints](https://docs.github.com/en/rest/repos/repos?apiVersion=2026-03-10)). Labels use `GET /repos/{owner}/{repo}/labels`, `POST /repos/{owner}/{repo}/labels`, and `PATCH /repos/{owner}/{repo}/labels/{name}`. Create requires `name`, returns `201`, and can return `422`; update returns `200` and accepts `new_name`, `color`, `description`, and `archived` ([GitHub label endpoints](https://docs.github.com/en/rest/issues/labels?apiVersion=2026-03-10)). `gh api` exposes these endpoints with explicit method, fields, headers, and pagination ([GitHub CLI `api`](https://cli.github.com/manual/gh_api)). GitHub documents separate read/create/update operations, not an upsert or a dedicated duplicate-name status.

#### Testing patterns

These are external contracts rather than repository tests. No repository integration test exercises them. The official documentation checked for this pass did not expose an official `llms.txt` at the tested Linear, Atlassian Jira, or GitHub Docs locations; Linear does publish [agent-oriented Markdown](https://linear.app/developers/agents.md), and Atlassian publishes a [Jira Cloud REST v3 OpenAPI schema](https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json?_v=1.8516.116).

## Code References

### Installer and runtime generation (exhaustive for the researched behavior)

- `scripts/install.mjs:41-74` - Managed-block markers and CLI selection flags.
- `scripts/install.mjs:146-216` - User/project destinations and pre-write planning.
- `scripts/install.mjs:240-355` - Directory replacement, Codex block reconciliation, selected uninstall, and Atomic cleanup.
- `scripts/lib/build.mjs:1-18` - Generated tree and worker-format contract.
- `scripts/lib/build.mjs:70-119` - Runtime-specific build implementation.
- `tests/install.test.mjs:58-261` - Selection, preservation, rerun, uninstall, and scope tests.

### Tracker-aware skills (exhaustive current references)

- `skills/delivery/start-epic-delivery/SKILL.md:22-32` - GitHub label and child-issue creation.
- `skills/delivery/resolve-pr-reviews/SKILL.md:18-43` - Optional setup metadata, provider detection, auth, review state, and rerun gate.
- `skills/delivery/describe-pr/SKILL.md:29-44` - GitHub/GitLab discovery and creation behavior.
- `skills/delivery/describe-pr/SKILL.md:71-81` - PR/MR publishing and confirmation.
- `skills/delivery/review-code/SKILL.md:16-22` - GitHub/GitLab merge-target resolution.
- `skills/delivery/fix-code-review/SKILL.md:16-22` - Review-base reconciliation.
- `skills/delivery/record-evidence/SKILL.md:129-135` - Authenticated-browser upload boundary.

### Workflow conventions and orchestration (exhaustive integration points, representative tests)

- `shared/WRITING.md:1-60` - Writing contract.
- `shared/CONVENTIONS.md:5-173` - Portable execution, tasks, artifacts, handoffs, Atomic boundaries, commits, and workers.
- `scripts/validate.mjs:287-563` - Mechanical canonical, template, workflow, generated-tree, and commit-rule checks.
- `workflows/delivery.md:1-180` - Documented chains, gates, ownership, and phase table.
- `atomic/workflows/delivery.ts:9-174` - Optional workflow registration and orchestration loop.
- `atomic/lib/controller.mjs:8-30` - Skill-to-artifact integration map.
- `atomic/lib/controller.mjs:176-220` - Fresh-stage skill prompt and launch boundary.
- `tests/atomic-controller.test.mjs:27-218` - Representative routing, recovery, and worktree tests.
- `docs/testing.md:1-81` - Evidence boundaries and workflow-skill addition checklist.
- `evals/run.mjs:195-309` - Live phase runner and artifact checks.
- `evals/scenarios/full-with-sources.mjs:1-64` - Representative external-contract propagation scenario.

## Architecture Documentation

Current ownership follows a one-way source-to-runtime path:

```text
skills/delivery/* + shared/*
        |
        +--> references/*
        +--> scripts/lib/build.mjs --> runtime-specific skill/worker trees
        +--> scripts/validate.mjs --> structural and handoff checks
        +--> workflows/delivery.md --> published phase contract
        +--> atomic/workflows/delivery.ts + atomic/lib/* --> optional orchestration
        +--> tests/* and evals/* --> offline and live evidence
```

The installer owns selected destination names and one marked Codex configuration block; task artifacts and unrelated names remain outside that scope. Tracker-provider behavior starts inside individual skill instructions, with no shared metadata schema or provider module connecting installation to those skills. External provider contracts supply the authentication, discovery, and mutation primitives those instructions may invoke, but they do not share one label data model or idempotent upsert contract.

## Open Questions

None.
