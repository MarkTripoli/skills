# Narration guide

Narration is the text track that talks the viewer through the recording. It stays on screen until the next narration line, so each line frames the next stretch of the video.

## What a line does

One line answers, for the viewer who cannot see your intent: what am I about to see, and what does it prove?

- Before an action: "We open Settings and switch the theme to dark. The change should apply without a reload."
- Before a check: "Reloading now. The dark theme must survive the reload for the preference to count as saved."
- On a failure: "The theme came back light after the reload. This is the bug the fix addresses; the next run shows the fixed build."
- On a limit: "The simulator has no touch driver in this run, so the scroll check is marked untested rather than skipped."

## Rules

1. Narrate before the action, then act; the line is on screen while the change happens. Assertions come after the change is visible.
2. One or two sentences, under 280 characters. The recorder rejects longer lines.
3. Present tense, first person plural or neutral: "We tap Save", "The list scrolls". No "I think", no "should work".
4. Name what is on screen with the app's own labels: "the Connectors page", "the Save button", not "the button".
5. Say what the check proves, not that it passed; the assertion toast and its color carry the result.
6. Never describe something the video does not show. If a state is off screen, either show it or leave it out.
7. Numbers over adjectives: "loads in under a second" beats "loads fast" only when the video shows the timing; otherwise say what is visible.
8. Between tests, one bridging line: "Next, the same flow on the iPhone simulator."
9. Multi-device: a line that applies to every pane goes to every session in one `narrate` call so the composite shows it once. A pane-specific line goes to that session only.
10. Use `--hold S` for a line that must disappear on its own (a warning, a note about a pause); otherwise let the next line replace it.

## Shape of a run

```text
setup      "Signed in as a member; on the dashboard."           (annotate --type setup)
narrate    "We open the connectors page and add a Slack connector. It should appear in the list without a refresh."
test_start "It should add a connector without a refresh"
   ... act ...
assertion  passed  "Slack connector listed immediately"
narrate    "Now we revoke it. The row must disappear and the audit log must record the revocation."
test_start "It should revoke and audit"
   ... act ...
assertion  passed  "Row removed after revoke"
assertion  failed  "Audit log shows no revocation entry"
narrate    "The audit entry is missing. That is the defect under test; everything else in this flow behaves."
```

Frame check after `stop`: open `frames/` and read each still as a viewer would. The narration, the test chip, and the toast must agree with what the screen shows at that moment.
