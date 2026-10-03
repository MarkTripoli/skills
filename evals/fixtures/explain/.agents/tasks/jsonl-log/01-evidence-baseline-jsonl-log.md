---
type: evidence-baseline
status: passed
summary: "Baseline at {{BASE_SHORT}}: notifyctl send took a median 91.5 ms with a 50,000-entry log and 40.3 ms with 100 entries (15 runs each, captured terminal output)."
---

# Evidence Receipt

## Revision

- commit: {{BASE_SHA}}
- branch: main
- environment: Linux x86_64, Node 26.5.0, shared developer host
- original baseline: this receipt

## Sessions

- CLI send probe: `evidence/baseline-send/report.md`, `evidence/baseline-send/output.txt`; reproduce with `node bench/send-probe.mjs . 50000 15`

## Results

| Test | Result | Capture timestamp or line |
|---|---|---|
| send on a 50,000-entry log is timed | passed | output line 3 |
| send on a 100-entry log is timed | passed | output line 7 |

## Caveats

- One 50,000-entry run took 1089.7 ms on the shared host; the median is reported.
- Windows was not measured: no Windows host was available.
