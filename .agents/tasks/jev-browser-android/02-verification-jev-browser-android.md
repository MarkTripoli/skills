---
type: verification
revision: 3da7ded
status: passed
summary: Browser and Android release acceptance passes on frozen source. iOS is excluded and deferred; recordings and historical failures remain local.
---

# Browser and Android verification

Final product revision: `3da7ded`. Main ran verification; every new implementation, regression, and diagnostic program was authored by `openai-codex/gpt-5.6-luna-fast`. Independent reviewers were read-only. No source edits occurred during final live verification.

## Repository gates

- `npm test`: 130 passed, zero failed. This includes mechanical validation, plugin synchronization, repository tests, and the isolated skill acceptance suite. Inventory: 43 skills, 36 ordinary plugin skills, seven workers; package version before release versioning is 3.0.0.
- `node scripts/build-runtimes.mjs --runtime <runtime> --dest <isolated destination>`: all four builds passed. Claude Code, Codex, and Oh My Pi each contain 43 skills and seven workers; Pi contains 43 skills and no workers.
- Independent standards and spec reviews: all findings resolved. See `01-review-jev-browser-android.md`, including retained intermediate failures and focused regression evidence.
- Source explicitly exposes browser and Android, not the new JEV iOS implementation. Existing unrelated iOS support in record-evidence and other skills is preserved.

## Actual UI and standalone proof

All paths below are relative to this task. Media and raw receipts are retained locally under ignored `evidence/`; they are not uploaded or included in the release commit.

| Check | Observed result | Evidence |
| --- | --- | --- |
| Android generic confirmation | Passed; independently observed `Confirmed`; one passed assertion | `evidence/verified-3da7ded/android-generic/` |
| Android exact label-equal value | Passed; independently observed `Confirmed Name via Email.`; one passed assertion | `evidence/verified-3da7ded/android-exact-name/` |
| Android genuine replacement | Both actual transitions passed without a relaunch between them: `Confirmed Casey via Email.` then `Confirmed Jordan via Email.`; two passed assertions | `evidence/verified-3da7ded/android-replacement/` |
| Android XML-sensitive name and dropdown selection | Unchanged previously blocked goal passed: `Confirmed A & B via Phone.`; one passed assertion | `evidence/verified-3da7ded/android-xml-phone/` |
| Copied selected-skill browser execution | Passed outside the repository, with Atomic absent from PATH and the isolated HOME; copied typed-judgment and record-evidence helpers present; verified 12.1-second H.264 recording | `evidence/verified-3da7ded/standalone.json` and `standalone-evidence/` |
| Full-array text-helper command | Recorded browser acceptance passed using the JSON array command form | `evidence/verified-4a364eb/browser-array/` |
| Browser production CLI | Exact Casey/Email goal exited zero; zero-action and zero-model runs each exited one; owned sessions were absent afterward | Supervisor command output at unchanged browser product revision `4a364eb` |
| Browser origin boundary | Redirect, popup, 800ms event-loop-stalled popup, and shutdown cases made no foreign-origin requests, including cleanup; source remained stable | `evidence/verified-4a364eb/origin-boundary.json` |
| Selected-resource ownership | Installing record-evidence independently, then installing/uninstalling jev-ui, preserved record-evidence and typed-judgment while removing jev-ui | Isolated home `/tmp/jev-release-ownership.2p84is` |

The final Android receipts identify real model `jev-1.13.0`, explicit target `emulator-5560`, independently observed postconditions, verified evidence, and zero failed assertions. The final copied browser proof also uses real JEV decisions and independent observation. Main visually inspected the recorded browser and native behavior, including the repaired Phone selection and confirmation. The native run did not touch `emulator-5554`, kill the ADB server, or reset a device to hide a failure.

Browser/controller/helper/installer source is unchanged by the later Android-only normalization fixes. Browser-specific evidence at `4a364eb` therefore remains applicable; copied standalone execution was additionally repeated from the final `3da7ded` installation. Browser origin proof records SHA-256 `998556db41a0d4fff18874b70f1dfd85a8d6fb6657b94ff0538e7271d7b4af28` for the unchanged browser module.

## Failures retained, not relabeled

The original all-platform task, paused Atomic run, interrupted iOS work, and all recordings remain local. Release evidence retains the blocked pre-fix dropdown replacement and Phone-selection attempts. Their exact goals now pass after capability/ancestry corrections, without prompt rewriting, added retries, or increased action budgets. The final real-process regression also fails against isolated pre-fix source and passes against repaired source; its test-only startup/exit-observer corrections are documented in the review artifact.

## Publication boundary

Local acceptance is complete. GitHub Conventional Commits checks must pass before the authorized feature merge. The user additionally authorized a new release: use the existing Changesets minor-version flow, verify the version PR and published release, then create the fresh local iOS branch from released main. This artifact does not claim GitHub publication before it occurs, iOS readiness, or resumption of the original paused Atomic workflow.
