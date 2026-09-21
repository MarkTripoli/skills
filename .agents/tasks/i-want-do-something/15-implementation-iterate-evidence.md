---
task: i-want-do-something
type: implementation
summary: "R7 fixes continuation status/stop_reason and preamble defects at the canonical skill/template boundary (source commit 4b2123a). SKILL.md section 5 now states continuation uses the same terminal rules and enumerates only valid values. SKILL.md finalization adds a bolded allowed-values block. Terminal delivery sentence requires nothing before the template's first line. Template preamble uses pipe-separated exhaustive lists with explicit 'ONLY valid values; any other string is invalid' statement. Grader already rejected non-canonical values; no grader change needed. Live run evals/results/20260920-144640: iterate-evidence-continuation passes 1/1. Status=passed, stop_reason=success, markdown link first line, no preamble."
status: complete
revision: 4b2123a
target: origin/main 4458fbf
---

# R7 Implementation

## Changes (source commit `4b2123a`)

### Fix: Enumerate allowed frontmatter values and forbid preamble

**SKILL.md section 5 (continuation)** — added paragraph after the existing continuation guidance:

> A continuation session finishes the same receipt's reserved round and applies the same terminal rules as a new session: allowed `status` values are exactly `in-progress`, `passed`, `blocked`, or `failed`; allowed `stop_reason` values are exactly `none`, `success`, `blocker`, `no-progress`, or `exhaustion`. Any other value (e.g. `completed`, `done`, or prose) is invalid. The final answer must be the selected template filled verbatim with nothing before its first line — no introductory preamble, no summary sentence, no "here is the answer" wrapper. The markdown receipt link is the first line of the filled template, period.

**SKILL.md finalization section** — added bolded block directly before the numbered finalization steps:

> **Allowed frontmatter values — only these exact strings are valid:**
> - `status`: `in-progress` | `passed` | `blocked` | `failed`
> - `stop_reason`: `none` (while active) | `success` | `blocker` | `no-progress` | `exhaustion`
> Any other value — including `completed`, `done`, `all-resolved`, or any prose description — is invalid and will be rejected.

**SKILL.md terminal delivery sentence** — strengthened to: "The filled template is the complete answer — nothing appears before its first line. Do not prepend a preamble, summary, 'here is the answer', or any other text before the template's first `[{artifact_file}]({artifact_link})` line; the markdown receipt link is the first character of the reply."

**Template preamble (evidence_iteration_template.md)** — `status` and `stop_reason` lines now use pipe-separated exhaustive lists with "ONLY valid values; any other string (e.g. `completed`, `done`, `all-resolved`, or prose) is invalid and will be rejected by the grader."

**Grader check** — verified at line 900: already rejects non-canonical `status`/`stop_reason` via `receipt.fm.status !== status || receipt.fm.stop_reason !== reason`. No grader change needed.

**Changeset** — `.changeset/iterate-evidence-r7.md` patch for `@marktripoli/skills`.

## Live run `evals/results/20260920-144640` — 1/1

Single invocation: `npm run evals -- iterate-evidence-continuation --model anthropic/claude-sonnet-4-6 --keep --max-time 25`

| Scenario | Grade | Notes |
|---|---|---|
| iterate-evidence-continuation | **pass** | status=passed, stop_reason=success; answer starts with `[01-evidence-iteration-counter-evidence-continuation.md](...)` markdown link, no preamble. Pause valid. IE-001 resolved at R1 (count=1 confirmed by pixel). |

Saved grade: **1/1**.

### Independent review

Baseline (interrupted): increment=2 (line 2962, seq=85 precedes reservation seq=106), reset=0 (line 3404). Post-repair (main): increment=1 (line 1044), reset=0 (line 1136). Reservation at seq=106 with IE-001 open and pixels preceding. resolvedAfter=["IE-001"]. Receipt canonical, history preserved, no edit replay.

## Gates

| Command | Result |
|---|---|
| `npm test` | 184/184 pass |
| `npm run build -- --runtime oh-my-pi` | 44 skills, 7 workers |
| `node scripts/check-commits.mjs 4458fbf..HEAD` | ok: 33 subjects |
| `node scripts/sync-plugin.mjs --check` | plugin in sync (3.1.0, 37 skills, 7 agents) |
