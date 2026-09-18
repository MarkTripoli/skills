import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadChannel } from "../src/channels/index.mjs";
import { loadConfig } from "../src/config.mjs";
import { appendLog, readLog } from "../src/store.mjs";

test("loadChannel refuses a channel the config does not name", async () => {
  await assert.rejects(loadChannel("sms", { channels: { console: {} } }), /not configured/);
});

test("email channel writes one .eml per delivery and reports queued", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "notifyctl-"));
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    const email = await loadChannel("email", { channels: { email: { from: "billing@example.com" } } });
    const result = await email.deliver({ to: "owner@example.com", message: "Invoice 42 is overdue", config: { from: "billing@example.com" } });
    assert.equal(result.status, "queued");
    const files = fs.readdirSync(path.join(cwd, "outbox"));
    assert.deepEqual(files, [`${result.id}.eml`]);
    assert.match(fs.readFileSync(path.join(cwd, "outbox", files[0]), "utf8"), /^From: billing@example.com\r\nTo: owner@example.com/);
  } finally {
    process.chdir(previous);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("store appends and reads back in order", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "notifyctl-"));
  const config = { ...loadConfig(root), root };
  appendLog(config, { channel: "console", to: "a", status: "delivered", at: "1" });
  appendLog(config, { channel: "email", to: "b", status: "queued", at: "2" });
  assert.deepEqual(
    readLog(config).map((e) => e.to),
    ["a", "b"],
  );
  fs.rmSync(root, { recursive: true, force: true });
});
