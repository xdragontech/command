# Operator Installation Guide

**Purpose**
Provide the generic install and deployment path for a new `command` instance without assuming X Dragon-specific history.

This is the primary operator doc for:
- first deployment of `apps/admin-web`
- first deployment of `apps/public-api`
- bootstrap superadmin setup
- public-site integration setup

Historical X Dragon extraction notes live separately in the migration-history docs.

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
- the bootstrap recovery password
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
   - `/admin/signin`
   - staff login
   - dashboard
   - brands
   - configs
   - security
6. Run explicit bootstrap ensure/recovery tooling only if needed.
7. Configure brand email settings in admin-web if the brand is not already ready.
8. Point the public site BFF at the deployed `public-api`.

## Bootstrap Superadmin Rule

`COMMAND_BOOTSTRAP_SUPERADMIN_EMAIL` is the protected bootstrap identity source for the install.

Important:
- missing this env should not block ordinary admin login
- but protected-account semantics and bootstrap recovery tooling depend on it being set correctly

## Public-site Integration Inputs

The public site needs:
- `COMMAND_PUBLIC_API_BASE_URL`
- `COMMAND_PUBLIC_INTEGRATION_KEY`
- `COMMAND_BFF_SESSION_SECRET`

`COMMAND_PUBLIC_INTEGRATION_KEY` must match the `key` value from the corresponding `COMMAND_PUBLIC_INTEGRATIONS_JSON` entry in `public-api`.

## Recommended Smoke Checks

After first deployment:
- admin sign-in
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
