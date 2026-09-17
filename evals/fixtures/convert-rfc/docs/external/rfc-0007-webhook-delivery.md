# RFC 0007: Webhook delivery channel

Status: Accepted 2026-08-19. Authors: Dana Okafor, Luis Ferreira. Discussion: platform-eng RFC review, 2026-08-14.

## Summary

Add a `webhook` channel to notifyctl that POSTs each notification as JSON to customer-configured URLs, signs the body, and retries transient failures with exponential backoff. Delivery outcomes are written to the existing outbox log.

## Motivation

Customers integrate notifyctl output into their own tooling by parsing the `.eml` files the email channel writes. Three enterprise accounts asked for an HTTP push instead. A webhook channel removes the file parsing and lets them verify that a payload came from us.

## Design

### Channel module

`src/channels/webhook.mjs` exports `name = "webhook"` and `deliver({ to, message, config })` like the other channels. `to` is the key of an entry in `config.endpoints`; `config` is the `webhook` block of `notifyctl.config.json`.

### Payload

```json
{
  "id": "<uuid>",
  "to": "<endpoint key>",
  "message": "<text>",
  "sentAt": "<ISO 8601>"
}
```

Content-Type is `application/json`. The body is serialized once; the same bytes are signed and sent.

### Signing

Every request carries `X-Notifyctl-Signature: sha256=<hex>`, where `<hex>` is HMAC-SHA256 of the raw body using the endpoint's `secret`. Receivers recompute and compare with a constant-time comparison. `X-Notifyctl-Timestamp` carries the Unix seconds the body was signed; receivers should reject timestamps older than five minutes.

### Retries

A response with status 2xx is `delivered`. A 5xx, 429, or network error is retried with exponential backoff: three attempts in total, waiting 1 s, then 4 s, then 16 s before giving up. A 4xx other than 429 is `rejected` and not retried. `Retry-After` on a 429 overrides the backoff wait when present.

### Delivery log

Each attempt appends one entry to the outbox log through `appendLog`, with `channel: "webhook"`, `attempt` (1-3), `status` (`delivered`, `retrying`, `rejected`, `failed`), and `httpStatus`.

### Configuration

```json
{
  "channels": {
    "webhook": {
      "endpoints": {
        "billing-ops": { "url": "https://hooks.example.com/notifyctl", "secret": "..." }
      },
      "timeoutMs": 5000
    }
  }
}
```

`secret` is required per endpoint; startup fails with a clear message when it is missing. `timeoutMs` defaults to 5000.

## Failure modes

- Endpoint unreachable: three attempts, then `failed`.
- Endpoint returns 401 or 403: `rejected` after the first attempt; the operator is expected to fix the secret.
- Body larger than 256 KiB: `rejected` before any request is made.

## Open questions

- TBD: whether a delivery that is still failing after the third attempt is written to a dead-letter file under `outbox/` or only recorded in the log and dropped.
- TBD: whether the signature should also cover the timestamp header (as Stripe does) or only the body.

## Out of scope

- Receiving webhooks.
- Per-endpoint rate limiting.
