# Digest command spec

`notifyctl digest` prints a daily digest of queued notifications.

1. Entries are sorted newest first.
2. The digest holds at most 10 entries; older ones are dropped.
3. Each line reads `<channel>: <message>`.
