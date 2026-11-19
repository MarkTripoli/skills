import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";

// The state type allows contradictory combinations and the reader casts around them. The fix is a discriminated
// union with a literal discriminant and no cast.
function check({ live, repo }) {
  if (!live) return [];
  const file = path.join(repo, "src", "state.ts");
  if (!fs.existsSync(file)) return ["typescript-best-practices: src/state.ts is missing"];
  const text = fs.readFileSync(file, "utf8");
  return failures(
    expect.matches("typescript-best-practices: literal discriminant", text, /(kind|type|tag|status):\s*["']loading["']/),
    expect.excludes("typescript-best-practices: cast survives", text, /\bas Diff\b|\bas any\b/),
    expect.excludes("typescript-best-practices: boolean-plus-optionals survives", text, /loading:\s*boolean/),
  );
}

export default {
  slug: "typescript-diff-state",
  title: "Make contradictory diff states unrepresentable",
  workflow: "oneshot",
  fixtures: ["typescript-best-practices"],
  request: "Rework DiffState in src/state.ts so impossible states cannot be represented.",
  phases: [{ skill: "typescript-best-practices", terminal: true, request: "Rework `DiffState` in src/state.ts so impossible states cannot be represented, and update `describe` to match. Edit the file in place.", check }],
};
