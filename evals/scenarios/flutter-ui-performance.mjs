import { execFileSync } from "node:child_process";
import { artifacts, expect, failures } from "../lib.mjs";

// The fixture is a small Flutter app. Its Teams screen updates an expanded count with parent setState,
// while each row holds its own expansion state. The item builder sorts and filters repeatedly, and the view model
// clears every team's members at reload start, so expanded rows show "No members". Settings is a static ListView with
// no work to save. The request asks for the audit and the first slice's plan, no code change. Graded on: Teams
// ranked above Settings, per-item notifiers in place of parent setState, unknown members kept instead of shown as empty,
// the concurrency guards that keeping data during a reload needs, the prefetch fix rather than keep-alive or the
// deprecated `cacheExtent`, state == kept a separate change, and no source edits.

function written(taskDir) {
  return artifacts(taskDir).filter((artifact) => artifact.current !== false).map((artifact) => artifact.text).join("\n");
}

function check({ live, repo, taskDir, answer, fixtureSha }) {
  const text = `${answer}\n${written(taskDir)}`;
  const teams = text.search(/TeamsScreen|teams_screen|Teams screen/);
  const settings = text.search(/SettingsScreen|settings_screen|Settings screen/);
  // A re-grade has only the recorded answer and artifacts, not the repository the model worked in.
  const edited = live ? execFileSync("git", ["-C", repo, "diff", "--name-only", fixtureSha, "--", "lib", "pubspec.yaml"], { encoding: "utf8" }).split("\n").filter(Boolean) : [];
  return failures(
    teams === -1 ? "audit: the Teams screen is not named" : null,
    settings !== -1 && settings < teams ? "audit: Settings is ranked above Teams" : null,
    expect.matches("audit: per-item notifier replaces parent setState for expand", text, /\b(ValueNotifier|ChangeNotifier|ValueListenableBuilder|ListenableBuilder)\b[^\n]{0,200}\b(per[- ](item|row|team)|each (item|row|team)|team id)|\bper[- ](item|row|team)\b[^\n]{0,200}\b(ValueNotifier|ChangeNotifier|notifier)/i),
    expect.matches("audit: unknown members are not shown as empty", text, /\b(unknown|not (yet )?loaded|last known|kept)\b[^\n]{0,200}\b(empty|No members|clear)|\b(empty|No members|clear)\w*\b[^\n]{0,200}\b(unknown|not (yet )?loaded|last known)/i),
    expect.matches("audit: keep-during-reload is flagged as a concurrency change", text, /\b(concurren\w*|race\w*|overlapping|stale (load|reload)|epoch|newest load|generation)\b/i),
    expect.matches("audit: prefetch with scrollCacheExtent", text, /ScrollCacheExtent\.viewport/),
    expect.excludes("audit: keep-alive recommended as the fix", text.replace(/[^\n]*\b(not|no|never|avoid|instead of|rather than|without|don't|do not)\b[^\n]*/gi, ""), /AutomaticKeepAlive|wantKeepAlive/),
    expect.excludes("audit: deprecated cacheExtent recommended", text.replace(/[^\n]*\b(not|no|never|avoid|instead of|rather than|deprecated|don't|do not)\b[^\n]*/gi, ""), /\bcacheExtent\s*:/),
    expect.matches("audit: state == is a separate change", text, /(==|operator ==|equality)[^\n]{0,200}\b(separate|own|later|follow-?up|independent)\b|\b(separate|own|later|follow-?up|independent)\b[^\n]{0,200}(==|operator ==|equality)/i),
    edited.length ? `audit: changed source files: ${edited.join(", ")}` : null,
  );
}

export default {
  slug: "teams-list-jank",
  title: "Teams list rebuilds and flashes",
  workflow: "oneshot",
  fixtures: ["flutter-ui-performance"],
  request: "The Teams list janks when I expand a team, an expanded team flashes \"No members\" after every sync, and expansion is lost when I scroll far down and back. Audit the list screens in this Flutter app with /flutter-ui-performance, rank what to fix, and plan the first slice with its tests. Do not change code.",
  phases: [
    {
      skill: "flutter-ui-performance",
      terminal: true,
      check,
    },
  ],
};
