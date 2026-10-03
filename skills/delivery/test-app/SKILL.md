---
name: test-app
description: Tests the running application by hand through its web, iOS simulator or Android emulator interface against the task's desired end state, records each step's observed state, and reports passed, failed or blocked. Use when the user runs /test-app, asks to try the feature in the browser or simulator, or after /verify-implementation passes and app testing remains; not for repository checks (use /verify-implementation) or recording video evidence (use /record-evidence).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Test App

Drive the implemented application through a task-derived charter, observe each result, and save `app-test` as passed, failed, or blocked. A passing text/screenshot test does not replace required recorded evidence or authorize PR publication.

Inputs: `kind` is `web`, `ios`, or `android`; `target` is optional and names what to launch (a URL, an iOS bundle id or `.app` path, an Android package or `.apk`). Read them from the request or supplied stage instructions. Infer a missing `kind` from the repository: a `package.json` with a dev script is `web`, an `.xcodeproj` or `Package.swift` with an app target is `ios`, and a `build.gradle` with an application plugin is `android`. When more than one pattern matches or none does, ask which `kind` to test.

For a delivery task, save the output of `node <skills-dir>/deliver/contract.mjs revision <task-dir>` as `revision`, never a git hash, record the policy and baseline paths, and report the evidence still missing. A source change makes earlier verification, review, recording and inspection historical. `node <skills-dir>/deliver/contract.mjs status <task-dir>` reports currency; optional for manual work.

Requirements: `web` runs without `agent-browser` need Playwright, installed outside the repository as launch_web.md says; `ios` and `android` runs need Maestro, or `idb` or `adb`.

## Steps

1. **Locate the task and read primary inputs.** Read `task.md`, current `planning.plan` or `planning.structure`, and every indexed `implementation.receipt` iteration completely. Use summaries only for other current artifacts. Read the app-test templates.

   For delivery, select only the task/policy surfaces and verify the running build identity before testing.

2. **Check existing app-test evidence.** A rerun reads current `review.browser` as input, allocates a successor, and reruns every charter step. Keep earlier bytes and digests unchanged; numbered discovery applies only when the index is genuinely absent.

3. **Determine how to launch.** Read the reference for the `kind` and launch the app as it says: `web` [references/launch_web.md](references/launch_web.md), `ios` [references/launch_ios.md](references/launch_ios.md), `android` [references/launch_android.md](references/launch_android.md). Read only that file.
   - Anything the app needs to start (a database, seed data, an environment variable) comes from the repository's README or scripts. A credential that is not in the repository is a missing prerequisite, never a value to guess or to record.

4. **Write the charter.** Six to twelve steps, each an action a user performs plus an `expected` outcome quoted or paraphrased from the artifacts (the desired end state, a plan phase's acceptance line, an implementation receipt's verify item). Number them `S1`, `S2`, and so on. Start from the launch state, cover every behavior the task added or changed, include one negative or edge case when the artifacts name one, and end where the desired end state says the user ends. A step whose expected outcome no artifact supports is dropped, not invented.

5. **Execute the charter.** After each action, read the screen as text, then record it. Drive the app as the `kind` reference says.
   - Record per step into `steps.json` in a temporary directory outside the repository (`mktemp -d`): `[{id, expected, observed}]`, where `observed` is the text of the snapshot or hierarchy excerpt after the action, trimmed to the elements the step concerns. Never put a screenshot path, page source, or repository code in `observed`.
   - A step that cannot be performed because the app never reached the state the step starts from is recorded with `observed` stating that fact, and the charter continues from the nearest reachable state.

6. **Grade.** Run `node <skills-dir>/typed-judgment/judge.mjs grade-steps --kind screen <temp dir>/steps.json --json` (`<skills-dir>` is the directory that holds this skill; in a checkout, `skills/delivery`). Exit 0: take each row's `verdict` and `severity` (0 none, 1 cosmetic, 2 functional, 3 blocking). Exit 3, no `node`, or a row whose verdict is `unclear`: decide that step yourself by comparing `observed` with `expected` and assign a severity on the same scale; say in the artifact's `### Known limits` that the helper was unavailable or which rows were `unclear`. The helper receives `steps.json` only; never send screenshots or code.

7. **Set the status.**
   - `passed`: every step's verdict is `pass`.
   - `failed`: at least one step's verdict is `fail`. Write one entry per failed step under `## Findings`: the step id, what was expected, what was observed, the severity, and the artifact line the expectation came from.
   - `blocked`: the app could not be launched or driven (no simulator, no emulator, no browser driver or a failed Playwright install, a missing credential, a build that does not compile), or every step was unreachable. List each missing prerequisite under `## Missing`, one per line, exact enough that someone can supply it; no step is graded.
   - Every delivery continues through current recording and inspection; this skill's text observations do not waive either. Standalone testing records video only when requested.

8. **Save the artifact.** Record the next immutable `review.browser` iteration from `references/app_test_template.md`. Keep frontmatter `task`, `type: app-test`, factual `summary`, `status`, `kind`, actual launch `target`, and the source `revision`. Record every charter row's observed text, verdict and severity, Findings, Missing, and Human Review. Screenshots are local support files under `<task-dir>/app-test/`, linked relatively. Keep records uncommitted. Legacy tasks retain their numbered-file contract.

9. **Final answer.** Read the status-selected template: `passed` uses `references/app_test_passed_answer.md`; `failed` uses `references/app_test_failed_answer.md`, with `{source_file}` the worktree-relative plan or outline path, otherwise this app-test artifact; `blocked` uses `references/app_test_blocked_answer.md`. Fill `{needed}` from Missing and other placeholders per the conventions. Keep the one command fence last. A human prerequisite goes to the orchestrator; by hand, use `agent-slack-control-plane`'s feature-thread mode.

## Rules

- Never edit product code, configuration, or test files, and never commit code. Save the app-test artifact and screenshots locally in the task directory; exclude the resolved task root from any code commit.
- Keep credentials out of the artifact, `steps.json`, screenshots, and Maestro flows. A flow that would need a secret to proceed marks its step unreachable and names the secret's purpose, not its value.
- Quote what the screen showed; never paraphrase an error message or a status text in `observed`.
- Install a missing tool outside the repository; never remove or alter the project's own `node_modules`, manifest or lockfile.
- Stop the development server or emulator you started (`kill <pid>`, `xcrun simctl shutdown <udid>`, `adb emu kill`); leave running ones you found as they were.
