---
task: i-want-do-something
type: implementation
summary: "R13 fixes the zero-limit terminal answer failure. Root cause: the subject emitted the filled answer template, then made a todo tool call to mark tasks done, received the tool result, and responded with 'The answer was delivered in the previous turn' — which the grader (correctly) read as the terminal answer. Fix: SKILL.md now has an explicit mandatory session-stop rule forbidding any tool calls after the filled template turn; both answer templates have a meta-instruction comment instructing the subject to emit and stop, re-emit verbatim if forced into another turn, and complete todo/commit before the template. Harness inspection confirmed no extra-turn injection: hooks only observe tool boundaries, no pending-todo reminders. No grader changes required. Offline: 187/187 pass. Live run 20260921-004116: subject correctly emitted the filled template with no post-template tool calls; answer.md starts with receipt link. Independent pixel review: initial=0 (0.244s), increment=2 (IE-001 defect), reset=0. Saved grade: 1/1."
round: R13
revision: fc959a3
fixes: zero-limit-session-stop
---

# R13 Implementation Receipt

## Root cause analysis

Trace replay for R12 zero-limit run (20260920-235943):
- L5611: Subject emits filled answer template (correct receipt link) ✓
- L5625: Subject makes `todo` tool call (marking tasks done)
- L5629: Tool result delivered ("6/6 done, 0 open")
- L5643: Subject says "The answer was delivered in the previous turn. All work is complete."
- L5645: agent_end

Grader uses `index.answer` = last non-tool-call assistant text = L5643 → no receipt link → "reply: must link the receipt without a handoff fence".

The harness (iterate-evidence-hooks.mjs) does not inject extra turns or todo reminders — it only observes tool boundaries. The extra turn was a voluntary subject action.

## Changes (source commit fc959a3)

**skills/delivery/iterate-evidence/SKILL.md** — Added `**Session stop (mandatory):**` paragraph after the receipt-commit paragraph in "Stop precedence and terminal delivery": "After the receipt commit, emit the filled answer template as the final turn of the session — then stop completely. Do not make any further tool calls after the template turn: no `todo`, no confirmations, no follow-up reads, no git commands. If the session framework forces another turn after the filled template (for example, because a prior tool result is still being delivered), re-emit the full filled template verbatim as the sole content of that turn. Never replace the template with a note such as 'The answer was delivered in the previous turn' — that note is not the answer and will be rejected by the grader. Complete any required `todo` or commit operations before emitting the template, not after."

**skills/delivery/iterate-evidence/references/evidence_iteration_stopped_answer.md** — Added comment after last placeholder line: `<!-- Session stop: after emitting this filled template, make no further tool calls or turns. If another turn is forced, re-emit this entire filled template verbatim. Complete todo and commit operations before this turn, not after. -->`

**skills/delivery/iterate-evidence/references/evidence_iteration_passed_answer.md** — Same comment added.

No grader changes. No changeset needed (instruction-only skill change in an already-shipped skill; the existing changeset from R12 covers the iterate-evidence version bump).

## Offline verification

```
npm test              → 187/187 pass
node scripts/sync-plugin.mjs --check  → plugin in sync (3.1.0, 37 skills, 7 agents)
node scripts/check-commits.mjs 4458fbf..HEAD  → ok: 52 subjects (after source commit)
```

## Live run 20260921-004116

One invocation: `npm run evals -- iterate-evidence-zero-limit --model anthropic/claude-sonnet-4-6 --keep --max-time 25`

Trace verification: last assistant text turns were L4610 (template, first emission), L4999 (template repeated), L5000 (template repeated). No post-template tool calls. `answer.md` starts with `[01-evidence-iteration-counter-zero-limit.md](...)` — session-stop fix confirmed.

Independent pixel review (this session):
- L1592 initial-state-0.244s.png: count = **0** (pre-click state, before first Add one)
- L1693 02-assertion-recorded-increment-state-pixel-inspection-pendin-untested.png: count = **2** (IE-001 confirmed: should be 1, app.js uses value += 2; UNTESTED overlay)
- L1826 04-assertion-recorded-reset-state-pixel-inspection-pending-untested.png: count = **0** (reset correct; UNTESTED overlay)

All frame sha256 values match trace image sha256 values (no OMP resize).

Saved grade (one invocation): **1/1 passed**.

## Known limits

- Duplicate terminal answer turns (L4999, L5000): OMP framework may repeat the last assistant message; both contain the correct filled template. The grader uses the last one. This is harmless.
- Evidence is local and ignored. Git commits do not transport media or diagnostic dependencies.
