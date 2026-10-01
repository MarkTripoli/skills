import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { artifacts, expect, failures, newest } from "./lib.mjs";
import { readSessions, sessionProblems, skillLoadProblems } from "./sessions.mjs";
import { checkReview, parseRecord } from "../skills/delivery/deliver/contract.mjs";
import { strongestCandidate } from "../skills/delivery/route-model/route-model.mjs";

export const git = (repo, ...argv) => execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const REVIEW_TYPES = new Set(["plan-review", "slice-review", "code-review", "verification"]);
const FINAL_TYPES = ["verification", "code-review"];
const ROUND_LIMIT = 4;
const REMOTE_MISSING = /(?:\bno|\bmissing|\bwithout)\s+(?:git\s+)?remote\b|remote\s+(?:is\s+)?(?:missing|not\s+configured)|add\s+a\s+remote|git remote add/i;

// The review records of a task directory, each through the contract's own parser. A record the parser
// rejects is a failure here, so a hollow or self-contradicting file cannot stand in for a review.
export function readRecords(taskDir) {
  const problems = [];
  const records = [];
  let all;
  try {
    all = artifacts(taskDir);
  } catch (error) {
    return { records, problems: [`index: ${error.message}`] };
  }
  for (const a of all.filter((x) => REVIEW_TYPES.has(x.fm.type))) {
    try {
      const parsed = parseRecord(taskDir, a.file);
      records.push({ mtime: fs.statSync(path.join(taskDir, a.file)).mtimeMs, file: a.file, sha256: a.record?.sha256, type: a.fm.type, group: parsed.info.checkpoint === "final" ? "final" : parsed.info.checkpoint, checkpoint: parsed.info.checkpoint, round: parsed.round, status: parsed.status, reviewed_commit: parsed.info.reviewed_commit, reviewer_model: parsed.info.reviewer_model, reviewed_artifact: parsed.info.reviewed_artifact, reviewed_artifact_sha256: parsed.info.reviewed_artifact_sha256 });
    } catch (error) {
      problems.push(`record ${a.file}: ${error.message}`);
    }
  }
  return { records, problems };
}

// Highest round per checkpoint and type must approve; rounds and record counts stay below the limit.
export function verdictProblems(records) {
  const groups = new Map();
  for (const r of records) groups.set(`${r.checkpoint}/${r.type}`, [...(groups.get(`${r.checkpoint}/${r.type}`) ?? []), r]);
  return [...groups.entries()].flatMap(([key, list]) => {
    const top = list.reduce((a, b) => (b.round > a.round ? b : a));
    return [
      top.status === "approve" ? null : `review: ${key} round ${top.round} is ${top.status}, expected approve`,
      new Set(list.map((r) => r.round)).size === list.length ? null : `review: ${key} has duplicate round records`,
      top.round < ROUND_LIMIT && list.length < ROUND_LIMIT ? null : `review rounds: ${key} has ${list.length} records up to round ${top.round}, expected fewer than ${ROUND_LIMIT}`,
    ];
  }).filter(Boolean);
}

// The grader of a live `/deliver` run on seeded bugs in a repository with no remote. `changed` lists the only files the
// builders may touch. `separate` says the run has no pinned builder definition, so the builder ran as its own `omp -p --model`
// session, recorded under `nestedDir`. `minPhases` is the fewest plan phases; a plan of several phases must bind its slice
// reviews to different commits, and not all of them to the commit the final reviews bind.
// `stopAt` is what the `blocked` stop names: the missing `remote` (the first run), or the PR `host` once a remote exists.
// `sessions: false` skips the session attribution, for a resumed run whose recordings hold only its own session.
export function deliverCheck({ changed = ["src/retry.mjs"], separate = false, minPhases = 1, stopAt = "remote", sessions: checkSessions = true } = {}) {
  return ({ live, repo, taskDir, fixtureSha, answer, sessionDir, nestedDir, codeRoot, timesPreserved }) => {
    let selected;
    try {
      selected = newest(taskDir, "plan");
    } catch (error) {
      return [`index: ${error.message}`];
    }
    const plan = selected ? [selected] : [];
    const taskText = fs.existsSync(path.join(taskDir, "task.md")) ? fs.readFileSync(path.join(taskDir, "task.md"), "utf8") : "";
    const stop = /Stopped:\s*`?blocked:[^\n]*/i.exec(answer)?.[0] ?? "";
    const { records, problems: parseProblems } = readRecords(taskDir);
    // The reviewer template types every record `slice-review` and the skill also allows `plan-review`; the checkpoint says which review it is.
    const slices = records.filter((r) => r.type === "slice-review" && !["plan", "final"].includes(r.checkpoint));
    const finals = records.filter((r) => r.group === "final");
    const phases = new Set(plan.flatMap((p) => [...p.text.matchAll(/^#{2,3}\s+Phase\s+(\d+)/gim)].map((m) => m[1])));
    const top = (list) => list.reduce((a, b) => (!a || b.round > a.round ? b : a), null);
    const approvedSlices = [...new Set(slices.map((s) => s.checkpoint))].map((c) => top(slices.filter((s) => s.checkpoint === c))).filter((s) => s.status === "approve");
    const problems = failures(
      expect.includes("task.md: delivery brief", taskText, "## Delivery brief"),
      /^(slack_run_id|slack_thread_ts):/m.test(taskText) ? "task.md: gained a Slack run or thread; the eval must not reach Slack" : null,
      expect.atLeast("plan artifacts", plan.length, 1),
      expect.atLeast("slice review records", slices.length, 1),
      plan.length && !phases.size ? "plan: no `## Phase N` heading, so the phase count is unknown" : null,
      phases.size && phases.size < minPhases ? `plan: ${phases.size} phases, expected at least ${minPhases}` : null,
      phases.size && new Set(approvedSlices.map((s) => s.checkpoint)).size < phases.size ? `slice review: ${approvedSlices.length} approved checkpoints for ${phases.size} plan phases` : null,
      plan.length && !records.some((r) => r.checkpoint === "plan" && ["plan-review", "slice-review"].includes(r.type) && r.status === "approve" && r.reviewed_artifact === selected.file && (!selected.record || r.reviewed_artifact_sha256 === selected.record.sha256)) ? "plan review: no approved record binds the current plan and its digest" : null,
      ...FINAL_TYPES.map((t) => (finals.some((f) => f.type === t) ? null : `final review: no ${t} record`)),
      expect.matches("reply: stops blocked naming the PR host", stop, /(pull request|\bPR\b|GitHub)/i),
      stopAt === "remote"
        ? expect.matches("reply: blocked names the missing remote", stop, /remote/i)
        : [stop, taskText.split(/^## Status\s*$/m)[1]?.split(/^## /m)[0] ?? ""].some((t) => REMOTE_MISSING.test(t)) ? "reply: the stop still names a missing remote, but the run was resumed with one" : null,
      expect.matches("reply: blocked names an unblock check", stop, /unblock check:/i),
      expect.matches("task.md: ## Status records the blocked stop", taskText.split(/^## Status\s*$/m)[1] ?? "", /blocked:/i),
      parseProblems,
      verdictProblems(records),
    );
    const profile = (() => {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(codeRoot, ".agents", "model-candidates.json"), "utf8"));
        return { economy: p.economy, strongest: strongestCandidate(p.candidates).model };
      } catch {
        return null;
      }
    })();
    const sessions = sessionDir ? readSessions(sessionDir) : [];
    const nested = separate ? (nestedDir ? readSessions(nestedDir).filter((x) => !x.child) : []) : null;
    const builderSubjects = live ? git(repo, "log", "--format=%s", `${fixtureSha}..HEAD`).split("\n").filter(Boolean) : [];
    const sessionChecks = !profile ? ["profile: .agents/model-candidates.json missing or malformed"] : !sessions.length ? ["sessions: no recorded omp session"] : sessionProblems({ sessions, records: records.filter((r) => ["plan-review", "slice-review", ...FINAL_TYPES].includes(r.type)), subjects: builderSubjects, economy: profile.economy, strongest: profile.strongest, timesPreserved: Boolean(timesPreserved), separate: nested, changed }).concat(skillLoadProblems({ sessions, names: ["review-code", "verify-implementation"] }));
    if (!checkSessions) sessionChecks.length = 0;
    if (!live) return failures(problems, sessionChecks);

    const builders = git(repo, "log", "--format=%H", `${fixtureSha}..HEAD`).split("\n").filter(Boolean);
    const head = git(repo, "rev-parse", "HEAD");
    const resolve = (rev) => {
      try {
        return git(repo, "rev-parse", "--verify", `${rev}^{commit}`);
      } catch {
        return null;
      }
    };
    const covered = (commit) => approvedSlices.some((s) => {
      const r = resolve(s.reviewed_commit);
      if (!r) return false;
      try {
        execFileSync("git", ["merge-base", "--is-ancestor", commit, r], { cwd: repo, stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    });
    const uncovered = builders.filter((c) => !covered(c));
    const finalCheck = finals.flatMap((f) => {
      if (f.round !== top(finals.filter((x) => x.type === f.type))?.round) return [];
      try {
        checkReview({ taskDir, file: f.file });
        return [];
      } catch (error) {
        return [`final review ${f.file}: ${error.message}`];
      }
    });
    const sliceCommits = new Set(approvedSlices.map((s) => resolve(s.reviewed_commit)).filter(Boolean));
    const finalCommits = finals.map((f) => resolve(f.reviewed_commit));
    const bindingProblem = minPhases < 2 ? null
      : sliceCommits.size < 2 ? `slice review: ${sliceCommits.size} distinct reviewed commits for ${minPhases} phases, each slice must bind its own`
      : [...sliceCommits].every((c) => finalCommits.includes(c)) ? "review: every slice record binds a commit the final records bind too; a slice must bind its phase commit, not HEAD" : null;
    // A slice review judges a builder's commit, so each approved one must name a commit the builders made, not the base or a review-only commit.
    const foreignSlices = approvedSlices.filter((s) => !builders.includes(resolve(s.reviewed_commit))).map((s) => `${s.file} (${s.reviewed_commit})`);
    const touched = git(repo, "diff", "--name-only", fixtureSha, "HEAD").split("\n").filter(Boolean);
    const committedTasks = git(repo, "log", "--all", "--format=", "--name-only").split("\n").filter((f) => f.startsWith(".agents/tasks"));
    const dirty = git(repo, "status", "--porcelain");
    let testsPass = true;
    try {
      execFileSync("npm", ["test", "--silent"], { cwd: repo, stdio: "ignore" });
    } catch {
      testsPass = false;
    }
    return failures(
      problems,
      sessionChecks,
      finalCheck,
      builders.length ? null : "git: no builder commit after the fixture",
      uncovered.length ? `slice review: builder commits without an approved slice review reaching them: ${uncovered.map((c) => c.slice(0, 12)).join(", ")}` : null,
      finals.some((f) => resolve(f.reviewed_commit) === head) ? null : `final review: no record reviews HEAD ${head.slice(0, 12)}`,
      committedTasks.length ? `git: .agents/tasks path in a commit: ${[...new Set(committedTasks)].join(", ")}` : null,
      dirty ? `git: repository left dirty:\n${dirty}` : null,
      touched.sort().join(",") === [...changed].sort().join(",") ? null : `git: expected only ${changed.join(", ")} changed, got ${touched.join(", ") || "nothing"}`,
      bindingProblem,
      foreignSlices.length ? `slice review: reviewed_commit is not a builder commit after the fixture: ${foreignSlices.join(", ")}` : null,
      testsPass ? null : "npm test fails on the final tree",
    );
  };
}
