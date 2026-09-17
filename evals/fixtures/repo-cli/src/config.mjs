import fs from "node:fs";
import path from "node:path";

const DEFAULTS = { timezone: "UTC", outbox: "outbox", channels: { console: {} } };

// Reads notifyctl.config.json from the working directory; missing file means defaults.
export function loadConfig(cwd = process.cwd()) {
  const file = path.join(cwd, "notifyctl.config.json");
  if (!fs.existsSync(file)) return { ...DEFAULTS, root: cwd };
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return { ...DEFAULTS, ...parsed, channels: { ...DEFAULTS.channels, ...(parsed.channels ?? {}) }, root: cwd };
}
