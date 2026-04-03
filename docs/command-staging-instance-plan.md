# Command Staging Instance Plan

**Purpose**
Define the concrete plan to stand up a real `command` staging instance for the X Dragon install, using the same release discipline as `xdragon-site` while respecting the fact that `command` is two deployable apps, not one.

This is a plan artifact, not an implementation log.

Related docs:
- [operator-installation-guide.md](./operator-installation-guide.md)
- [public-api-preview-deployment-and-cutover.md](./public-api-preview-deployment-and-cutover.md)
- [setup-onboarding-contract.md](./setup-onboarding-contract.md)

## What Is True Today

`command` already has some of the right primitives:
- preview and production database targeting exists in repo scripts
- the database host registry already models:
  - production public host
  - production admin host
  - preview public host
  - preview admin host
- the setup flow already asks for preview public/admin hosts
- the public API already supports preview-oriented integration entries

What does **not** exist yet as a first-class operating model:
- no `staging` branch in the `command` repo
- no documented `command` staging release lane equivalent to `xdragon-site`
- no stable, documented staging domain pair for both deployable apps
- no `command` staging QA checklist
- no single source-of-truth doc that explains how staging should work across:
  - `apps/admin-web`
  - `apps/public-api`
  - preview database
  - preview host mapping
  - `xdragon-site` staging integration

## Important Recommendation

Do **not** try to make `command` staging look exactly like `xdragon-site` at the deployment boundary.

Reason:
- `xdragon-site` is one browser-facing app
- `command` is two apps:
  - `apps/admin-web`
  - `apps/public-api`

So the correct equivalent of “staging the same way” is:
- one `staging` branch
- one preview database
- one preview deployment for `admin-web`
- one preview deployment for `public-api`
- stable staging domains for both
- explicit promotion path from `staging` to `main`

That is the real parallel to the current `xdragon-site` model.

## Recommended Target Shape

### Git / Release Shape

Add a long-lived `staging` branch to `command`.

Recommended release flow:
1. feature branch
2. PR into `staging`
3. staging deploy + QA
4. PR from `staging` into `main`
5. production deploy
6. keep `staging` patch-synced after production release

Reason:
- this matches the proven `xdragon-site` release discipline
- it gives `command` a real pre-production lane
- it reduces the current risk where production is effectively the first integrated environment

### Deployment Shape

Use two Vercel projects for the X Dragon `command` install:
- `command-admin-web`
- `command-public-api`

Each project should have:
- production deployment from `main`
- preview deployment from `staging`

Do **not** collapse both apps into one Vercel project.

Reason:
- runtime boundary is already separate
- env ownership is separate
- release rollback is cleaner

### Database Shape

Use one preview/staging Postgres database shared by:
- staging `admin-web`
- staging `public-api`

Keep it separate from production.

Do **not** give staging its own split admin/public databases.

Reason:
- one `command` install is one shared database
- splitting DBs by app would create a false architecture and invalidate real staging

### Domain Shape

Use stable staging domains instead of raw Vercel preview URLs.

Recommended X Dragon staging domains:
- `stg-admin.xdragon.tech` -> `apps/admin-web` preview deployment
- `stg-command-api.xdragon.tech` -> `apps/public-api` preview deployment

Recommendation strength:
- `stg-admin.xdragon.tech` is effectively required for realistic auth/callback/host testing
- `stg-command-api.xdragon.tech` is strongly recommended, not optional, because it removes preview-URL churn from `xdragon-site` staging config and makes smoke checks stable

Reason:
- admin auth and callback rules are host-sensitive
- BFF integration becomes operationally cleaner with a stable staging API base URL
- stage/prod drift is easier to reason about when both have equivalent domain shapes

## Required Preview Environment Model

### `apps/admin-web` preview env

Required:
- `XD_POSTGRES`
- `NEXTAUTH_URL=https://stg-admin.xdragon.tech`
- `NEXTAUTH_SECRET`
- `BACKOFFICE_MFA_ENCRYPTION_KEY`
- `BACKOFFICE_BOOTSTRAP_PASSWORD`
- `COMMAND_BOOTSTRAP_SUPERADMIN_EMAIL`

Recommended:
- `BACKOFFICE_MFA_ISSUER`

### `apps/public-api` preview env

Required:
- `XD_POSTGRES`
- `COMMAND_PUBLIC_INTEGRATIONS_JSON`
- `RESEND_API_KEY`
- `OPENAI_API_KEY`

Also required when referenced by active brand email config:
- any secret envs referenced by `BrandEmailConfig.providerSecretRef`

### Legacy script compatibility envs

These should remain aligned if you still use legacy recovery/sync tooling:
- `COMMAND_INSTALL_APEX_HOST`
- `COMMAND_INSTALL_PRODUCTION_PUBLIC_HOST`
- `COMMAND_INSTALL_PRODUCTION_ADMIN_HOST`
- `COMMAND_INSTALL_PREVIEW_PUBLIC_HOST`
- `COMMAND_INSTALL_PREVIEW_ADMIN_HOST`

Important:
- the app setup flow is DB-backed
- but some scripts still read install/host env values directly
- if those envs drift from the DB-backed host model, operator tooling becomes misleading

Recommendation:
- either keep them aligned
- or explicitly retire the remaining env-reading bootstrap/sync scripts in a later cleanup wave

## Preview Install Data Model

The staging `command` install should mirror the X Dragon production brand/host shape, but with preview hosts:
- preview public host: `staging.xdragon.tech`
- preview admin host: `stg-admin.xdragon.tech`

Reason:
- brand/runtime resolution is already database-backed
- the staging command install must know about the staging website and staging admin host pair

Recommendation:
- if the staging DB is uninitialized, run `/setup` on the staging admin host and create the preview host mappings there
- if the staging DB already exists, verify:
  - preview public host is correct
  - preview admin host is correct
  - brand email metadata is valid
  - protected bootstrap account exists and is healthy

## Public API Integration Registry Plan

The staging `public-api` integration registry must include a staging website entry.

Recommended preview entry:

```json
[
  {
    "name": "xdragon-staging-site",
    "key": "<long-random-secret>",
    "brandKey": "xdragon",
    "publicOrigin": "https://staging.xdragon.tech"
  }
]
```

Production should keep a separate production entry:

```json
[
  {
    "name": "xdragon-production-site",
    "key": "<different-long-random-secret>",
    "brandKey": "xdragon",
    "publicOrigin": "https://www.xdragon.tech"
  }
]
```

Important rule:
- preview and production must not share the same integration key

Reason:
- key reuse weakens environment isolation
- staging should never be able to impersonate production integration credentials

## Xdragon-site Staging Contract

Once staging `command/public-api` exists, `xdragon-site` preview should point at it with stable envs:
- `COMMAND_PUBLIC_API_BASE_URL=https://stg-command-api.xdragon.tech`
- `COMMAND_PUBLIC_INTEGRATION_KEY=<staging integration key>`
- `COMMAND_BFF_SESSION_SECRET=<staging secret>`

This is better than using a raw preview deployment hostname because:
- the hostname stays stable across deployments
- smoke checks become repeatable
- callback/origin reasoning is simpler

## Implementation Waves

### Wave 0: Lock the operating model

Create and protect the `staging` branch in `command`.

Decisions to lock:
- branch protections for `staging`
- who can promote `staging` -> `main`
- whether production deploys from `main` automatically or manually

### Wave 1: Stand up preview deployments

Create or formalize the two Vercel projects:
- `apps/admin-web`
- `apps/public-api`

Configure preview environment variables on both.

Add stable staging domains:
- `stg-admin.xdragon.tech`
- `stg-command-api.xdragon.tech`

### Wave 2: Stand up the preview database

Provision the staging Postgres database.

Then:
1. set `XD_POSTGRES` on both preview projects
2. run `npm run db:deploy:preview`
3. verify `npm run db:status:preview`

### Wave 3: Initialize and verify staging install data

If uninitialized:
- open `https://stg-admin.xdragon.tech/setup`
- complete install setup

If already initialized:
- verify brand and host records
- verify protected bootstrap account
- verify brand email config metadata

### Wave 4: Wire staging xdragon-site to staging command

Update `xdragon-site` preview env:
- `COMMAND_PUBLIC_API_BASE_URL`
- `COMMAND_PUBLIC_INTEGRATION_KEY`

Then redeploy staging `xdragon-site`.

### Wave 5: Add a command-specific staging QA checklist

Create a dedicated checklist similar in spirit to `xdragon-site/docs/staging-qa-checklist.md`, but scoped to `command`.

Minimum checks:
- `stg-admin` sign-in stays on staging host
- `/api/healthz`
- `/api/readyz`
- setup gating if uninitialized
- staff auth and MFA
- brand/host runtime diagnostics
- public-api integration auth
- one BFF-backed website flow from `xdragon-site` staging

### Wave 6: Normalize release operations

Document the full release lane:
- feature -> `staging`
- staging QA
- `staging` -> `main`
- prod smoke
- sync `main` back into `staging`

This should become the default command release process, not a one-off X Dragon workaround.

## Acceptance Criteria

The staging instance is not “done” when the apps deploy. It is done when all of this is true:

- `command` has a protected `staging` branch
- staging `admin-web` is reachable on `stg-admin.xdragon.tech`
- staging `public-api` is reachable on `stg-command-api.xdragon.tech`
- both preview apps point at the same staging DB
- `npm run db:status:preview` is clean
- staging host/runtime resolution is correct
- staging `xdragon-site` uses staging `command/public-api`, not production
- one end-to-end BFF flow works on staging
- a documented staging QA checklist exists

## Risks To Avoid

### Risk: fake staging

Bad pattern:
- preview deploys exist
- but `xdragon-site` staging still points at production `command/public-api`

Why this is bad:
- it makes staging UI tests look real while production data/auth is still in use

### Risk: no stable staging API host

Bad pattern:
- `xdragon-site` preview points at a rotating Vercel preview URL for `public-api`

Why this is bad:
- brittle env handoffs
- flaky smoke testing
- easy to accidentally test the wrong deployment

### Risk: staging/prod env key reuse

Bad pattern:
- same integration key or auth secret reused between environments

Why this is bad:
- weakens environment isolation
- complicates debugging of session and auth drift

### Risk: app/runtime parity without operator parity

Bad pattern:
- preview deploy works
- but no branch discipline, QA checklist, or promotion rules exist

Why this is bad:
- you still do first integrated testing in production

## Recommendation

Implement this in this order:

1. create `command` `staging` branch and branch protections  
2. provision stable staging domains for both deployable apps  
3. provision preview DB and preview envs  
4. initialize/verify staging install data  
5. repoint `xdragon-site` staging to staging `command/public-api`  
6. add staging QA checklist and release procedure docs

This order matters because a staging domain without a real preview DB and integration path is cosmetic, and a preview DB without a disciplined release lane is not yet a usable staging environment.
