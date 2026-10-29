import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { expect, failures, isHostWrite } from "../lib.mjs";

// Live `/assess-merge-risk` on two branches of a small static site. Setup commits the site to main: a global stylesheet
// and three pages that each use `.btn-danger` (Delete on the archive page, Delete account on settings, Cancel subscription
// on billing). Phase 1's branch says it hides the archive page's Delete button but does it with a global
// `.btn-danger { display: none; }`, which also hides the two other buttons: a side effect that blocks account deletion and
// cancellation, so High, and the reply must name both other pages. Phase 2's branch rewords one heading: Low. Phase 3's
// branch says it raises the base font size site-wide and does exactly that: an intended, cosmetic, wide change with no
// ticket or PRD, Medium (a missing doc must not raise it). Phase 4's commit message calls removing the billing page's
// Cancel subscription button intended, but `docs/prd/billing.md` requires it: High, with a Contradicts row citing the PRD.
// Phase 5 answers an earlier report: setup seeds the report for a branch that moves Cancel subscription behind a confirm
// prompt in `site/billing.js`, with a High finding (if the script fails, Cancel does nothing) and its local check, and the
// developer reports that check passing on the branch tip. The finding must move to Retracted naming that commit, the level
// must drop to Low, and the report file must hold the reply.
// There is no MR (`glab` fails), each branch is cut from main, and setup leaves HEAD on main. The grade reads the reply's
// level line and the pages it names, runs the installed skill's check-report.mjs on the reply against the phase's merged
// tree, and checks that the repository, branches and HEAD are as setup left them.

const git = (repo, ...argv) => execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const page = (title, body) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="styles.css"></head>
<body>
<h1>${title}</h1>
${body}
</body>
</html>
`;

export const SITE = {
  "site/styles.css": `body { font-family: system-ui, sans-serif; margin: 2rem; }
.btn { padding: 0.5rem 1rem; border-radius: 4px; border: 1px solid #888; }
.btn-danger { background: #b00020; color: #fff; border-color: #b00020; }
`,
  "site/archive.html": page("Archive", `<ul class="archive"><li>Q1 report <button class="btn btn-danger" data-action="delete-item">Delete</button></li></ul>`),
  "site/settings.html": page("Settings", `<section><h2>Danger zone</h2><button class="btn btn-danger" data-action="delete-account">Delete account</button></section>`),
  "site/billing.html": page("Billing", `<p>Plan: Team</p><button class="btn btn-danger" data-action="cancel-subscription">Cancel subscription</button>`),
  "docs/prd/billing.md": `# Billing page PRD

## Requirements

1. The billing page shows the current plan.
2. Users can cancel their subscription from the billing page at any time, without contacting support.
`,
};

const CONFIRM_MARKUP = `<form id="cancel-form" method="post" action="/subscription/cancel"><button class="btn btn-danger" type="button" data-action="cancel-subscription">Cancel subscription</button></form>
<script type="module" src="billing.js"></script>`;
const CONFIRM_SCRIPT = `// Asks before cancelling, then submits the cancel form.
const button = document.querySelector('[data-action="cancel-subscription"]');
button.addEventListener("click", () => {
  if (window.confirm("Cancel your subscription?")) document.getElementById("cancel-form").submit();
});
`;

// The earlier report phase 5 answers, for the cleared branch at `tip` onto `main`.
export function seededReport(tip, main) {
  return `**Merge risk: High**: \`feature/billing-cancel-confirm\` into \`main\` (${tip.slice(0, 10)} onto ${main.slice(0, 10)})

Cancel subscription now submits through \`site/billing.js\`; if that script fails to load or throws, the button does nothing, because it no longer submits the form itself. A revert restores the plain button.

| # | What users would see | Who | Severity | Reach | Level | Evidence | Intent |
|---|---|---|---|---|---|---|---|
| 1 | Clicking Cancel subscription does nothing when \`billing.js\` fails to load or throws | Subscribers who want to cancel | S3 | Feature | High | \`site/billing.html:6\`, \`site/billing.html:7\`, \`site/billing.js:4\` | Unexplained |
| 2 | Cancel subscription asks "Cancel your subscription?" before cancelling | Subscribers who want to cancel | S1 | Feature | Low | \`site/billing.js:4\` | Stated (commit message) |

Intent: subscribers confirm before their subscription is cancelled. Read: commit ${tip.slice(0, 10)}, \`docs/prd/billing.md\`. Not available: Jira issue, MR description (no remote, no MR).

Merge: No conflicts; no file changed on both sides

Not verified: whether the form posts in a browser; nothing in the repository runs the page.

Advisories: None.

Before merging:
1. Finding 1. Local check: run \`npx serve site\`, open http://localhost:3000/billing.html, click Cancel subscription and accept the prompt; expect the serve log to show POST /subscription/cancel.
`;
}

export const BRANCHES = {
  high: {
    name: "feature/archive-hide-delete",
    subject: "fix: hide the delete button on the archive page",
    edit: (repo) => fs.appendFileSync(path.join(repo, "site/styles.css"), ".btn-danger { display: none; }\n"),
  },
  low: {
    name: "feature/archive-heading",
    subject: "docs: rename the archive heading to archived items",
    edit: (repo) => {
      const file = path.join(repo, "site/archive.html");
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("<h1>Archive</h1>", "<h1>Archived items</h1>"));
    },
  },
  contradicts: {
    name: "feature/billing-cancel-via-support",
    subject: "feat: remove the cancel button from billing; support handles cancellations",
    edit: (repo) => {
      const file = path.join(repo, "site/billing.html");
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/<button[^>]*cancel-subscription[^>]*>Cancel subscription<\/button>/, "<p>To cancel, contact support.</p>"));
    },
  },
  cleared: {
    name: "feature/billing-cancel-confirm",
    subject: "feat: ask before cancelling a subscription",
    edit: (repo) => {
      const file = path.join(repo, "site/billing.html");
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/<button[^>]*cancel-subscription[^>]*>Cancel subscription<\/button>/, CONFIRM_MARKUP));
      fs.writeFileSync(path.join(repo, "site/billing.js"), CONFIRM_SCRIPT);
    },
  },
  medium: {
    name: "feature/larger-base-font",
    subject: "style: raise the base font size on every page for readability",
    edit: (repo) => {
      const file = path.join(repo, "site/styles.css");
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("body { font-family: system-ui, sans-serif; margin: 2rem; }", "body { font-family: system-ui, sans-serif; margin: 2rem; font-size: 18px; }"));
    },
  },
};

// Commits the site to main once, cuts the phase's branch from main, and returns to main.
function branch(variant) {
  return ({ repo }) => {
    if (!fs.existsSync(path.join(repo, "site"))) {
      for (const [file, text] of Object.entries(SITE)) {
        fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
        fs.writeFileSync(path.join(repo, file), text);
      }
      git(repo, "add", "site", "docs");
      git(repo, "commit", "-q", "-m", "feat: add the account site");
    }
    const b = BRANCHES[variant];
    git(repo, "checkout", "-q", "-b", b.name, "main");
    b.edit(repo);
    git(repo, "add", "-A", "site", "docs");
    git(repo, "commit", "-q", "-m", b.subject);
    const tip = git(repo, "rev-parse", "HEAD");
    git(repo, "checkout", "-q", "main");
    const main = git(repo, "rev-parse", "main");
    if (variant !== "cleared") return { branch: b.name, tip, main };
    // The report a first assessment saved, at the path scope.mjs prints for this branch.
    const report = path.join(repo, git(repo, "rev-parse", "--git-path", `assess-merge-risk-${b.name.replace(/[^A-Za-z0-9._-]+/g, "-")}.md`));
    fs.writeFileSync(report, seededReport(tip, main));
    return { branch: b.name, tip, main, report };
  };
}

// The level on the reply's `Merge risk:` line, lower-cased, or null.
export function replyLevel(answer) {
  return /merge risk:?\**:?\s*\**\s*(high|medium|low)\b/i.exec(answer ?? "")?.[1]?.toLowerCase() ?? null;
}

// `contradicts` is a doc path some table row must mark Contradicts and cite. `retracted` is the commit a Retracted item
// must name, with `rows` findings left and nothing under Before merging.
export function riskProblems(answer, { level, mentions = [], contradicts = null, retracted = null, rows: rowCount = null, calls = [] }) {
  const got = replyLevel(answer);
  const rows = (answer ?? "").split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l));
  const retractedBlock = (answer ?? "").split(/\n\s*\n/).find((b) => b.startsWith("Retracted:")) ?? "";
  return failures(
    retracted && !(/Cleared by:/.test(retractedBlock) && retractedBlock.includes(retracted.slice(0, 7))) ? `assess-merge-risk: no Retracted item clears a finding with the run on ${retracted.slice(0, 7)}` : null,
    rowCount !== null && rows.length !== rowCount ? `assess-merge-risk: ${rows.length} findings left, expected ${rowCount}` : null,
    retracted && !/^Before merging: None\./m.test(answer ?? "") ? "assess-merge-risk: Before merging still lists a check after the only blocking finding was cleared" : null,
    got === level ? null : `assess-merge-risk: reply rates ${got ?? "nothing"}, expected ${level}`,
    contradicts && !rows.some((r) => /\|\s*Contradicts\b[^|]*\|?\s*$/.test(r) && r.includes(contradicts)) ? `assess-merge-risk: no finding is marked Contradicts citing ${contradicts}` : null,
    mentions.map((m) => expect.matches(`assess-merge-risk: reply names ${m}`, answer ?? "", new RegExp(m.replace(/[.]/g, "\\."), "i"))),
    calls.filter(isHostWrite).map((c) => `assess-merge-risk: a host write ran: ${c.slice(0, 80)}`),
  );
}

// Runs the installed skill's check-report.mjs on the reply against this phase's merged tree; returns its problems.
function checkerProblems(ctx) {
  const script = (name) => path.join(ctx.skillsDir, "assess-merge-risk", "scripts", name);
  const s = JSON.parse(execFileSync("node", [script("scope.mjs"), ctx.setup.branch, "--target", "main", "--json"], { cwd: ctx.repo, encoding: "utf8" }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assess-merge-risk-reply-"));
  const file = path.join(dir, "reply.md");
  fs.writeFileSync(file, ctx.answer ?? "");
  try {
    execFileSync("node", [script("check-report.mjs"), file, "--tree", s.mergedTree, "--base", s.mergeBase], { cwd: ctx.repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return [];
  } catch (error) {
    return String(error.stderr).trim().split("\n").filter(Boolean).map((line) => `assess-merge-risk: ${line}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function check(expected) {
  return (ctx) => {
    const retracted = expected.retracted === "tip" ? ctx.setup?.tip ?? null : expected.retracted;
    const out = [expect.present("assess-merge-risk: a final reply", ctx.answer?.trim()), riskProblems(ctx.answer, { ...expected, retracted, calls: ctx.stubCalls ?? [] })];
    if (ctx.live) {
      out.push(checkerProblems(ctx));
      if (git(ctx.repo, "status", "--porcelain", "--", ".", ":!.agents")) out.push("assess-merge-risk: the repository was left dirty");
      if (git(ctx.repo, "rev-parse", "HEAD") !== ctx.setup.main) out.push("assess-merge-risk: HEAD moved off main");
      if (git(ctx.repo, "rev-parse", "main") !== ctx.setup.main) out.push("assess-merge-risk: main moved; the skill must not merge");
      if (git(ctx.repo, "rev-parse", ctx.setup.branch) !== ctx.setup.tip) out.push(`assess-merge-risk: ${ctx.setup.branch} moved`);
      if (ctx.setup.report && fs.readFileSync(ctx.setup.report, "utf8").trim() !== (ctx.answer ?? "").trim()) out.push("assess-merge-risk: the reply differs from the report file; step 7 updates the report in place and prints it");
    }
    return failures(out.flat());
  };
}

export default {
  slug: "assess-merge-risk",
  title: "Assess merge risk",
  workflow: "oneshot",
  request: "Assess how risky merging branches into main would be for users.",
  stubs: { glab: "echo 'no merge request for this branch' >&2; exit 1", gh: "echo 'no pull request for this branch' >&2; exit 1" },
  phases: [
    {
      skill: "assess-merge-risk",
      terminal: true,
      setup: branch("high"),
      request: `Assess the risk of merging branch \`${BRANCHES.high.name}\` into \`main\`. It hides the Delete button on the archive page. There is no remote and no MR.`,
      check: check({ level: "high", mentions: ["settings.html", "billing.html"] }),
    },
    {
      skill: "assess-merge-risk",
      terminal: true,
      setup: branch("low"),
      request: `How risky is merging \`${BRANCHES.low.name}\` into \`main\`? There is no remote and no MR.`,
      check: check({ level: "low" }),
    },
    {
      skill: "assess-merge-risk",
      terminal: true,
      setup: branch("medium"),
      request: `Is \`${BRANCHES.medium.name}\` safe to merge into \`main\`? It deliberately raises the base font size on every page. There is no remote and no MR.`,
      check: check({ level: "medium" }),
    },
    {
      skill: "assess-merge-risk",
      terminal: true,
      setup: branch("contradicts"),
      request: `Assess merging \`${BRANCHES.contradicts.name}\` into \`main\`. Removing the cancel button is intentional. There is no remote and no MR.`,
      check: check({ level: "high", contradicts: "docs/prd/billing.md" }),
    },
    {
      skill: "assess-merge-risk",
      terminal: true,
      setup: branch("cleared"),
      request: `I ran the Before merging local check for finding 1 of the \`${BRANCHES.cleared.name}\` merge risk report on the current tip of that branch: I ran \`npx serve site\`, opened http://localhost:3000/billing.html, clicked Cancel subscription, accepted the prompt, and the serve log showed POST /subscription/cancel. Update the assessment. There is no remote and no MR.`,
      check: check({ level: "low", retracted: "tip", rows: 1 }),
    },
  ],
};
