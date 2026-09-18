Epic delivery started: {summary}

Review artifact: {artifact_link}

Check:
- {review_check}
- Known limits: {known_limits}

Wave 1 children, their GitHub issues, and their start commands (run each from the project root; use shell single quotes and write each prompt apostrophe as `'\''`; each child runs as its own delivery run, cuts its worktree from the epic branch named by `--base`, and opens its pull request against that branch):
- `{child_slug}` ({child_issue}): `{child_start_command}`

The child `task.md` files are committed on the epic branch as `docs(task): open epic children`; a child with an issue carries `issue: <number>`, and its pull request description closes that issue. Under `delivery-epic` and `delivery-program`, the `delivery-wave` block pushes the epic branch and starts the ready children itself when the pack's `children` input is `auto` (the default), so run the commands above only with `children=manual` or when starting a child by hand, after `git push -u origin <epic branch>`: Archon cuts each child from the epic branch on `origin`. Later waves start after every dependency's pull request is merged into the epic branch. Running the epic plan's delivery recorded approval of the epic plan; reply with changes to a child's `task.md` before starting it.

With `children: manual`, or to start one child by hand, ask your agent to start that child; it runs the command above for you. The commands are printed as the record of what runs, not as something for you to type.
