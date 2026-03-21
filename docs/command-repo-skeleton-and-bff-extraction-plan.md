# Command Repo Skeleton And BFF Extraction Plan

**Purpose**
Turn the repo-split architecture into an implementation-oriented extraction plan.

This document does not move code. It defines:
- the recommended initial `command` repo/module shape
- the recommended `xdragon-site` BFF shape
- the extraction waves from the current single-repo state
- the ownership map from current files to future repos/modules

This is the bridge between:
- [`docs/repo-split-and-service-contract.md`](./repo-split-and-service-contract.md)
- [`docs/command-public-api-contract.md`](./command-public-api-contract.md)
- [`docs/command-bff-session-forwarding-contract.md`](./command-bff-session-forwarding-contract.md)

## Core Recommendation

Do not split by copying route folders into a new repo and fixing imports afterward.

That would preserve the wrong architecture:
- shared runtime assumptions
- shared DB coupling
- admin UI and public API coupled to one web framework surface
- undocumented internal route behavior masquerading as a product boundary

The safer approach is:
1. create the `command` repo skeleton first
2. establish API and module boundaries there
3. move backoffice/admin ownership into `command`
4. convert `xdragon-site` into a BFF consumer of `command`
5. remove temporary compatibility logic last

## Recommended `command` Repo Shape

**Recommendation**
Use one repo with separate apps/modules from day one so future server separation is possible without another architectural rewrite.

```text
command/
  apps/
    admin-web/
    public-api/
  packages/
    core-config/
    core-db/
    core-brand-runtime/
    core-auth-backoffice/
    core-auth-external/
    core-content/
    core-leads/
    core-email/
    contracts-openapi/
    contracts-types/
  scripts/
  docs/
  prisma/
```

## Why This Shape

**`apps/admin-web`**
- owns the backoffice user interface
- owns backoffice-only session UX, MFA UX, and operator screens
- should not become the public integration surface

**`apps/public-api`**
- owns the versioned API contract consumed by public-site BFFs
- should be framework-isolated enough that it can scale or separate later
- should not depend on admin-only route structure

**`packages/core-*`**
- carry reusable business/runtime logic without app-specific rendering code
- let the admin app and API app share logic without cross-importing pages/components

**`packages/contracts-*`**
- keep OpenAPI and generated types explicit
- prevent route handlers from becoming the accidental source of truth

## Framework Recommendation

**Recommendation**
- `apps/admin-web`: Next.js is acceptable
- `apps/public-api`: prefer a standalone TypeScript HTTP service, not Next.js page/API routing

**Reason**
- the public API is supposed to be the reusable product boundary
- keeping it as a standalone service from the first extraction makes later scale/separation easier
- reusing Next Pages Router for public API would carry too much current coupling into the new product

This is a recommendation, not a locked implementation constraint. The non-negotiable part is the module boundary, not the exact framework.

## Recommended `xdragon-site` Shape After Extraction

```text
xdragon-site/
  pages/
    auth/
    guides/
    prompts/
    tools/
    api/
      bff/
  components/
    public/
  lib/
    command-client/
    site-session/
    bff/
  docs/
```

## `xdragon-site` Rules After Extraction

- no Prisma access for reusable identity/content/resource truth
- no direct imports from `command`
- no backoffice/admin UI code
- no browser-direct calls to `command` for normal flows
- public authenticated UX goes through local BFF routes only

## Initial `command` App Responsibilities

### `apps/admin-web`
- backoffice sign-in
- backoffice MFA enrollment/challenge UX
- staff accounts
- client accounts
- brands
- configs
- analytics
- leads
- library/content management

### `apps/public-api`
- auth/session endpoints
- account read/update endpoints
- password reset endpoints
- resource/feed endpoints
- future public service endpoints

### Shared packages

**`core-config`**
- env parsing
- install/runtime config
- bootstrap config

**`core-db`**
- Prisma client
- transaction helpers
- migration/seed helper entry points

**`core-brand-runtime`**
- brand/host resolution
- brand email config lookup
- integration-brand mapping

**`core-auth-backoffice`**
- backoffice identity
- staff auth policy
- MFA policy and verification primitives

**`core-auth-external`**
- external user auth
- session issuance/validation
- account lifecycle

**`core-content`**
- prompts
- guides
- articles/resource access

**`core-leads`**
- leads
- lead events
- future public service intake flows

**`core-email`**
- brand-scoped sender/runtime dispatch

**`contracts-openapi`**
- source OpenAPI specs

**`contracts-types`**
- generated client/server DTO types

## Recommended `xdragon-site` BFF Surface

The public site should introduce a narrow local BFF that mirrors the `command` public contract.

**Initial BFF routes**
- `POST /api/bff/auth/login`
- `POST /api/bff/auth/logout`
- `GET /api/bff/auth/session`
- `POST /api/bff/auth/register`
- `POST /api/bff/auth/password/forgot`
- `POST /api/bff/auth/password/reset`
- `GET /api/bff/account`
- `PATCH /api/bff/account`
- `GET /api/bff/resources/prompts`
- `GET /api/bff/resources/guides`
- `GET /api/bff/resources/guides/:slug`

**BFF support modules**
- `lib/command-client/`
  - typed client for `command` APIs
- `lib/site-session/`
  - local site-session mapping to forwarded `command` session
- `lib/bff/`
  - request validation
  - CSRF/origin checks
  - error mapping

## Current Repo To Future Ownership Map

### Moves to `command/apps/admin-web`
- [`pages/admin/*`](../pages/admin)
- [`components/admin/*`](../components/admin)
- [`components/backoffice/*`](../components/backoffice)
- [`components/resources/*`](../components/resources)

### Moves to `command/apps/public-api` or shared public API packages
- [`pages/api/auth/*`](../pages/api/auth)
- [`pages/api/guides/*`](../pages/api/guides)
- external-user auth/session logic from:
  - [`lib/externalIdentity.ts`](../lib/externalIdentity.ts)
  - [`lib/requireUser.ts`](../lib/requireUser.ts)
- brand email runtime from:
  - [`lib/brandEmail.ts`](../lib/brandEmail.ts)

### Moves to `command/packages/core-*`
- [`lib/backofficeAuth.ts`](../lib/backofficeAuth.ts)
- [`lib/backofficeIdentity.ts`](../lib/backofficeIdentity.ts)
- [`lib/backofficeMfa.ts`](../lib/backofficeMfa.ts)
- [`lib/backofficeMfaChallenge.ts`](../lib/backofficeMfaChallenge.ts)
- [`lib/backofficeMfaService.ts`](../lib/backofficeMfaService.ts)
- [`lib/backofficeAdminUsers.ts`](../lib/backofficeAdminUsers.ts)
- [`lib/externalAdminUsers.ts`](../lib/externalAdminUsers.ts)
- [`lib/brandContext.ts`](../lib/brandContext.ts)
- [`lib/brandRegistry.ts`](../lib/brandRegistry.ts)
- [`lib/runtimeHostConfig.ts`](../lib/runtimeHostConfig.ts)
- [`lib/requestHost.ts`](../lib/requestHost.ts)
- [`lib/requestIdentity.ts`](../lib/requestIdentity.ts)
- [`lib/prisma.ts`](../lib/prisma.ts)
- [`prisma/`](../prisma)
- bootstrap and sync scripts from [`scripts/`](../scripts)

### Stays in `xdragon-site`
- [`pages/index.tsx`](../pages/index.tsx)
- [`pages/auth/*`](../pages/auth)
- [`pages/prompts/*`](../pages/prompts)
- [`pages/guides/*`](../pages/guides)
- [`pages/tools/*`](../pages/tools)
- [`components/BusinessWebsite.tsx`](../components/BusinessWebsite.tsx)
- [`components/ChatWidget.tsx`](../components/ChatWidget.tsx)
- [`components/BrandHead.tsx`](../components/BrandHead.tsx)
- brand-specific design/assets/copy

### Transitional Exceptions
- [`pages/api/chat.ts`](../pages/api/chat.ts)
- [`pages/api/contact.ts`](../pages/api/contact.ts)

These should remain in `xdragon-site` for the first extraction only if they are explicitly treated as temporary compatibility surfaces. They are not yet in the OpenAPI v1 public contract, so moving them immediately would create more contract surface than we have frozen.

## Extraction Waves

### Wave 1: Create `command` skeleton
Exit criteria:
- repo exists
- apps/packages layout exists
- docs and OpenAPI contracts are copied in as source-of-truth assets
- no production traffic moves yet

Tasks:
- create `command` repo
- create `apps/admin-web`
- create `apps/public-api`
- create initial `packages/core-*`
- copy Prisma schema/migrations and bootstrap scripts into `command`

### Wave 2: Move backoffice/admin ownership first
Exit criteria:
- admin UI runs from `command`
- admin data/auth no longer depend on `xdragon-site`
- `xdragon-site` no longer serves `/admin/*`

Tasks:
- move admin pages/components
- move backoffice identity/MFA/runtime helpers
- move admin APIs needed by the backoffice UI
- keep public-site flows untouched

### Wave 3: Introduce `xdragon-site` BFF for public auth/resources
Exit criteria:
- public auth/resource pages in `xdragon-site` stop talking to local DB/auth logic
- public pages go through local `/api/bff/*`
- BFF talks to `command/apps/public-api`

Tasks:
- add `command-client`
- add local site-session store
- add `/api/bff/*` routes
- convert `/auth`, `/prompts`, `/guides`, and account screens to BFF usage

### Wave 4: Retire direct public runtime coupling
Exit criteria:
- `xdragon-site` no longer owns external identity truth
- `xdragon-site` no longer directly serves legacy public auth/resource APIs
- compatibility paths removed or explicitly deprecated

Tasks:
- remove direct use of current public auth APIs
- remove local `requireUser` dependency from public pages
- move remaining shared runtime logic fully into `command`

### Wave 5: Decide follow-on services
Exit criteria:
- chat/contact are either:
  - formally moved into the `command` public contract
  - or explicitly retained as public-site-local services by product decision

Tasks:
- do not guess here
- only expand contract once service ownership is deliberate

## Non-Negotiable Extraction Rules

1. Do not share source files across repos through git subtrees or copy-paste mirroring as a long-term pattern.
2. Do not let `xdragon-site` keep direct Prisma access for identities/resources after the BFF cutover.
3. Do not expose raw `command` session artifacts to the browser.
4. Do not move chat/contact into the public contract without extending OpenAPI and human docs first.
5. Do not make the first `command` repo shape depend on X Dragon branding, domains, or copy.

## Risks To Watch

### Risk: moving admin UI before package extraction
If admin pages are moved without extracting shared runtime packages first, the new repo will immediately recreate current coupling.

### Risk: putting public API inside admin-web
That saves time in the short term but makes future server separation harder and muddies the reusable contract boundary.

### Risk: leaving `xdragon-site` with hidden DB ownership
If the public site still owns auth/resource truth after the BFF is introduced, the split is cosmetic rather than architectural.

### Risk: expanding the first contract too far
Trying to move chat/contact/analytics/admin APIs all at once will turn the split into an uncontrolled rewrite.

## Definition Of Done For This Planning Pass

- `command` repo/module layout is explicit
- `xdragon-site` BFF shape is explicit
- current-file ownership has a future destination
- extraction waves are ordered to reduce rewrite risk
- temporary exceptions are named instead of hidden
