import { expect, failures } from "../lib.mjs";

// When `simview url` exits 1 (no web server), the agent must not start one itself; it tells the owner how to.
// A model may run `simview url` in parallel with another call, which interleaves the log lines, so the url call is matched unanchored.
// `simview` and `adb` are stubs: url fails like the real command, adb is the only device tooling. Graded on calls and the reply.
const SIMVIEW = [
  'case "$1" in',
  '  url) echo "simview: no simview web server is running" >&2; exit 1;;',
  '  note) if [ "$2" = "--list" ]; then :; fi;;',
  '  list) echo "emulator-5554 android Pixel_8 adb";;',
  '  *) echo "simview stub: $1";;',
  "esac",
].join("\n");
const ADB = 'case "$*" in *devices*) printf "List of devices attached\\nemulator-5554\\tdevice\\n";; *) echo "adb stub ok";; esac';

export default {
  slug: "simview-server-down",
  title: "Do not start the simview web server unasked; tell the owner how",
  workflow: "oneshot",
  fixtures: [],
  stubs: { simview: SIMVIEW, adb: ADB, systemctl: 'echo "systemctl stub: $*"' },
  request: "Drive the Android emulator emulator-5554 to open Settings and let me watch.",
  phases: [
    {
      skill: "simview",
      terminal: true,
      request: "Drive the Android emulator emulator-5554 to open Settings and let me watch. Only adb is installed for device control. Do not ask questions.",
      check: ({ answer, stubCalls }) => {
        const started = stubCalls.filter((c) => /^(simview web|systemctl)\b/.test(c));
        return failures(
          stubCalls.some((c) => /simview url\b/.test(c)) ? null : "simview: did not check the viewer with simview url",
          started.length ? `simview: started the web server unasked: ${started.join(" | ")}` : null,
          expect.matches("simview: reply tells the owner how to start the viewer", answer, /systemctl --user start simview-web|simview web/),
        );
      },
    },
  ],
};
