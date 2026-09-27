# Oh My Pi

## Skill notes

Invoke a skill by typing `/<name>` in the Oh My Pi prompt, for example `/create-plan @03-plan-verbose-flag-cli.md`.
Child workers: call the `task` tool with one item `{ "agent": "agent-<role>", "task": "<assignment>" }`; the result auto-delivers when the worker yields. Read its final message before using any claim.

## Install

`npx github:MarkTripoli/skills oh-my-pi` performs these steps (add `--project` for one repository, `--dry-run` to look first); by hand:

1. Build the tree: `npm run build -- --runtime oh-my-pi` (writes `dist/oh-my-pi/`).
2. Skills: `cp -R dist/oh-my-pi/skills/* ~/.omp/agent/skills/` (the native user directory, which wins over same-named skills from other directories; `~/.agents/skills/` also works).
3. Workers: `cp dist/oh-my-pi/agents/*.md ~/.omp/agent/agents/` for every project, or `cp dist/oh-my-pi/agents/*.md <repo>/.omp/agents/` for one project. Project agents win over user agents with the same name.
4. Start a new session; `/agents` lists the workers and `/` lists the skills.

## Optional publication guard

Install with `npx github:MarkTripoli/skills oh-my-pi --omp-publication-hook` (add `--project` for a project-local copy). The installer prints the exact hook path; registration is explicit per launch:

```sh
SKILLS_PUBLICATION_TASK_DIR=/absolute/path/to/task omp --hook=/absolute/path/to/skills-publication/hooks/omp-publication.mjs
```

For that task, the hook intercepts Oh My Pi `bash` tool calls: it permits a draft PR creation only to host capture, denies ready PR creation before a hosted draft, and runs the shared publication-proof CLI before making an existing draft ready. Missing or stale proof denies the intercepted command. It does not protect commands run outside Oh My Pi, other tool surfaces, or Codex; a successful `omp` process exit is not proof of publication readiness. Without both registration and the task-directory environment variable, this guard does not enforce publication.

## Edit-time security advisory

Installing `oh-my-pi` also installs `hooks/security-edit.mjs` under the printed `skills-security` path. Register it with `omp --hook=<installed-path>`. The adapter listens to OMP's documented post-execution `tool_result` event and scans only when `isError === false`; failed results never invoke scanners. It accepts OMP `write` and `edit` tool names, reads paths from `input`, `details`, or supported `content` patch/result text, including hashline section headers (`[path#TAG]`), multi-file patches, result headers, and `MV DEST` destinations, then resolves paths within the repository while preserving the requested relative name for scanner selection. Environment files are excluded through either the requested name or resolved target. Scanners receive a read-only saved-file snapshot bounded to 5 MiB; larger or unstable files are reported incomplete. A separate `apply_patch` tool name is not assumed. Missing success, path, or saved content is reported incomplete. Findings are advisory and never block edits.

Hadolint scans edited Dockerfiles and actionlint scans edited `.github/workflows/*.yml` or `.yaml` files. Semgrep runs only when `SKILLS_SECURITY_SEMGREP_RULES` names an existing absolute local rules path; it never uses registry presets. Trivy filesystem scanning requires an existing local database and uses offline/update-disabled flags. Trivy config coverage currently remains incomplete because no local checks-bundle contract is verified. Missing tools, rules, caches, unsupported callbacks, and invalid coverage are reported as incomplete. Findings omit source excerpts and scanner diagnostics.

This adapter does not cover Codex: its hooks are stable, but the edited-file callback payload is unverified in this repository. It also does not intercept shell-based edits or claim that unscanned files are clean. The `model-endpoint-redteam` executable independently requires a current local authorization artifact for live probes; edit-time hooks are not its authorization boundary.

## Model routing

Run `/configure-model-routing` when no valid profile exists. Standalone Oh My Pi skills may call the shared `route-model` helper through Node; discovery may use the documented public `omp models --json` command, and failed or unavailable discovery falls back to explicit exact candidates. Do not scrape provider-private registries or store credentials. Explicit `quota_mode=omp` additionally runs `omp usage --json` locally before JEV; provider filtering does not bind accounts, report `fetchedAt` and one account identifier must be fresh and explicit, and the snapshot creates no concurrency reservation. `context_policy=stop-at-60` consumes the managed RPC `get_state` response's `data.contextUsage` plus the current child session identity and stops when either is unavailable. The normal `task` API does not promise that live child metric.

## Optional Atomic orchestration

Skills and workers do not need Atomic. Add `--atomic` to install all portable skills and its optional `delivery` workflow. It does not launch `omp` subprocess stages.

Follow [Atomic setup](../docs/getting-started.md#add-optional-atomic-orchestration) to launch. Atomic runs the shared skills in new sessions; there is no Oh My Pi-specific workflow. Ordinary sessions still use the handoffs and `task` workers above. Answer approvals with `/workflow connect <run-id>`. Runs without an interactive screen need `gates=none`. See [pause, quit, and resume](../workflows/delivery.md#gates-and-native-controls).
