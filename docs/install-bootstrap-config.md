# Install Bootstrap Config

**Purpose**
Define the preferred install-time configuration surface for bootstrap identity and initial brand seeding in `command`.

This is the transitional configuration layer before the future setup page owns first-run onboarding.

**Preferred Install-Time Env Vars**
- `COMMAND_BOOTSTRAP_SUPERADMIN_EMAIL`
- `BACKOFFICE_BOOTSTRAP_PASSWORD`
- `COMMAND_INSTALL_BRAND_KEY`
- `COMMAND_INSTALL_BRAND_NAME`
- `COMMAND_INSTALL_APEX_HOST`
- `COMMAND_INSTALL_PRODUCTION_PUBLIC_HOST`
- `COMMAND_INSTALL_PRODUCTION_ADMIN_HOST`
- `COMMAND_INSTALL_PREVIEW_PUBLIC_HOST`
- `COMMAND_INSTALL_PREVIEW_ADMIN_HOST`
- optional: `COMMAND_INSTALL_EMAIL_PROVIDER_SECRET_REF`

**What These Control**
- `COMMAND_BOOTSTRAP_SUPERADMIN_EMAIL`
  - protected bootstrap superadmin identity for the install
- `BACKOFFICE_BOOTSTRAP_PASSWORD`
  - password source used by explicit bootstrap ensure/recovery tooling
- `COMMAND_INSTALL_*`
  - brand/bootstrap values used by the brand sync and related install scripts

**Legacy Alias Support**
The old X Dragon migration-era env names are still accepted as temporary aliases by the install scripts:

- `BRAND_KEY`
- `NEXT_PUBLIC_BRAND_NAME`
- `NEXT_PUBLIC_APEX_HOST`
- `NEXT_PUBLIC_PROD_WWW_HOST`
- `NEXT_PUBLIC_PROD_ADMIN_HOST`
- `NEXT_PUBLIC_WWW_HOST`
- `NEXT_PUBLIC_ADMIN_HOST`
- `BRAND_EMAIL_PROVIDER_SECRET_REF`

These aliases are transitional only. New installs should use the `COMMAND_INSTALL_*` names.

**Safety Rules**
- brand/bootstrap scripts now fail fast when required install values are missing
- they no longer silently default to X Dragon brand keys, names, or domains
- the bootstrap superadmin identity no longer falls back to a hardcoded X Dragon email in code
- `COMMAND_BOOTSTRAP_SUPERADMIN_EMAIL` is now required for a correctly configured install until the future setup page owns first-run bootstrap
