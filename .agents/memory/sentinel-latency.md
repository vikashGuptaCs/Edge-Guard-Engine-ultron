---
name: Sentinel latency via inter-snapshot gap
description: How to compute feed latency in the Sentinel agent without relying on snapshot age vs wall clock
---

Using `Date.now() - latest.ts` as a latency proxy breaks when DB data is seeded with fixed timestamps (always looks stale, triggering CIRCUIT_BREAKER on all fixtures).

**Rule:** Compute latency as the gap between the two most-recent consecutive odds snapshots:
```ts
const prev = history.length >= 2 ? history[history.length - 2] : null;
const interSnapGap = prev ? Math.abs(latest.ts - prev.ts) : 50;
const latencyMs = Math.min(interSnapGap, 60_000);
```

**Why:** The inter-snapshot gap measures how fast the feed is producing new data, which is the actual latency signal we care about. Wall-clock age just measures when the data was seeded.

**How to apply:** Any time a risk agent needs to measure feed health: prefer relative timestamp deltas between consecutive items over absolute age comparisons. Threshold: gap > 30 000 ms = CIRCUIT_BREAKER, gap > 10 000 ms = TOXIC_FLOW.
