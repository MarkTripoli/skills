# Acceptance-only evidence

The acceptance helper is repository-owned and is not required by the portable production controller. Run it from the repository root; it never chooses a device implicitly.

```bash
node skills/delivery/jev-ui/scripts/acceptance.mjs --smoke
node skills/delivery/jev-ui/scripts/acceptance.mjs --surface browser --evidence-dir <task-root>/<slug>/evidence/browser
node skills/delivery/jev-ui/scripts/acceptance.mjs --surface android --target emulator-5560 --evidence-dir <task-root>/<slug>/evidence/android
```

The acceptance runner uses the local `record-evidence` companion by default. An installed copy must receive an explicit evidence executable through `JEV_UI_EVIDENCE_COMMAND` and optional working directory `JEV_UI_EVIDENCE_CWD`; when that companion is unavailable, `runAcceptance` returns `blocked` rather than claiming `passed`. The generic `jev-ui.mjs` controller does not import or resolve this companion.
The acceptance runner admits `passed` only when the receipt has an explicit target, model and usage metadata, and the recorder returns linked session, manifest, report, playable video, and at least one assertion event. Missing recorder output or unverified media yields `blocked`; action acknowledgements remain narration and cannot satisfy this gate.

The browser capture source is `external`, so the acceptance runner starts and stops an owned `agent-browser` recording and imports that exact video with `evidence.py stop --video`; a user-supplied video is not required. Native sessions use `android` capture and the explicit target. Start and stop each session through the configured `record-evidence` executable; the runner writes `jev-receipt.json`, annotates observed assertions, and retains the generated `manifest.json`, `report.md`, screenshots, and playable `evidence.mp4`. Never use the recorder's `test` source for acceptance proof.

The web fixture exposes a name field, channel select, confirmation button, and independently readable status. It contains no action policy or JEV client. Native packaging is intentionally not inferred by this runner: use the selected environment's existing native build/install setup and preserve the authorized identity in the acceptance receipt.
