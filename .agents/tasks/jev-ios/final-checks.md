---
task: jev-ios
type: final-checks
status: pending-affected-native-proof
---

# Final checks

- Branch/worktree: `feat/jev-ios`, existing checkout; no new worktree, push, PR creation, upload, old Atomic resume, or Android interaction.
- `npm test`: exit 0, 149 tests, 149 pass, 0 fail, 0 skipped, 0 todo.
- Runtime packaging: all four `node scripts/build-runtimes.mjs` commands exited 0 into `/tmp/jev-ios-risk-builds-1789902006/`: claude-code `43 skills, 7 workers`; codex `43 skills, 7 workers`; oh-my-pi `43 skills, 7 workers`; pi `43 skills, 0 workers`.
- `node scripts/check-commits.mjs origin/main..HEAD`: exit 0 after continuation artifacts; current subject count is recorded by the final integration commit.
- Qlty setup: one bounded install to `/tmp/jev-qlty-bin/qlty`, version `0.643.0`; temporary `qlty init --no` config removed afterward. `qlty check --upstream origin/main` found one medium shellcheck advisory at `skills/delivery/jev-ui/fixture/ios/install-authorized.sh:6:6`; no product change was authorized for that advisory.
- Affected live reruns: generic and blocked receipts pass with external `idb`/JEV. Exact Name, Casey seed, and standalone wrapper-backed receipts are rejected because the wrapper rewrote prompts; unchanged-helper attempts are retained as unproven. Earlier blocked evidence remains preserved. `xcrun simctl list devices` reports authorized `7A023F51-F0DA-4179-868B-19207E433651` as `Shutdown`; the owned socket is absent and unrelated processes were not touched.
- Review: the prior `07-code-review-jev-ios.md` approved the previous repair; independent review of `b95285c` remains pending.
