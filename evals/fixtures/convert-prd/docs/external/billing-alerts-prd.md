# Billing Alerts Digest

Exported from Notion on 2026-09-02. Owner: Priya Natarajan (Billing PM). Status: Approved by Billing leads 2026-08-28.

## Overview

Account owners miss overdue-invoice notifications because notifyctl sends one email per event. An account with twelve overdue invoices gets twelve emails in one morning; owners report filtering them out. Support attributes 31% of "why was my account suspended" tickets in Q2 to owners who never read the individual overdue emails.

## Problem

- Owners see a stream of near-identical emails and stop reading them.
- Nothing tells an owner how many invoices are overdue in total or which one suspends the account first.
- Suspension happens fourteen days after the first overdue invoice with no consolidated warning.

## Goals and success metrics

- Cut "unaware of suspension" support tickets by half within one quarter of launch (Q2 baseline: 214 tickets).
- Reach a 40% open rate on the digest within thirty days of launch, measured by the tracking pixel notifyctl already includes in email.

## Requirements

1. Account owners receive one digest per day at 09:00 in the account's time zone.
2. The digest lists every overdue invoice with its number, amount, days overdue, and the date the account would be suspended.
3. When no invoice is overdue, no digest is sent.
4. The digest replaces the per-event overdue emails; no per-event overdue email is sent once an account is on the digest.
5. An owner can opt back into per-event emails from the account settings page; the digest still goes out.
6. Digests must be fast.
7. A digest that fails to deliver is retried the next day at 09:00; it is not resent the same day.

## Non-goals

- SMS or push delivery of the digest.
- Digests for anything other than overdue invoices (usage warnings, plan changes).
- Changes to the suspension policy itself.

## Open questions

- Should the digest include invoices that are due within the next seven days as well as overdue ones? Finance says yes; Support says it dilutes the message.
