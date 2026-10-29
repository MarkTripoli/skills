# Overdue Gear Panel (Mobile) — BA Specification

Status: Draft for review · Ships after the spring workshop · Owner: Design

## 1. Executive summary

This comprehensive specification provides a robust, holistic definition of the Overdue Gear Panel. Requirements OG-01 to OG-60 are numbered by group.

## 2. Requirements

- OG-01: The system shall display an Overdue panel at the top of the Gear page.
- OG-02: The Overdue panel shall list every checkout whose return date has passed.
- OG-03: The Equipment Manager shall see every overdue checkout in the organization.
- OG-04: A Team Lead shall see overdue checkouts for every team.
- OG-05: A Team Lead shall see overdue checkouts only for the teams they lead.
- OG-06: Each row shall show the borrower, the item, and the days overdue.
- OG-07: A borrower with two overdue items shall appear on two rows.
- OG-08: A borrower with two overdue items shall appear on one row with two item chips.
- OG-09: A borrower who has left the organization shall appear with a "Left organization" chip.
- OG-10: Tapping Mark returned shall close the checkout.
- OG-11: Tapping Mark returned shall close the checkout and reset the borrower's role.
- OG-12: Mark returned shall work offline and sync later.
- OG-13: Search shall match borrower name and item serial number.
- OG-14: Members shall not see the panel.

## 3. Edge cases

- EC-1: An item is overdue by zero days at midnight. Behavior TBD.
- EC-2: A borrower has left the organization and has an overdue item. Only the Equipment Manager can mark it returned.
- EC-3: A Team Lead marks an item returned with no signal, and the Equipment Manager marks it lost before the sync.

## 4. Open questions

- Q1: Should Team Leads see other teams? See OG-04 and OG-05.
- Q2: One row or two rows per borrower? See OG-07 and OG-08.
