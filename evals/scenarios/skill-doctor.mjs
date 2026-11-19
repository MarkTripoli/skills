import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";

// The fixture skill has an invalid name, a first-person description with no trigger, a broken link and a shouted
// rule. A diagnosis reports each with a fix and edits nothing, because no fix was requested.
const ORIGINAL = "name: Note_Helper";
function check({ live, repo, answer }) {
  if (!live) return [];
  const text = fs.readFileSync(path.join(repo, "bad-skill", "SKILL.md"), "utf8");
  return failures(
    text.includes(ORIGINAL) ? null : "skill-doctor: edited the skill without being asked to fix it",
    expect.matches("skill-doctor: reports the name", answer, /lowercase|hyphen|Note_Helper/),
    expect.matches("skill-doctor: reports the description", answer, /third person|first person|when to use/i),
    expect.matches("skill-doctor: reports the broken link", answer, /references\/format\.md/),
    expect.matches("skill-doctor: gives fixes", answer, /Fix:/),
  );
}

export default {
  slug: "skill-doctor-bad-skill",
  title: "Diagnose a malformed skill",
  workflow: "oneshot",
  fixtures: ["skill-doctor"],
  request: "Check the skill in bad-skill/.",
  phases: [{ skill: "skill-doctor", terminal: true, request: "/skill-doctor bad-skill. Report only; do not fix anything.", check }],
};
