# Setup Onboarding Contract

**Purpose**
Define the first-run setup page contract for `command`.

This document exists to prevent a sloppy outcome where the setup page becomes a second bootstrap path with unclear ownership. The page must become the DB-backed onboarding surface, while env/deployment secrets remain operator-owned.

## Core Recommendation

The setup page should be:
- a first-run `admin-web` route such as `/setup`
- available only while the install is uninitialized
- responsible for DB-backed install state only
- explicit about any remaining env/deployment steps it cannot own

It should **not** try to write Vercel env vars, provider secrets, or deployment URLs from inside the app.

## V1 Scope

The setup page should handle:
- initial install profile
- initial brand creation
- initial host mapping
- initial brand email config metadata
- creation of the protected bootstrap superadmin user
- completion gating so normal admin auth replaces `/setup` after onboarding

It should not try to solve every future provisioning problem in v1.

## Setup Prerequisites

Before `/setup` can be used, these install-level envs must already exist:
- `XD_POSTGRES`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `BACKOFFICE_MFA_ENCRYPTION_KEY`
- `COMMAND_BOOTSTRAP_SUPERADMIN_EMAIL`

Recommended but not strictly required to render the page:
- `BACKOFFICE_MFA_ISSUER`

Required to unlock and complete the page:
- `BACKOFFICE_BOOTSTRAP_PASSWORD`

Reason:
- the page can write DB state
- it cannot bootstrap the runtime itself if the runtime secrets are absent

## Setup State Model

The implementation should introduce an explicit DB-backed install state record instead of inferring readiness from accidental table contents.

Recommended minimum:
- `InstallProfile`
  - `id`
  - `displayName`
  - `setupCompletedAt`
  - `primaryBrandId`
  - `createdAt`
  - `updatedAt`

Reason:
- “no brands” or “no users” is not a safe initialization detector after partial failures
- explicit setup state makes `/setup` gating, resume behavior, and future onboarding upgrades much safer

## V1 Form Inputs

Recommended required inputs:
- install display name
- brand key
- brand name
- apex host
- production public host
- production admin host
- preview public host
- preview admin host

Recommended email section:
- email enabled toggle or status
- provider secret env key
- from name
- from email
- reply-to email
- support / notification email

Important recommendation:
- v1 should create **one** bootstrap superadmin only
- do not turn first-run onboarding into a multi-user invitation workflow

Reason:
- protected-account semantics already exist
- additional user creation belongs in normal staff-management flows after setup
- multiple-user setup increases partial-failure and permissions complexity for little gain

## Env-Owned Inputs vs DB-Owned Inputs

### Env-owned
These remain outside the setup page:
- runtime secrets
- database URL
- MFA encryption key
- email provider secret values
- public integration secret values
- deployment hostnames and project URLs

### DB-owned
These should be created or updated by the setup page:
- install profile
- `Brand`
- `BrandHost`
- `BrandEmailConfig`
- protected bootstrap `BackofficeUser`
- bootstrap user brand access

Reason:
- this is the clean ownership split the current product already wants
- if the page tries to own env state too, it becomes misleading and brittle

## Protected Bootstrap Identity Rule

`COMMAND_BOOTSTRAP_SUPERADMIN_EMAIL` remains the source of truth for the protected bootstrap identity in v1.

The setup page should:
- read that email
- show it clearly as the protected bootstrap account email
- create the bootstrap user record if it does not exist
- set the initial password hash from the configured `BACKOFFICE_BOOTSTRAP_PASSWORD`

It should **not** ask the operator to choose a different bootstrap email at runtime in v1.

Reason:
- protected-account behavior is currently env-driven
- letting the page choose a different email without changing runtime config would create drift immediately

## Brand Email Config Rule

The setup page may create a complete active `BrandEmailConfig`, but it must not assume the referenced provider secret env is actually present unless runtime readiness confirms it.

Recommended behavior:
- allow the operator to save email config metadata
- if the provider secret env is missing, mark email as not ready and explain why

Reason:
- the page can own metadata
- only the runtime can verify secret availability

## Public Integration Rule

The setup page should not directly create `COMMAND_PUBLIC_INTEGRATIONS_JSON` in v1.

Instead, after brand setup it should show:
- the expected integration payload shape
- the exact values the operator must place in `COMMAND_PUBLIC_INTEGRATIONS_JSON`
- the public-site env values needed to connect later

Reason:
- the current integration registry is env-backed
- pretending the page owns it would be dishonest until integrations become DB-backed

## Transaction & Failure Rules

The final submit should use a transaction for DB-backed install writes.

Recommended failure rules:
- no partial brand/host/bootstrap-user creation outside a transaction
- password validation must happen before writes
- host uniqueness and brand-key validation must reuse the same runtime rules as normal admin screens
- if setup fails, the page should show actionable errors and remain resumable

## Route Gating Rules

Recommended behavior:
- if `InstallProfile.setupCompletedAt` is null, allow `/setup`
- if setup is complete, `/setup` redirects to `/admin/signin`
- normal `/admin/*` routes should redirect to `/setup` when the install is not initialized

This gating should be explicit and centralized, not duplicated across pages.

## Completion Output

V1 should end on an intermediate completion screen showing:
- setup complete status
- configured bootstrap email
- configured brand and host summary
- brand email metadata summary
- the exact `COMMAND_PUBLIC_INTEGRATIONS_JSON` entry shape for the new brand
- the public-site BFF env handoff values the operator still needs to set
- remaining operator actions, if any

Then it should link onward to:
- `/admin/signin`

## Explicit Non-Goals For V1

- no theming or design customization wizard
- no multi-brand setup wizard
- no multi-user invitation flow
- no Vercel/env mutation from the page
- no partner-account onboarding
- no permissions-v2 design

## Transitional Relationship To Current Scripts

Until the page is implemented, the existing env + script path remains the operator bootstrap path.

After the page is implemented:
- scripts should remain for recovery, diagnostics, and automation
- but first-run onboarding should no longer depend on operators manually running multiple bootstrap scripts in the common case

## Recommendation

Implemented in two passes:

1. contract-backed install state and gating
2. the actual `/setup` UI and transaction flow

Remaining follow-up:
- broaden packaging/onboarding around the setup flow
- eventually replace the bootstrap-password gate with a more explicit install-claim model if product requirements demand it
