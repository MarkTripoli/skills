import fs from "node:fs";
import path from "node:path";

function logFile(config) {
  return path.join(config.root, config.outbox, "log.jsonl");
}

function legacyFile(config) {
  return path.join(config.root, config.outbox, "log.json");
}

// Append-only delivery log, one JSON object per line, so a send writes one line instead of the whole log.
export function appendLog(config, entry) {
  const file = logFile(config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

// Entries from a log.json written before the switch come first, then the JSON Lines log.
export function readLog(config) {
  const legacy = legacyFile(config);
  const entries = fs.existsSync(legacy) ? JSON.parse(fs.readFileSync(legacy, "utf8")) : [];
  const file = logFile(config);
  if (!fs.existsSync(file)) return entries;
  return entries.concat(fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)));
}
