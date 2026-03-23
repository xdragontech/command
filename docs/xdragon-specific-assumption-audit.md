# X Dragon-Specific Assumption Audit

**Purpose**
Identify the remaining X Dragon-specific assumptions inside `command` and separate:

- true reuse blockers
- operator/bootstrap debt
- documentation/example cleanup

This is the next step after the public-site cutover. The goal is not vague “de-branding.” The goal is to make `command` installable for non-X Dragon environments without silently inheriting X Dragon identity, domains, or user-facing copy.

**Audit Date**
- 2026-03-22

**What Was Audited**
- runtime code
- bootstrap/config code
- operator scripts
- admin UI placeholders
- product/operator docs

**Non-Findings**
These are in reasonable shape already and are not the current blockers:

- repo/app naming is generic enough for the product boundary: `command`
- public API pathing is generic
- DB brand/runtime ownership is already install-aware
- backoffice/public split is already real at the deployment boundary

That matters because it means the remaining X Dragon assumptions are concentrated, not everywhere.

**P1 Reuse Blockers**
1. Protected bootstrap superadmin identity was hardcoded to `grant@xdragon.tech`
- files:
  - [`packages/core-config/src/bootstrapConfig.json`](/Users/grantr/Projects/command/packages/core-config/src/bootstrapConfig.json)
  - [`packages/core-config/src/backofficeBootstrap.ts`](/Users/grantr/Projects/command/packages/core-config/src/backofficeBootstrap.ts)
  - [`scripts/bootstrap-superadmin.js`](/Users/grantr/Projects/command/scripts/bootstrap-superadmin.js)
- why this is a blocker:
  - a reusable install cannot ship with an X Dragon bootstrap identity baked into the product
  - it hardcodes both ownership and recovery assumptions into the install
- recommendation:
  - replace the hardcoded protected email with install-time configuration
  - the future setup flow should write this once for a new install
  - the runtime should fail clearly if bootstrap identity config is missing, not default to X Dragon

Status:
- resolved on 2026-03-22 by making `COMMAND_BOOTSTRAP_SUPERADMIN_EMAIL` the required bootstrap identity source

2. Brand/bootstrap sync scripts silently default to X Dragon values
- files:
  - [`scripts/sync-brand-registry.js`](/Users/grantr/Projects/command/scripts/sync-brand-registry.js)
  - [`scripts/sync-brand-email-config.js`](/Users/grantr/Projects/command/scripts/sync-brand-email-config.js)
  - [`scripts/sync-legacy-identities.js`](/Users/grantr/Projects/command/scripts/sync-legacy-identities.js)
- current defaults include:
  - brand key `xdragon`
  - brand name `X Dragon`
  - X Dragon production/preview domains
- why this is a blocker:
  - a new install can be seeded incorrectly just because an operator forgot to provide values
  - silent X Dragon fallback is worse than a hard failure
- recommendation:
  - remove X Dragon defaults from all install/bootstrap scripts
  - require explicit inputs or a setup/install manifest
  - fail fast when required install values are missing

3. Public chat behavior is hardcoded to X Dragon brand copy
- file:
  - [`apps/public-api/src/server/publicChat.ts`](/Users/grantr/Projects/command/apps/public-api/src/server/publicChat.ts)
- current assumptions include:
  - “You are X Dragon Technologies' website chat assistant.”
  - X Dragon-specific service descriptions
  - response schema name `xdragon_chat`
- why this is a blocker:
  - the reusable product currently generates X Dragon-branded chat behavior for every install
  - that is directly visible to end users
- recommendation:
  - move chat assistant identity and service copy into brand/install configuration
  - rename the schema identifier to something generic
  - keep the qualification logic, but remove X Dragon-specific copy from runtime

**P2 Productization Debt**
4. Admin-web placeholders still teach X Dragon examples
- file:
  - [`apps/admin-web/src/pages/admin/settings/brands.tsx`](/Users/grantr/Projects/command/apps/admin-web/src/pages/admin/settings/brands.tsx)
- examples include:
  - `xdragon`
  - `X Dragon`
  - `xdragon.tech`
  - `www.xdragon.tech`
  - `admin.xdragon.tech`
- why this matters:
  - not a runtime blocker, but it makes first-time setup feel like a fork of an internal app instead of a product
- recommendation:
  - switch placeholders to generic install examples

Status:
- resolved on 2026-03-22 by replacing X Dragon-specific admin-web placeholder values with generic install-safe examples

5. Public API readmes and deployment docs are still X Dragon instance-oriented
- files:
  - [`README.md`](/Users/grantr/Projects/command/README.md)
  - [`apps/public-api/README.md`](/Users/grantr/Projects/command/apps/public-api/README.md)
  - [`docs/public-api-preview-deployment-and-cutover.md`](/Users/grantr/Projects/command/docs/public-api-preview-deployment-and-cutover.md)
- current examples still use:
  - `xdragon-site`
  - `xdragon-preview`
  - `staging.xdragon.tech`
- why this matters:
  - these docs are fine as migration history, but not as reusable product/operator docs
- recommendation:
  - separate generic operator docs from X Dragon migration runbooks
  - keep historical X Dragon cutover notes only where they are explicitly labeled as migration history

Status:
- resolved on 2026-03-22 by adding a generic operator install guide, switching public-api examples to generic values, and labeling X Dragon-specific cutover docs as migration history

**P3 Documentation / Historical Context Debt**
6. Some architecture docs still describe the split through the `xdragon-site` migration lens
- files:
  - [`docs/repo-split-and-service-contract.md`](/Users/grantr/Projects/command/docs/repo-split-and-service-contract.md)
  - [`docs/command-repo-skeleton-and-bff-extraction-plan.md`](/Users/grantr/Projects/command/docs/command-repo-skeleton-and-bff-extraction-plan.md)
- why this matters:
  - these were the right docs while the split was happening
  - they are not the right long-term product docs for non-X Dragon adopters
- recommendation:
  - preserve them as migration-history docs
  - add separate install/product docs that assume no prior knowledge of X Dragon

Status:
- resolved on 2026-03-22 by separating generic operator docs from the extraction-history docs and labeling the migration-history set explicitly

**Recommended Removal Order**
1. Replace hardcoded bootstrap identity with install-time config.
2. Remove X Dragon defaults from brand/email/legacy sync scripts.
3. Make public chat install-aware or brand-aware instead of X Dragon-branded.
4. Replace X Dragon placeholders/examples in admin-web.
5. Split generic product/operator docs from X Dragon migration-history docs.

**Why This Order**
- The first three items affect runtime correctness for new installs.
- The last two mostly affect operator experience and packaging quality.
- If you do docs/examples first, the product still behaves like X Dragon under the hood.
- If you do runtime first, packaging can then be honest.

**Recommendation**
The next implementation pass should be item 1 and item 2 together:

- introduce install-time bootstrap/install config
- remove X Dragon default seeding from scripts

That is the highest-leverage path because it addresses both the protected bootstrap identity and the silent X Dragon seeding risk in one pass.
