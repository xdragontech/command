# Operator Installation Guide

**Purpose**
Provide the generic install and deployment path for a new `command` instance without assuming X Dragon-specific history.

This is the primary operator doc for:
- first deployment of `apps/admin-web`
- first deployment of `apps/public-api`
- bootstrap superadmin setup
- public-site integration setup

Historical X Dragon extraction notes live separately in the migration-history docs.

Future first-run app onboarding is defined in:
- [`setup-onboarding-contract.md`](./setup-onboarding-contract.md)

Current state:
- the v1 `/setup` route is implemented for uninitialized installs
- env/deployment secrets and public integration registry values remain operator-owned
- recovery/automation scripts still exist alongside the app-owned setup path

## Install Shape

One `command` install consists of:
- one Postgres database
- one `admin-web` deployment
- one `public-api` deployment

Both apps point at the same install database. Do not create separate databases just because the apps deploy separately.

## Required Inputs

Before deployment, define:
- the install database URL
- the protected bootstrap superadmin email
- the bootstrap setup / recovery password
- the admin-web public URL
- the public-api public URL
- the initial public-site integration key and brand mapping

## Admin-web Required Env

Set these on the `apps/admin-web` deployment:
- `XD_POSTGRES`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `BACKOFFICE_MFA_ENCRYPTION_KEY`
- `BACKOFFICE_BOOTSTRAP_PASSWORD`
- `COMMAND_BOOTSTRAP_SUPERADMIN_EMAIL`

Recommended:
- `BACKOFFICE_MFA_ISSUER`

## Public-api Required Env

Set these on the `apps/public-api` deployment:
- `XD_POSTGRES`
- `COMMAND_PUBLIC_INTEGRATIONS_JSON`
- `RESEND_API_KEY`
- `OPENAI_API_KEY`

Also set any additional email provider secret env keys referenced by active `BrandEmailConfig.providerSecretRef` values.

## Public Integration Registry

`COMMAND_PUBLIC_INTEGRATIONS_JSON` defines which public-site BFFs may call this install.

Each entry should include:
- `name`
- `key`
- `brandKey`
- `publicOrigin`

Example:

```json
[
  {
    "name": "example-site-production",
    "key": "replace-with-long-random-secret",
    "brandKey": "example-brand",
    "publicOrigin": "https://www.example.com"
  }
]
```

Recommendation:
- use one integration key per public site
- keep each key brand-scoped for v1
- treat the key as a server-to-server secret, not a browser credential

## Deployment Sequence

1. Apply database migrations from the `command` repo.
2. Deploy `apps/public-api`.
3. Verify:
   - `GET /api/healthz`
   - `GET /api/readyz`
4. Deploy `apps/admin-web`.
5. Verify:
   - if the install is already initialized: `/admin/signin`
   - if the install is new: `/setup`
6. For a new install, open `/setup`, unlock it with `BACKOFFICE_BOOTSTRAP_PASSWORD`, and create:
   - install profile
   - primary brand
   - host mapping
   - brand email metadata
   - protected bootstrap superadmin record
7. Use the post-setup completion screen to copy:
   - the exact `COMMAND_PUBLIC_INTEGRATIONS_JSON` entry shape
   - the public-site BFF env handoff values
8. Run explicit bootstrap ensure/recovery tooling only if needed.
9. Configure brand email settings in admin-web if the brand is not already ready.
10. Point the public site BFF at the deployed `public-api`.

## Bootstrap Superadmin Rule

`COMMAND_BOOTSTRAP_SUPERADMIN_EMAIL` is the protected bootstrap identity source for the install.

Important:
- missing this env should not block ordinary admin login
- but protected-account semantics and bootstrap recovery tooling depend on it being set correctly
- on uninitialized installs, `/setup` uses `BACKOFFICE_BOOTSTRAP_PASSWORD` both to unlock setup access and to seed the initial bootstrap superadmin password hash

## Public-site Integration Inputs

The public site needs:
- `COMMAND_PUBLIC_API_BASE_URL`
- `COMMAND_PUBLIC_INTEGRATION_KEY`
- `COMMAND_BFF_SESSION_SECRET`

`COMMAND_PUBLIC_INTEGRATION_KEY` must match the `key` value from the corresponding `COMMAND_PUBLIC_INTEGRATIONS_JSON` entry in `public-api`.

## Recommended Smoke Checks

After first deployment:
- `/setup` on a new install or `/admin/signin` on an existing one
- MFA enrollment and challenge
- staff accounts
- client accounts
- brands and configs
- `/api/healthz`
- `/api/readyz`
- public login through the public-site BFF
- prompts and guides
- contact form
- chat flow

## Source Contracts

- [`command-public-api-contract.md`](./command-public-api-contract.md)
- [`command-bff-session-forwarding-contract.md`](./command-bff-session-forwarding-contract.md)
- [`../packages/contracts-openapi/command-public-api.v1.yaml`](../packages/contracts-openapi/command-public-api.v1.yaml)
