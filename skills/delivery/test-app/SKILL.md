---
name: test-app
description: Run for /test-app requests. Test the running application by hand through its user interface (web, iOS simulator, or Android emulator) against the task's desired end state, record every step's observed state, and report passed, failed, or blocked.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Test App

Drive the implemented application the way a tester at a keyboard would: launch it, follow a charter of steps derived from the task's artifacts, read the screen after each step, and grade what was observed against what the artifacts promise. The result is an `app-test` artifact whose `status` routes the delivery workflow: `passed` continues to the pull request description, `failed` sends the failing steps back to `iterate-implementation`, `blocked` stops the run until the missing prerequisite is supplied.

Inputs: `kind` is `web`, `ios`, or `android`; `target` is optional and names what to launch (a URL, an iOS bundle id or `.app` path, an Android package or `.apk`). Read them from the request or supplied stage instructions. Infer a missing `kind` from the repository: a `package.json` with a dev script is `web`, an `.xcodeproj` or `Package.swift` with an app target is `ios`, and a `build.gradle` with an application plugin is `android`.

## Steps

1. **Locate the task and read primary inputs.** Locate the task directory and read `task.md` per the conventions, creating it from the request when none exists. Read the newest artifact of type `plan` or `structure-outline` and every artifact of type `implementation` completely; read the `## Desired End State` section wherever the selected artifacts carry one. Read `summary` only from other artifacts. Read `references/app_test_template.md`, `references/app_test_passed_answer.md`, `references/app_test_failed_answer.md`, `references/app_test_blocked_answer.md`.

2. **Check for an existing app-test artifact.** When the newest artifact of type `app-test` exists, this is a re-run after `iterate-implementation`: keep its file and number, revise it in place per the Iteration convention, and re-run every step, not only the ones that failed.

3. **Determine how to launch.**
   - `web`: `target` is the URL. Without one, start the repository's development server (`npm run dev`, `pnpm dev`, `yarn dev`, or the script the README names) in the background, wait for its port to accept connections, and use `http://localhost:<port>`. Confirm the server is yours: `lsof -i :<port>` then `ps -p <pid> -o args=`.
   - `ios`: `xcrun simctl list devices booted -j`; when nothing is booted, boot the first available iPhone (`xcrun simctl list devices available -j`, then `xcrun simctl boot <udid>` and `xcrun simctl bootstatus <udid> -b`). A `.app` path in `target` is installed with `xcrun simctl install booted <path>` and launched with `xcrun simctl launch booted <bundle id>` (the bundle id is `CFBundleIdentifier` in the app's `Info.plist`); a bundle id in `target` is launched directly. Without `target`, build the scheme the repository names for a simulator destination (`xcodebuild -scheme <scheme> -destination 'generic/platform=iOS Simulator' -derivedDataPath <temp dir> build`) and install the resulting `.app`.
   - `android`: `adb devices` must list one running emulator or device; when none is listed, start the first AVD (`emulator -list-avds`, `emulator -avd <name> -no-audio &`, `adb wait-for-device`). An `.apk` in `target` is installed with `adb install -r <path>` and launched with `adb shell monkey -p <package> -c android.intent.category.LAUNCHER 1`; a package name in `target` is launched directly. Without `target`, run `./gradlew installDebug` and launch the `applicationId` from the app module's `build.gradle`.
   - Anything the app needs to start (a database, seed data, an environment variable) comes from the repository's README or scripts. A credential that is not in the repository is a missing prerequisite, never a value to guess or to record.

4. **Write the charter.** Six to twelve steps, each an action a user performs plus an `expected` outcome quoted or paraphrased from the artifacts (the desired end state, a plan phase's acceptance line, an implementation receipt's verify item). Number them `S1`, `S2`, and so on. Start from the launch state, cover every behavior the task added or changed, include one negative or edge case when the artifacts name one, and end where the desired end state says the user ends. A step whose expected outcome no artifact supports is dropped, not invented.

5. **Execute the charter.** After each action, read the screen as text, then record it.
   - `web`: `command -v agent-browser` first. Present: `agent-browser open <url>`, then per step `agent-browser snapshot -i` before acting, `agent-browser click @eN` / `agent-browser fill @eN "<text>"` / `agent-browser press <key>`, `agent-browser wait --load networkidle`, `agent-browser snapshot -i` again to read the result, `agent-browser screenshot <task dir>/app-test/SN.png` when a screenshot helps a reviewer; `agent-browser close` at the end. Absent: use the repository's own browser driver (Playwright when `@playwright/test` or `playwright` is a dependency, Puppeteer when `puppeteer` is) through a throwaway script that prints the accessibility snapshot (`page.accessibility.snapshot()` or `page.locator('body').ariaSnapshot()`) after each step. Neither: `blocked`.
   - `ios` and `android`: write one Maestro flow per step to a temporary directory outside the repository (`mktemp -d`), `appId` the bundle id or package, commands `tapOn`, `inputText`, `assertVisible`, `scroll`; run `maestro test <flow.yaml>` (`maestro --device <udid or serial> test` when several are connected). Read the screen with `maestro hierarchy` and keep the excerpt around the elements the step names. Screenshots: `xcrun simctl io booted screenshot <task dir>/app-test/SN.png` or `adb exec-out screencap -p > <task dir>/app-test/SN.png`. `maestro` missing: drive with `idb ui tap` and `idb ui describe-all` on iOS, `adb shell input` and `adb shell uiautomator dump` on Android; none of these: `blocked`.
   - Record per step into `steps.json` in the same temporary directory: `[{id, expected, observed}]`, where `observed` is the text of the snapshot or hierarchy excerpt after the action, trimmed to the elements the step concerns. Never put a screenshot path, page source, or repository code in `observed`.
   - A step that cannot be performed because the app never reached the state the step starts from is recorded with `observed` stating that fact, and the charter continues from the nearest reachable state.

6. **Grade.** Run `node <skills dir>/typed-judgment/judge.mjs grade-steps <temp dir>/steps.json --json` (`<skills dir>` is the directory that holds this skill; in a checkout, `skills/delivery`). Exit 0: take each row's `verdict` and `severity` (0 none, 1 cosmetic, 2 functional, 3 blocking). Exit 3, no `node`, or a row whose verdict is `unclear`: decide that step yourself by comparing `observed` with `expected` and assign a severity on the same scale; say in the artifact's `### Known limits` that the helper was unavailable or which rows were `unclear`. The helper receives `steps.json` only; never send screenshots or code.

7. **Set the status.**
   - `passed`: every step's verdict is `pass`.
   - `failed`: at least one step's verdict is `fail`. Write one entry per failed step under `## Findings`: the step id, what was expected, what was observed, the severity, and the artifact line the expectation came from.
   - `blocked`: the app could not be launched or driven (no simulator, no emulator, no browser driver, a missing credential, a build that does not compile), or every step was unreachable. List each missing prerequisite under `## Missing`, one per line, exact enough that someone can supply it; no step is graded.
   - Optional: when `task.md` asks for a recording, hand the passed charter to the `record-evidence` skill after saving this artifact; this skill records text, not video.

8. **Save the artifact.** Take the next artifact number (or keep the existing file from step 2) and write `NN-app-test-<slug>.md` in the task directory from the template. Frontmatter: `task`, `type: app-test`, `summary` (two to four sentences: what was tested, the status, the failing or missing items, what the next phase needs), `status`, `kind`, `target` (the URL, bundle id, package, or path actually launched; empty when blocked before launch). Fill the steps table with every charter step (`observed` is a one-line digest of the recorded text; `verdict` and `severity` from step 6). `## Findings` and `## Missing` read `None.` when empty. Fill `## Human Review`: `### Review targets` names the steps and findings a reviewer should re-run; `### Verify` lists the launch command and each failed step's action; `### Known limits` records steps not reachable, environments not tried, and whether the helper graded or you did. Screenshots stay under `<task dir>/app-test/` and are referenced by relative path from the table's action column only when they add information. Commit the saved file and its screenshots with `git add <path>` as `docs(task): app-test artifact`.

9. **Final answer.** `status: passed` uses `references/app_test_passed_answer.md`; `status: failed` uses `references/app_test_failed_answer.md`, where `{plan_file}` is the name of the plan or structure outline from step 1; `status: blocked` uses `references/app_test_blocked_answer.md`. Fill the selected template exactly, using the conventions' placeholders, plus `{needed}`: one line per item of the artifact's `## Missing` list. End with one fenced `text` command; nothing follows the fence.

## Rules

- Never edit product code, configuration, or test files, and never commit code. Only the app-test artifact and its screenshots are committed, as a `docs(task)` commit.
- Keep credentials out of the artifact, `steps.json`, screenshots, and Maestro flows. A flow that would need a secret to proceed marks its step unreachable and names the secret's purpose, not its value.
- Do not send screenshots, page source, or repository code to the typed-judgment helper; `steps.json` carries text observations only.
- Quote what the screen showed; never paraphrase an error message or a status text in `observed`.
- Stop the development server or emulator you started (`kill <pid>`, `xcrun simctl shutdown <udid>`, `adb emu kill`); leave running ones you found as they were.

## References

Read from this skill directory: `references/app_test_template.md`, `references/app_test_passed_answer.md`, `references/app_test_failed_answer.md`, `references/app_test_blocked_answer.md`.
