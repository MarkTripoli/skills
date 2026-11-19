import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";

// The notes mix machine-sounding filler with two measurements, a real hedge and a literal command.
// The pass removes the filler and keeps every fact; it must not turn "may be slower" into a certainty.
function check({ live, repo }) {
  if (!live) return [];
  const file = path.join(repo, "notes.md");
  if (!fs.existsSync(file)) return ["deslop: notes.md is missing"];
  const text = fs.readFileSync(file, "utf8");
  return failures(
    expect.excludes("deslop: stock vocabulary survives", text, /\b(delve|pivotal|robust|serves as|enhances)\b/i),
    expect.excludes("deslop: chat residue survives", text, /hope this helps/i),
    expect.excludes("deslop: dash connector survives", text, /—/),
    expect.matches("deslop: both latency numbers kept", text, /120 ms[\s\S]*9 ms/),
    expect.matches("deslop: endpoint count kept", text, /\b42\b/),
    expect.matches("deslop: the hedge kept", text, /may be slower/),
    expect.matches("deslop: the command kept", text, /`cachectl warm --all`/),
  );
}

export default {
  slug: "deslop-notes",
  title: "Remove machine-sounding patterns from rollout notes",
  workflow: "oneshot",
  fixtures: ["deslop"],
  request: "Deslop notes.md in place. Keep every fact.",
  phases: [{ skill: "deslop", terminal: true, request: "/deslop notes.md, editing the file in place. Keep every fact, number, hedge and command.", check }],
};
