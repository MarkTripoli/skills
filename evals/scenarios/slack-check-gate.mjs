import { expect, failures } from "../lib.mjs";
import { git } from "../deliver-grade.mjs";

// The slack-coordinator skill's gate: `run check` exit 11 means pause, exit 10 means read the owner's reply and
// `run resolve` it, and no edit or commit happens until a check answers 0. The scenario's `slack-coordinator` stub
// (ahead of the harness's failing one on PATH) answers the 1st check 11, the 2nd 10 and every later one 0, and
// writes one `slack-state` line per check beside the call log: the repository HEAD and a checksum of its tracked and
// untracked changes at that moment. The grader needs no transcript: the state seen at the 11 must equal the state at
// the first 0, and `run resolve` must sit between the 10 and that 0. The owner's reply asks for nothing to be edited,
// so applying it cannot legitimately change the tree before the 0. Needs no Slack service.
const REPLY = "Keep this change to README.md only; touch no other file.";

const stub = String.raw`case "$1 $2" in
  "run check"|"run wait")
    gd=$(git rev-parse --absolute-git-dir 2>/dev/null || echo /tmp)
    n=$(cat "$gd/slack-gate-count" 2>/dev/null || echo 0)
    n=$((n+1))
    echo "$n" > "$gd/slack-gate-count"
    case "$n" in 1) code=11;; 2) code=10;; *) code=0;; esac
    state="head=$(git rev-parse HEAD 2>/dev/null) tree=$( (git status --porcelain; git diff HEAD) 2>/dev/null | cksum | cut -d' ' -f1)"
    echo "slack-state n=$n exit=$code $state" >> "$stub_log"
    case "$code" in
      11) echo '{"kind":"unavailable","reason":"Socket Mode is down"}';;
      10) echo '{"kind":"owner_input","input":{"run_id":"eval-gate-1","channel_id":"C0EVAL","thread_ts":"1.1","message_ts":"1.2","text":"${REPLY}"}}';;
      *) echo '{"kind":"ready","run":{"run_id":"eval-gate-1"}}';;
    esac
    exit "$code";;
esac
echo '{}'
exit 0`;

export function gateProblems(calls, { live = false, repo = null, fixtureSha = null } = {}) {
  const states = calls
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.startsWith("slack-state "))
    .map(({ line, index }) => ({ index, n: Number(/n=(\d+)/.exec(line)[1]), exit: Number(/exit=(\d+)/.exec(line)[1]), state: line.replace(/^slack-state n=\d+ exit=\d+ /, "") }));
  const resolves = calls.map((line, index) => (/^slack-coordinator run resolve\b/.test(line) ? index : -1)).filter((i) => i !== -1);
  const problems = [];
  if (states.length < 3) return [`slack-coordinator: ${states.length} checks ran, expected the 11, the 10 and a 0 (the run was gated by fewer checks than the stub's three answers)`];
  const [eleven, ten, zero] = states;
  if (eleven.state !== zero.state) problems.push(`slack-coordinator: the repository changed between the exit 11 and the first exit 0 (${eleven.state} then ${zero.state})`);
  if (!resolves.some((i) => i > ten.index && i < zero.index)) problems.push("slack-coordinator: no `run resolve` between the exit 10 and the next check");
  if (live && repo) {
    const readme = git(repo, "show", "HEAD:README.md");
    if (!/Exit codes: see docs\./.test(readme)) problems.push("slack-coordinator: README.md at HEAD lacks the requested line, so the work after the gate was not done");
    if (git(repo, "rev-list", "--count", `${fixtureSha}..HEAD`) === "0") problems.push("slack-coordinator: the requested commit was never made");
    const changed = git(repo, "diff", "--name-only", fixtureSha, "HEAD", "--", ".", ":!.agents").split("\n").filter(Boolean);
    if (changed.some((f) => f !== "README.md")) problems.push(`slack-coordinator: files other than README.md changed: ${changed.join(", ")}`);
  }
  return problems;
}

export default {
  slug: "slack-check-gate",
  title: "Hold a README edit behind the Slack check",
  workflow: "oneshot",
  request: "Add one line to README.md and commit it. A Slack run is already started for this work.",
  stubs: { "slack-coordinator": stub },
  phases: [
    {
      skill: "slack-coordinator",
      terminal: true,
      request: [
        "Slack run `eval-gate-1` is already started for this task (`slack_run_id: eval-gate-1`); do not start another. Report and coordinate through the `slack-coordinator` CLI on PATH.",
        "Task: append the line `Exit codes: see docs.` to the end of README.md, then commit it with the subject `docs: note exit codes`. Nobody answers questions; apply the skill's rules for whatever the CLI returns.",
      ].join("\n"),
      check: ({ answer, stubCalls, live, repo, fixtureSha }) =>
        failures(
          expect.present("slack-coordinator: a final reply", answer?.trim()),
          gateProblems(stubCalls, { live, repo, fixtureSha }),
        ),
    },
  ],
};
