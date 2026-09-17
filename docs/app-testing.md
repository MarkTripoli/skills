# App testing

The `test-app` phase drives the implemented application through its user interface, the way a tester at a keyboard would, and records what each step showed. It runs after implementation and before the pull request description when a pack is started with `--input app_test=<kind>`; by hand it is `/test-app` in a fresh session.

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

## Pack inputs

Every pack that implements code (`delivery-full`, `delivery-lean`, `delivery-prd`, `delivery-oneshot`, `delivery-bugfix`) takes two inputs:

- `app_test`: `none` (default), `web`, `ios`, or `android`. Anything but `none` runs the `delivery-app-test` block after implementation.
- `app_target`: what to launch. Empty lets the skill start the repository's own dev server or build.

```sh
archon workflow run delivery-lean --branch verbose-flag --input app_test=web --input app_target=http://localhost:3000 "Add a --verbose flag to the settings page"
archon workflow run delivery-full --branch onboarding --input app_test=ios --input app_target=com.example.app "Redesign onboarding"
```

The run needs the simulator, emulator, or browser on the same machine as the Archon worker; the phase does not provision devices.

## What the artifact records

`NN-app-test-<slug>.md` carries frontmatter `task`, `type: app-test`, `summary`, `status`, `kind`, `target`, then the launch command and revision, a table of steps (id, action, expected, observed, verdict, severity), `## Findings` (one entry per failed step: expected, observed, severity, source line), `## Missing` (blocked only), and `## Human Review` with the checks a reviewer re-runs. Screenshots, when taken, sit under `<task dir>/app-test/` and travel with the artifact commit `docs(task): app-test artifacts`.

## How failures loop back

The `delivery-app-test` block is a `loop_group` of three rounds. A `failed` round runs `iterate-implementation` with the artifact's `## Findings` as feedback, commits the artifact, and tests again in a fresh session, which revises the same artifact in place. `passed` ends the loop and the pack continues to `describe-pr`. `blocked` commits the artifact and cancels the run; supply what `## Missing` names and start the run again with the same `--input task_dir=`. Three failed rounds fail the node.

By hand the same routing is the reply's command fence: `/describe-pr` after a pass, `/iterate-implementation @<plan file>` after a failure, `/show-me` when blocked.

## Grading

Each step's `expected` and `observed` text goes to the typed-judgment helper (`judge.mjs grade-steps`), which returns a verdict and severity per step when `TYPESAFE_API_KEY` is set. Without the key, or when a row comes back `unclear`, the agent decides that step itself and says so under `### Known limits`. Screenshots, page source, and repository code never leave the machine; only `steps.json` does. See [skills/delivery/typed-judgment/SKILL.md](../skills/delivery/typed-judgment/SKILL.md).
