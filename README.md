# Command

Reusable backoffice product for brand installs.

## Current status

This repo is no longer just a skeleton. It now contains working extraction waves for:

- `apps/admin-web`
- `apps/public-api`
- core packages for auth, brand runtime, email, content, leads, and DB access

What is still not finished:

- broader setup/install packaging around the new first-run setup flow
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

## Product & Operator Docs

- [`docs/operator-installation-guide.md`](./docs/operator-installation-guide.md)
- [`docs/setup-onboarding-contract.md`](./docs/setup-onboarding-contract.md)
- [`docs/command-public-api-contract.md`](./docs/command-public-api-contract.md)
- [`docs/command-bff-session-forwarding-contract.md`](./docs/command-bff-session-forwarding-contract.md)
- [`docs/install-bootstrap-config.md`](./docs/install-bootstrap-config.md)
- [`docs/scheduling-calendar-contract.md`](./docs/scheduling-calendar-contract.md)
- [`docs/xdragon-specific-assumption-audit.md`](./docs/xdragon-specific-assumption-audit.md)

## Migration History Docs

- [`docs/repo-split-and-service-contract.md`](./docs/repo-split-and-service-contract.md)
- [`docs/command-repo-skeleton-and-bff-extraction-plan.md`](./docs/command-repo-skeleton-and-bff-extraction-plan.md)
- [`docs/public-api-preview-deployment-and-cutover.md`](./docs/public-api-preview-deployment-and-cutover.md)

These documents describe how `command` was extracted from the X Dragon platform. They are useful implementation history, but they should not be treated as the primary install guide for new adopters.

## Working Principle

This repo is the reusable product boundary:
- admin UI lives here
- public service/API lives here
- external identity truth lives here
- public websites integrate through documented APIs instead of shared runtime code
