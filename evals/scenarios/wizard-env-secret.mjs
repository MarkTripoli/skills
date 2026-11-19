import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { expect, failures } from "../lib.mjs";

// The wizard captures one secret a person must fetch from a dashboard. The generated script keeps the library,
// declares its stages, takes the key through hidden entry, writes it to .env, and parses as bash. It is not run.
function check({ live, repo }) {
  if (!live) return [];
  const file = path.join(repo, "scripts", "setup-mail.sh");
  if (!fs.existsSync(file)) return ["wizard: scripts/setup-mail.sh was not written"];
  const text = fs.readFileSync(file, "utf8");
  const parsed = spawnSync("bash", ["-n", file], { encoding: "utf8" });
  return failures(
    parsed.status === 0 ? null : `wizard: bash -n failed: ${parsed.stderr.trim()}`,
    expect.matches("wizard: stage count set", text, /^TOTAL_STAGES=[1-9]/m),
    expect.matches("wizard: secret taken through hidden entry", text, /ask_secret\s+\S*MAIL_API_KEY/),
    expect.matches("wizard: value written to the env file", text, /write_env\s+\S*MAIL_API_KEY/),
    expect.matches("wizard: opens the dashboard", text, /open_url/),
    fs.existsSync(path.join(repo, ".env")) ? "wizard: ran the wizard or wrote .env itself" : null,
  );
}

export default {
  slug: "wizard-mail-key",
  title: "Generate a wizard that captures a mail API key",
  workflow: "oneshot",
  fixtures: [],
  request: "Make a wizard for getting our mail provider API key into .env.",
  phases: [{ skill: "wizard", terminal: true, request: "/wizard at scripts/setup-mail.sh: one person-only step, copying the API key from https://mail.example.com/settings/api-keys (Settings, API keys, Create key) into `MAIL_API_KEY` in .env. The stage list is confirmed; ask nothing and do not run the script.", check }],
};
