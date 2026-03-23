# Command

Reusable backoffice product for brand installs.

## Current status

This repo is no longer just a skeleton. It now contains working extraction waves for:

- `apps/admin-web`
- `apps/public-api`
- core packages for auth, brand runtime, email, content, leads, and DB access

What is still not finished:

- first-run setup/install flow
- full deployment packaging for non-X Dragon installs
- final split cleanup across the public-site BFF boundary
- broader polish and hardening
- removal of remaining X Dragon-specific assumptions from runtime/bootstrap/docs

## Intended structure

```text
apps/
  admin-web/
  public-api/
packages/
  core-*/
  contracts-*/
docs/
prisma/
scripts/
```

## Source contracts

- [`docs/repo-split-and-service-contract.md`](./docs/repo-split-and-service-contract.md)
- [`docs/command-public-api-contract.md`](./docs/command-public-api-contract.md)
- [`docs/command-bff-session-forwarding-contract.md`](./docs/command-bff-session-forwarding-contract.md)
- [`docs/command-repo-skeleton-and-bff-extraction-plan.md`](./docs/command-repo-skeleton-and-bff-extraction-plan.md)
- [`docs/public-api-preview-deployment-and-cutover.md`](./docs/public-api-preview-deployment-and-cutover.md)
- [`docs/install-bootstrap-config.md`](./docs/install-bootstrap-config.md)
- [`docs/xdragon-specific-assumption-audit.md`](./docs/xdragon-specific-assumption-audit.md)

## Public API Preview Deployment

The first preview deployment runbook for `apps/public-api` is here:

- [`docs/public-api-preview-deployment-and-cutover.md`](./docs/public-api-preview-deployment-and-cutover.md)

The short version:

- create a separate Vercel project with root `apps/public-api`
- set `XD_POSTGRES`, `COMMAND_PUBLIC_INTEGRATIONS_JSON`, and the brand email provider envs
- verify `GET /api/healthz`
- verify `GET /api/readyz`
- then point `xdragon-site` preview at that deployment with `COMMAND_PUBLIC_API_BASE_URL` and `COMMAND_PUBLIC_INTEGRATION_KEY`

## Working principle

This repo should become the reusable product boundary:
- admin UI lives here
- public service/API lives here
- external identity truth lives here
- public websites integrate through documented APIs instead of shared runtime code
