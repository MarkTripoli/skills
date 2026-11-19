---
name: gitlab-inline-comments
description: Posts authorized line-anchored GitLab merge request comments using nested JSON positions and verifies every returned DiffNote. Use when the user runs /gitlab-inline-comments or a review explicitly requests GitLab inline findings; not for GitHub publication (use group-review) or replies to existing discussions (use resolve-pr-reviews).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# GitLab inline comments

This optional provider procedure requires an explicitly selected GitLab MR and authenticated `glab`. GitHub remains the collection's default. Resolve the hostname, encoded project path and MR IID from the selected URL or configured remote; never switch repositories or accounts implicitly. Resolve scratch and task paths through the collection conventions.

## 1. Establish authority and preserve the review

Posting needs explicit user authority for the selected findings. `/review-code --comment` authorizes posting that review's concrete findings on its selected GitLab MR; an ordinary review does not. Group review retains its separate decisions, test-post and batch approvals.

Save the review first using its immutable indexed artifact contract. Keep the exact reviewed head, current source revision, observed reviewer model and checkpoint; never change these to make an old review appear current. If working changes were reviewed but are absent from the MR head, do not post those findings. Show any unanchorable finding locally rather than silently converting it to a summary note.

## 2. Pin fresh diff refs and a valid line

Run against the selected host:

```sh
glab api --hostname <hostname> "projects/<encoded-project>/merge_requests/<iid>/versions" > <scratch>/versions.json
glab api --hostname <hostname> "projects/<encoded-project>/merge_requests/<iid>/diffs" > <scratch>/diffs.json
```

The first versions entry is the latest: map `base_commit_sha`, `start_commit_sha`, `head_commit_sha` to `base_sha`, `start_sha`, `head_sha`. Require all three, and require the head to match the saved review. Read the current diff and the file at that exact commit with `git show <head_sha>:<path>`. Choose a line in a current diff hunk that supports the finding, not merely a line in the full file. Use the diff's `old_path` and `new_path`, which differ for renames. Use `new_line` for a new-side anchor, or `old_line` for an old-side anchor.

## 3. Write a nested JSON payload

Write the approved body and position as one JSON object to a scratch file. Example new-side payload:

```json
{
  "body": "<approved finding text>",
  "position": {
    "position_type": "text",
    "base_sha": "<base_sha>",
    "start_sha": "<start_sha>",
    "head_sha": "<head_sha>",
    "old_path": "<old path>",
    "new_path": "<new path>",
    "new_line": 42
  }
}
```

For an old-side anchor replace `new_line` with `old_line`. Do not send `-f "position[...]=..."`: flat form fields can create a top-level note rather than an inline discussion. Immediately before each POST, read the latest diff version again and compare all three SHAs with the payload and reviewed head. A changed ref requires re-review, re-anchoring and any approval the calling workflow requires; do not post a stale position.

## 4. Post with an explicit JSON Content-Type

```sh
glab api --hostname <hostname> "projects/<encoded-project>/merge_requests/<iid>/discussions" \
  --method POST --input <scratch>/payload.json -H "Content-Type: application/json" \
  > <scratch>/created-discussion.json
```

`--input` without the header can produce HTTP 415. A successful HTTP response alone does not prove that the comment is inline. An invalid line-code response requires deriving the anchor again from the current diff, not dropping its position.

## 5. Verify the returned note before reporting success

Compare the response's first note with the exact payload. Require `type: DiffNote` and matching `base_sha`, `start_sha`, `head_sha`, `old_path`, `new_path`, and every supplied `new_line` or `old_line`. For example:

```sh
node --input-type=module - <scratch>/created-discussion.json <scratch>/payload.json <<'JS'
import fs from 'node:fs';
import assert from 'node:assert/strict';
const discussion = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expected = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).position;
const note = discussion.notes?.[0];
assert.equal(note?.type, 'DiffNote');
for (const key of ['base_sha', 'start_sha', 'head_sha', 'old_path', 'new_path', 'new_line', 'old_line']) {
  if (key in expected) assert.equal(note.position?.[key], expected[key], key);
}
console.log(discussion.id, note.id);
JS
```

A `DiscussionNote`, missing position or mismatch is failure, even after HTTP 200. Inspect the MR discussions before retrying an uncertain result to avoid duplicates. Record the discussion ID, note ID, verified position and link only after verification; leave the immutable review unchanged and report posting results separately.

## Stray-note cleanup needs authority

Report a stray top-level note without calling it an inline success. Delete it only when the user authorized cleanup:

```sh
glab api --hostname <hostname> "projects/<encoded-project>/merge_requests/<iid>/notes/<note-id>" --method DELETE
glab api --hostname <hostname> "projects/<encoded-project>/merge_requests/<iid>/discussions/<discussion-id>/notes/<note-id>" --method DELETE
```

The first command deletes a top-level note; the second deletes a note inside a discussion. Never delete an unrelated note.
