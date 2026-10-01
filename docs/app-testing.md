# App testing

`test-app` uses the real app and records what happened at each step. Run `/test-app` in a new session before the pull request description.

## What the phase does

1. Read `task.md`, the newest plan or outline, and implementation reports. `## Desired End State` defines expected behavior.
2. Launch the target: a URL or dev server for `web`; a bundle id or `.app` on a booted simulator for `ios`; a package or `.apk` on a running emulator for `android`.
3. Write a test plan with six to twelve steps. Link each expected result to a line in the task documents.
4. Perform every step and record the screen as text: an accessibility snapshot or view hierarchy, not a screenshot path.
5. Grade each step `pass`, `fail`, or `unclear`, with severity 0 (none) through 3 (blocking).
6. Save `<task-root>/<slug>/artifacts/review/browser/<NNNN>.md` with `status: passed`, `failed`, or `blocked`.

## Prerequisites per kind

| Kind | Needs on the machine running the phase |
|---|---|
| `web` | `agent-browser` on `PATH` (`npm i -g agent-browser && agent-browser install`), or a repository Playwright/Puppeteer dependency; a dev-server script when no URL is passed |
| `ios` | macOS, Xcode, an iPhone simulator runtime (`xcrun simctl list devices available`), `maestro` on `PATH` to tap and type (`idb` fallback), and a simulator build or a scheme `xcodebuild` can build |
| `android` | Android SDK platform-tools (`adb`), an emulator/device listed by `adb devices` or an AVD `emulator` can start, `maestro` on `PATH` (`adb shell input` fallback), and an `.apk` or Gradle `installDebug` task |

Missing prerequisites produce `status: blocked` and a complete `## Missing` list. They do not fail silently.

## Launch target

Pass the launch target in the request, for example `/test-app http://localhost:3000` or an iOS bundle ID. Omit it to let the skill inspect repository dev-server or build instructions.

The running machine needs the simulator, emulator, or browser; this skill does not set them up.

## What the artifact records

`<task-root>/<slug>/artifacts/review/browser/<NNNN>.md` stores:

- Header fields: `task`, `type: app-test`, `summary`, `status`, `kind`, and `target`.
- Launch command, revision, and a step table: id, action, expected, observed, verdict, and severity.
- `## Findings`: each failed step's expected result, observed result, severity, and source line.
- `## Missing` when blocked, and `## Human Review` with checks to rerun.

Screenshots go under `<task dir>/app-test/` and remain in the local task directory.

## How failures loop back

Read the artifact status:

- `failed`: run `/iterate-implementation @<plan file>`, then `/test-app` again in a fresh session;
- `passed`: continue with review and `/describe-pr`;
- `blocked`: the missing prerequisite is reported instead of passing. Use `/show-me` if it helps.

## Grading

`judge.mjs grade-steps` sends each step's `expected` and `observed` text to the grading service. It returns a verdict and severity. The key can come from the environment or a key file; see [typed-judgment](../skills/delivery/typed-judgment/SKILL.md). If the helper is unavailable or returns `unclear`, the agent decides and says so under `### Known limits`. Only `steps.json` leaves the machine, not screenshots, page source, or repository code.