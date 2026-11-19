---
name: blast-radius
description: Finds what a code change could break outside its own diff and proves the one fact its safety rests on by running real code, then reports confirmed risks, cleared risks and the cheapest check to run before merging. Use when the user runs /blast-radius or asks "what could this break", for the blast radius of a change, or to check a small diff they do not trust; not for rating user-facing merge risk without running anything (use assess-merge-risk) or for a full code review (use review-code).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Blast radius

Find what a change breaks somewhere else before it ships. Listing callers is not the job; a search does that in a second. The job is the breakage a search does not show, and proof for the claim that the change is safe.

A written analysis reads the same whether or not it is true. So the deliverable is not the analysis: it is the one or two facts the change's safety depends on, each proven as far as is cheap.

## Proof ladder

For each fact the change's safety depends on, climb as far as is cheap and report the rung reached.

| Rung | Evidence | Worth |
|---|---|---|
| 1 | Asserted from reading | Nothing on its own |
| 2 | Cited: a real `file:line` in this repository or in the dependency's source at its pinned version | Shows the claim is about real code |
| 3 | Traced: the failure walked step by step and shown not to reach | Rules out one path |
| 4 | Run: a script or test that calls the real code and fails loudly when the fact is false | The default target |
| 5 | Reproduced in the running application | For behavior only the full system shows |

Rung 4 is usually one small script that imports the same library version the application ships and calls the exact function in question.

## Steps

1. Read the change: the diff, the symbols it adds, changes and deletes, and what now behaves differently, including what the diff does not spell out. Read the pull request and its commits when there is one (`gh pr view <n> --json title,body,commits` and `gh pr diff <n>`).
2. Find the one fact the change is safe because of. Most changes that look risky are safe because of a single fact, such as "this call only drops cache entries that are already dead". If it holds, most risky cases clear at once. Spend the time here, not on a long list of maybes.
3. Look where a symbol search stops:
   - the source of each library the change calls, at its pinned version and with any local patch;
   - when things run: scheduling, teardown and unmount, retries, concurrency, ordering between processes;
   - what crosses a boundary: the JSON an API returns, a database column, a wire or file format, another language or service reading the same bytes, a feature flag, a cache entry written by the old version;
   - code several calls downstream of the changed symbol.
4. Rate each risk with a real chance of happening and a real cost if it does. Keep confirmed risks apart from the ones checked and cleared. Cite a real `file:line` for each. A search that finds nothing is an answer; never invent a caller or an API.
5. Prove the one fact. Write the script or test in a scratch directory outside the tracked tree, run it against the real code, and keep the command and its output. Change no tracked file unless the user asked for the test to be added.
6. For a wide change, or one where a wrong answer is costly, get a second independent read: give a fresh worker, on a different model when the runtime offers one, the same question with the diff and none of the analysis, then merge the two lists.

## Reply

Use these five parts, in this order:

- **What it does.** The change, including the part that is not obvious.
- **The one fact it is safe because of.** The fact, the rung reached, and the command with its output. When it could not be proven, write `unproven` and what would prove it.
- **Risks.** For each: how it breaks, `file:line`, how likely, how bad, and how to check. Paste the proof for the ones that matter.
- **Cleared.** What was checked and why it is fine.
- **Before merging.** The cheapest test or reproduction that would catch the real failure, including the script written in step 5.

Remove secrets and private data from pasted output before the reply goes anywhere public.
