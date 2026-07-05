---
name: Wouter nested routing
description: How to correctly handle nested dashboard routing in wouter v3 to avoid 404 on exact parent path
---

When a parent Switch uses `<Route path="/dashboard/*">` to nest child routes, the wildcard `/*` does NOT match the exact path `/dashboard` (without trailing slash or additional segment).

**Rule:** Always register BOTH the exact path AND the wildcard in the parent Switch:

```tsx
<Route path="/dashboard" component={DashboardRouter} />
<Route path="/dashboard/*" component={DashboardRouter} />
```

**Why:** In wouter v3, `"/dashboard/*"` requires at least one character after the slash. The exact path `/dashboard` fails to match it, hits the catch-all NotFound route instead.

**How to apply:** Any time you build a dashboard layout with nested sub-routes, add both the exact and wildcard variants in the top-level Switch.
