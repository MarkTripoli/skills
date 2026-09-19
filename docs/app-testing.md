# App testing

The `test-app` phase drives the implemented application through its user interface, the way a tester at a keyboard would, and records what each step showed. The optional Atomic controller runs it before the pull request description when `app_test` is enabled; by hand invoke `/test-app` in a fresh session.

## What the phase does

1. Reads `task.md`, the newest plan or structure outline, and the implementation receipts; the `## Desired End State` is the source of truth for what the app should do.
2. Launches the app: a URL or the repository's dev server for `web`, a bundle id or `.app` on a booted simulator for `ios`, a package or `.apk` on a running emulator for `android`.
3. Writes a charter of six to twelve steps, each with an expected outcome traced to an artifact line.
4. Performs every step and records the screen as text (accessibility snapshot or view hierarchy), not as a screenshot path.
5. Grades each step `pass`, `fail`, or `unclear` with a severity from 0 (none) to 3 (blocking).
6. Saves `NN-app-test-<slug>.md` with `status: passed`, `failed`, or `blocked`.

## Prerequisites per kind

| Kind | Needs on the machine running the phase |
|---|---|
| `web` | `agent-browser` on `PATH` (`npm i -g agent-browser && agent-browser install`), or a Playwright or Puppeteer dependency in the repository; a dev-server script when no URL is passed. |
| `ios` | macOS with Xcode and at least one iPhone simulator runtime (`xcrun simctl list devices available`); `maestro` on `PATH` to tap and type (`idb` is the fallback); a simulator build of the app or a scheme `xcodebuild` can build for the simulator. |
| `android` | Android SDK platform-tools (`adb`) and an emulator or device that `adb devices` lists, or an AVD `emulator` can start; `maestro` on `PATH` (`adb shell input` is the fallback); an `.apk` or a Gradle `installDebug` task. |

Missing prerequisites do not fail the phase silently: the artifact's `## Missing` list names each one and the status is `blocked`.

## Optional workflow inputs

The Atomic `delivery` workflow takes:

- `app_test`: `none` (default), `web`, `ios`, or `android`. Anything but `none` requests UI testing.
- `app_target`: what to launch. Omit it to let the skill inspect the repository's dev-server or build instructions.

Inside Atomic:

```text
/workflow delivery request="Add a settings toggle" workflow=lean branch=settings-toggle app_test=web app_target="http://localhost:3000"
/workflow delivery request="Redesign onboarding" workflow=full branch=onboarding app_test=ios app_target=com.example.app
```

The machine running the stage needs the simulator, emulator, or browser; the phase does not provision devices. Independent skill invocation has the same prerequisites but needs no Atomic installation.

## What the artifact records

`NN-app-test-<slug>.md` carries frontmatter `task`, `type: app-test`, `summary`, `status`, `kind`, `target`, then the launch command and revision, a table of steps (id, action, expected, observed, verdict, severity), `## Findings` (one entry per failed step: expected, observed, severity, source line), `## Missing` (blocked only), and `## Human Review` with the checks a reviewer re-runs. Screenshots, when taken, sit under `<task dir>/app-test/` and travel with the artifact commit `docs(task): app-test artifacts`.

## How failures loop back

The Atomic controller reads the saved app-test artifact. A `failed` result routes to `iterate-implementation` with its findings, then a fresh test stage exercises the repair. A `passed` result allows the remaining review/PR work to continue. A `blocked` result reports the missing prerequisite instead of passing. The workflow's `max_steps` bounds repeated repair sessions; inspect native run status and the artifact before resuming or starting a new run with the existing `task_dir`.

By hand the same routing is the reply's command fence: `/describe-pr` after a pass, `/iterate-implementation @<plan file>` after a failure, `/show-me` when blocked.

## Grading

Each step's `expected` and `observed` text goes to the typed-judgment helper (`judge.mjs grade-steps`), which returns a verdict and severity per step when `TYPESAFE_API_KEY` is set. Without the key, or when a row comes back `unclear`, the agent decides that step itself and says so under `### Known limits`. Screenshots, page source, and repository code never leave the machine; only `steps.json` does. See [skills/delivery/typed-judgment/SKILL.md](../skills/delivery/typed-judgment/SKILL.md).
