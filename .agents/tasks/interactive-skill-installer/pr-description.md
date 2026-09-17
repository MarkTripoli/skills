Task: `interactive-skill-installer`

## Purpose

Give the GitHub npx installer the same guided harness and skill-selection flow users expect from other agent-skill installers while preserving runtime-specific workers and Archon packs.

## Special things to note

- Selecting fewer than all skills skips Archon packs because every pack references the complete delivery chain.
- Partial Codex worker installs merge their managed configuration entries instead of removing unselected workers.
- The prompt dependency raises the minimum supported Node.js version from 20 to 20.12.

## Change outline

The installer, runtime builder, tests, and user-facing setup documentation change together.

```text
scripts/
  install.mjs            owns prompts, selection, planning, and partial config updates
  lib/build.mjs          builds only the selected runtime-adapted skills and workers
tests/
  install.test.mjs       covers menus, flags, partial builds, and Codex config preservation
package.json              adds @clack/prompts and Node.js 20.12 minimum
README.md                 documents interactive and scripted installation
docs/                     updates setup and cheat-sheet instructions
```

Runtime selection now gates the existing install plan.

```diff
 npx github:MarkTripoli/skills
+  select one or more detected harnesses
+  choose all skills or search for a subset
+  skip Archon packs when the subset is incomplete
   show the destination plan
   confirm
-  build and copy every skill and worker
+  build and copy only selected skills and worker definitions
+  merge selected Codex worker entries with existing managed entries
```

Review `scripts/install.mjs` first: it owns the pack-completeness invariant and the distinction between full and partial Codex configuration updates.

## Human Review

### Review targets

- Confirm the default interactive path preselects detected harnesses and keeps the full collection as the recommended choice.
- Confirm `--skill`, `--yes`, `--dry-run`, uninstall, and existing full-install behavior remain compatible.
- Inspect partial Codex worker updates for preservation of unselected files and managed configuration entries.

### Verify

- [ ] Run `npm test` and confirm the validator, generated-file checks, and all unit tests pass.
- [ ] Run `node scripts/install.mjs --dry-run` in a terminal and select one skill to confirm the searchable menu and partial plan.
- [ ] Run `npm pack --dry-run` and confirm `scripts/install.mjs` and the runtime sources are included.

### Known limits

- Partial skill selections intentionally do not install Archon packs.
