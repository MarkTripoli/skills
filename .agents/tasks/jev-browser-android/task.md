---
slug: jev-browser-android
title: Ship JEV browser and Android support separately from iOS
workflow: oneshot
created: 2026-09-20
base: main
---

User request:

> Can we do something different? If our Android and web work is good and we're just waiting on iOS, can we commit, push, and merge all of that, then spin up a fresh branch to handle the iOS side?

## Approved delivery boundary

Ship the existing real JEV browser and Android control, selected-skill installation, record-evidence integration, safety boundaries, and regression coverage. Exclude the new JEV iOS implementation, fixtures, CLI/library exposure, and support claims from this release. Preserve unrelated existing iOS support in record-evidence and other skills. Keep the latest main documentation and release history; do not overwrite them with the older all-platform branch.

Commit, push, open a PR, and merge the verified browser/Android subset. Do not upload recordings or publish the old all-platform branch. After merge, create a fresh local iOS branch from merged main and carry the remaining iOS work there.

All new implementation, test, regression, and diagnostic programs must be authored by `openai-codex/gpt-5.6-luna-fast`. The supervisor may inspect, run existing programs, edit prose/configuration/evidence, manage git, verify, and publish. Preserve every original task artifact, failed/blocked/interrupted run, and owner-managed worktree.

## Source and preservation

- Release worktree: `/Users/marktripoli/.agents/worktrees/skills/jev-browser-android`, branch `feat/jev-browser-android`, based on `origin/main` at `c5a6148`.
- Imported source snapshot: `ccedd485635fc5ac89e82b99160bc0deae313901`, which incorporates current main without conflicts.
- Original worktree: `/Users/marktripoli/.agents/worktrees/skills/build-a-new-independently-1cea3ccc`.
- Local preservation branch: `jev-ui-all-platform-preserved` at `891ef37` before main integration.
- Original Atomic run `3a9f5147-f685-4d42-acfb-322bcb5f520f` is paused at stage 039 with no active writer/verifier. Do not resume it automatically.
- Pending fixture/source changes and original task history were committed locally before the split. Raw recordings remain excluded from git and retained in the original task evidence directory.

## Acceptance

1. Production CLI/library and packaged skill support browser and Android only; iOS is not silently redirected or reported as supported.
2. Real JEV chooses actions; expected outcomes are independently observed. Keep origin/app/device confinement, bounded actions and subprocess cleanup, privacy, and truthful non-green outcomes.
3. Run aggregate checks, the complete relevant focused suite, and all four supported runtime builds on final release source.
4. Prove actual browser CLI lifecycle and recorded acceptance, plus Android generic, exact label-equal Name, and genuine Casey-to-Jordan replacement without relaunch between transitions.
5. Prove copied selected-skill execution outside Atomic and preserve independently installed record-evidence ownership on uninstall.
6. Obtain focused independent code review of this release diff, repair actionable browser/Android findings, and record final proof before publication.
7. Publish only reviewed code/docs and this release task's artifacts; retain old all-platform history and recordings locally.
8. Create a fresh iOS branch from merged main with preserved work and explicit remaining acceptance requirements.

## Existing proof and execution environment

Current pre-split proof is retained under the original task:
- `evidence/verification15-browser-20260920T014701Z/`: real FILL/CLICK/DONE, verified 11.4-second media, owned browser closed.
- `evidence/verification15-native-20260920T014800Z/android-generic/`, `android-label-equal/`, and `android-casey-jordan/`: all passed with verified media.
- The interrupted iOS generic attempt is untested/non-green, not a passed case.

Read `/tmp/atomic-migration.JBu9Sk/acceptance-environment.json` for the existing text helper configuration. Do not print secrets. The authorized Android emulator is `emulator-5560`; never touch `emulator-5554` or kill the ADB server. The supervisor owns running emulator/companion services. Evidence must be written outside skill source. Existing standalone proof programs are in `/tmp/atomic-migration.JBu9Sk/`; execute them instead of authoring new supervisor probes.

## Implementation ownership

The Luna-fast writer owns product/tests/docs changes only in this release worktree. Remove the iOS-specific parts of the imported JEV skill, adapt shared call sites and tests, update its changeset and user-facing registration/documentation, and report changed paths and the iOS restoration boundary. Do not commit, publish, merge, edit the original worktree, reset devices, or resume the paused workflow. Skip formatters, linters, builds, and tests during the edit phase; the supervisor runs final checks after the tree is coherent. Keep the extraction separate from unrelated fixes so iOS can be restored cleanly on the fresh branch.

## Additional publication authorization

The user subsequently instructed:

> I would just ask you: once everything is good here, and the merge request is up and it's settled, please just merge it in once all checks are good.

> And also, then cut a new release.

Merge without another confirmation after local acceptance and GitHub checks pass. Use the existing Changesets versioning/release flow for the browser/Android-only release, verify the version PR and resulting release, then base the fresh local iOS branch on the released main. Do not publish iOS or upload recordings.
