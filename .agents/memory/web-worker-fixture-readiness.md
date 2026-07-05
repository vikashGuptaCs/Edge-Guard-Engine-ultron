---
name: Web Worker fixture readiness
description: Pattern for starting a Web Worker before fixture IDs are known, then flushing queued IDs once the worker is ready
---

When the React context mounts, fixtures are not yet loaded (async API call pending). The worker must be started immediately (so it can be ready), but fixture IDs arrive later.

**Rule:** 
1. Start the worker with `fixtureIds: []` in the `START` message.
2. Use a `pendingFixturesRef` to buffer IDs that arrive before the worker posts `READY`.
3. On receiving `READY`, flush `pendingFixturesRef` via `UPDATE_FIXTURES`.
4. For the badge/count display, use the fixture list length (from the API query) rather than `allFixtureRisks.size` which starts at 0 on every page load.

**Why:** The HMR-safe mount-only `useEffect` runs with whatever `initialFixtureIds` were at mount time (empty). A ref-based flush pattern avoids recreating the worker on every fixture list change.

**How to apply:** See `useRiskAgents` hook — `readyRef`, `pendingFixturesRef`, and the `updateFixtures` callback. Context exposes `monitoredFixtureCount` (from fixture query, not signal map size).
