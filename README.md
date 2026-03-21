# Command

Reusable backoffice product for brand installs.

## Current status

This repo is the initial extraction skeleton from the current X Dragon platform. It is not a finished split yet.

What is already present:
- canonical repo-split and API contract docs
- public API OpenAPI source
- current Prisma schema and migration history
- bootstrap and sync scripts that will move with the reusable backoffice
- initial app/package layout for future extraction waves

What is not finished yet:
- admin app implementation
- public API implementation
- BFF client integration from public sites
- install/setup flow

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

## Working principle

This repo should become the reusable product boundary:
- admin UI lives here
- public service/API lives here
- external identity truth lives here
- public websites integrate through documented APIs instead of shared runtime code
