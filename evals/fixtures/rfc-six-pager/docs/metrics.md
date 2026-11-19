# reportd metrics, October 2026

Source: reportd job log and the support ticket system. Pulled November 2, 2026 by Tomas.

| Measure | Value |
|---|---|
| Nightly exports attempted | 9,870 |
| Exports that failed | 412 |
| Failures caused by the 15-minute gateway timeout | 388 |
| Failures from other causes | 24 |
| p50 export duration | 3 minutes |
| p95 export duration | 14 minutes |
| Largest tenant export | 2.1 million rows |
| Support tickets about a missing export | 37 |
| Tenants on the enterprise tier | 64 |

## Cost per month

| Item | Today | Proposed queue | Larger machine |
|---|---|---|---|
| Compute | $1,900 | $2,300 | $3,800 |
| Queue service | $0 | $140 | $0 |

Row growth across all tenants: 9% per quarter over the last four quarters.
