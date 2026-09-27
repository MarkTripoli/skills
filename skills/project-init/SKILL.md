---
name: project-init
description: Detect an existing supported target-project stack and prepare a safe, idempotent bootstrap plan without automatic mutations.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Project Bootstrap

Initialize an existing target project from its detected language and package-toolchain setup. This is distinct from installing this skills collection. Detection and planning are read-only; unknown and unsupported stacks are reported, never guessed.

## Steps

1. Set the target to the project root explicitly provided by the operator, or the current working directory. Do not inspect ignored environment files or secrets.
2. Run `node <skill-dir>/scripts/bootstrap.mjs <target-root>` and inspect its JSON result. The script recognizes `package.json` with npm/yarn/pnpm lockfiles, and `pyproject.toml` with uv/Poetry/Pipenv lockfiles. Unknown lockfile/toolchain and absent manifests are reported as unknown/unsupported. It does not create, edit, install, start, or execute project commands.
3. Present the complete plan before any mutation. The plan must preserve existing configuration and must not propose overwriting it. State that the current plan contains no automatic actions. If bootstrapping requires adding dependencies, installing tools, starting services, or changing files, describe each exact action and its effect, then obtain explicit operator approval before performing that action. Approval for one action does not authorize others. Without approval, stop after the plan.
4. After approved work, rerun detection and planning. Compare with the first plan: repeated runs on unchanged project state must be identical and make no additional changes. Report unsupported cases without attempting arbitrary package-manager fallbacks.

## Safety

- Never treat this skill collection's installation as target-project initialization.
- Never run package manager, installer, service, or dependency commands automatically.
- Never overwrite or normalize existing project configuration.
- Do not claim bootstrap completion when only detection/planning was performed.
