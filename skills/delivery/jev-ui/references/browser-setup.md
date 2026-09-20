# Browser setup

Install `agent-browser` and make it available on `PATH`. Runs create an isolated session and never reuse a user browser profile. Supply a URL within the user-selected origin. The adapter takes one accessibility/text snapshot, indexes visible actionable controls, and rechecks its fingerprint before mutation.

Set a TypeSafe credential with `TYPESAFE_API_KEY`, `TYPESAFE_API_KEY_FILE`, or `~/.config/typesafe/api_key`. Credentials are sent only as authorization headers and never appear in receipts or diagnostics. `--help` does not require a credential or browser driver.

Unsupported browser features include frames, shadow roots, canvas, uploads, pop-up tabs, nested scrolling, and arbitrary keyboard widgets. These return a non-green structured result rather than being inferred from model text.
