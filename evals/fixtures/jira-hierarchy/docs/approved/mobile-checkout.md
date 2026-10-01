# Approved requirement: Mobile Checkout

Status: Approved for implementation planning

## Requirements

1. A signed-in customer can review the items in their cart and the total before placing an order.
2. A customer can submit an order only after confirming the displayed total. The order confirmation shows the order number and item summary.
3. If payment is declined, the customer sees that the order was not placed and can retry payment without creating a duplicate order.
4. The checkout page is usable on mobile and desktop widths.

## Constraints

- Existing cart and payment services remain the source of truth.
- Do not store payment card details in the checkout application.

## Out of scope

- Guest checkout is explicitly out of scope; no covering ticket exists yet.

## Design

No design has been approved yet. Do not block story drafting on Figma.
