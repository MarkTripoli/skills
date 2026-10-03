---
type: evidence
status: passed
summary: "At {{HEAD_SHORT}}: notifyctl send took a median 36.6 ms with a 50,000-entry log (baseline 91.5 ms) and 43.0 ms with 100 entries (baseline 40.3 ms); list still reads an existing log.json. Windows untested."
---

# Evidence Receipt

## Revision

- commit: {{HEAD_SHA}}
- branch: perf/store-jsonl
- environment: Linux x86_64, Node 26.5.0, the same shared developer host as the baseline
- original baseline: 01-evidence-baseline-jsonl-log.md

## Sessions

- CLI send probe: `evidence/after-send/report.md`, `evidence/after-send/output.txt`; reproduce with `node bench/send-probe.mjs . 50000 15`
- CLI list with an old log: `evidence/after-list/report.md`, `evidence/after-list/output.txt`

## Results

| Test | Result | Capture timestamp or line |
|---|---|---|
| send on a 50,000-entry log is faster than the baseline | passed | after-send output line 3 (36.6 ms vs 91.5 ms) |
| send on a 100-entry log is no slower than the baseline's spread | passed | after-send output line 7 (43.0 ms vs 40.3 ms, min 27.3 vs 26.2) |
| list prints entries from an existing log.json in order | passed | after-list output lines 2 to 4 and 9 to 12 |
| `npm test` passes | passed | 3 of 3 |

## Caveats

- Windows was not measured: no Windows host was available.
- Timing is one shared Linux host, 15 runs per case; process start-up is included in every time.
- The old `log.json` is read but never rewritten; it is not migrated into `log.jsonl`.
