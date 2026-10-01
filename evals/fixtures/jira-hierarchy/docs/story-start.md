# Existing Story KIT-520: Retry a declined Mobile Checkout payment

Work on this Story is starting now. Parent Epic: KIT-400. Component: Mobile Checkout.
No implementation children exist yet. This is a supplied read-only snapshot, not live Jira evidence.

Approved Story acceptance criteria:
- If payment is declined, the customer sees that the order was not placed.
- The customer can retry payment without creating a duplicate order.
- Do not store card details in the checkout application.

The developer plans two pieces of work:
1. Implement backend retry idempotency and the declined-payment response. The backend behavior can be tested independently against the Story criteria.
2. Regenerate the typed client for that response so the frontend can consume it. This generated-client update has no independently testable user outcome; the Story's retry criteria cover it. Do not route this implementation child to QA.

Source: docs/approved/mobile-checkout.md#requirements
