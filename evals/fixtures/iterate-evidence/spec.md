# Counter acceptance

Use Chromium at a 1280×720 viewport. Start each capture by loading the application afresh.

1. **Increment:** The initial visible count is `0`. Activate **Add one** once. The visible count must be exactly `1`.
2. **Reset:** From that nonzero count, activate **Reset**. The visible count must be exactly `0`.

Both flows are required at the same final served application revision. This is a static-state contract, not an animation or persistence contract. No network or business-state effect is expected.

The existing layout, colors, typography, and native button semantics are outside repair scope. Only `app.js` and `check.mjs` may change. Do not change this specification, the page, server, capture entry, installed skills, or task request.

Launch: `node server.mjs` prints its allocated loopback URL. Check: `node check.mjs URL` exercises the served application. Browser dependencies are supplied in ignored evidence storage, without changing application dependencies.
