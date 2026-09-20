# Evidence recovery record (2026-09-20)

Scope: evidence recovery only. No product code, verification matrix, inventory, PR description, device action, upload, move, overwrite, or deletion was performed. The existing blocked artifact was left untouched.

## Recovered passing standalone evidence

The passing source was verified before copying from `/tmp/jev-ios-current-standalone`:

- Receipt status: `passed`; target simulator `7A023F51-F0DA-4179-868B-19207E433651`; observed PID `16750`; observed postcondition `Confirmed Name`; assertions `passed: 1, failed: 0, untested: 0`.
- Receipt observations include the final `AXStaticText` status `Confirmed Name via Email.` and frame `{x:201,y:304.83333333333337}` for PID 16750.
- Report says one passed assertion and a verified 2110x2622, 74.633333-second capture.
- `ffprobe` verified the copied/source MP4 has width 2110, height 2622, duration 74.633333, and 2239 frames.
- SHA-256 (source and copied bytes are equal): receipt `479b47ceea9c913d55e779a72f4a39514b4266a1c0924e377129440f1c96fee3`; report `3810d9dd2511b45beb2a8eb6c7c3138748ea41b7ae0fac0029bed25d14e6bfcd`; video `63f62d28998a9767d9435a18ac8a63341c7f8f8fd88d1ee0ecf6d19d0dae405a`; final frame `8dda8edac55357c179205c6dd1b6570a35a08ad853b321e26ae741b444acf5c0`.
- Recovery copies (unique ignored/local directory; not committed or uploaded): `/tmp/jev-ios-evidence-recovery-current-20260920T123601Z-61502/passed-pid16750-jev-receipt.json`, `passed-pid16750-report.md`, `passed-pid16750-evidence.mp4`, and `passed-pid16750-final.png`.

The accepted historical directory remains separate and untouched: `.agents/tasks/jev-ios/evidence/final-sync-20260920/current-standalone/`. Its receipt SHA-256 is `72ba589475b10564f73a0ece605e3f55e3eaeade669f779c37380d1b4033cf19`; its video SHA-256 is `482207ccac6c0cce14054d05043084794ffe371be7d93ebe511821cbaf33be86`. It reports `blocked`, PID 2374, ten WAIT decisions, no observed postconditions, and zero passed assertions. It is not replaced or relabeled here.

## Deletion commands and timestamps

Raw original transcript excerpts are retained at `/tmp/jev-ios-evidence-recovery-current-20260920T123601Z-61502/transcript-excerpts-original.jsonl`, sourced from `/Users/marktripoli/.atomic/agent/sessions/--Users-marktripoli-.agents-worktrees-skills-jev-ios--/2026-09-20T10-54-09-350Z_01a0be73-b5c6-7334-bde9-ca3886e221b4/cb11feba/run-0/session.jsonl`.

- Transcript source line 78, timestamp `2026-09-20T12:06:37.397Z`: `rm -rf /tmp/jev-ios-current-replacement; mkdir -p ...`; this deleted the prior replacement directory before its retry. The deleted attempt's original bytes were not found in available copies/backups.
- Transcript source line 84, timestamp `2026-09-20T12:09:14.432Z`: `rm -rf /tmp/jev-ios-current-standalone; mkdir -p ...`; the subsequent tool output recorded standalone PID 98075 evidence.
- Transcript source line 88, timestamp `2026-09-20T12:12:16.954Z`: `rm -rf /tmp/jev-ios-current-standalone; mkdir -p ...`; this deleted the PID 98075 standalone receipt/report/video before the PID 16750 retry.

The PID 98075 tool output was available in the transcript, so a separately labeled reconstructed receipt was written to `/tmp/jev-ios-evidence-recovery-current-20260920T123601Z-61502/pid98075-receipt-reconstructed.json`. It reports `blocked`, PID `98075`, no observed postconditions, and zero passed assertions. This is reconstructed from transcript output, not the original receipt bytes. No original PID 98075 MP4, report, frame, or manifest bytes were found in the safe read-only searches. The deleted replacement attempt's original receipt, report, video, and frames were likewise not recovered.

## Contract failure / limits

The preservation contract was unavoidably violated before this recovery: the transcript proves destructive `rm -rf` commands deleted failed/interrupted evidence before retries. The reconstructed PID 98075 receipt and raw transcript excerpt do not restore the deleted media. The passing PID 16750 receipt/report/video are actual recovered bytes and are not evidence that the deleted PID 98075 media was restored. No claim of original-video restoration is made.

Recovery commands used after inspection were read-only validation (`jq`, `ffprobe`, `shasum`, `cmp`, `ps`, transcript parsing) plus new-directory creation and `cp -p` into the unique `/tmp` recovery directory. No existing evidence path was deleted, moved, or overwritten.
