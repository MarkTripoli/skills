# Writing

Documents and prose for a reader. Source: `skills/writing/`.

| Skill | Use it to | Produces |
|---|---|---|
| [`technical-writing`](../skills/writing/technical-writing/SKILL.md) | Write, edit, review or score technical prose for one reader | Revised text that keeps every fact, hedge and literal string; a score out of 100 on request |
| [`deslop`](../skills/writing/deslop/SKILL.md) | Strip machine-sounding patterns from any text | The same text without stock vocabulary, filler and decorative formatting |
| [`product-brief`](../skills/writing/product-brief/SKILL.md) | Brief the people and agents who will build a capability | One HTML page: problem, example cast, ordered principles, sketches |
| [`pr`](../skills/writing/pr/SKILL.md) | Write a pull request body | A visual summary, before-and-after evidence and a merge-danger rating |
| [`rfc-six-pager`](../skills/writing/rfc-six-pager/SKILL.md) | Draft, revise, tighten, critique or run the review of an RFC | A checked Markdown six-pager that opens with the recommendation |

Which one:

- The words are fine but it sounds generated: `deslop`.
- The reader cannot find or trust what they need: `technical-writing`.
- A decision needs a decider: `rfc-six-pager`. Builders need to understand a capability: `product-brief`.

`technical-writing` owns sentence-level rules and the prose scorer; `rfc-six-pager` requires it and the installer brings it along. `deslop` owns the catalog of machine-writing patterns; the others name it as optional. Every skill in the collection also follows the shared [writing guide](../shared/WRITING.md).

`pr` is the bare template. Inside a delivery task, `/describe-pr` writes the gated description from the task's evidence.

After an accepted RFC, `/create-tdd` in the [delivery workflow](delivery.md) turns it into a technical design.
