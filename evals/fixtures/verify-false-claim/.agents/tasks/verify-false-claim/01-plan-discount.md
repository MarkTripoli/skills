---
task: verify-false-claim
type: plan
summary: "Add a percent discount helper that never returns a negative price."
---

# Discount Plan

## Desired End State

`applyDiscount(priceCents, percent)` returns the price after the discount and never goes below zero. `npm test` passes.

## Phase 1: Rework the discount helper

### Verify

- [ ] `npm test` passes.
- [ ] `applyDiscount(200, 10)` is `180`.
