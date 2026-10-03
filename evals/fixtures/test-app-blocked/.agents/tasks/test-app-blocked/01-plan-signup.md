---
task: test-app-blocked
type: plan
summary: "Serve a sign-up page whose Subscribe button confirms the subscription."
---

# Sign-up Plan

## Desired End State

Opening `/` shows the heading "Sign-up" and a Subscribe button. Clicking Subscribe shows "Thanks for subscribing" below the button.

## Phase 1: Serve the page

### Verify

- [ ] `npm run dev` serves the page on port 4310.
- [ ] Clicking Subscribe shows "Thanks for subscribing".
