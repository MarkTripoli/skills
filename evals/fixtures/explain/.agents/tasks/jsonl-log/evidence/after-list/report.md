# notifyctl list keeps an existing log

- commit: {{HEAD_SHA}}
- command: as shown in `output.txt`, on an `outbox/log.json` written by {{BASE_SHORT}}
- output: `output.txt`

Observed: `list` printed the three entries from the old `log.json` unchanged, a new `send` wrote `log.jsonl`, and `list` then printed all four in order.
