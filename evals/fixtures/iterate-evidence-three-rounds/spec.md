# Independent counter acceptance

Use Chromium at a 1280×720 viewport. Start each capture by loading the application afresh. Counters A, B, C, and D are independent: interacting with one must not change another.

For each counter:

1. **Increment:** The initial visible count is `0`. Activate its **Add one** button once. Its visible count must be exactly `1`.
2. **Reset:** From that nonzero count, activate its **Reset** button. Its visible count must be exactly `0`.

The eight required flows are `A-increment`, `B-increment`, `C-increment`, `D-increment`, `A-reset`, `B-reset`, `C-reset`, and `D-reset`. Capture every flow at baseline and after each repair, at the same served application revision for that pass. Increment all four in A-D order, retain their simultaneous increment states for inspection, then reset all four in A-D order. All counters and their controls must remain visible throughout each capture.

This is a static-state contract, not an animation or persistence contract. No network or business-state effect is expected. Previously passing coverage must be inspected again at each new application revision.

The existing layout, colors, typography, and native button semantics are outside repair scope. Only `app.js` and `check.mjs` may change. Do not change this specification, the page, server, capture entry, installed skills, or task request.

Launch: `node server.mjs` prints its allocated loopback URL. Check: `node check.mjs URL` exercises the served application. Browser dependencies are supplied in ignored evidence storage, without changing application dependencies.
