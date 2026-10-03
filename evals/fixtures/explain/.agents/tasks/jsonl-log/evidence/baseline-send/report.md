# notifyctl send on a large log, before

- commit: {{BASE_SHA}}
- command: `node bench/send-probe.mjs . 50000 15` and `node bench/send-probe.mjs . 100 15`, run from the repository root (probe copied from {{HEAD_SHORT}}, which adds it)
- environment: Linux x86_64, Node 26.5.0, local disk, one shared developer host
- output: `output.txt`

The probe writes a delivery log of N entries in the format this commit uses, then times one `notifyctl send` process from spawn to exit, 15 times, reseeding before each run.

Observed: with 50,000 entries the median send took 91.5 ms (min 80.4, max 1089.7). With 100 entries it took 40.3 ms. One 50,000-entry run took 1089.7 ms; the host was shared, so the median is the figure to use.
