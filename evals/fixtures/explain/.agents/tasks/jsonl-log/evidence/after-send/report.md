# notifyctl send on a large log, after

- commit: {{HEAD_SHA}}
- command: `node bench/send-probe.mjs . 50000 15` and `node bench/send-probe.mjs . 100 15`, run from the repository root
- environment: Linux x86_64, Node 26.5.0, local disk, the same host as the baseline
- output: `output.txt`

Observed: with 50,000 entries the median send took 36.6 ms (min 27.8, max 46.7). With 100 entries it took 43.0 ms, within the spread of the baseline's 40.3 ms: small logs gain nothing measurable.
