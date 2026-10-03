// Times `notifyctl send` against a delivery log that already holds N entries. Usage: node send-probe.mjs <repo> <entries> <runs>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const [repo, entries, runs] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
const outbox = path.join(repo, "outbox");
const jsonl = fs.readFileSync(path.join(repo, "src", "store.mjs"), "utf8").includes("log.jsonl");
const seed = () => {
  fs.rmSync(outbox, { recursive: true, force: true });
  fs.mkdirSync(outbox);
  const rows = Array.from({ length: entries }, (_, i) => ({ channel: "console", to: `user${i}@example.com`, id: `c-${i}`, status: "delivered", at: "2026-09-30T12:00:00.000Z" }));
  if (jsonl) fs.writeFileSync(path.join(outbox, "log.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  else fs.writeFileSync(path.join(outbox, "log.json"), JSON.stringify(rows, null, 2));
};
const times = [];
for (let i = 0; i < runs; i++) {
  seed();
  const start = process.hrtime.bigint();
  execFileSync("node", ["src/cli.mjs", "send", "--channel", "console", "--to", "owner@example.com", "--message", "Invoice 42 is overdue"], { cwd: repo, stdio: "ignore" });
  times.push(Number(process.hrtime.bigint() - start) / 1e6);
}
times.sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
const file = jsonl ? "outbox/log.jsonl" : "outbox/log.json";
console.log(`notifyctl send, log with ${entries.toLocaleString("en-US")} entries, ${runs} runs`);
console.log(`median ${median.toFixed(1)} ms  min ${times[0].toFixed(1)} ms  max ${times.at(-1).toFixed(1)} ms`);
console.log(`log file after last run: ${file} ${(fs.statSync(path.join(repo, file)).size / 1e6).toFixed(1)} MB`);
