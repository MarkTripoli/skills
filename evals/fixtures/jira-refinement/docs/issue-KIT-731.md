# Supplied text of Jira issue KIT-731

This is the text the requester pasted. Jira itself is not reachable from this task.

Title: notifyctl send loses the message for some channels

Description:
Sometimes `notifyctl send` just does nothing and the customer never gets the message. It should be fast and reliable.

Comments:
- Dana Whitfield, 2026-09-12: Only seen with the email channel. The SMS channel prints an error, so that one is fine.
- Priya Nair, 2026-09-14: Reproduced on staging with an address that has no domain part. I have not looked at what the log says afterwards.

Links: none. Attachments: one screenshot named `outbox-empty.png`, not supplied.
Fix status: no fix merged; no pull request linked.
