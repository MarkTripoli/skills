# Apply approved descriptions

Run this only for issue keys the user approved in chat. Approval of one key never covers another. `<server>` is the name your runtime registered for the Atlassian MCP server (`claude_ai_Atlassian_Rovo` in Claude Code). For each approved key:

1. Fetch the full description again as HTML with `<server>:getJiraIssue`. Save it to a file in the task directory and run `sha256sum <file>`; record the hex digest.
2. Compare the issue's update time and the digest with the draft's source snapshot. If either differs, show the difference and obtain new approval before continuing.
3. Call `<server>:getContentFormatGuide` for `editJiraIssue`.
4. Build the body from the approved header, rewrite, and QA guide. Append `<details><summary>Original ticket text</summary>...</details>` containing the HTML fetched in step 1 verbatim. Keep every original node, including images and mentions; keep `<details>` outside panels and use no columns.
5. Submit only `fields.description` with `contentFormat: "html"` through `<server>:editJiraIssue`. Never change the title, status, priority, assignee, labels, comments, or unrelated fields.
6. Re-read the issue and check the rendered header plus the preserved original block. Jira may normalize HTML on readback, so compare the preserved nodes and content and never claim byte-identical storage if the API changed the markup.
7. If readback lost an original node, re-submit once with the same payload. If a node is still lost, stop without another write (the same HTML conversion would drop it again) and report the lost nodes, the issue's history entry, and the file saved in step 1.
8. Report with `references/refinement_applied_answer.md`.
