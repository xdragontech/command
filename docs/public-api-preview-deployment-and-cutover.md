# Command Public API Preview Deployment And Cutover

This document is the operator runbook for the first real `command/public-api` preview deployment and the matching `xdragon-site` BFF cutover.

## Goal

Deploy `command/public-api` as its own preview service, verify readiness, then point `xdragon-site` staging at it through the BFF env seam.

## Vercel Project Shape

Create a separate Vercel project for the public API:

- repo: `xdragontech/command`
- root directory: `apps/public-api`
- framework preset: Next.js

Do not point a single Vercel project at the command repo root. `command` contains more than one app and the public API must be deployable on its own boundary.

## Required Preview Environment Variables

At minimum, set these on the `command/public-api` preview project:

- `XD_POSTGRES`
- `COMMAND_PUBLIC_INTEGRATIONS_JSON`
- `RESEND_API_KEY`

Notes:

- `XD_POSTGRES` must point at the preview/staging install database.
- `COMMAND_PUBLIC_INTEGRATIONS_JSON` defines which public-site BFFs are allowed to call this install.
- `RESEND_API_KEY` is required if the active `BrandEmailConfig.providerSecretRef` resolves to `RESEND_API_KEY`.
- If future brands use a different `providerSecretRef`, add those env keys too.

Example preview integration JSON:

```json
[
  {
    "name": "xdragon-staging-site",
    "key": "replace-with-long-random-secret",
    "brandKey": "xdragon",
    "publicOrigin": "https://staging.xdragon.tech"
  }
]
```

## Deployment Checks

After the preview deploy, verify these endpoints:

- `GET /api/healthz`
- `GET /api/readyz`

Expected behavior:

- `/api/healthz` returns `200` if the app is up
- `/api/readyz` returns `200` only when:
  - `XD_POSTGRES` is present
  - `COMMAND_PUBLIC_INTEGRATIONS_JSON` parses
  - the database is reachable
  - each configured integration resolves to an active brand
  - auth email is ready for each configured integration brand

If `/api/readyz` returns `503`, do not cut over `xdragon-site` yet. Fix the reported readiness failures first.

## Xdragon-site Preview Cutover

Once `command/public-api` preview is healthy, set these env vars on `xdragon-site` staging/preview:

- `COMMAND_PUBLIC_API_BASE_URL=https://<command-public-api-preview-host>`
- `COMMAND_PUBLIC_INTEGRATION_KEY=<matching key from COMMAND_PUBLIC_INTEGRATIONS_JSON>`
- `COMMAND_BFF_SESSION_SECRET=<optional but recommended>`

Notes:

- `COMMAND_BFF_SESSION_SECRET` is recommended so the public site’s BFF session envelope does not depend on `NEXTAUTH_SECRET`.
- `xdragon-site` already has fallback behavior. If these command env vars are absent, it stays on the legacy local public-auth path.

## Staging Smoke Checklist

After the `xdragon-site` preview env cutover:

1. open `/auth/signin`
2. sign in with a known public user
3. confirm `/tools`
4. confirm `/prompts`
5. confirm `/guides`
6. confirm `/guides/[slug]`
7. confirm sign out
8. confirm signup
9. confirm verify email
10. confirm forgot/reset password

## Rollback

Rollback is intentionally simple at this stage:

1. remove or unset:
   - `COMMAND_PUBLIC_API_BASE_URL`
   - `COMMAND_PUBLIC_INTEGRATION_KEY`
2. redeploy `xdragon-site`

That returns the public site to the current local public-auth/resource path.

## Known Risk To Watch

The public content feeds must match the old local behavior before final cutover. If staging auth works but prompts/guides are unexpectedly empty, inspect the underlying install data and resource query parity before promoting to production.
