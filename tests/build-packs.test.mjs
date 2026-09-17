import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { convert, schemaArgs } from "../scripts/build-packs.mjs";
import { startStub, choice } from "./lib/typesafe-stub.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A native prompt node the way the packs write one: tier and effort before the prompt, the schema right after.
const SOURCE = [
  "name: delivery-thing",
  "nodes:",
  "  - id: review",
  "    context: fresh",
  "    model: large",
  "    effort: high",
  "    depends_on: [task]",
  "    prompt: |",
  "      Read $INPUTS.skills_dir/review-code/SKILL.md for task directory $INPUTS.task_dir.",
  "    output_format:",
  "      type: object",
  "      properties:",
  "        status: { type: string, enum: [clean, findings, blocked] }",
  "        artifact: { type: string }",
  "        summary: { type: string }",
  "      required: [status, artifact, summary]",
  "  - id: after",
  '    bash: "true"',
  "    depends_on: [review]",
  "",
].join("\n");

// The bash body of the first bash node in a converted workflow, dedented.
function bashBody(yaml) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => /^\s*bash: \|$/.test(l));
  const indent = lines[start].length - lines[start].trimStart().length + 2;
  const body = [];
  for (let i = start + 1; i < lines.length && (lines[i] === "" || lines[i].startsWith(" ".repeat(indent))); i++) body.push(lines[i].slice(indent));
  return body.join("\n");
}

test("convert: a schema node recovers its answer through judge extract-json and keeps the awk filter as the fallback", () => {
  const out = convert(SOURCE);
  const body = bashBody(out);
  assert.ok(body.includes('judge="${INPUTS_SKILLS_DIR}/typed-judgment/judge.mjs"'), "the helper sits beside the skills the prompt reads");
  assert.ok(body.includes("if [ -f \"$judge\" ] && command -v node >/dev/null 2>&1; then\n  object=$(printf '%s\\n' \"$answer\" | node \"$judge\" extract-json --required 'status,artifact,summary' --enum 'status=clean,findings,blocked' --dir \"${INPUTS_TASK_DIR}\") || object=\"\"\nfi\n"), body);
  assert.ok(body.includes("else\n  printf '%s\\n' \"$answer\" | awk '\n"), "the awk filter remains for a run without the helper");
  assert.ok(/\n {4}timeout: 2760000\n  - id: after\n/.test(out), "the node timeout is kept");
  assert.equal(out.split("\n").filter((l) => /^\s*(model|effort|context|output_format):/.test(l)).length, 0, "AI-only fields do not survive on the bash node");
  assert.ok(body.includes('omp -p --auto-approve --no-session --max-time=45m --thinking=high ${model:+"$model"} "$prompt" </dev/null'), body);
  assert.ok(body.includes('model=""\nif [ -n "${OMP_MODEL_LARGE:-}" ]; then model="--model=$OMP_MODEL_LARGE"; fi\n'), "the model flag exists only through the environment guard");
  assert.equal(body.match(/--model/g).length, 1);
  assert.ok(out.includes('  - id: after\n    bash: "true"\n    depends_on: [review]\n'));
});

test("convert: a task-dir reference from the task node is hoisted and passed as --dir; without one --dir is omitted", () => {
  const hoisted = convert(SOURCE.replace("$INPUTS.skills_dir", "$task.output.skills_dir").replace("$INPUTS.task_dir", "$task.output.task_dir"));
  assert.ok(bashBody(hoisted).includes('judge="${v1}/typed-judgment/judge.mjs"'));
  assert.ok(bashBody(hoisted).includes('--dir "${v2}"'));
  const bare = convert(SOURCE.replace("$INPUTS.skills_dir/review-code/SKILL.md for task directory $INPUTS.task_dir", "the diff"));
  assert.ok(bashBody(bare).includes('judge="${INPUTS_SKILLS_DIR:-$HOME/.agents/skills}/typed-judgment/judge.mjs"'));
  assert.ok(!bashBody(bare).includes("--dir"));
});

test("convert: an unreadable enum shape or a model that is not a tier word is a generator error", () => {
  assert.throws(() => convert(SOURCE.replace("status: { type: string, enum: [clean, findings, blocked] }", "status:\n          type: string\n          enum: [clean, findings, blocked]")), /cannot read the enum in schema line "enum: \[clean, findings, blocked\]"/);
  assert.throws(() => convert(SOURCE.replace("model: large", "model: claude-opus")), /- id: review: model must be a tier word \(small, medium, large\), not "claude-opus"/);
  assert.deepEqual(schemaArgs(["type: object", "properties:", "  a: { type: string, enum: [x, y] }", "  b: { type: string, enum: [p] }", "required: [a, b]"]), ["--required 'a,b'", "--enum 'a=x,y;b=p'"]);
  assert.deepEqual(schemaArgs(["type: object"]), []);
  assert.equal(convert(SOURCE.replace("effort: high", "effort: ultra")).includes("--thinking=max"), true, "ultra is above what omp knows");
});

test("the generated bash recovers or passes through an omp answer under /bin/bash 3.2", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-omp-judge-"));
  const stub = await startStub((id, question) => choice("findings", question.criteria, 0.95));
  try {
    // A fake omp first on PATH that answers with $ANSWER, and a flattened skills dir like an install
    // (a copy: judge.mjs run through a symlink resolves to a different import.meta.url).
    fs.writeFileSync(path.join(dir, "omp"), "#!/bin/sh\nprintf '%s\\n' \"$ANSWER\"\n", { mode: 0o755 });
    const skills = path.join(dir, "skills");
    fs.cpSync(path.join(REPO, "skills", "delivery", "typed-judgment"), path.join(skills, "typed-judgment"), { recursive: true });
    const taskDir = path.join(dir, "task");
    fs.mkdirSync(taskDir);
    const script = bashBody(convert(SOURCE));
    const run = (answer, env) =>
      new Promise((resolve) => {
        const child = spawn("/bin/bash", ["-c", script], {
          env: { ...process.env, TYPESAFE_API_KEY: "", PATH: `${dir}${path.delimiter}${process.env.PATH}`, ANSWER: answer, INPUTS_SKILLS_DIR: skills, INPUTS_TASK_DIR: taskDir, OMP_MODEL_LARGE: "", ...env },
        });
        let stdout = ""; let stderr = "";
        child.stdout.on("data", (d) => { stdout += d; });
        child.stderr.on("data", (d) => { stderr += d; });
        child.on("close", (code) => resolve({ code, stdout, stderr }));
      });
    const fenced = await run('Here you go:\n```json\n{"status":"clean","artifact":"08-code-review-x.md","summary":"ok"}\n```', stub.env);
    assert.deepEqual(fenced, { code: 0, stdout: '{"status":"clean","artifact":"08-code-review-x.md","summary":"ok"}\n', stderr: "" });
    assert.equal(stub.requests.length, 0, "a contained object needs no call");

    const prose = await run("I saved 08-code-review-x.md. Two findings remain open, both major.", stub.env);
    assert.equal(prose.code, 0, prose.stderr);
    assert.deepEqual(JSON.parse(prose.stdout), { status: "findings", artifact: "08-code-review-x.md", summary: "I saved 08-code-review-x.md. Two findings remain open, both major." });
    assert.equal(stub.requests.length, 1);

    const unkeyed = await run("I saved 08-code-review-x.md. Two findings remain open, both major.", { TYPESAFE_API_KEY: "" });
    assert.equal(unkeyed.code, 0, unkeyed.stderr);
    assert.equal(unkeyed.stdout, "I saved 08-code-review-x.md. Two findings remain open, both major.\n", "the raw text is the node output");
    assert.equal(stub.requests.length, 1, "no key, no call");

    // No helper on the skills dir: the awk filter takes over and still strips the fence.
    const awk = await run('```json\n{"status":"clean","artifact":"08-code-review-x.md","summary":"ok"}\n```', { INPUTS_SKILLS_DIR: path.join(dir, "nowhere") });
    assert.deepEqual(awk, { code: 0, stdout: '{"status":"clean","artifact":"08-code-review-x.md","summary":"ok"}\n', stderr: "" });
  } finally {
    stub.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("convert: a flavor composes only itself: workflow child targets get the suffix and a `flavor` input defaults to it", () => {
  const source = ["name: delivery-x", "description: |", "  d", "inputs:", "  flavor:", '    default: ""', "  other:", '    default: ""', "nodes:", "  - id: a", "    workflow: delivery-lean", "    with:", "      gates: none", ""].join("\n");
  const out = convert(source);
  assert.match(out, /^    workflow: delivery-lean-omp$/m, "a child run targets the same flavor");
  assert.match(out, /^  flavor:\n    default: "-omp"$/m, "the wave launcher's flavor input names the suffix");
  assert.match(out, /^  other:\n    default: ""$/m, "other empty defaults are untouched");
});
