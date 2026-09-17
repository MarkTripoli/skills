# Acme Status API v1: Incidents

Vendor documentation, version 1.4, last updated 2026-07-30. Source: https://developer.acme-status.example/v1/incidents (saved copy).

## Authentication

Every request carries `Authorization: Bearer <token>`. Tokens are created per status page in the Acme Status dashboard under Settings, API. A token is scoped to one page.

## Rate limits

60 requests per minute per token. Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header in seconds. Bursts above 10 requests per second are rejected regardless of the per-minute budget.

## Create an incident

`POST https://api.acme-status.example/v1/pages/{page_id}/incidents`

Request body (`application/json`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | 1 to 120 characters, shown as the incident title |
| `status` | string | yes | one of `investigating`, `identified`, `monitoring`, `resolved` |
| `body` | string | no | up to 4000 characters of Markdown, the first update on the incident |
| `impact` | string | no | `none`, `minor`, `major`, `critical`; defaults to `none` |
| `component_ids` | string[] | no | components affected; unknown ids return 422 |

Response `201 Created`:

```json
{
  "id": "inc_3f9a",
  "name": "Elevated invoice API latency",
  "status": "investigating",
  "created_at": "2026-07-30T14:02:11Z",
  "shortlink": "https://stspg.io/3f9a"
}
```

## Errors

| Status | Meaning |
|---|---|
| 401 | missing or invalid token |
| 404 | unknown `page_id` |
| 422 | validation failed; the body lists `errors[]` with `field` and `message` |
| 429 | rate limited; honor `Retry-After` |

## Idempotency

Send `Idempotency-Key: <uuid>` to make a create request safe to retry; the same key within 24 hours returns the original `201` response.
