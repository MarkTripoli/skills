---
name: project-init
description: Detect an existing supported target-project stack and prepare a safe, idempotent bootstrap plan without automatic mutations.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Project Bootstrap

Initialize an existing target project from detected setup. This is distinct from installing this skills collection. Planning is read-only; unknown and unsupported stacks are reported, never guessed.

## Steps

1. Set the target to the project root explicitly provided by the operator, or the current working directory.
2. Run `node <skill-dir>/scripts/bootstrap.mjs [--target <directory>]`. The read-only default target is the current directory. Existing Node projects require `package.json`; `.nvmrc` or `.node-version` supports an otherwise empty target. A lockfile without `package.json`, multiple lockfiles, Python projects, Go projects (`go.mod`), and mixed project signals are unsupported. Existing Node projects are preserved; a new `package.json` is proposed only when the target contains no entries except regular `.nvmrc` or `.node-version` marker files.
3. Present the complete read-only plan, including its `planId`, before mutation. After explicit operator approval, pass that exact ID back: `node <skill-dir>/scripts/bootstrap.mjs --target <directory> --apply --approve <planId-from-dry-run>`. A missing ID, changed target inode, changed plan, or only one authorization flag is rejected before staging. Output reports `outcome: "planned"`, `"applied"`, or `"unchanged"`; successful creation reports `"applied"`. Creation rechecks project signals, requires a project directory whose staging entries cannot be replaced by other users, and exclusively publishes the complete manifest. Existing/racing files and symlinked path components are rejected. Darwin `/tmp` and `/var` aliases are canonicalized as platform paths. No dependencies are installed, services started, or commands executed.
4. Rerun the read-only command after approved creation. Repeated runs on unchanged state produce the same plan; after creation, the plan has no action. Report unsupported cases without mutation.

## Safety

- Never treat this skill collection's installation as target-project initialization.
- Never run package-manager, installer, service, or dependency commands.
- Never overwrite or normalize existing project configuration.
- Do not claim bootstrap completion when only detection/planning was performed.
