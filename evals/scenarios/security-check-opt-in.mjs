// Explicitly opted-in scanner contract exercise. Scanner processes are deterministic local stubs,
// never live scans or uploads; this is not a security recall or model-quality benchmark.
import { execFileSync } from "node:child_process";
import { failures, isHostWrite, NO_HOST } from "../lib.mjs";

const git = (repo, ...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const stubs = {
  semgrep: 'if [ "$1" = "--version" ]; then echo "1.168.0"; else printf \'%s\\n\' \'{"results":[],"errors":[]}\'; fi',
  gitleaks: 'if [ "$1" = "version" ] || [ "$1" = "--version" ]; then echo "8.24.0"; exit 0; fi; report=""; next=0; for arg in "$@"; do if [ "$next" = 1 ]; then report="$arg"; next=0; fi; case "$arg" in --report-path) next=1 ;; --report-path=*) report="${arg#--report-path=}" ;; esac; done; if [ -n "$report" ]; then printf \'[]\\n\' > "$report"; else printf \'[]\\n\'; fi',
  gh: 'echo "host access is not authorized in this scanner fixture" >&2; exit 3',
  glab: 'echo "host access is not authorized in this scanner fixture" >&2; exit 3',
};
export function checkScan(expected) {
  return ({ live, repo, fixtureSha, answer, stubCalls = [] }) => failures(
    stubCalls.some(call => /^semgrep scan\b/.test(call)) ? null : "security-check: Semgrep scan was not executed",
    stubCalls.some(call => /^gitleaks git\b/.test(call)) ? null : "security-check: Git history secret scan was not executed",
    /1\.168\.0/.test(answer) && /8\.24\.0/.test(answer) ? null : "security-check: report omits scanner versions",
    new RegExp(`\\b${expected}\\b`, "i").test(answer) ? null : `security-check: report omits ${expected} coverage`,
    /github\.com\/eval\/notifyctl/.test(answer) ? null : "security-check: report omits repository provenance",
    live && !answer.includes(fixtureSha) ? "security-check: report omits scanned HEAD" : null,
    stubCalls.some(isHostWrite) ? "security-check: explicit scan attempted hosted publication" : null,
    live && (git(repo, "rev-parse", "HEAD") !== fixtureSha || git(repo, "status", "--porcelain")) ? "security-check: scan changed the fixture checkout" : null,
    expected === "incomplete" && /(?:all clear|no vulnerabilities|clean scan)/i.test(answer) ? "security-check: incomplete coverage was advertised as clean" : null,
  );
}
export default {
  slug: "security-check-opt-in",
  title: "Run explicit security checks without treating unavailable coverage as clean",
  workflow: "oneshot",
  covers: ["security-check"],
  request: "Explicitly run /security-check. This isolated evaluation uses local scanner stubs, not live scanners or a security benchmark. Do not change code or upload source.",
  stubs,
  ...NO_HOST,
  phases: [
    {
      skill: "security-check", terminal: true,
      setup: ({ repo }) => { git(repo, "remote", "add", "origin", "https://github.com/eval/notifyctl.git"); },
      stubs: { ...stubs, semgrep: 'if [ "$1" = "--version" ]; then echo "1.168.0"; else echo "scanner unavailable" >&2; exit 2; fi' },
      request: "Run the opt-in security command and report both coverage fields, versions, repository and revision. One scanner is unavailable: retain that gap; do not claim a clean scan.",
      check: checkScan("incomplete"),
    },
    {
      skill: "security-check", terminal: true,
      request: "Explicitly rerun /security-check now that both local scanner stubs are available. Report the complete normalized scan, including empty findings, both coverage fields, versions, repository and revision. This is still only a stub-protocol exercise.",
      check: checkScan("complete"),
    },
  ],
};
