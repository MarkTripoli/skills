# Comment style

A posted comment speaks for the user to a colleague. Write it as that reviewer, in plain words, without mentioning review files, finding ids, or agents.

## Shape

1. A bold first line that states the problem: **Editing a report Message through PATCH drops its Report**.
2. One paragraph on the mechanism, naming the code with `path:line` or the function.
3. The failure as a short numbered scenario when it takes more than one step.
4. Evidence the author can check in a minute: a grep, a test name, a `merge-tree` result.
5. A suggested fix, stated as a suggestion. Offer two options when the right one depends on intent.

## Question form

Use it when the finding depends on context the author has and the reviewers lacked: a design document nobody could reach, an approval not recorded on the ticket, a product rule that may have changed.

- Title starts with **Question:** or **Question for product:**.
- State what the code does and why it looks wrong against the source you could read.
- Name the source you could not read.
- Ask the one question whose answer settles it, and say what would follow from each answer.

## Rules

- One comment per finding, anchored on a line inside the diff.
- When the real location is outside the diff, anchor on the nearest added line that shows the problem and name the real `path:line` in the body.
- Link related comments by request number (`the same applies in !3339`), never by id.
- Keep test-gap comments to the criterion, the missing check, and the suggested test.
- When a repository review rule backs the finding, link the rule file (`.code-review/query-count-tests.md`) so the author sees it is the repository's rule, not the reviewer's preference.
- No praise, no severity labels, no text addressed to an agent.

## Examples

A defect comment:

```markdown
**Updating an invoice through PATCH drops its line items**

`InvoiceService.update` (`billing/service.py:88`) rebuilds the invoice from the request body, and the serializer treats a missing `items` key as an empty list.

1. A client sends `PATCH /invoices/12 {"note": "paid"}`.
2. `items` is absent, so `update` assigns `[]`.
3. The three existing line items are deleted on save.

`test_patch_note_only` in `billing/tests/test_invoices.py` sends the same body and passes, because it asserts only the `note` field.

Suggestion: skip `items` when the key is absent (`if "items" in data:`), or reject a PATCH that omits it.
```

A question comment:

```markdown
**Question for product: should a refunded order keep its loyalty points?**

`OrderService.refund` (`orders/service.py:140`) returns the order total but leaves `points_awarded` unchanged. The ticket says refunds "reverse the order", and I could not read the loyalty design doc it links.

Is keeping the points intended? If yes, the ticket wording needs a note; if no, `refund` should subtract `points_awarded` in the same transaction.
```

