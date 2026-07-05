---
name: Orval path+query params TS2308 collision
description: Endpoints with both path params AND query params generate duplicate type names causing TS2308 in api-zod
---

When an OpenAPI endpoint has BOTH path parameters AND query parameters, Orval generates a `<OperationIdPascal>Params` type in both `generated/api.ts` (Zod schema) and `generated/types/` (TypeScript interface), causing:

```
error TS2308: Module "./generated/api" has already exported a member named 'GetFixtureOddsParams'.
```

**Rule:** Remove optional query params from any endpoint that also has path params. Move filtering to separate endpoints or handle it server-side via the path-only endpoint.

**Why:** Orval uses the same naming convention (`<Op>Params`) for both the Zod schema for path+query params combined and the TypeScript type. The barrel `export *` from both files causes the collision.

**How to apply:** In `lib/api-spec/openapi.yaml`, if an endpoint has `fixtureId` as a path param, do NOT add `market`, `since`, `limit` etc. as query params on that same operation. The typecheck error appears during `pnpm -w run typecheck:libs` after codegen (not during orval itself), which can look like a codegen error.
