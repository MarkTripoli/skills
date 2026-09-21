# Receipt schema

A run prints one JSON object:

```json
{
  "surface": "browser",
  "target": {"id": "session-id"},
  "observations": [{"fingerprint":"...","elements":[{"id":"e1","role":"button","name":"Submit","operations":["CLICK"]}]}],
  "decisions": [{"operation":"CLICK","target":"e1","model":"jev-latest","usage":{}}],
  "executions": [{"operation":"CLICK","target":"e1","ok":true}],
  "expectedPostconditions": ["Confirmation is visible"],
  "observedPostconditions": ["Confirmation is visible"],
  "status": "passed",
  "reason": "expected postconditions observed",
  "warnings": []
}
```

Native receipts retain the selected Android serial or iOS simulator UDID in `target.id`; iOS observations retain app PID identity, editable/focused metadata, and observed frames. Missing or inconsistent identity, app scope, bounds, or supported text is non-green and does not invoke the driver.
`status` is exactly `passed`, `failed`, or `blocked`. A `DONE` choice never passes without an independent post-action observation and postcondition verification. Receipts contain model and usage metadata, not model choice keys or credentials.
