import fs from "node:fs";
import path from "node:path";

function logFile(config) {
  return path.join(config.root, config.outbox, "log.json");
}

// Append-only delivery log. One JSON array; rewritten on every append.
export function appendLog(config, entry) {
  const file = logFile(config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const entries = readLog(config);
  entries.push(entry);
  fs.writeFileSync(file, JSON.stringify(entries, null, 2));
}

export function readLog(config) {
  const file = logFile(config);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
}
