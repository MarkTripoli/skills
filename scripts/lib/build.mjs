// Builds a runtime-specific install tree from the canonical skills. Used by scripts/build-runtimes.mjs (CLI)
// and scripts/install.mjs (installer). Throws on a malformed adapter or skill; the callers report.
//
// Output: <dest>/skills/<name>/ (SKILL.md with the runtime's notes inserted after line 6),
//         <dest>/agents/ (one worker definition per agent-* skill, in the runtime's format, when it has one),
//         codex only: skills/<name>/agents/openai.yaml and <dest>/config.snippet.toml.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanSkills } from "./layout.mjs";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const RUNTIMES = ["claude-code", "codex", "oh-my-pi", "pi"];

// Worker definition format per runtime; pi has no worker mechanism, so its tree carries none.
export const WORKER_FORMAT = { "claude-code": "md", "oh-my-pi": "md", codex: "toml" };

const manualIndexMutation = Object.freeze({
  schema: 'skills.task-index/v1', validate: 'full-existing-index-and-relative-nonsymlink-artifact-path',
  allocation: 'reserve-generation-and-next-contiguous-four-digit', staging: '.artifact-staging/<uuid>.md',
  reservation: '.artifact-reservations/<uuid>.json-exclusive-create', digest: 'sha256-exact-utf8',
  recordFields: Object.freeze(['id', 'iteration', 'path', 'sha256', 'type', 'status', 'summary']),
  supersedes: 'prior-current-or-omit-first', current: 'new-record-id', generationIncrement: 1,
  publish: 'exclusive-hard-link-staging-to-semantic-path', write: 'exclusive-sibling-temp-atomic-rename',
  rollback: 'remove-published-artifact-if-index-write-fails', cleanup: 'remove-staging-and-reservation-after-success', onConflict: 'abort',
});
export const TASK_ARTIFACT_DISTRIBUTION = Object.freeze({
  canonical: Object.freeze({ mode: 'manual-index-mutation', contract: manualIndexMutation }),
  plugin: Object.freeze({ mode: 'manual-index-mutation', contract: manualIndexMutation }),
  runtime: Object.freeze({ mode: 'adjacent-helper', required: false }),
  portable: Object.freeze({ mode: 'adjacent-helper', required: false }),
  atomic: Object.freeze({ mode: 'adjacent-helper', required: true }),
});

export function parseAdapter(content, file) {
  const title = /^# (.+)$/m.exec(content)?.[1]?.trim();
  const sections = [];
  for (const line of content.split("\n")) {
    if (line.startsWith("## ")) sections.push([line.slice(3).trim(), []]);
    else if (sections.length > 0) sections[sections.length - 1][1].push(line);
  }
  for (const section of sections) section[1] = section[1].join("\n").trim();
  const names = sections.map(([name]) => name);
  if (!title || names[0] !== "Skill notes" || names[1] !== "Install") {
    throw new Error(`${path.relative(repoRoot, file)}: expected an H1 title and H2 sections "Skill notes" then "Install" first (found ${names.join(", ") || "none"})`);
  }
  const notes = sections[0][1];
  const noteLines = notes.split("\n").length;
  if (noteLines > 12) throw new Error(`${path.relative(repoRoot, file)}: Skill notes must be at most 12 lines (found ${noteLines})`);
  return { title, notes };
}

export function parseSkill(file) {
  const content = fs.readFileSync(file, "utf8");
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!fm) throw new Error(`${file}: missing frontmatter`);
  const name = /^name:\s*(.*)$/m.exec(fm[1])?.[1]?.trim();
  const description = /^description:\s*(.*)$/m.exec(fm[1])?.[1]?.trim();
  if (!name || !description) throw new Error(`${file}: frontmatter needs name and description`);
  return { content, name, description, body: content.slice(fm[0].length) };
}

function titleCase(name) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// The purpose sentence: drop the trigger prefix ("Run for /x requests." or "Child worker role.").
export function shortDescription(text, max = 80) {
  const purpose = text.replace(/^(?:Run for \/[a-z0-9-]+ requests\.|Child worker role\.)\s*/, "");
  const sentence = purpose.split(/(?<=\.)\s/)[0].trim();
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).trimEnd()}.`;
}

const quote = (value) => JSON.stringify(value);

function tomlMultiline(value) {
  return `"""\n${value.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"')}\n"""`;
}

const noDsStore = (src) => path.basename(src) !== ".DS_Store";

function assertNoSymlinks(root) {
  const rootInfo = fs.lstatSync(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error(`refusing symlink in staged skill tree: ${root}`);
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const name of fs.readdirSync(directory)) {
      const entry = path.join(directory, name);
      const info = fs.lstatSync(entry);
      if (info.isSymbolicLink()) throw new Error(`refusing symlink in staged skill tree: ${entry}`);
      if (info.isDirectory()) pending.push(entry);
    }
  }
}

const SAFE_TASK_ARTIFACT_COPY_SCRIPT = String.raw`import json, os, secrets, stat, sys
if not hasattr(os, 'O_NOFOLLOW') or not hasattr(os, 'O_DIRECTORY'):
    raise SystemExit(1)
root_fd = os.dup(3)
references_fd = None
def fail():
    raise RuntimeError('unsafe task-artifact helper destination')
try:
    required = (os.open, os.mkdir, os.stat, os.rename, os.unlink)
    if not hasattr(os, 'supports_dir_fd') or any(function not in os.supports_dir_fd for function in required):
        fail()
    header, payload = sys.stdin.buffer.read().split(b'\n', 1)
    entries = json.loads(header)
    try:
        os.mkdir('references', 0o755, dir_fd=root_fd)
    except FileExistsError:
        pass
    references_fd = os.open('references', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
    offset = 0
    for entry in entries:
        name = entry['name']
        size = entry['size']
        if name not in ('task-artifacts.mjs', 'task-root.mjs') or not isinstance(size, int) or size < 0:
            fail()
        content = payload[offset:offset + size]
        if len(content) != size:
            fail()
        offset += size
        try:
            current = os.stat(name, dir_fd=references_fd, follow_symlinks=False)
        except FileNotFoundError:
            current = None
        if current is not None and not stat.S_ISREG(current.st_mode):
            fail()
        temporary = '.' + name + '.' + secrets.token_hex(16)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
        fd = os.open(temporary, flags, 0o600, dir_fd=references_fd)
        try:
            view = memoryview(content)
            while view:
                written = os.write(fd, view)
                view = view[written:]
            os.fchmod(fd, entry['mode'] & 0o777)
            os.rename(temporary, name, src_dir_fd=references_fd, dst_dir_fd=references_fd)
        except Exception:
            try:
                os.unlink(temporary, dir_fd=references_fd)
            except OSError:
                pass
            raise
        finally:
            os.close(fd)
    if offset != len(payload):
        fail()
except Exception:
    sys.stderr.write('unsafe task-artifact helper destination or secure copy unavailable')
    sys.exit(1)
finally:
    if references_fd is not None:
        os.close(references_fd)
    os.close(root_fd)`;

export function copyTaskArtifactHelper(skillTarget) {
  assertNoSymlinks(skillTarget);
  const names = ["task-artifacts.mjs", "task-root.mjs"];
  const entries = names.map(name => {
    const source = path.join(repoRoot, "shared", name);
    return { name, mode: fs.statSync(source).mode & 0o777, bytes: fs.readFileSync(source) };
  });
  const manifest = Buffer.from(`${JSON.stringify(entries.map(({ name, mode, bytes }) => ({ name, mode, size: bytes.length })))}\n`);
  const input = Buffer.concat([manifest, ...entries.map(entry => entry.bytes)]);
  if (!fs.constants.O_DIRECTORY || !fs.constants.O_NOFOLLOW) throw new Error("secure task-artifact helper copy requires no-follow directory support");
  let rootFd;
  try {
    rootFd = fs.openSync(skillTarget, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    const result = spawnSync("python3", ["-I", "-c", SAFE_TASK_ARTIFACT_COPY_SCRIPT], {
      input, encoding: null, timeout: 30_000, maxBuffer: 1024 * 1024,
      stdio: ["pipe", "ignore", "pipe", rootFd],
    });
    if (result.error?.code === "ENOENT") throw new Error("Python 3 is required for safe task-artifact helper installation");
    if (result.error || result.status !== 0) throw new Error("refusing symlinked task-artifact helper destination or secure copy unavailable");
  } finally {
    if (rootFd !== undefined) fs.closeSync(rootFd);
  }
}

// Returns { skills: [names], workers }. `skillNames` narrows an installer build; omitted builds the collection.
export function buildRuntime(runtime, dest, { skillNames } = {}) {
  if (!RUNTIMES.includes(runtime)) throw new Error(`unknown runtime "${runtime}"; choose one of ${RUNTIMES.join(", ")}`);
  const runtimeFile = path.join(repoRoot, "runtimes", `${runtime}.md`);
  if (!fs.existsSync(runtimeFile)) throw new Error(`missing runtime adapter ${path.relative(repoRoot, runtimeFile)}`);
  const adapter = parseAdapter(fs.readFileSync(runtimeFile, "utf8"), runtimeFile);

  const layout = scanSkills(path.join(repoRoot, "skills"));
  if (layout.problems.length) throw new Error(layout.problems.map((p) => `${path.relative(repoRoot, p.path)}: ${p.message}`).join("\n"));
  const requested = skillNames ? new Set(skillNames) : null;
  const available = new Set(layout.skills.map((skill) => skill.name));
  const unknown = requested ? [...requested].filter((name) => !available.has(name)) : [];
  if (unknown.length) throw new Error(`unknown skill${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  const selected = requested ? layout.skills.filter((skill) => requested.has(skill.name)) : layout.skills;

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.join(dest, "skills"), { recursive: true });
  if (WORKER_FORMAT[runtime]) fs.mkdirSync(path.join(dest, "agents"), { recursive: true });

  const snippet = [];
  let workers = 0;
  for (const { name, dir: source } of selected) {
    const target = path.join(dest, "skills", name);
    fs.cpSync(source, target, { recursive: true, filter: noDsStore });
    copyTaskArtifactHelper(target);

    const skill = parseSkill(path.join(source, "SKILL.md"));
    const lines = skill.content.split("\n");
    if (lines.length < 7 || lines[6] !== "") throw new Error(`${name}/SKILL.md: expected line 6 to be the shared sentence followed by a blank line`);
    const inserted = [...lines.slice(0, 6), "", `Runtime: ${adapter.title}.`, adapter.notes, ...lines.slice(6)];
    fs.writeFileSync(path.join(target, "SKILL.md"), inserted.join("\n"));

    if (runtime === "codex") {
      fs.mkdirSync(path.join(target, "agents"), { recursive: true });
      fs.writeFileSync(path.join(target, "agents", "openai.yaml"), ["interface:", `  display_name: ${quote(titleCase(name))}`, `  short_description: ${quote(shortDescription(skill.description))}`, ""].join("\n"));
    }

    if (!name.startsWith("agent-") || !WORKER_FORMAT[runtime]) continue;
    workers += 1;
    const body = skill.body.trim();
    if (WORKER_FORMAT[runtime] === "md") {
      fs.writeFileSync(path.join(dest, "agents", `${name}.md`), ["---", `name: ${name}`, `description: ${skill.description}`, "---", "", body, ""].join("\n"));
    } else {
      fs.writeFileSync(path.join(dest, "agents", `${name}.toml`), [`name = ${quote(name)}`, `description = ${quote(skill.description)}`, `developer_instructions = ${tomlMultiline(body)}`, ""].join("\n"));
      snippet.push(`[agents.${name}]`, `config_file = "./agents/${name}.toml"`, "");
    }
  }

  if (runtime === "codex") fs.writeFileSync(path.join(dest, "config.snippet.toml"), snippet.join("\n"));

  return { skills: selected.map((skill) => skill.name), workers };
}
