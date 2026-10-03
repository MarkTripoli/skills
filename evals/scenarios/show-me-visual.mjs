import fs from "node:fs";
import path from "node:path";
import { expect, failures } from "../lib.mjs";

// show-me picks the smallest view. Phase 1 asks for a simple call flow: the reply carries a text call tree or a Mermaid
// block naming both functions and no `show-me-*.html` is written. Phase 2 asks for a dense state comparison: one saved
// `show-me-*.html` in the task directory built from the fixture's real labels, and a reply from the final-answer template
// with a relative link. `xdg-open` and `open` are stubs, so no window opens; their calls are logged, not required.
// Neither phase ends with a handoff command, so both are terminal.
const html = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^show-me-.+\.html$/.test(f)) : []);
const fences = (text) => [...text.matchAll(/^(`{3,})([^\n]*)\n([\s\S]*?)^\1[ \t]*$/gm)].map((m) => ({ lang: m[2].trim(), body: m[3] }));
const commandFence = (text) => fences(text).some((f) => /^\/[a-z][a-z0-9-]*(?: |$)/.test(f.body.trim()));

// Every `show-me-*.html` in the repository outside dependencies and VCS data, task directory included.
function htmlAnywhere(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/^show-me-.+\.html$/.test(e.name)) out.push(path.relative(root, full));
    }
  };
  walk(root);
  return out;
}

const STATES = ["Loading", "Empty", "Error", "Saved", "Offline"];
const LABELS = ["Email alerts", "SMS alerts", "Quiet hours", "Retry", "Saved just now", "Could not load settings", "You are offline"];

export default {
  slug: "show-me-visual",
  title: "Show the form flow and the settings states",
  workflow: "oneshot",
  fixtures: ["show-me-visual"],
  stubs: { "xdg-open": "exit 0", open: "exit 0" },
  request: "Explain two things visually: how submitForm flows through createSession, and the notification settings screen states.",
  phases: [
    {
      skill: "show-me",
      terminal: true,
      request: "/show-me how `submitForm` in `src/submit-form.mjs` flows through `createSession` in `src/create-session.mjs`.",
      check: ({ answer, taskDir, repo, live }) => {
        const blocks = fences(answer ?? "");
        const flow = blocks.find((b) => /submitForm/.test(b.body) && /createSession/.test(b.body));
        const files = [...html(taskDir), ...(live && repo ? htmlAnywhere(repo) : [])];
        return failures(
          flow ? null : "show-me flow: the reply holds no fenced call tree or diagram naming both submitForm and createSession",
          files.length ? `show-me flow: a simple call flow was given an HTML file: ${[...new Set(files)].join(", ")}` : null,
          expect.excludes("show-me flow: no saved-artifact line for a visual kept in the reply", answer, /Artifact saved:/),
          commandFence(answer ?? "") ? "show-me flow: the reply ends with a next-step command, which a visual reply never does" : null,
        );
      },
    },
    {
      skill: "show-me",
      terminal: true,
      request: "/show-me how the notification settings screen differs across its five states: what each state shows, which controls are enabled, and which state it moves to next. Use the facts in `docs/notification-settings.md`.",
      check: ({ answer, taskDir, stubCalls }) => {
        const files = html(taskDir);
        const file = files[0];
        const page = file ? fs.readFileSync(path.join(taskDir, file), "utf8") : "";
        const link = /Artifact saved:\s*\[[^\]]*\]\(([^)\s]+)\)/.exec(answer ?? "")?.[1] ?? null;
        const states = STATES.filter((s) => new RegExp(s, "i").test(page));
        const labels = LABELS.filter((l) => page.includes(l));
        return failures(
          files.length === 1 ? null : `show-me comparison: expected exactly one show-me-*.html in the task directory, found ${files.length}`,
          file && !/<(?:html|svg|body)\b/i.test(page) ? "show-me comparison: the saved file is not an HTML page" : null,
          states.length >= 5 ? null : `show-me comparison: the page names ${states.length} of the five states (${states.join(", ")})`,
          labels.length >= 5 ? null : `show-me comparison: the page carries ${labels.length} of the fixture's real labels, expected at least 5 (${labels.join(", ")})`,
          link ? null : "reply: no `Artifact saved: [label](link)` line from the final-answer template",
          link && /^(?:[a-z]+:|\/|~)/i.test(link) ? `reply: the artifact link is not relative: ${link}` : null,
          link && file && path.basename(link) !== file ? `reply: the link names ${link}, the saved file is ${file}` : null,
          expect.matches("reply: carries the template's Summary", answer, /Summary:\s*\S/),
          expect.excludes("reply: no unfilled template field", answer, /\{(?:artifact_link|summary)\}/),
          commandFence(answer ?? "") ? "reply: the reply ends with a next-step command, which the final-answer template does not carry" : null,
          stubCalls.some((c) => /^(?:xdg-open|open)\s/.test(c) && !c.includes(".html")) ? "show-me comparison: an opener was run on something other than the HTML file" : null,
        );
      },
    },
  ],
};
