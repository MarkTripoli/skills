# Cache Rollout Notes

**Caching:** Our caching layer serves as a pivotal component — it doesn't just speed up reads, it enhances the entire request lifecycle, ensuring a robust experience. Let's delve into the numbers.

Median read latency fell from 120 ms to 9 ms across 42 endpoints. Writes may be slower on cold nodes; we have not measured that yet.

Run `cachectl warm --all` before the rollout. I hope this helps!
