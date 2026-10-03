import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPTS = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "skills", "delivery", "agent-slack-control-plane", "scripts");

// A stub curl on PATH logs its arguments and prints the canned response in $STUB_RESPONSE.
function setup(response) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slack-scripts-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "curl"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STUB_LOG"\nprintf "%s" "$STUB_RESPONSE"\n', { mode: 0o755 });
  const env = path.join(dir, "env");
  fs.writeFileSync(env, "SLACK_AGENT_BOT_TOKEN=xoxb-test\nSLACK_AGENT_CHANNEL_ID=C1\n");
  const log = path.join(dir, "log");
  const run = (script, ...args) => spawnSync("bash", [path.join(SCRIPTS, script), ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SLACK_AGENT_ENV_FILE: env, STUB_LOG: log, STUB_RESPONSE: response },
  });
  const message = path.join(dir, "msg.txt");
  fs.writeFileSync(message, "hello");
  return { run, log, message, bin, env };
}

test("slack-post prints channel and ts, targets the right method and deletes the message file", () => {
  const { run, log, message } = setup('{"ok":true,"channel":"C1","ts":"1.2"}');
  const post = run("slack-post.sh", "post", message);
  assert.equal(post.status, 0);
  assert.equal(post.stdout.trim(), "C1 1.2");
  assert.equal(fs.existsSync(message), false);
  assert.match(fs.readFileSync(log, "utf8"), /chat\.postMessage.*channel=C1/);
  fs.writeFileSync(message, "again");
  assert.equal(run("slack-post.sh", "update", message, "C9", "5.5").status, 0);
  assert.match(fs.readFileSync(log, "utf8"), /chat\.update.*channel=C9.*ts=5\.5/);
  fs.writeFileSync(message, "again");
  assert.equal(run("slack-post.sh", "reply", message, "C9", "5.5").status, 0);
  assert.match(fs.readFileSync(log, "utf8"), /thread_ts=5\.5/);
});

test("slack-post exits nonzero with the Slack error", () => {
  const { run, message } = setup('{"ok":false,"error":"not_in_channel"}');
  const result = run("slack-post.sh", "post", message);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not_in_channel/);
  assert.equal(run("slack-post.sh", "bogus", message).status, 2);
});

test("slack-read prints one JSON line per message and reports Slack errors", () => {
  const ok = setup('{"ok":true,"messages":[{"user":"U1","ts":"1.0","text":"parent","x":1},{"user":"U2","ts":"1.1","text":"answer"}]}');
  const read = ok.run("slack-read.sh", "C1", "1.0", "1.0");
  assert.equal(read.status, 0);
  assert.deepEqual(read.stdout.trim().split("\n").map((line) => JSON.parse(line)), [{ user: "U1", ts: "1.0", text: "parent" }, { user: "U2", ts: "1.1", text: "answer" }]);
  const bad = setup('{"ok":false,"error":"missing_scope"}').run("slack-read.sh", "C1", "1.0", "1.0");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /missing_scope/);
});

test("scripts need only curl and node, and check them before any network call", () => {
  for (const name of fs.readdirSync(SCRIPTS)) assert.doesNotMatch(fs.readFileSync(path.join(SCRIPTS, name), "utf8"), /\bjq\b/, name);
  const { log, message, bin, env } = setup("{}");
  const bash = spawnSync("sh", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();
  // PATH holds only the stub curl, so node is missing.
  const result = spawnSync(bash, [path.join(SCRIPTS, "slack-post.sh"), "post", message], { encoding: "utf8", env: { PATH: bin, SLACK_AGENT_ENV_FILE: env, STUB_LOG: log } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /curl and node/);
  assert.equal(fs.existsSync(log), false);
  assert.equal(fs.existsSync(message), true);
});

test("slack-post post takes an optional channel that overrides the default", () => {
  const { run, log, message } = setup('{"ok":true,"channel":"C7","ts":"1.2"}');
  assert.equal(run("slack-post.sh", "post", message, "C7").status, 0);
  assert.match(fs.readFileSync(log, "utf8"), /chat\.postMessage.*channel=C7/);
});
