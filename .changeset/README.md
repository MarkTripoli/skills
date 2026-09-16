# Changesets

Every pull request that changes what users get (a skill, a template, an extension, the installer, the build) adds one file here describing the change and the semver bump it deserves. `npm run changeset` writes one interactively; or write it by hand:

```markdown
---
"@marktripoli/skills": patch
---

One or more sentences on what changed and why a user cares. This text becomes the CHANGELOG entry.
```

`patch` for fixes, skill copy, template and UI polish; `minor` for a new skill, phase, extension, or installer capability, and for anything that changes the task directory layout or reply contract while the version is below 1.0.0; `major` for those after 1.0.0. Docs-only and test-only changes need no changeset.

On every push to `main`, the Release workflow collects the pending files into a "chore: version skills" pull request that bumps `package.json`, syncs `.claude-plugin/plugin.json`, and writes `CHANGELOG.md`. Merging that pull request tags `v<version>` and publishes the GitHub release. Full documentation: [changesets/changesets](https://github.com/changesets/changesets).
