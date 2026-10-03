import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { git } from "../deliver-grade.mjs";
import { expect, failures as flat, frontmatter, handoff, newest, placeholders } from "../lib.mjs";
const failures = (...checks) => flat(checks.flat(Infinity));

// `record-evidence` on a CLI change, baseline then final. This machine has no display, so the scenario uses the skill's
// non-UI path: a real terminal session captured with `script`, sealed through `contract.mjs`. Needs only `node` and `script`;
// no browser, device or ffmpeg. Phase 1 (`--baseline`) must seal an `evidence-baseline` receipt of the old behavior before any
// edit. Between the phases the runner plays the builder and commits the fix. Phase 2 must seal an `evidence` receipt of the new
// behavior that keeps the baseline untouched. Catches a fabricated or synthetic capture (`--source test`), a baseline taken
// after the fix, a missing evidence `.gitignore`, an unsealed receipt, and a final receipt that rewrites the baseline.
const NEW = /no notifications/i;
const FIX_COMMIT = "fix(cli): print no notifications for an empty log";

// Everything the skill leaves under the task directory: sealed records (parsed), terminal captures, the evidence ignore file.
export function evidenceState(taskDir) {
  const sealedDir = path.join(taskDir, ".delivery-evidence");
  const sealed = fs.existsSync(sealedDir)
    ? fs.readdirSync(sealedDir).filter((f) => f.endsWith(".json")).flatMap((f) => {
        try {
          return [JSON.parse(fs.readFileSync(path.join(sealedDir, f), "utf8"))];
        } catch {
          return [];
        }
      })
    : [];
  const files = [];
  const walk = (dir) => {
    for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(path.join(taskDir, "evidence"));
  const ignore = path.join(taskDir, "evidence", ".gitignore");
  return { sealed, files, ignore: fs.existsSync(ignore) ? fs.readFileSync(ignore, "utf8").trim() : null };
}

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
const syntheticProblems = (taskDir, files) =>
  files.flatMap((f) => (/manifest\.json$|report\.md$/.test(f) && /"source":\s*"test"|source `test` is a synthetic pattern/.test(read(f)) ? [`record-evidence: ${path.relative(taskDir, f)} is a synthetic \`--source test\` capture`] : []));
const outputCapture = (taskDir, record) => (record?.captures ?? []).find((c) => c.role === "output" && c.path);
const captureText = (taskDir, record) => read(path.join(taskDir, outputCapture(taskDir, record)?.path ?? "/nonexistent"));
const policy = (taskDir) => {
  try {
    return JSON.parse(read(path.join(taskDir, "evidence-policy.json")));
  } catch {
    return null;
  }
};

// A final receipt is sealed only with a hosted capture whose bytes read back. The runner stands in for the upload host: a local
// static server over the task's `evidence/` directory, on an ephemeral port that setup writes to `HOST_FILE` for the request to name.
const HOST_FILE = "upload-host.txt";
const hostUrl = (taskDir) => {
  try {
    return fs.readFileSync(path.join(taskDir, HOST_FILE), "utf8").trim();
  } catch {
    return null;
  }
};
function serveEvidence(taskDir) {
  const root = path.join(taskDir, "evidence");
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/octet-stream" }).end(fs.readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.unref();
      resolve(server);
    });
  });
}

const BASELINE_NEXT = new Set(["iterate-implementation", "implement-plan", "implement-outline"]);

export default {
  slug: "record-evidence-cli",
  title: "List shows a message for an empty log",
  workflow: "oneshot",
  request: `\`notifyctl list\` prints nothing at all when no notification was ever sent. It should print \`no notifications\` and exit 0.

Acceptance criteria:
- \`node src/cli.mjs list\` in a fresh checkout (no \`outbox/log.json\`) prints \`no notifications\` and exits 0.
- \`npm test\` still passes.
- The fix changes only \`src/cli.mjs\`.

This is a CLI change: evidence is a captured terminal session, not UI video.`,
  phases: [
    {
      skill: "record-evidence",
      artifactType: "evidence-baseline",
      template: "evidence_template.md",
      // The delivery answer names the implementation skill; it is task-only here, so `/iterate-implementation`, or the plan's own.
      next: (ctx) => (BASELINE_NEXT.has(handoff(ctx.answer)?.skill) ? handoff(ctx.answer).skill : "iterate-implementation"),
      // The task base, as a `git` ref rather than a task.md edit (a phase may not change `task.md`): the seal resolves it through origin/HEAD.
      setup: ({ repo }) => {
        git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
        git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
        return { head: git(repo, "rev-parse", "HEAD") };
      },
      request: [
        "Run `/record-evidence --baseline` for this task. Do not edit product source or tests: the fix has not been written yet, and the baseline is the existing, unfixed behavior.",
        "This machine is headless and the change is a CLI: use the skill's non-UI path (a real `script` terminal session of the changed command, with its exit status). Do not use the recorder's `--source test` or any synthetic or scripted-playback footage; if an output cannot be captured for real, say so.",
        "Derive the policy from the task (one `cli` surface, existing behavior), seal the baseline receipt through the delivery contract in the installed `deliver` skill, and do not ask me questions.",
        "In the receipt, write the seal command with `$CONTRACT` standing for `<skills-dir>/deliver/contract.mjs`, never the absolute path of the skills directory.",
      ].join("\n"),
      check: ({ taskDir, artifact, live, repo, setup }) => {
        const { sealed, files, ignore } = evidenceState(taskDir);
        const record = sealed.find((r) => r.phase === "evidence-baseline");
        const text = captureText(taskDir, record);
        const pol = policy(taskDir);
        return failures(
          expect.matches("record-evidence baseline: receipt is type evidence-baseline", artifact?.fm?.type, /^evidence-baseline$/),
          record ? null : "record-evidence baseline: no sealed evidence-baseline record under .delivery-evidence/",
          expect.present("record-evidence baseline: evidence-policy.json saved", pol),
          pol?.surfaces?.some((s) => s.kind === "cli" && s.behavior === "existing") ? null : "record-evidence baseline: policy has no existing-behavior cli surface",
          record && !outputCapture(taskDir, record) ? "record-evidence baseline: sealed record has no output capture" : null,
          record && outputCapture(taskDir, record) ? [
            expect.matches("record-evidence baseline: capture holds the list command", text, /\blist\b/),
            expect.matches("record-evidence baseline: capture holds the exit status", text, /exit=0/),
            NEW.test(text) ? "record-evidence baseline: capture already shows the fixed output, so it is not the pre-fix behavior" : null,
          ] : null,
          ignore === "*" ? null : `record-evidence baseline: evidence/.gitignore is ${JSON.stringify(ignore)}, expected a single \`*\``,
          syntheticProblems(taskDir, files),
          live && setup?.head && git(repo, "rev-parse", "HEAD") !== setup.head ? "record-evidence baseline: HEAD moved; a baseline commits nothing" : null,
        );
      },
    },
    {
      skill: "record-evidence",
      terminal: true,
      template: "evidence_template.md",
      // The builder's step between the phases, played by the runner: the fix, committed.
      setup: async ({ repo, taskDir }) => {
        const server = await serveEvidence(taskDir);
        fs.writeFileSync(path.join(taskDir, HOST_FILE), `http://127.0.0.1:${server.address().port}/`);
        const file = path.join(repo, "src", "cli.mjs");
        const src = fs.readFileSync(file, "utf8");
        const old = '    for (const entry of readLog(config)) stdout.write(`${entry.at} ${entry.channel} ${entry.to} ${entry.status}\\n`);\n';
        if (!src.includes(old)) throw new Error("fixture src/cli.mjs no longer has the list loop this scenario fixes");
        fs.writeFileSync(
          file,
          src.replace(old, '    const entries = readLog(config);\n    if (!entries.length) stdout.write("no notifications\\n");\n    for (const entry of entries) stdout.write(`${entry.at} ${entry.channel} ${entry.to} ${entry.status}\\n`);\n'),
        );
        git(repo, "add", "src/cli.mjs");
        git(repo, "commit", "-q", "-m", FIX_COMMIT);
        return { head: git(repo, "rev-parse", "HEAD"), cleanup: () => new Promise((r) => server.close(r)) };
      },
      request: [
        "The fix is committed at HEAD and the baseline is already sealed. Run `/record-evidence` (final) for the delivered revision. Do not edit product source, tests or the baseline receipt, and do not replace the baseline's capture.",
        "This machine is headless and the change is a CLI: use the skill's non-UI path (a real `script` terminal session of the fixed command, with its exit status) and seal the receipt through the delivery contract. Do not use `--source test` or any synthetic footage. Hosting: an upload host is already running; its base URL is the line in `.agents/tasks/record-evidence-cli/upload-host.txt`. It serves the files under `.agents/tasks/record-evidence-cli/evidence/` by their path below that directory (for example `.agents/tasks/record-evidence-cli/evidence/<session>/terminal-session.txt` is <base URL><session>/terminal-session.txt). Use it as the hosted capture URL. Do not ask me questions.",
      ].join("\n"),
      check: (ctx) => {
        const { taskDir, answer, template, live, repo, setup, before } = ctx;
        const artifact = newest(taskDir, "evidence");
        const { sealed, files, ignore } = evidenceState(taskDir);
        const baseline = sealed.find((r) => r.phase === "evidence-baseline");
        const finalRecord = sealed.find((r) => r.phase === "evidence");
        const finalText = captureText(taskDir, finalRecord);
        const next = handoff(answer);
        const baselineReceipt = before.find((a) => a.file !== "task.md" && frontmatter(a.text)?.type === "evidence-baseline");
        const baselineNow = baselineReceipt && read(path.join(taskDir, baselineReceipt.file));
        const left = artifact ? placeholders(artifact.text, template) : [];
        return failures(
          expect.matches("record-evidence final: receipt is type evidence", artifact?.fm?.type, /^evidence$/),
          artifact?.fm?.summary ? null : "record-evidence final: receipt frontmatter summary missing",
          left.length ? `record-evidence final: template placeholder left: ${left.slice(0, 3).join(" | ")}` : null,
          baseline ? null : "record-evidence final: the sealed baseline record is gone",
          baselineReceipt && baselineNow === baselineReceipt.text ? null : "record-evidence final: the baseline receipt was changed or removed",
          finalRecord ? null : "record-evidence final: no sealed evidence record under .delivery-evidence/",
          finalRecord && !outputCapture(taskDir, finalRecord) ? "record-evidence final: sealed record has no output capture" : null,
          finalRecord && outputCapture(taskDir, finalRecord) ? [
            expect.matches("record-evidence final: capture shows the fixed output", finalText, NEW),
            expect.matches("record-evidence final: capture holds the exit status", finalText, /exit=0/),
            outputCapture(taskDir, finalRecord).path === outputCapture(taskDir, baseline)?.path ? "record-evidence final: the final capture is the baseline's file, not a new session" : null,
          ] : null,
          finalRecord && !(finalRecord.hosted ?? []).some((h) => h.status === 200 && String(h.url).startsWith(hostUrl(taskDir) ?? "\0") && h.sha256) ? "record-evidence final: sealed record has no byte-verified hosted capture on the upload host" : null,
          finalRecord && baseline && finalRecord.baseline?.artifact_sha256 !== baseline.artifact_sha256 ? "record-evidence final: the final record is not bound to the sealed baseline" : null,
          finalRecord && baseline && finalRecord.revision === baseline.revision ? "record-evidence final: final and baseline name the same revision" : null,
          ignore === "*" ? null : `record-evidence final: evidence/.gitignore is ${JSON.stringify(ignore)}, expected a single \`*\``,
          syntheticProblems(taskDir, files),
          next?.skill === "iterate-evidence" ? null : `record-evidence final: hands off to /${next?.skill ?? "nothing"}, expected /iterate-evidence`,
          live && setup?.head && git(repo, "rev-parse", "HEAD") !== setup.head ? "record-evidence final: HEAD moved; recording commits no source" : null,
          live && git(repo, "status", "--porcelain") ? "record-evidence final: repository left dirty" : null,
          live && git(repo, "diff", "--name-only", setup?.head ?? "HEAD", "--", ".", ":!.agents") ? "record-evidence final: source changed during recording" : null,
        );
      },
    },
  ],
};
