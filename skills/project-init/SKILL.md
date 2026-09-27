---
name: project-init
description: Detect an existing supported target-project stack and prepare a safe, idempotent bootstrap plan without automatic mutations.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Project Bootstrap

Initialize an existing target project from detected setup. This is distinct from installing this skills collection. Planning is read-only; unknown and unsupported stacks are reported, never guessed.

## Steps

1. Set the target to the project root explicitly provided by the operator, or the current working directory.
2. Run `node <skill-dir>/scripts/bootstrap.mjs [--target <directory>]`. The read-only default target is the current directory. Supported Node signals are `package.json`, `.nvmrc`, and `.node-version`; npm/yarn/pnpm lockfiles identify an existing manager. Existing Node projects are preserved. Only an empty supported Node target gets a planned minimal `package.json`. Python projects and mixed Node/Python signals are unsupported; do not guess or fall back.
3. Present the complete plan before mutation. To create the planned file, rerun with both `--apply --approve` after explicit operator approval: `node <skill-dir>/scripts/bootstrap.mjs --target <directory> --apply --approve`. Supplying only one flag is rejected. This creates only `package.json` in the target directory with exclusive creation (`wx`); an existing/racing file is never overwritten. Symlink-resolved target directories are rejected. No dependencies are installed, services started, or commands executed.
4. Rerun the read-only command after approved creation. Repeated runs on unchanged state produce the same plan; after creation, the plan has no action. Report unsupported cases without mutation.

## Safety

- Never treat this skill collection's installation as target-project initialization.
- Never run package-manager, installer, service, or dependency commands.
- Never overwrite or normalize existing project configuration.
- Do not claim bootstrap completion when only detection/planning was performed.
